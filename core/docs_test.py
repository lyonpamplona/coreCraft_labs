"""Prototipo isolado para validar a experiencia de documentacao.

Este modulo fica fora das views principais para permitir iterar em layout,
tema e filtros de conteudo antes de religar a documentacao definitiva do
painel. A rota publica de teste e ``/docs-test/``.
"""

import re
from html import escape

from django.conf import settings
from django.http import Http404
from django.shortcuts import render
from django.views.decorators.http import require_GET


DOCS_TEST_TOPICS = {
    "painel": {
        "title": "Operar o Painel",
        "description": "Entrada, redes, terminal RPC, dashboard, timeline e ajustes visuais.",
        "kind": "guide",
        "content": """
# Operar o Painel

## Entrada

1. Abra o painel principal em `http://localhost:8005`.
2. Informe o `APP_AUTH_TOKEN` quando o login aparecer.
3. Aguarde os indicadores `RPC` e `WebSocket` ficarem disponiveis.
4. Use `REGTEST` para testes de escrita, mineracao e wallet.

## Areas Principais

- Activity Bar: abre Explorer, Docs, Busca, Fluxos, Execucao e Ajustes.
- Explorer: troca entre `mainnet`, `signet` e `regtest`.
- Dashboard: resume sincronizacao, mempool e eventos.
- `rpc.response`: mostra o JSON completo do ultimo comando.
- Terminal: executa comandos Bitcoin Core por rede.
- Timeline: exibe blocos e transacoes recebidos via ZMQ/WebSocket.

## Fluxo Recomendado

```text
getblockchaininfo
getmempoolinfo
getpeerinfo
help
```

Use os botoes rapidos para consultas comuns. Objetos grandes ficam em
`rpc.response`, e o terminal mostra uma saida curta para leitura operacional.
""",
    },
    "mainnet": {
        "title": "Mainnet",
        "description": "Leitura segura da rede principal, sincronizacao, peers e mempool.",
        "kind": "network",
        "content": """
# Mainnet

## Uso Esperado

Mainnet deve ser tratada como rede de leitura e observabilidade. Comandos de
wallet, mineracao e envio ficam bloqueados pela politica RPC do backend.

## Comandos Seguros

```text
getblockchaininfo
getblockcount
getbestblockhash
getmempoolinfo
getnetworkinfo
getpeerinfo
estimatesmartfee 6
```

## Diagnostico

- Confira altura, headers e progresso de IBD no dashboard.
- Use `getpeerinfo` para investigar conectividade.
- Timeouts podem acontecer durante sincronizacao inicial ou em node pruned.
""",
    },
    "signet": {
        "title": "Signet",
        "description": "Rede publica de testes, faucet interna e validacao externa.",
        "kind": "network",
        "content": """
# Signet

## Uso Esperado

Signet serve para validar comportamento em rede publica de teste, sem bitcoin
real. A faucet interna opera a wallet `corecraft_faucet`.

## Faucet

```text
loadwallet corecraft_faucet
getbalance
```

Se a wallet nao existir:

```text
createwallet corecraft_faucet
```

Depois envie fundos Signet de teste para essa wallet. O painel usa valor fixo e
destino gerado no backend.

## Comandos Uteis

```text
getblockchaininfo
getmempoolinfo
getnetworkinfo
help wallet
```
""",
    },
    "regtest": {
        "title": "Regtest",
        "description": "Laboratorio local para wallet, mineracao, maturacao e eventos ZMQ.",
        "kind": "network",
        "content": """
# Regtest

## Uso Esperado

Regtest e a rede local para comandos de escrita. Os atalhos de wallet usam a
wallet `corecraft`.

## Wallet e Mineracao

```text
listwallets
loadwallet corecraft
createwallet corecraft
getnewaddress
generatetoaddress 1 <endereco>
generatetoaddress 100 <endereco>
```

## Validacao Visual

- O terminal deve receber mensagens de bloco.
- A timeline deve criar um card novo.
- O dashboard deve atualizar altura, mempool e eventos.
""",
    },
    "arquitetura": {
        "title": "Arquitetura",
        "description": "Servicos, containers, Django/ASGI, Redis, ZMQ e Bitcoin Core.",
        "kind": "technical",
        "file": "arquitetura.md",
    },
    "comandos": {
        "title": "Comandos",
        "description": "Catalogo operacional de comandos, macros, Docker, logs e APIs.",
        "kind": "technical",
        "file": "comandos.md",
    },
    "fluxos": {
        "title": "Fluxos",
        "description": "Sequencias guiadas para RPC, mempool, mineracao, faucet e eventos.",
        "kind": "technical",
        "file": "fluxos.md",
    },
    "operacao": {
        "title": "Operacao",
        "description": "Configuracao, token, credenciais RPC, Docker e troubleshooting.",
        "kind": "technical",
        "file": "configuracao.md",
    },
}


