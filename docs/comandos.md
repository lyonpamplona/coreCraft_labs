# Guia de Comandos do Sistema

Este arquivo reune os comandos mais importantes para usar, operar, testar e diagnosticar o Bitcoin Regtest Terminal.

## 1. Subir o Ambiente

Subir todos os servicos e reconstruir a imagem da aplicacao:

```bash
docker compose up --build
```

Subir em segundo plano:

```bash
docker compose up --build -d
```

Verificar containers ativos:

```bash
docker compose ps
```

Acessar a interface:

```text
http://localhost:8005
```

## 2. Encerrar, Reiniciar e Reconstruir

Parar e remover containers da aplicacao:

```bash
docker compose down
```

Parar sem remover:

```bash
docker compose stop
```

Iniciar novamente containers parados:

```bash
docker compose start
```

Reiniciar todos os servicos:

```bash
docker compose restart
```

Reiniciar apenas a interface web:

```bash
docker compose restart web-app
```

Reiniciar apenas o listener ZMQ:

```bash
docker compose restart zmq-listener
```

Reconstruir a imagem sem usar cache:

```bash
docker compose build --no-cache
```

## 3. Logs e Diagnostico dos Servicos

Ver todos os logs:

```bash
docker compose logs -f
```

Logs da aplicacao Django/ASGI:

```bash
docker compose logs -f web-app
```

Logs do Bitcoin Core:

```bash
docker compose logs -f bitcoind
```

Logs do Redis:

```bash
docker compose logs -f redis
```

Logs do listener ZMQ:

```bash
docker compose logs -f zmq-listener
```

Ver ultimas 100 linhas de um servico:

```bash
docker compose logs --tail=100 web-app
```

Validar a configuracao final do Compose:

```bash
docker compose config
```

## 4. Comandos no Terminal Web

Digite estes comandos diretamente no terminal da interface em `http://localhost:8005`.

### Informacoes do Node e da Rede

Ver informacoes gerais da blockchain:

```text
getblockchaininfo
```

Ver altura atual:

```text
getblockcount
```

Ver hash do melhor bloco:

```text
getbestblockhash
```

Ver informacoes da rede P2P:

```text
getnetworkinfo
```

Ver peers conectados:

```text
getpeerinfo
```

Em `regtest` local, e comum `getpeerinfo` retornar lista vazia.

### Carteira

Criar uma carteira simples:

```text
createwallet miner
```

Ver informacoes da carteira carregada:

```text
getwalletinfo
```

Gerar novo endereco:

```text
getnewaddress
```

Ver saldo:

```text
getbalance
```

Listar transacoes recentes:

```text
listtransactions
```

### Mineracao em Regtest

Fluxo manual para minerar:

1. Gere um endereco:

   ```text
   getnewaddress
   ```

2. Use o endereco retornado:

   ```text
   generatetoaddress 1 <endereco>
   ```

Minerar 101 blocos para amadurecer recompensa coinbase:

```text
generatetoaddress 101 <endereco>
```

Depois disso, confira o saldo:

```text
getbalance
```

### Mempool

Ver estado da mempool:

```text
getmempoolinfo
```

Listar transacoes pendentes:

```text
getrawmempool
```

O dashboard da interface executa `getmempoolinfo` automaticamente a cada 3 segundos.

### Blocos

Pegar hash de um bloco por altura:

```text
getblockhash 1
```

Consultar um bloco com detalhes:

```text
getblock <hash> true
```

Consultar cabecalho de bloco:

```text
getblockheader <hash>
```

## 5. Macros da Interface

A interface possui botoes de acao rapida:

| Botao | Comando executado |
| --- | --- |
| Saldo | `getbalance` |
| Novo Endereco | `getnewaddress` |
| Info da Rede | `getblockchaininfo` |
| Forjar 1 Bloco | `getnewaddress` e depois `generatetoaddress 1 <endereco>` |

Se a macro "Forjar 1 Bloco" falhar ao gerar endereco, crie uma carteira primeiro:

```text
createwallet miner
```

## 6. Usar `bitcoin-cli` Dentro do Container

Executar comando direto no container `bitcoind`:

```bash
docker compose exec bitcoind bitcoin-cli -regtest -rpcuser=lyon -rpcpassword=senha_segura getblockchaininfo
```

Ver altura:

```bash
docker compose exec bitcoind bitcoin-cli -regtest -rpcuser=lyon -rpcpassword=senha_segura getblockcount
```

Criar wallet:

```bash
docker compose exec bitcoind bitcoin-cli -regtest -rpcuser=lyon -rpcpassword=senha_segura createwallet miner
```

Gerar endereco:

```bash
docker compose exec bitcoind bitcoin-cli -regtest -rpcuser=lyon -rpcpassword=senha_segura getnewaddress
```

Minerar para um endereco:

