"""Utilitario de linha de comando para tarefas administrativas do Django."""

import os
import sys


def main():
    """Configura o modulo de settings e delega comandos ao Django."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError("Django not installed") from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
