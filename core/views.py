"""Views HTTP do painel multi-node.

As views servem a interface, validam autenticacao por token e delegam parsing,
politica e chamada JSON-RPC para ``core.rpc``.
"""

import json

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET, require_POST

from .auth import auth_cookie_name, token_from_request, validate_token
from .rpc import RPCParseError, RPCPolicyError, parse_terminal_command, rpc_call


@require_GET
def index(request):
    """Renderiza a interface principal do command center."""
    return render(request, 'index.html', {"require_auth": settings.REQUIRE_AUTH})


@require_GET
def health(request):
    """Endpoint simples de healthcheck para Docker e diagnostico local."""
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
    """Recebe comandos do terminal web e repassa ao Bitcoin Core via RPC.

    A autenticacao pode vir do cookie ``HttpOnly`` emitido por
    ``auth_verify`` ou de headers usados por clientes externos.
    """
    if not validate_token(token_from_request(request)):
        return JsonResponse({"error": "Token de acesso invalido ou ausente"}, status=401)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    network = data.get("network", "regtest")

    try:
        method, params = parse_terminal_command(data.get("command", ""))
        result = rpc_call(network, method, params)
    except RPCParseError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except RPCPolicyError as exc:
        return JsonResponse({"error": str(exc)}, status=403)

    return JsonResponse(result)
