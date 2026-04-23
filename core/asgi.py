"""Entrada ASGI da aplicacao.

O ASGI permite servir HTTP e WebSocket no mesmo processo. As requisicoes HTTP
sao delegadas ao Django tradicional, enquanto conexoes em ``/ws/btc/`` sao
tratadas pelo ``BTCEventConsumer``.
"""

import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from django.urls import path
from core.consumers import BTCEventConsumer

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": URLRouter([
        path("ws/btc/", BTCEventConsumer.as_asgi()),
    ]),
})
