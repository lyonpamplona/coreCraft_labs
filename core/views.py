"""Views HTTP e APIs auxiliares do painel multi-node.

O modulo entrega a interface web, valida autenticacao por token, encaminha
comandos RPC para o Bitcoin Core e expoe endpoints agregados usados pelo
dashboard de sincronizacao, mempool, eventos ZMQ/Redis e faucet Signet.
"""

import json
import os
import redis
from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET, require_POST
from .auth import auth_cookie_name, token_from_request, validate_token
from .rpc import RPCParseError, RPCPolicyError, parse_terminal_command, rpc_call


def get_redis_client():
    """Cria cliente Redis para consultar os resumos mantidos pelo listener ZMQ."""

    return redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"))


@require_GET
def index(request):
    """Renderiza a interface principal do command center."""

    return render(request, 'index.html', {"require_auth": settings.REQUIRE_AUTH})


@require_GET
def health(request):
    """Endpoint simples de healthcheck HTTP para Docker e diagnostico local."""

    return JsonResponse({"status": "ok"})


@require_POST
def auth_verify(request):
    """Valida o token do painel e renova o cookie seguro de autenticacao."""

    if not validate_token(token_from_request(request)):
        return JsonResponse({"authenticated": False, "error": "Token invalido"}, status=401)
    response = JsonResponse({"authenticated": True})
    if settings.REQUIRE_AUTH:
        response.set_cookie(
            auth_cookie_name(),
            token_from_request(request),
            httponly=True,
            secure=request.is_secure(),
            samesite="Lax",
            max_age=60 * 60 * 8,
        )
    return response


@require_POST
def auth_logout(request):
    """Remove o cookie de autenticacao usado pela interface web."""

    response = JsonResponse({"authenticated": False})
    response.delete_cookie(auth_cookie_name(), samesite="Lax")
    return response


@require_POST
def terminal_command(request):
    """Recebe comandos do terminal web e repassa ao Bitcoin Core via RPC."""

    if not validate_token(token_from_request(request)):
        return JsonResponse({"error": "Token de acesso invalido ou ausente"}, status=401)
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON invalido"}, status=400)
    network = data.get("network", "regtest")
    try:
        method, params = parse_terminal_command(data.get("command", ""))
        result = rpc_call(network, method, params)
    except RPCParseError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except RPCPolicyError as exc:
        return JsonResponse({"error": str(exc)}, status=403)
    return JsonResponse(result)


@require_GET
def mempool_summary(request):
    """Resume a mempool da rede para o card Mempool Intelligence.

    Para evitar varreduras caras em mempools grandes, consulta primeiro
    ``getmempoolinfo`` e omite a distribuicao de fees quando o tamanho passa do
    limite configurado.
    """

    if not validate_token(token_from_request(request)):
        return JsonResponse({"error": "Token invalido"}, status=401)
    network = request.GET.get("network", "regtest")
    try:
        info = rpc_call(network, "getmempoolinfo")
        if "error" in info and info["error"]:
            return JsonResponse(info)

        size = info.get("result", {}).get("size", 0)
        if size > 1500:
            return JsonResponse({
                "tx_count": size,
                "total_vsize": info["result"].get("bytes", 0),
                "avg_fee_rate": 0,
                "min_fee_rate": 0,
                "max_fee_rate": 0,
                "fee_distribution": {"low": 0, "medium": 0, "high": 0},
                "warning": "Extensa",
            })

        mempool_data = rpc_call(network, "getrawmempool", [True])
        if "error" in mempool_data and mempool_data["error"]:
            return JsonResponse(mempool_data)

        txs = mempool_data.get("result", {})
        tx_count = len(txs)
        total_vsize = 0
        total_fee_rate = 0
        min_fee_rate = float('inf')
        max_fee_rate = 0
        low, medium, high = 0, 0, 0

        for _txid, data in txs.items():
            vsize = data.get("vsize", 0)
            total_vsize += vsize
            fees = data.get("fees", {})
            base_fee = fees.get("base", data.get("fee", 0))
            fee_rate = (base_fee * 100000000) / vsize if vsize > 0 else 0

            total_fee_rate += fee_rate
            min_fee_rate = min(min_fee_rate, fee_rate)
            max_fee_rate = max(max_fee_rate, fee_rate)

            if fee_rate < 10:
                low += 1
            elif fee_rate <= 50:
                medium += 1
            else:
                high += 1

        if tx_count == 0:
            min_fee_rate = 0

        avg_fee_rate = total_fee_rate / tx_count if tx_count > 0 else 0

        return JsonResponse({
            "tx_count": tx_count,
            "total_vsize": total_vsize,
            "avg_fee_rate": round(avg_fee_rate, 2),
            "min_fee_rate": round(min_fee_rate, 2),
            "max_fee_rate": round(max_fee_rate, 2),
            "fee_distribution": {"low": low, "medium": medium, "high": high},
        })
    except Exception as e:
        return JsonResponse({"error": str(e)})


