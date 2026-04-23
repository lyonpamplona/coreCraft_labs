"""Ponto de entrada WSGI tradicional da aplicacao Django.

O projeto atual usa ASGI para suportar HTTP e WebSocket, mas este objeto
``application`` permanece disponivel para compatibilidade com servidores WSGI
caso a camada WebSocket nao seja necessaria em algum ambiente.
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

application = get_wsgi_application()
