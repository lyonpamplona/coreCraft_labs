"""Cliente JSON-RPC e politicas de comandos Bitcoin.

Este modulo concentra tres responsabilidades que antes ficavam misturadas na
view: parsing de comandos, politica de comandos por rede e chamada HTTP ao RPC
do Bitcoin Core.
"""

import json
import logging
import os
import re
import shlex

import requests
from dotenv import load_dotenv

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
    "uptime",
    "validateaddress",
    "verifychain",
    "verifytxoutproof",
}

DEFAULT_REGTEST_BLOCKLIST = {"stop"}
NUMBER_RE = re.compile(r"^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$")


class RPCParseError(ValueError):
    """Erro de parsing da linha digitada no terminal."""


class RPCPolicyError(PermissionError):
    """Erro de politica quando um metodo nao e permitido para a rede."""


def csv_set(name, default_values):
    """Le uma lista separada por virgulas do ambiente."""
    raw = os.getenv(name)
    if raw is None:
        return set(default_values)
    return {value.strip().lower() for value in raw.split(",") if value.strip()}


MAINNET_ALLOWLIST = csv_set("MAINNET_RPC_ALLOWLIST", READ_ONLY_METHODS)
SIGNET_ALLOWLIST = csv_set("SIGNET_RPC_ALLOWLIST", READ_ONLY_METHODS)
REGTEST_BLOCKLIST = csv_set("REGTEST_RPC_BLOCKLIST", DEFAULT_REGTEST_BLOCKLIST)


def coerce_rpc_param(value):
    """Converte um token textual para tipo JSON sempre que for seguro."""
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
    """Transforma uma linha de terminal em metodo RPC e parametros.

    Usa ``shlex.split`` para preservar argumentos com espacos quando o usuario
    usa aspas, por exemplo ``sendtoaddress <addr> 0.1 "comentario longo"``.
    """
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
    """Valida e retorna a configuracao da rede solicitada."""
    config = NETWORKS.get(network)
    if not config:
        raise RPCPolicyError(f"Rede invalida: {network}")
    if not config.get("url"):
        raise RPCPolicyError("Configuracao de rede ausente no .env")
    return config


def ensure_method_allowed(network, method):
    """Aplica a politica de comandos por rede."""
    normalized = method.lower()
    if network == "mainnet" and normalized not in MAINNET_ALLOWLIST:
        raise RPCPolicyError(f"Metodo bloqueado em mainnet: {method}")
    if network == "signet" and normalized not in SIGNET_ALLOWLIST:
        raise RPCPolicyError(f"Metodo bloqueado em signet: {method}")
    if network == "regtest" and normalized in REGTEST_BLOCKLIST:
        raise RPCPolicyError(f"Metodo bloqueado em regtest: {method}")


def rpc_call(network, method, params=None):
    """Executa uma chamada JSON-RPC autenticada contra o node selecionado."""
    if params is None:
        params = []

    config = ensure_network(network)
    ensure_method_allowed(network, method)

    payload = {"jsonrpc": "2.0", "id": "corecraft", "method": method, "params": params}
    try:
        response = requests.post(
            config["url"],
            auth=(config.get("user") or "", config.get("pass") or ""),
            json=payload,
            timeout=10,
        )
    except requests.Timeout:
        logger.warning("Timeout RPC em %s.%s", network, method)
        return {"error": {"message": "Timeout ao consultar o node Bitcoin"}}
    except requests.RequestException:
        logger.exception("Falha de comunicacao RPC em %s.%s", network, method)
        return {"error": {"message": "Falha de comunicacao com o node Bitcoin"}}

    if response.status_code == 401:
        return {"error": {"message": "Erro de autenticacao RPC"}}
    if response.status_code >= 400:
        logger.warning("RPC %s.%s retornou HTTP %s", network, method, response.status_code)
        return {"error": {"message": f"RPC retornou HTTP {response.status_code}"}}

    try:
        return response.json()
    except ValueError:
        logger.exception("Resposta RPC nao JSON em %s.%s", network, method)
        return {"error": {"message": "Resposta RPC invalida"}}