```bash
docker compose exec bitcoind bitcoin-cli -regtest -rpcuser=lyon -rpcpassword=senha_segura generatetoaddress 1 <endereco>
```

Consultar mempool:

```bash
docker compose exec bitcoind bitcoin-cli -regtest -rpcuser=lyon -rpcpassword=senha_segura getmempoolinfo
```

## 7. Usar RPC via `curl` no Host

Como a porta `18443` esta publicada no host, tambem e possivel chamar RPC diretamente:

```bash
curl --user lyon:senha_segura \
  --data-binary '{"jsonrpc":"1.0","id":"curl","method":"getblockchaininfo","params":[]}' \
  -H 'content-type:text/plain;' \
  http://127.0.0.1:18443/
```

Consultar altura:

```bash
curl --user lyon:senha_segura \
  --data-binary '{"jsonrpc":"1.0","id":"curl","method":"getblockcount","params":[]}' \
  -H 'content-type:text/plain;' \
  http://127.0.0.1:18443/
```

Minerar um bloco:

```bash
curl --user lyon:senha_segura \
  --data-binary '{"jsonrpc":"1.0","id":"curl","method":"generatetoaddress","params":[1,"<endereco>"]}' \
  -H 'content-type:text/plain;' \
  http://127.0.0.1:18443/
```

## 8. Testar a Aplicacao Django

Validar sintaxe dos arquivos Python:

```bash
PYTHONPYCACHEPREFIX=/tmp/bitcoin-regtest-pycache python3 -m py_compile manage.py core/settings.py core/urls.py core/views.py core/wsgi.py core/asgi.py core/consumers.py core/zmq_listener.py
```

Executar checks do Django dentro do container:

```bash
docker compose exec web-app python manage.py check
```

Abrir shell Python/Django:

```bash
docker compose exec web-app python manage.py shell
```

## 9. Testar WebSocket e ZMQ

O caminho esperado de eventos e:

```text
bitcoind -> ZMQ rawtx/rawblock -> zmq-listener -> Redis/Channels -> /ws/btc/ -> navegador
```

Para gerar um evento `rawblock`:

```text
getnewaddress
generatetoaddress 1 <endereco>
```

Depois acompanhe:

```bash
docker compose logs -f zmq-listener
```

Se o frontend estiver aberto, o terminal deve mostrar um evento de bloco confirmado e o painel lateral deve receber um novo item.

## 10. Comandos de Inspecao de Containers

Entrar no container da aplicacao:

```bash
docker compose exec web-app sh
```

Entrar no container do Bitcoin Core:

```bash
docker compose exec bitcoind sh
```

Entrar no Redis:

```bash
docker compose exec redis redis-cli
```

Testar Redis:

```bash
docker compose exec redis redis-cli ping
```

Resposta esperada:

```text
PONG
```

## 11. Fluxo Recomendado de Primeiro Uso

1. Suba o ambiente:

   ```bash
   docker compose up --build
   ```

2. Abra:

   ```text
   http://localhost:8005
   ```

3. No terminal web, crie uma wallet:

   ```text
   createwallet miner
   ```

4. Gere um endereco:

   ```text
   getnewaddress
   ```

5. Minere 101 blocos para amadurecer saldo:

   ```text
   generatetoaddress 101 <endereco>
   ```

6. Confira o saldo:

   ```text
   getbalance
   ```

7. Confira a altura:

   ```text
   getblockcount
   ```

8. Use o botao "Forjar 1 Bloco" para testar o fluxo WebSocket/ZMQ.

## 12. Problemas Comuns

### Porta `8005` ocupada

Altere o mapeamento em `docker-compose.yaml`:

```yaml
ports:
  - "8006:8000"
```

Depois suba novamente:

```bash
docker compose up --build
```

### `getnewaddress` retorna erro

Crie ou carregue uma wallet:

```text
createwallet miner
```

### Eventos em tempo real nao aparecem

Confira se Redis e listener estao ativos:

```bash
docker compose ps
docker compose logs -f redis
docker compose logs -f zmq-listener
```

Gere um bloco para forcar evento:

```text
getnewaddress
generatetoaddress 1 <endereco>
```

### RPC retorna erro de autenticacao

Verifique se os valores batem:

```text
rpcuser=lyon
rpcpassword=senha_segura
```

Esses valores aparecem em `bitcoin.conf` e em `core/views.py`.

### Interface abre, mas CDN do xterm.js falha

O navegador precisa carregar:

```text
https://cdn.jsdelivr.net/npm/xterm@5.1.0/
```

Em ambiente sem internet, baixe e sirva o xterm.js localmente.

## 13. Git

Inicializar repositorio local, caso ainda nao exista:

```bash
git init
```

Ver status:

```bash
git status --short
```

Adicionar arquivos:

```bash
git add .
```

Criar commit inicial:

```bash
git commit -m "Documenta arquitetura e comandos do Bitcoin Regtest Terminal"
```
