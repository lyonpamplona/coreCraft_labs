"""Rotas HTTP da aplicacao Django.

A raiz entrega a interface de terminal, ``/terminal/`` encaminha comandos RPC e
``/api/*`` alimenta cards de dashboard, eventos e faucet Signet. As rotas
WebSocket ficam declaradas em ``core.asgi``.
"""

from django.urls import path
from . import views
from .docs_test import docs_test_page

urlpatterns = [
    path('', views.index, name='index'),
    path('docs-test/', docs_test_page, name='docs_test_page'),
    path('docs-test/<slug:topic>/', docs_test_page, name='docs_test_page_topic'),
    path('auth/logout/', views.auth_logout, name='auth_logout'),
    path('auth/verify/', views.auth_verify, name='auth_verify'),
    path('health/', views.health, name='health'),
    path('terminal/', views.terminal_command, name='terminal_command'),
    path('api/mempool/summary/', views.mempool_summary, name='mempool_summary'),
    path('api/blockchain/lag/', views.blockchain_lag, name='blockchain_lag'),
    path('api/events/summary/', views.events_summary, name='events_summary'),
    path('api/events/latest/', views.events_latest, name='events_latest'),
    path('api/events/state-comparison/', views.events_state_comparison, name='events_state_comparison'),
    path('api/faucet/dispense/', views.faucet_dispense, name='faucet_dispense'),
    path('api/faucet/balance/', views.faucet_balance, name='faucet_balance'),
]
