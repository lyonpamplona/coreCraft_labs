"""Configuracoes Django/Channels do coreCraft Multi-Node.

O projeto roda como laboratorio local em Docker Compose, com suporte a mainnet,
signet e regtest. Django serve HTTP, Daphne/ASGI atende WebSocket e Redis atua
como channel layer para distribuir eventos ZMQ recebidos dos nodes Bitcoin.
"""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')


def env_bool(name, default=False):
    """Le booleanos do ambiente usando valores textuais comuns."""
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.lower() in {'1', 'true', 'yes', 'on'}


def env_list(name, default=""):
    """Le listas separadas por virgula do ambiente."""
    return [value.strip() for value in os.getenv(name, default).split(',') if value.strip()]


DEBUG = env_bool('DEBUG', False)
SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'django-insecure-local-dev-key'
    else:
        raise ImproperlyConfigured('SECRET_KEY deve ser configurada quando DEBUG=False')

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1,0.0.0.0').split(',')
    if host.strip()
]
REQUIRE_AUTH = env_bool('REQUIRE_AUTH', True)
APP_AUTH_TOKEN = os.getenv('APP_AUTH_TOKEN', '')
APP_AUTH_COOKIE_NAME = os.getenv('APP_AUTH_COOKIE_NAME', 'corecraft_auth')
WEBSOCKET_ALLOWED_ORIGINS = env_list(
    'WEBSOCKET_ALLOWED_ORIGINS',
    'http://localhost:8005,http://127.0.0.1:8005',
)

INSTALLED_APPS = [
    'daphne',
    'core',
    'django.contrib.staticfiles',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.middleware.common.CommonMiddleware',
]

ROOT_URLCONF = 'core.urls'
WSGI_APPLICATION = 'core.wsgi.application'
ASGI_APPLICATION = 'core.asgi.application'

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [os.getenv("REDIS_URL", "redis://redis:6379/0")],
        },
    },
}

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
            ],
        },
    },
]

DATABASES = {}
LANGUAGE_CODE = 'pt-br'
STATIC_URL = 'static/'
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_REFERRER_POLICY = 'same-origin'
