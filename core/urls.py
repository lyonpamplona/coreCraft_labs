"""Rotas HTTP da aplicacao Django.

As URLs sao intencionalmente enxutas: a raiz entrega a interface de terminal e
``/terminal/`` recebe comandos digitados pelo usuario para encaminhamento ao
Bitcoin Core. As rotas WebSocket ficam declaradas em ``core.asgi``.
"""

from django.urls import path

from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('auth/logout/', views.auth_logout, name='auth_logout'),
    path('auth/verify/', views.auth_verify, name='auth_verify'),
    path('health/', views.health, name='health'),
    path('terminal/', views.terminal_command, name='terminal_command'),
]
