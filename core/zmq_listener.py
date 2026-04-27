"""Listener ZMQ multi-rede para eventos do Bitcoin Core.

O processo assina eventos de mainnet, signet e regtest, enriquece eventos de
bloco quando possivel via RPC e publica mensagens no grupo ``btc_events`` do
Django Channels para entrega por WebSocket.
"""

import json
import logging
import os
import signal
import time

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

import requests
import zmq
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)
logging.getLogger("channels_redis.core").setLevel(os.getenv("CHANNELS_REDIS_LOG_LEVEL", "WARNING"))

RUNNING = True
READY_FILE = os.getenv("ZMQ_READY_FILE", "/tmp/corecraft-zmq.ready")
DEFAULT_ZMQ_TOPICS = {
    "mainnet": "rawblock,hashblock",
    "signet": "rawblock,hashblock",
    "regtest": "rawtx,rawblock,hashblock",
}

NETWORKS_ZMQ = [
    {"name": "mainnet", "url": "tcp://btc-mainnet:28332"},
    {"name": "signet", "url": "tcp://btc-signet:28332"},
    {"name": "regtest", "url": "tcp://btc-regtest:28332"},
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
    """Sinaliza encerramento gracioso do loop principal."""
    del frame
    global RUNNING
    RUNNING = False
    logger.info("Recebido sinal %s; encerrando listener ZMQ", signum)


def mark_ready():
    """Cria um arquivo usado pelo healthcheck do container."""
    try:
        with open(READY_FILE, "w", encoding="utf-8") as handle:
            handle.write("ready\n")
    except OSError:
        logger.exception("Nao foi possivel escrever arquivo de healthcheck")


def rpc_call(network, method, params=None):
    """Consulta o RPC da rede informada para enriquecer eventos ZMQ."""
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
        logger.warning("Falha RPC ao enriquecer evento %s.%s", network, method, exc_info=True)
        return None
    except ValueError:
        logger.warning("Resposta RPC invalida ao enriquecer evento %s.%s", network, method, exc_info=True)
        return None


def create_subscriber(context, url, topics):
    """Cria um socket SUB para os topicos ZMQ usados pelo painel."""
    sock = context.socket(zmq.SUB)
    sock.setsockopt(zmq.RCVHWM, 1000)
    sock.connect(url)
    sock.connect(url.replace("28332", "28333"))
    for topic in topics:
        sock.setsockopt_string(zmq.SUBSCRIBE, topic)
    return sock


def publish_event(layer, data):
    """Publica evento no channel layer, isolando falhas de Redis/Channels."""
    try:
        async_to_sync(layer.group_send)("btc_events", {"type": "btc_message", "data": data})
    except Exception:
        logger.exception("Falha ao publicar evento no channel layer")


def start_zmq():
    """Abre sockets ZMQ para todas as redes e publica eventos no channel layer."""
    signal.signal(signal.SIGTERM, request_shutdown)
    signal.signal(signal.SIGINT, request_shutdown)

    context = zmq.Context()
    poller = zmq.Poller()
    layer = get_channel_layer()

    sockets = {}
    for net in NETWORKS_ZMQ:
        topics = zmq_topics_for(net["name"])
        sock = create_subscriber(context, net["url"], topics)
        poller.register(sock, zmq.POLLIN)
        sockets[sock] = {"name": net["name"], "topics": topics}
        logger.info(
            "Assinando ZMQ %s em %s com topicos %s",
            net["name"],
            net["url"],
            ",".join(sorted(topics)),
        )

    mark_ready()

    try:
        while RUNNING:
            try:
                active_sockets = dict(poller.poll(1000))
            except zmq.ZMQError:
                logger.exception("Erro no poller ZMQ; tentando novamente")
                time.sleep(2)
                continue

            for sock, meta in sockets.items():
                if active_sockets.get(sock) != zmq.POLLIN:
                    continue

                name = meta["name"]

                try:
                    parts = sock.recv_multipart(flags=zmq.NOBLOCK)
                except zmq.Again:
                    continue
                except zmq.ZMQError:
                    logger.exception("Erro lendo socket ZMQ de %s", name)
                    continue

                if len(parts) != 3:
                    logger.warning("Mensagem ZMQ inesperada em %s com %s partes", name, len(parts))
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

                if topic_str == "hashblock":
                    block_hash = payload[::-1].hex()
                    header = rpc_call(name, "getblockheader", [block_hash])
                    stats = rpc_call(name, "getblockstats", [block_hash])

                    if header and stats:
                        data["topic"] = "block_rich"
                        data["hash"] = block_hash
                        data["height"] = header.get("height")
                        data["tx_count"] = stats.get("txs")
                        data["total_out"] = stats.get("total_out", 0)
                        data["fees"] = stats.get("totalfee", 0)
                        data["size"] = stats.get("total_size", len(payload))

                if data["topic"] in ["rawtx", "rawblock", "block_rich"]:
                    publish_event(layer, data)
    finally:
        for sock in sockets:
            poller.unregister(sock)
            sock.close(linger=0)
        context.term()
        logger.info("Listener ZMQ encerrado")


if __name__ == "__main__":
    start_zmq()
