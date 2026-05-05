"""Ponte ZMQ -> Django Channels/Redis para eventos dos nodes Bitcoin.

O processo assina topicos ZMQ nos tres nodes, publica eventos em tempo real no
grupo ``btc_events`` e mantem pequenas listas Redis com blocos/transacoes
recentes para os endpoints agregados do dashboard.
"""

import json
import logging
import os
import signal
import time

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

import requests
import zmq
import redis
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from dotenv import load_dotenv
from bitcoin.core import CTransaction, b2lx

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)
logging.getLogger("channels_redis.core").setLevel(os.getenv("CHANNELS_REDIS_LOG_LEVEL", "WARNING"))

RUNNING = True
READY_FILE = os.getenv("ZMQ_READY_FILE", "/tmp/corecraft-zmq.ready")
REDIS_CLIENT = redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"))

DEFAULT_ZMQ_TOPICS = {
    "mainnet": "rawblock,hashblock",
    "signet": "rawblock,hashblock",
    "regtest": "rawtx,rawblock,hashblock",
}

NETWORKS_ZMQ = [
    {
        "name": "mainnet",
        "host": os.getenv("ZMQ_MAINNET_HOST", "btc-mainnet"),
        "tx_port": int(os.getenv("ZMQ_MAINNET_TX_PORT", 28332)),
        "block_port": int(os.getenv("ZMQ_MAINNET_BLOCK_PORT", 28333))
    },
    {
        "name": "signet",
        "host": os.getenv("ZMQ_SIGNET_HOST", "btc-signet"),
        "tx_port": int(os.getenv("ZMQ_SIGNET_TX_PORT", 28332)),
        "block_port": int(os.getenv("ZMQ_SIGNET_BLOCK_PORT", 28333))
    },
    {
        "name": "regtest",
        "host": os.getenv("ZMQ_REGTEST_HOST", "btc-regtest"),
        "tx_port": int(os.getenv("ZMQ_REGTEST_TX_PORT", 28332)),
        "block_port": int(os.getenv("ZMQ_REGTEST_BLOCK_PORT", 28333))
    },
]

NETWORKS_RPC = {
    "mainnet": {
        "url": os.getenv("MAINNET_RPC_URL"),
        "user": os.getenv("MAINNET_RPC_USER"),
        "pass": os.getenv("MAINNET_RPC_PASS"),
    },
    "signet": {
        "url": os.getenv("SIGNET_RPC_URL"),
        "user": os.getenv("SIGNET_RPC_USER"),
        "pass": os.getenv("SIGNET_RPC_PASS"),
    },
    "regtest": {
        "url": os.getenv("REGTEST_RPC_URL"),
        "user": os.getenv("REGTEST_RPC_USER"),
        "pass": os.getenv("REGTEST_RPC_PASS"),
    },
}

def csv_set(name, default_value):
    """Le uma lista CSV do ambiente e remove itens vazios."""
    raw = os.getenv(name, default_value)
    return {item.strip() for item in raw.split(",") if item.strip()}

def zmq_topics_for(network):
    """Retorna os topicos ZMQ habilitados para a rede informada."""
    env_name = f"ZMQ_{network.upper()}_TOPICS"
    return csv_set(env_name, DEFAULT_ZMQ_TOPICS[network])

def request_shutdown(signum, frame):
    """Marca o loop principal para encerramento gracioso por sinal."""
    del frame
    global RUNNING
    RUNNING = False

def mark_ready():
    """Cria arquivo de readiness usado pelo healthcheck do container."""
    try:
        with open(READY_FILE, "w", encoding="utf-8") as handle:
            handle.write("ready\n")
    except OSError:
        pass

def rpc_call(network, method, params=None):
    """Executa uma chamada RPC curta usada apenas para enriquecer eventos ZMQ."""
    if params is None:
        params = []
    config = NETWORKS_RPC.get(network)
    if not config or not config["url"]:
        return None
    payload = {"jsonrpc": "2.0", "id": "zmq-listener", "method": method, "params": params}
    try:
        response = requests.post(
            config["url"],
            auth=(config.get("user") or "", config.get("pass") or ""),
            json=payload,
            timeout=5,
        )
        return response.json().get("result")
    except requests.RequestException:
        return None
    except ValueError:
        return None

