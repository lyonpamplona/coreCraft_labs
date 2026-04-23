"""Listener ZMQ para eventos publicados pelo Bitcoin Core.

O Bitcoin Core publica transacoes e blocos brutos nas portas ZMQ configuradas
em ``bitcoin.conf``. Este processo assina os topicos ``rawtx`` e ``rawblock`` e
republica metadados desses eventos no grupo ``btc_events`` do Django Channels,
permitindo que a interface web receba atualizacoes em tempo real via WebSocket.
"""

import os
import zmq
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')


def start_zmq():
    """Inicia o loop bloqueante que assina eventos ZMQ do node bitcoind."""
    context = zmq.Context()
    sub = context.socket(zmq.SUB)
    sub.connect("tcp://bitcoind:28332")
    sub.connect("tcp://bitcoind:28333")
    sub.setsockopt_string(zmq.SUBSCRIBE, "rawtx")
    sub.setsockopt_string(zmq.SUBSCRIBE, "rawblock")

    layer = get_channel_layer()

    while True:
        topic, payload, seq = sub.recv_multipart()
        topic_str = topic.decode('utf-8')
        sequence = int.from_bytes(seq, "little")
        
        data = {
            "topic": topic_str,
            "size": len(payload),
            "sequence": sequence
        }
        
        async_to_sync(layer.group_send)(
            "btc_events",
            {"type": "btc_message", "data": data}
        )


if __name__ == "__main__":
    start_zmq()
