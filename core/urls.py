"""Rotas HTTP da aplicacao Django.

As URLs sao intencionalmente enxutas: a raiz entrega a interface de terminal e
``/terminal/`` recebe comandos digitados pelo usuario para encaminhamento ao
Bitcoin Core. As rotas WebSocket ficam declaradas em ``core.asgi``.
"""

from django.urls import path

from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('terminal/', views.terminal_command, name='terminal_command'),
]
