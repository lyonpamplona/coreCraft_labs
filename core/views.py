"""Views da interface web e adaptador JSON-RPC para o Bitcoin Core.

Este modulo concentra a ponte entre o terminal exibido no navegador e o node
Bitcoin Core em modo regtest. A tela envia comandos textuais para o endpoint
``/terminal/``; a view converte esses comandos para chamadas JSON-RPC e devolve
o resultado bruto para o frontend.
"""

import json

import requests
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt

RPC_URL = "http://bitcoind:18443"
RPC_USER = "lyon"
RPC_PASS = "senha_segura"


def coerce_rpc_param(value):
    """Converte um token digitado no terminal para um tipo aceito pelo RPC.

    A interface recebe tudo como texto. Esta funcao preserva strings por
    padrao, mas transforma inteiros positivos e booleanos simples para que
    comandos como ``generatetoaddress 1 <endereco>`` e ``getblock <hash> true`` sejam
    enviados ao Bitcoin Core com tipos JSON adequados.
    """
    if value.isdigit():
        return int(value)
    if value.lower() == "true":
        return True
    if value.lower() == "false":
        return False
    return value


def parse_terminal_command(command):
    """Separa a linha digitada em metodo RPC e parametros tipados.

    O primeiro token da linha e tratado como nome do metodo JSON-RPC. Os demais
    tokens viram parametros posicionais e passam por ``coerce_rpc_param`` antes
    de serem enviados ao node.
    """
    raw_cmd = command.strip().split()
    if not raw_cmd:
        return None, []

    method = raw_cmd[0]
    params = [coerce_rpc_param(param) for param in raw_cmd[1:]]
    return method, params


def rpc_call(method, params=None):
    """Executa uma chamada JSON-RPC autenticada contra o container bitcoind.

    Args:
        method: Nome do metodo RPC, por exemplo ``getblockchaininfo``.
        params: Lista opcional de parametros posicionais para o metodo.

    Returns:
        Dicionario retornado pelo Bitcoin Core, normalmente com as chaves
        ``result``, ``error`` e ``id``.
    """
    if params is None:
        params = []

    payload = json.dumps({"jsonrpc": "2.0", "id": "django", "method": method, "params": params})
    response = requests.post(RPC_URL, auth=(RPC_USER, RPC_PASS), data=payload)
    return response.json()


def index(request):
    """Renderiza a pagina principal com o terminal xterm.js."""
    return render(request, 'index.html')


@csrf_exempt
def terminal_command(request):
    """Recebe comandos do terminal web e os repassa ao Bitcoin Core via RPC.

    O endpoint espera um POST com corpo JSON no formato
    ``{"command": "metodo parametro1 parametro2"}``. Ele devolve diretamente a
    resposta JSON-RPC para que o frontend apresente o ``result`` ou o ``error``.
    """
    if request.method == "POST":
        data = json.loads(request.body)
        method, params = parse_terminal_command(data.get("command", ""))
        if not method:
            return JsonResponse({"error": "No command"})

        result = rpc_call(method, params)
        return JsonResponse(result)

    return JsonResponse({"error": "Method not allowed"}, status=405)
