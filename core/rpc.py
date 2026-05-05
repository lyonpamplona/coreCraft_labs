"""Parser, politica e cliente JSON-RPC para os nodes Bitcoin.

Este modulo e o limite entre o terminal web e o Bitcoin Core. Ele transforma a
linha digitada pelo usuario em metodo/parametros JSON-RPC, aplica regras de
seguranca por rede e executa a chamada HTTP com timeout, cache leve e
coalescencia de consultas repetidas.
"""

import json
import logging
import os
import re
import shlex
import threading
import time
import requests

from dotenv import load_dotenv
from bitcoin.core import CTransaction, b2lx

load_dotenv()
logger = logging.getLogger(__name__)

NETWORKS = {
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

READ_ONLY_METHODS = {
    "decodepsbt",
    "decoderawtransaction",
    "decodescript",
    "deriveaddresses",
    "estimatesmartfee",
    "getbestblockhash",
    "getblock",
    "getblockchaininfo",
    "getblockcount",
    "getblockfilter",
    "getblockhash",
    "getblockheader",
    "getblockstats",
    "getchaintips",
    "getchaintxstats",
    "getconnectioncount",
    "getdeploymentinfo",
    "getdifficulty",
    "getindexinfo",
    "getmempoolancestors",
    "getmempooldescendants",
    "getmempoolentry",
    "getmempoolinfo",
    "getmininginfo",
    "getnettotals",
    "getnetworkhashps",
    "getnetworkinfo",
    "getpeerinfo",
    "getrawmempool",
    "getrawtransaction",
    "getrpcinfo",
    "gettxout",
    "gettxoutproof",
    "gettxoutsetinfo",
    "help",
    "inspect_tx",
    "uptime",
    "validateaddress",
    "verifychain",
    "verifytxoutproof",
}

DEFAULT_REGTEST_BLOCKLIST = {"stop"}
NUMBER_RE = re.compile(r"^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$")

class RPCParseError(ValueError):
    """Erro levantado quando a linha do terminal nao pode ser interpretada."""

    pass

class RPCPolicyError(PermissionError):
    """Erro levantado quando a rede ou o metodo viola a politica configurada."""

    pass

def csv_set(name, default_values):
    """Le um conjunto CSV do ambiente, usando valores padrao quando ausente."""
    raw = os.getenv(name)
    if raw is None:
        return set(default_values)
    return {value.strip().lower() for value in raw.split(",") if value.strip()}

MAINNET_ALLOWLIST = csv_set("MAINNET_RPC_ALLOWLIST", READ_ONLY_METHODS)
SIGNET_ALLOWLIST = csv_set("SIGNET_RPC_ALLOWLIST", READ_ONLY_METHODS)
REGTEST_BLOCKLIST = csv_set("REGTEST_RPC_BLOCKLIST", DEFAULT_REGTEST_BLOCKLIST)

RPC_TIMEOUT_SECONDS = float(os.getenv("RPC_TIMEOUT_SECONDS", "5"))
RPC_CACHE_SECONDS = float(os.getenv("RPC_CACHE_SECONDS", "15"))
RPC_ERROR_CACHE_SECONDS = float(os.getenv("RPC_ERROR_CACHE_SECONDS", "30"))

CACHEABLE_METHODS = {
    "getbestblockhash",
    "getblock",
    "getblockchaininfo",
    "getblockcount",
    "getmempoolinfo",
    "getnetworkinfo",
    "getpeerinfo",
}

_rpc_cache = {}
_rpc_locks = {}
_rpc_cache_guard = threading.Lock()

def coerce_rpc_param(value):
    """Converte tokens textuais do terminal para tipos JSON-RPC comuns.

    Booleanos, ``null``, numeros e JSON inline sao preservados como tipos
    nativos. O restante segue como string para o Bitcoin Core interpretar.
    """
    lowered = value.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    if lowered == "null":
        return None
    if value.startswith(("{", "[")):
        return json.loads(value)
    if NUMBER_RE.match(value):
        return json.loads(value)
    return value

def parse_terminal_command(command):
    """Divide uma linha do terminal em metodo RPC e lista de parametros."""
    try:
        tokens = shlex.split(command.strip())
    except ValueError as exc:
        raise RPCParseError(str(exc)) from exc
    if not tokens:
        raise RPCParseError("Comando vazio")
    try:
        params = [coerce_rpc_param(token) for token in tokens[1:]]
    except json.JSONDecodeError as exc:
        raise RPCParseError(f"Parametro JSON invalido: {exc.msg}") from exc
    return tokens[0], params

def ensure_network(network):
    """Valida a rede solicitada e retorna sua configuracao RPC."""
    config = NETWORKS.get(network)
    if not config:
        raise RPCPolicyError(f"Rede invalida: {network}")
    if not config.get("url"):
        raise RPCPolicyError("Configuracao de rede ausente no .env")
    return config

def ensure_method_allowed(network, method):
    """Aplica allowlist/blocklist antes de qualquer chamada ao Bitcoin Core."""
    normalized = method.lower()
    if network == "mainnet" and normalized not in MAINNET_ALLOWLIST:
        raise RPCPolicyError(f"Metodo bloqueado em mainnet: {method}")
    if network == "signet" and normalized not in SIGNET_ALLOWLIST:
        raise RPCPolicyError(f"Metodo bloqueado em signet: {method}")
    if network == "regtest" and normalized in REGTEST_BLOCKLIST:
        raise RPCPolicyError(f"Metodo bloqueado em regtest: {method}")

def rpc_cache_key(network, method, params):
    """Monta chave deterministica para cache de chamadas RPC read-only."""
    encoded_params = json.dumps(params or [], sort_keys=True, default=str)
    return network, method.lower(), encoded_params

def get_cached_rpc(key):
    """Retorna uma resposta RPC cacheada quando ela ainda esta dentro do TTL."""
    now = time.monotonic()
    with _rpc_cache_guard:
        cached = _rpc_cache.get(key)
        if not cached:
            return None
        expires_at, result = cached
        if expires_at <= now:
            _rpc_cache.pop(key, None)
            return None
        return result

def store_cached_rpc(key, result):
    """Armazena resultado RPC com TTL diferente para sucesso e erro temporario."""
    ttl = RPC_ERROR_CACHE_SECONDS if result.get("error") else RPC_CACHE_SECONDS
    if ttl <= 0:
        return
    with _rpc_cache_guard:
        _rpc_cache[key] = (time.monotonic() + ttl, result)

def rpc_key_lock(key):
    """Retorna um lock por chave para coalescer chamadas iguais em paralelo."""
    with _rpc_cache_guard:
        lock = _rpc_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _rpc_locks[key] = lock
        return lock

def rpc_call(network, method, params=None):
    """Executa um metodo JSON-RPC na rede selecionada.

    O metodo especial ``inspect_tx`` e resolvido localmente: aceita txid ou hex,
    tenta buscar a transacao bruta quando recebe txid e devolve um resumo
    estruturado sem repassar esse nome ao Bitcoin Core.
    """
    if params is None:
        params = []

    config = ensure_network(network)
    ensure_method_allowed(network, method)
    normalized_method = method.lower()

    if normalized_method == "inspect_tx":
        if not params:
            return {"error": {"message": "Informe o TXID ou a transacao em Hexadecimal para inspecionar"}}

        raw_data = str(params[0])

        if len(raw_data) == 64:
            payload = {"jsonrpc": "2.0", "id": "corecraft", "method": "getrawtransaction", "params": [raw_data]}
            try:
                resp = requests.post(
                    config["url"],
                    auth=(config.get("user") or "", config.get("pass") or ""),
                    json=payload,
                    timeout=RPC_TIMEOUT_SECONDS,
                )
                if resp.status_code == 200:
                    resp_json = resp.json()
                    if resp_json.get("result"):
                        raw_data = resp_json["result"]
            except requests.RequestException:
                pass

        try:
            tx_bytes = bytes.fromhex(raw_data)
            tx = CTransaction.deserialize(tx_bytes)
            total_sats = sum(int(v.nValue) for v in tx.vout)

            result = {
                "txid": b2lx(tx.GetTxid()),
                "size_bytes": len(tx_bytes),
                "is_coinbase": tx.is_coinbase(),
                "version": tx.nVersion,
                "locktime": tx.nLockTime,
                "vin_count": len(tx.vin),
                "vout_count": len(tx.vout),
                "total_out_sats": total_sats,
                "total_out_btc": total_sats / 100000000,
                "inputs": [{"previous_output": f"{b2lx(vin.prevout.hash)}:{vin.prevout.n}", "sequence": vin.nSequence} for vin in tx.vin[:50]],
                "outputs": [{"value_sats": int(vout.nValue), "script_pubkey_hex": vout.scriptPubKey.hex()} for vout in tx.vout[:50]]
            }

            if len(tx.vin) > 50:
                result["inputs_truncated"] = True
            if len(tx.vout) > 50:
                result["outputs_truncated"] = True

            return {"result": result}
        except Exception as e:
            return {"error": {"message": f"Falha ao inspecionar tx: hexadecimal ou txid invalido. ({str(e)})"}}

    cache_key = None
    if normalized_method in CACHEABLE_METHODS:
        cache_key = rpc_cache_key(network, normalized_method, params)
        cached = get_cached_rpc(cache_key)
        if cached is not None:
            return cached

    payload = {"jsonrpc": "2.0", "id": "corecraft", "method": method, "params": params}

    if cache_key is not None:
        lock = rpc_key_lock(cache_key)
        lock.acquire()
        cached = get_cached_rpc(cache_key)
        if cached is not None:
            lock.release()
            return cached
    else:
        lock = None

    try:
        response = requests.post(
            config["url"],
            auth=(config.get("user") or "", config.get("pass") or ""),
            json=payload,
            timeout=RPC_TIMEOUT_SECONDS,
        )
    except requests.Timeout:
        result = {"error": {"message": "Timeout ao consultar o node Bitcoin"}}
        if cache_key is not None:
            store_cached_rpc(cache_key, result)
        return result
    except requests.RequestException:
        result = {"error": {"message": "Falha de comunicacao com o node Bitcoin"}}
        if cache_key is not None:
            store_cached_rpc(cache_key, result)
        return result
    finally:
        if lock is not None and lock.locked():
            lock.release()

    if response.status_code == 401:
        result = {"error": {"message": "Erro de autenticacao RPC"}}
        if cache_key is not None:
            store_cached_rpc(cache_key, result)
        return result

    if response.status_code >= 400:
        result = {"error": {"message": f"RPC retornou HTTP {response.status_code}"}}
        if cache_key is not None:
            store_cached_rpc(cache_key, result)
        return result

    try:
        result = response.json()
    except ValueError:
        result = {"error": {"message": "Resposta RPC invalida"}}

    if cache_key is not None:
        store_cached_rpc(cache_key, result)

    return result
