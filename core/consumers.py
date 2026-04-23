"""Consumers WebSocket usados para transmitir eventos do Bitcoin Core.

O modulo recebe mensagens publicadas no channel layer do Django Channels e as
entrega para navegadores conectados em ``/ws/btc/``. Atualmente o grupo
``btc_events`` recebe eventos produzidos pelo listener ZMQ.
"""

import json

from channels.generic.websocket import AsyncWebsocketConsumer


class BTCEventConsumer(AsyncWebsocketConsumer):
    """Canal WebSocket que encaminha eventos de blocos e transacoes.

    Cada conexao aceita entra no grupo ``btc_events``. Quando outro processo
    publica uma mensagem do tipo ``btc_message`` nesse grupo, o consumer envia
    o payload JSON ao navegador.
    """

    async def connect(self):
        """Aceita a conexao e registra o cliente no grupo de eventos BTC."""
        await self.channel_layer.group_add("btc_events", self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        """Remove o cliente do grupo quando o WebSocket e encerrado."""
        await self.channel_layer.group_discard("btc_events", self.channel_name)

    async def btc_message(self, event):
        """Serializa e envia ao frontend uma mensagem recebida do channel layer."""
        await self.send(text_data=json.dumps(event["data"]))
