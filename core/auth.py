"""Utilitarios de autenticacao simples para HTTP e WebSocket.

O projeto ainda nao possui usuarios Django nem sessoes. Como primeira camada de
proteção operacional, as APIs internas validam um token compartilhado vindo do
ambiente em ``APP_AUTH_TOKEN``. Esse modelo e simples, mas ja evita que qualquer
cliente na rede execute comandos RPC sem conhecer o token.

A interface aceita o token no login uma vez e o backend grava um cookie
``HttpOnly``. Depois disso, HTTP e WebSocket usam o cookie sem expor o token em
``localStorage`` nem na URL do WebSocket. Headers continuam aceitos para scripts
e comandos manuais de diagnostico.
"""

import secrets
from urllib.parse import parse_qs
from urllib.parse import urlparse

from django.conf import settings


def auth_is_required():
    """Indica se a autenticacao por token esta habilitada."""
    return getattr(settings, "REQUIRE_AUTH", True)


def validate_token(token):
    """Valida o token recebido usando comparacao resistente a timing."""
    if not auth_is_required():
        return True

    expected = getattr(settings, "APP_AUTH_TOKEN", "")
    if not token or not expected:
        return False
    return secrets.compare_digest(str(token), str(expected))


def auth_cookie_name():
    """Retorna o nome do cookie usado pela autenticacao do painel."""
    return getattr(settings, "APP_AUTH_COOKIE_NAME", "corecraft_auth")


def token_from_request(request):
    """Extrai token de um request HTTP.

    O navegador usa cookie ``HttpOnly`` depois do login. Tambem aceitamos o
    header ``X-CoreCraft-Token`` e ``Authorization: Bearer <token>`` para
    facilitar clientes externos e chamadas com ``curl``.
    """
    header_token = request.META.get("HTTP_X_CORECRAFT_TOKEN")
    if header_token:
        return header_token

    authorization = request.META.get("HTTP_AUTHORIZATION", "")
    prefix = "Bearer "
    if authorization.startswith(prefix):
        return authorization[len(prefix):].strip()

    cookie_token = request.COOKIES.get(auth_cookie_name())
    if cookie_token:
        return cookie_token
    return ""


def token_from_headers(headers):
    """Extrai token dos headers ASGI de uma conexao WebSocket."""
    cookie_header = ""
    authorization = ""
    for key, value in headers:
        if key == b"cookie":
            cookie_header = value.decode("utf-8")
        elif key == b"authorization":
            authorization = value.decode("utf-8")

    if cookie_header:
        for item in cookie_header.split(";"):
            name, _, value = item.strip().partition("=")
            if name == auth_cookie_name():
                return value

    prefix = "Bearer "
    if authorization.startswith(prefix):
        return authorization[len(prefix):].strip()
    return ""


def token_from_scope(scope):
    """Extrai token de uma conexao ASGI/WebSocket.

    Prefere cookie/header e mantem a query string como compatibilidade com
    versoes antigas do painel.
    """
    header_token = token_from_headers(scope.get("headers", []))
    if header_token:
        return header_token

    raw_query = scope.get("query_string", b"").decode("utf-8")
    values = parse_qs(raw_query).get("token", [])
    return values[0] if values else ""


def origin_from_scope(scope):
    """Retorna o header Origin de uma conexao WebSocket, se existir."""
    for key, value in scope.get("headers", []):
        if key == b"origin":
            return value.decode("utf-8")
    return ""


def host_from_scope(scope):
    """Retorna o header Host usado no handshake WebSocket."""
    for key, value in scope.get("headers", []):
        if key == b"host":
            return value.decode("utf-8")
    return ""


def origin_is_allowed(origin, host=""):
    """Valida Origin quando uma allowlist foi configurada."""
    allowed = getattr(settings, "WEBSOCKET_ALLOWED_ORIGINS", [])
    if not origin or not allowed:
        return True
    if "*" in allowed:
        return True
    if origin in allowed:
        return True

    parsed = urlparse(origin)
    return bool(host and parsed.netloc == host)