@require_GET
def blockchain_lag(request):
    """Retorna altura, headers, lag, IBD e progresso de verificacao da rede."""

    if not validate_token(token_from_request(request)):
        return JsonResponse({"error": "Token invalido"}, status=401)
    network = request.GET.get("network", "regtest")
    try:
        info = rpc_call(network, "getblockchaininfo")
        if "error" in info and info["error"]:
            return JsonResponse(info)

        result = info.get("result", {})
        blocks = result.get("blocks", 0)
        headers = result.get("headers", 0)
        lag = headers - blocks

        ibd = result.get("initialblockdownload", False)
        progress = result.get("verificationprogress", 0)

        return JsonResponse({
            "blocks": blocks,
            "headers": headers,
            "lag": lag,
            "ibd": ibd,
            "progress": progress,
        })
    except Exception as e:
        return JsonResponse({"error": str(e)})


@require_GET
def events_summary(request):
    """Resume eventos ZMQ persistidos em Redis para o card Event Activity."""

    if not validate_token(token_from_request(request)):
        return JsonResponse({"error": "Token invalido"}, status=401)
    network = request.GET.get("network", "regtest")
    r = get_redis_client()
    try:
        blocks_len = r.llen(f"zmq:{network}:blocks")
        txs_len = r.llen(f"zmq:{network}:txs")
        last_time = r.get(f"zmq:{network}:last_time")
        last_time = int(last_time) if last_time else None

        tx_per_second = 0.0
        if txs_len >= 2:
            latest_tx_raw = r.lindex(f"zmq:{network}:txs", 0)
            oldest_tx_raw = r.lindex(f"zmq:{network}:txs", txs_len - 1)
            if latest_tx_raw and oldest_tx_raw:
                latest_tx = json.loads(latest_tx_raw)
                oldest_tx = json.loads(oldest_tx_raw)
                time_diff = latest_tx["ts"] - oldest_tx["ts"]
                if time_diff > 0:
                    tx_per_second = txs_len / time_diff

        return JsonResponse({
            "blocks_observed": blocks_len,
            "tx_observed": txs_len,
            "last_event_time": last_time,
            "tx_per_second": round(tx_per_second, 2),
        })
    except Exception as e:
        return JsonResponse({"error": str(e)})


@require_GET
def events_latest(request):
    """Retorna os blocos e transacoes mais recentes registrados pelo listener."""

    if not validate_token(token_from_request(request)):
        return JsonResponse({"error": "Token invalido"}, status=401)
    network = request.GET.get("network", "regtest")
    r = get_redis_client()
    try:
        blocks_raw = r.lrange(f"zmq:{network}:blocks", 0, 4)
        txs_raw = r.lrange(f"zmq:{network}:txs", 0, 9)
        blocks = [json.loads(b) for b in blocks_raw]
        txs = [json.loads(t) for t in txs_raw]
        return JsonResponse({"blocks": blocks, "txs": txs})
    except Exception as e:
        return JsonResponse({"error": str(e)})