def docs_test_payload(topic):
    """Monta o payload permitido para um topico do prototipo."""

    data = DOCS_TEST_TOPICS.get(topic)
    if not data:
        return None

    content = data.get("content", "").strip()
    if data.get("file"):
        path = settings.BASE_DIR / "docs" / data["file"]
        content = path.read_text(encoding="utf-8").strip()

    return {
        "topic": topic,
        "title": data["title"],
        "description": data["description"],
        "kind": data["kind"],
        "content": content,
        "html": markdown_to_html(content),
    }


def inline_markdown(text):
    """Renderiza marcacoes inline simples mantendo HTML de entrada escapado."""

    value = escape(text)
    value = re.sub(r"`([^`]+)`", r"<code>\1</code>", value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", value)
    value = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2" rel="noreferrer">\1</a>', value)
    return value


def markdown_to_html(markdown):
    """Converte um subconjunto previsivel de Markdown para o prototipo."""

    lines = str(markdown or "").splitlines()
    html = []
    paragraph = []
    list_type = ""
    in_code = False

    def flush_paragraph():
        nonlocal paragraph
        if paragraph:
            html.append(f"<p>{inline_markdown(' '.join(paragraph))}</p>")
            paragraph = []

    def close_list():
        nonlocal list_type
        if list_type:
            html.append(f"</{list_type}>")
            list_type = ""

    def open_list(tag):
        nonlocal list_type
        if list_type != tag:
            close_list()
            html.append(f"<{tag}>")
            list_type = tag

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```"):
            flush_paragraph()
            close_list()
            html.append("</code></pre>" if in_code else "<pre><code>")
            in_code = not in_code
            i += 1
            continue

        if in_code:
            html.append(f"{escape(line)}\n")
            i += 1
            continue

        if not stripped:
            flush_paragraph()
            close_list()
            i += 1
            continue

        if stripped.startswith("|") and stripped.endswith("|"):
            flush_paragraph()
            close_list()
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|") and lines[i].strip().endswith("|"):
                row = lines[i].strip()
                if not re.match(r"^\|\s*:?-+", row):
                    rows.append([cell.strip() for cell in row.split("|")[1:-1]])
                i += 1
            if rows:
                html.append("<table>")
                for row_index, cells in enumerate(rows):
                    tag = "th" if row_index == 0 else "td"
                    html.append("<tr>" + "".join(f"<{tag}>{inline_markdown(cell)}</{tag}>" for cell in cells) + "</tr>")
                html.append("</table>")
            continue

        heading = re.match(r"^(#{1,4})\s+(.+)$", stripped)
        if heading:
            flush_paragraph()
            close_list()
            level = min(len(heading.group(1)) + 1, 5)
            html.append(f"<h{level}>{inline_markdown(heading.group(2))}</h{level}>")
            i += 1
            continue

        unordered = re.match(r"^[-*]\s+(.+)$", stripped)
        if unordered:
            flush_paragraph()
            open_list("ul")
            html.append(f"<li>{inline_markdown(unordered.group(1))}</li>")
            i += 1
            continue

        ordered = re.match(r"^\d+\.\s+(.+)$", stripped)
        if ordered:
            flush_paragraph()
            open_list("ol")
            html.append(f"<li>{inline_markdown(ordered.group(1))}</li>")
            i += 1
            continue

        if stripped.startswith(">"):
            flush_paragraph()
            close_list()
            html.append(f"<blockquote>{inline_markdown(stripped.lstrip('> ').strip())}</blockquote>")
            i += 1
            continue

        paragraph.append(stripped)
        i += 1

    flush_paragraph()
    close_list()
    if in_code:
        html.append("</code></pre>")
    return "".join(html)


@require_GET
def docs_test_page(request, topic="painel"):
    """Renderiza a rota experimental de documentacao."""

    normalized_topic = (topic or "painel").strip().lower()
    payload = docs_test_payload(normalized_topic)
    if not payload:
        raise Http404("Topico de documentacao de teste invalido")

    topics = [
        {
            "key": key,
            "title": value["title"],
            "description": value["description"],
            "kind": value["kind"],
        }
        for key, value in DOCS_TEST_TOPICS.items()
    ]
    return render(request, "docs_test_page.html", {"doc": payload, "topics": topics})
