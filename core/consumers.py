"""Consumers WebSocket usados para transmitir eventos do Bitcoin Core.

O modulo recebe mensagens publicadas no channel layer do Django Channels e as
entrega para navegadores conectados em ``/ws/btc/``. Atualmente o grupo
``btc_events`` recebe eventos produzidos pelo listener ZMQ.
"""

import json
import logging

from channels.generic.websocket import AsyncWebsocketConsumer

from .auth import host_from_scope, origin_from_scope, origin_is_allowed, token_from_scope, validate_token

logger = logging.getLogger(__name__)


class BTCEventConsumer(AsyncWebsocketConsumer):
    """Canal WebSocket que encaminha eventos de blocos e transacoes.

    Cada conexao aceita entra no grupo ``btc_events``. Quando outro processo
    publica uma mensagem do tipo ``btc_message`` nesse grupo, o consumer envia
    o payload JSON ao navegador.
    """

    async def connect(self):
        """Valida cookie/token, confere Origin e registra o cliente no grupo."""
        if not validate_token(token_from_scope(self.scope)):
            logger.warning("WebSocket recusado: token invalido ou ausente")
            await self.close(code=4401)
            return

        origin = origin_from_scope(self.scope)
        host = host_from_scope(self.scope)
        if not origin_is_allowed(origin, host):
            logger.warning("WebSocket recusado: origin %s nao permitido para host %s", origin, host)
            await self.close(code=4403)
            return

        await self.channel_layer.group_add("btc_events", self.channel_name)
        await self.accept()
        logger.info("WebSocket aceito para btc_events")

    async def disconnect(self, close_code):
        """Remove o cliente do grupo quando o WebSocket e encerrado."""
        await self.channel_layer.group_discard("btc_events", self.channel_name)
        logger.info("WebSocket desconectado com codigo %s", close_code)

    async def btc_message(self, event):
        """Serializa e envia ao frontend uma mensagem recebida do channel layer."""
        await self.send(text_data=json.dumps(event["data"]))
