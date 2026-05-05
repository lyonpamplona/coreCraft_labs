"""Rotas HTTP da aplicacao Django.

As URLs sao intencionalmente enxutas: a raiz entrega a interface de terminal e
``/terminal/`` recebe comandos digitados pelo usuario para encaminhamento ao
Bitcoin Core. Os endpoints ``/api/*`` alimentam os cards agregados do
dashboard. As rotas WebSocket ficam declaradas em ``core.asgi``.
"""

from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('auth/logout/', views.auth_logout, name='auth_logout'),
    path('auth/verify/', views.auth_verify, name='auth_verify'),
    path('health/', views.health, name='health'),
    path('terminal/', views.terminal_command, name='terminal_command'),
    path('api/mempool/summary/', views.mempool_summary, name='mempool_summary'),
    path('api/blockchain/lag/', views.blockchain_lag, name='blockchain_lag'),
    path('api/events/summary/', views.events_summary, name='events_summary'),
    path('api/events/latest/', views.events_latest, name='events_latest'),
    path('api/events/state-comparison/', views.events_state_comparison, name='events_state_comparison'),
]
