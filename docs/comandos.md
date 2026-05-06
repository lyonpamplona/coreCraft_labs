# Guia de Comandos do Sistema

Para um passo a passo completo da interface, consulte [Tutorial da plataforma](tutorial-plataforma.md). Para uma narrativa de apresentacao e demo, consulte [Guia de apresentacao do projeto](apresentacao.md). Para comandos diretos com `bitcoin-cli` dentro dos containers, consulte [bitcoin-cli via Docker](bitcoin-cli-docker.md).

## Subir e Parar

Preparar arquivos locais na primeira execucao:

```bash
cp .env.example .env
cp bitcoin.conf.example bitcoin.conf
```

Depois gere `rpcauth` por rede, atualize `bitcoin.conf` e coloque as senhas correspondentes no `.env`.

```bash
docker compose up --build
docker compose up --build -d
docker compose ps
docker compose down
docker compose restart
```

Reiniciar servicos especificos:

```bash
docker compose restart web-app
docker compose restart zmq-listener
docker compose restart btc-regtest
```

## Logs

```bash
docker compose logs -f web-app
docker compose logs -f zmq-listener
docker compose logs -f btc-mainnet
docker compose logs -f btc-signet
docker compose logs -f btc-regtest
docker compose logs -f redis
```

## Validacao

```bash
docker compose config
PYTHONPYCACHEPREFIX=/tmp/bitcoin-regtest-pycache python3 -m py_compile manage.py core/settings.py core/urls.py core/views.py core/wsgi.py core/asgi.py core/consumers.py core/zmq_listener.py core/auth.py core/rpc.py
ruff check core/ manage.py
npx eslint static/js/panel/
```

## Terminal Web

Acesse:

```text
http://localhost:8005
```

Quando solicitado, informe o valor de `APP_AUTH_TOKEN` configurado no `.env`.
O navegador recebera um cookie `HttpOnly` de sessao; chamadas manuais via `curl` podem continuar usando o header `X-CoreCraft-Token`.

Comandos uteis:

```text
getblockchaininfo
getblockcount
getbestblockhash
getnetworkinfo
getmempoolinfo
getrawmempool
estimatesmartfee 6
help
help blockchain
help control
help mining
help network
help rawtransactions
help signer
help util
help wallet
help zmq
```

O comando `help` exibe o help completo real do Bitcoin Core. O formato
`help <categoria>` filtra a secao completa correspondente, sem usar lista
resumida local. Quando o argumento nao e uma categoria, o painel tenta consultar
a ajuda especifica do comando, por exemplo:

```text
help getblock
help getnewaddress
```

## Regtest

Criar carteira:

```text
createwallet miner
```

Gerar endereco:

```text
getnewaddress
```

O painel usa a wallet regtest padrao `corecraft` para os botoes **Endereco**, **Saldo**, **Forjar 100** e **Forjar 1**. Se ela nao estiver carregada, a interface tenta executar `loadwallet corecraft`; se ela nao existir, tenta `createwallet corecraft`.

Minerar um bloco:

```text
generatetoaddress 1 <endereco>
```

Minerar 101 blocos para amadurecer coinbase:

```text
generatetoaddress 101 <endereco>
```

Atalhos equivalentes na toolbar regtest:

```text
Forjar 1    -> getnewaddress + generatetoaddress 1 <endereco>
Forjar 100  -> getnewaddress + generatetoaddress 100 <endereco>
```

Use **Forjar 1** seguido de **Forjar 100** em uma rede zerada quando quiser
atingir a maturacao de coinbase durante uma demo.

Ver saldo:

```text
getbalance
```

## Signet

Comandos de leitura recomendados:

```text
getblockchaininfo
getblockcount
getbestblockhash
getmempoolinfo
getnetworkinfo
getpeerinfo
help network
```

O botao **Pingar Faucet** chama a API interna e solicita `0.01 sBTC` da wallet
`corecraft_faucet`. Para preparar a wallet no node Signet:

```text
createwallet corecraft_faucet
loadwallet corecraft_faucet
getnewaddress
```

Depois envie fundos Signet de teste para a wallet. O backend nao aceita valor
nem endereco arbitrario do navegador; ele gera o destino e envia sempre o valor
fixo definido na view.

## bitcoin-cli

Executar comandos no container regtest:

```bash
docker compose exec btc-regtest bitcoin-cli -regtest -rpcuser=<usuario> -rpcpassword=<senha> getblockchaininfo
docker compose exec btc-regtest bitcoin-cli -regtest -rpcuser=<usuario> -rpcpassword=<senha> getblockcount
docker compose exec btc-regtest bitcoin-cli -regtest -rpcuser=<usuario> -rpcpassword=<senha> createwallet miner
docker compose exec btc-regtest bitcoin-cli -regtest -rpcuser=<usuario> -rpcpassword=<senha> getnewaddress
docker compose exec btc-regtest bitcoin-cli -regtest -rpcuser=<usuario> -rpcpassword=<senha> generatetoaddress 1 <endereco>
```

Signet:

```bash
docker compose exec btc-signet bitcoin-cli -signet -rpcuser=<usuario> -rpcpassword=<senha> getblockchaininfo
```

Mainnet:

```bash
docker compose exec btc-mainnet bitcoin-cli -rpcuser=<usuario> -rpcpassword=<senha> getblockchaininfo
```

## API HTTP

Chamar `/terminal/` diretamente com token:

```bash
curl -X POST http://localhost:8005/terminal/ \
  -H "Content-Type: application/json" \
  -H "X-CoreCraft-Token: <APP_AUTH_TOKEN>" \
  --data '{"network":"regtest","command":"getblockchaininfo"}'
```

Healthcheck da aplicacao:

```bash
curl http://localhost:8005/health/
```

Consultar APIs agregadas do dashboard:

```bash
curl "http://localhost:8005/api/blockchain/lag/?network=regtest" \
  -H "X-CoreCraft-Token: <APP_AUTH_TOKEN>"

curl "http://localhost:8005/api/mempool/summary/?network=regtest" \
  -H "X-CoreCraft-Token: <APP_AUTH_TOKEN>"

curl "http://localhost:8005/api/events/summary/?network=regtest" \
  -H "X-CoreCraft-Token: <APP_AUTH_TOKEN>"

curl "http://localhost:8005/api/events/latest/?network=regtest" \
  -H "X-CoreCraft-Token: <APP_AUTH_TOKEN>"

curl "http://localhost:8005/api/events/state-comparison/?network=regtest" \
  -H "X-CoreCraft-Token: <APP_AUTH_TOKEN>"

curl "http://localhost:8005/api/faucet/balance/?network=signet" \
  -H "X-CoreCraft-Token: <APP_AUTH_TOKEN>"

curl -X POST http://localhost:8005/api/faucet/dispense/ \
  -H "Content-Type: application/json" \
  -H "X-CoreCraft-Token: <APP_AUTH_TOKEN>" \
  --data '{"network":"signet"}'
```

Limpar a sessao autenticada do navegador:

```bash
curl -X POST http://localhost:8005/auth/logout/
```

## Testar Eventos ZMQ

1. Abra a interface.
2. Selecione `REGTEST`.
3. Execute:

   ```text
   getnewaddress
   generatetoaddress 1 <endereco>
   ```

4. Veja logs:

   ```bash
   docker compose logs -f zmq-listener
   ```

5. A timeline deve receber o evento de bloco.

## Shells de Diagnostico

```bash
docker compose exec web-app sh
docker compose exec zmq-listener sh
docker compose exec redis redis-cli ping
docker compose exec redis redis-cli keys 'zmq:*'
docker compose exec btc-regtest sh
```

## Git

```bash
git status --short
git add .
git commit -m "Audita projeto e atualiza documentacao tecnica"
```