@require_GET
def events_state_comparison(request):
    """Compara melhor bloco RPC com ultimo bloco observado via ZMQ/Redis."""

    if not validate_token(token_from_request(request)):
        return JsonResponse({"error": "Token invalido"}, status=401)
    network = request.GET.get("network", "regtest")
    r = get_redis_client()
    try:
        info = rpc_call(network, "getbestblockhash")
        if "error" in info and info["error"]:
            return JsonResponse(info)

        best_block = info.get("result")
        last_seen_raw = r.lindex(f"zmq:{network}:blocks", 0)
        last_seen_block = json.loads(last_seen_raw).get("hash") if last_seen_raw else None

        divergence = False
        if best_block and last_seen_block and best_block != last_seen_block:
            divergence = True

        return JsonResponse({
            "best_block": best_block,
            "last_seen_block": last_seen_block,
            "divergence": divergence,
        })
    except Exception as e:
        return JsonResponse({"error": str(e)})


@require_GET
def faucet_balance(request):
    """Consulta o saldo da wallet interna `corecraft_faucet` em Signet."""

    if not validate_token(token_from_request(request)):
        return JsonResponse({"error": "Token de acesso invalido"}, status=401)
    network = request.GET.get("network", "signet")
    try:
        rpc_call(network, "loadwallet", ["corecraft_faucet"], bypass_policy=True)
        balance_info = rpc_call(network, "getbalance", [], bypass_policy=True)
        if "error" in balance_info and balance_info["error"]:
            return JsonResponse({"balance": 0, "error": "Wallet nao encontrada"})
        balance = float(balance_info.get("result", 0))
        return JsonResponse({"balance": balance})
    except Exception as e:
        return JsonResponse({"balance": 0, "error": str(e)}, status=500)


@require_POST
def faucet_dispense(request):
    """Solicita uma distribuicao controlada da faucet Signet.

    O endpoint nao aceita valor nem endereco vindo do cliente. Ele carrega a
    wallet interna ``corecraft_faucet``, gera um destino no backend e tenta
    enviar ``0.01 sBTC``. Quando a wallet existe mas nao tem saldo suficiente,
    o modo de demo retorna um txid simulado para manter a apresentacao fluida;
    esse retorno nao representa uma transacao publicada na Signet.
    """

    if not validate_token(token_from_request(request)):
        return JsonResponse({"error": "Token de acesso invalido"}, status=401)
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON invalido"}, status=400)

    network = data.get("network", "signet")
    amount = 0.01

    try:
        rpc_call(network, "loadwallet", ["corecraft_faucet"], bypass_policy=True)
        balance_info = rpc_call(network, "getbalance", [], bypass_policy=True)

        if "error" in balance_info and balance_info["error"]:
            return JsonResponse({"error": "A carteira 'corecraft_faucet' nao existe."}, status=400)

        balance = float(balance_info.get("result", 0))

        # O destino sempre e gerado pelo backend, nunca recebido do navegador.
        addr_info = rpc_call(network, "getnewaddress", [], bypass_policy=True)
        address = addr_info.get("result", "tb1q_falha_endereco")

        # Modo demo: preserva o fluxo visual quando a wallet existe, mas esta sem saldo.
        if balance < amount:
            import hashlib
            import time
            fake_txid = hashlib.sha256(str(time.time()).encode()).hexdigest()
            return JsonResponse({
                "txid": fake_txid,
                "amount": amount,
                "address": address,
                "simulated": True,
            })

        tx_info = rpc_call(network, "sendtoaddress", [address, amount], bypass_policy=True)
        if "error" in tx_info and tx_info["error"]:
            error_msg = tx_info["error"].get("message", str(tx_info["error"]))
            return JsonResponse({"error": f"Erro ao enviar: {error_msg}"}, status=400)

        return JsonResponse({"txid": tx_info.get("result"), "amount": amount, "address": address, "simulated": False})
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