def create_subscriber(context, host, tx_port, block_port, topics):
    """Cria socket SUB conectado aos endpoints ZMQ de transacao e bloco."""
    sock = context.socket(zmq.SUB)
    sock.setsockopt(zmq.RCVHWM, 1000)
    sock.connect(f"tcp://{host}:{tx_port}")
    if tx_port != block_port:
        sock.connect(f"tcp://{host}:{block_port}")
    for topic in topics:
        sock.setsockopt_string(zmq.SUBSCRIBE, topic)
    return sock

def publish_event(layer, data):
    """Publica um payload normalizado no grupo WebSocket ``btc_events``."""
    try:
        async_to_sync(layer.group_send)("btc_events", {"type": "btc_message", "data": data})
    except Exception:
        pass

def start_zmq():
    """Inicia o loop de polling ZMQ, Redis e publicacao via channel layer."""
    signal.signal(signal.SIGTERM, request_shutdown)
    signal.signal(signal.SIGINT, request_shutdown)
    context = zmq.Context()
    poller = zmq.Poller()
    layer = get_channel_layer()
    sockets = {}

    for net in NETWORKS_ZMQ:
        topics = zmq_topics_for(net["name"])
        sock = create_subscriber(context, net["host"], net["tx_port"], net["block_port"], topics)
        poller.register(sock, zmq.POLLIN)
        sockets[sock] = {"name": net["name"], "topics": topics}

    mark_ready()

    try:
        while RUNNING:
            try:
                active_sockets = dict(poller.poll(1000))
            except zmq.ZMQError:
                time.sleep(2)
                continue

            for sock, meta in sockets.items():
                if active_sockets.get(sock) != zmq.POLLIN:
                    continue

                name = meta["name"]

                try:
                    parts = sock.recv_multipart(flags=zmq.NOBLOCK)
                except (zmq.Again, zmq.ZMQError):
                    continue

                if len(parts) != 3:
                    continue

                topic, payload, seq = parts
                topic_str = topic.decode('utf-8')

                if topic_str not in meta["topics"]:
                    continue

                data = {
                    "network": name,
                    "topic": topic_str,
                    "size": len(payload),
                    "sequence": int.from_bytes(seq, "little"),
                }

                current_ts = int(time.time())

                if topic_str == "hashblock":
                    block_hash = payload[::-1].hex()
                    data["hash"] = block_hash

                    try:
                        event = {"hash": block_hash, "ts": current_ts}
                        REDIS_CLIENT.lpush(f"zmq:{name}:blocks", json.dumps(event))
                        REDIS_CLIENT.ltrim(f"zmq:{name}:blocks", 0, 49)
                        REDIS_CLIENT.set(f"zmq:{name}:last_time", current_ts)
                    except Exception:
                        pass

                    header = rpc_call(name, "getblockheader", [block_hash])
                    stats = rpc_call(name, "getblockstats", [block_hash])

                    if header and stats:
                        data["topic"] = "block_rich"
                        data["height"] = header.get("height")
                        data["tx_count"] = stats.get("txs")
                        data["total_out"] = stats.get("total_out", 0)
                        data["fees"] = stats.get("totalfee", 0)
                        data["size"] = stats.get("total_size", len(payload))
                    else:
                        data["topic"] = "rawblock"

                elif topic_str == "rawtx":
                    try:
                        tx = CTransaction.deserialize(payload)
                        txid = b2lx(tx.GetTxid())
                        data["txid"] = txid
                        data["total_out_sats"] = sum(int(v.nValue) for v in tx.vout)
                        data["vin_count"] = len(tx.vin)
                        data["vout_count"] = len(tx.vout)

                        event = {"txid": txid, "ts": current_ts}
                        REDIS_CLIENT.lpush(f"zmq:{name}:txs", json.dumps(event))
                        REDIS_CLIENT.ltrim(f"zmq:{name}:txs", 0, 999)
                        REDIS_CLIENT.set(f"zmq:{name}:last_time", current_ts)
                    except Exception:
                        pass

                if data["topic"] in ["rawtx", "rawblock", "block_rich"]:
                    publish_event(layer, data)
    finally:
        for sock in sockets:
            poller.unregister(sock)
            sock.close(linger=0)
        context.term()

if __name__ == "__main__":
    start_zmq()
