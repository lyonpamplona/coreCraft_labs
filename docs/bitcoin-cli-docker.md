# Guia bitcoin-cli via Docker

Este guia reune comandos para verificar as redes Bitcoin Core do projeto usando `bitcoin-cli` dentro dos containers Docker.

Os comandos abaixo usam as variaveis de ambiente carregadas pelo `docker compose`, entao voce nao precisa colar usuario ou senha RPC manualmente.

## Visao Geral dos Containers

| Rede | Servico Compose | Container | Flag bitcoin-cli |
| --- | --- | --- | --- |
| Mainnet | `btc-mainnet` | `btc_mainnet` | sem flag de rede |
| Signet | `btc-signet` | `btc_signet` | `-signet` |
| Regtest | `btc-regtest` | `btc_regtest` | `-regtest` |

## Atalhos Recomendados

Mainnet:

```bash
docker compose exec btc-mainnet sh -lc 'bitcoin-cli -rpcuser="$MAINNET_RPC_USER" -rpcpassword="$MAINNET_RPC_PASS" getblockchaininfo'
```

Signet:

```bash
docker compose exec btc-signet sh -lc 'bitcoin-cli -signet -rpcuser="$SIGNET_RPC_USER" -rpcpassword="$SIGNET_RPC_PASS" getblockchaininfo'
```

Regtest:

```bash
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getblockchaininfo'
```

## Verificar Sincronizacao

### Estado completo da blockchain

Mainnet:

```bash
docker compose exec btc-mainnet sh -lc 'bitcoin-cli -rpcuser="$MAINNET_RPC_USER" -rpcpassword="$MAINNET_RPC_PASS" getblockchaininfo'
```

Signet:

```bash
docker compose exec btc-signet sh -lc 'bitcoin-cli -signet -rpcuser="$SIGNET_RPC_USER" -rpcpassword="$SIGNET_RPC_PASS" getblockchaininfo'
```

Regtest:

```bash
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getblockchaininfo'
```

O que observar:

- `chain`: rede ativa (`main`, `signet` ou `regtest`).
- `blocks`: altura validada localmente.
- `headers`: melhor cabecalho conhecido.
- `initialblockdownload`: `true` enquanto o node ainda sincroniza.
- `verificationprogress`: progresso aproximado da validacao.
- `pruned`: `true` em mainnet/signet quando o modo pruned esta ativo.

### Altura atual

```bash
docker compose exec btc-mainnet sh -lc 'bitcoin-cli -rpcuser="$MAINNET_RPC_USER" -rpcpassword="$MAINNET_RPC_PASS" getblockcount'
docker compose exec btc-signet sh -lc 'bitcoin-cli -signet -rpcuser="$SIGNET_RPC_USER" -rpcpassword="$SIGNET_RPC_PASS" getblockcount'
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getblockcount'
```

Retorna apenas o numero do ultimo bloco validado.

### Melhor hash conhecido

```bash
docker compose exec btc-mainnet sh -lc 'bitcoin-cli -rpcuser="$MAINNET_RPC_USER" -rpcpassword="$MAINNET_RPC_PASS" getbestblockhash'
docker compose exec btc-signet sh -lc 'bitcoin-cli -signet -rpcuser="$SIGNET_RPC_USER" -rpcpassword="$SIGNET_RPC_PASS" getbestblockhash'
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getbestblockhash'
```

Retorna o hash do bloco que o node considera ponta da melhor cadeia.

## Verificar Rede P2P

### Informacoes gerais da rede

```bash
docker compose exec btc-mainnet sh -lc 'bitcoin-cli -rpcuser="$MAINNET_RPC_USER" -rpcpassword="$MAINNET_RPC_PASS" getnetworkinfo'
docker compose exec btc-signet sh -lc 'bitcoin-cli -signet -rpcuser="$SIGNET_RPC_USER" -rpcpassword="$SIGNET_RPC_PASS" getnetworkinfo'
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getnetworkinfo'
```

Mostra versao do node, conexoes, redes suportadas, relay fee e informacoes de P2P.

### Quantidade de peers

```bash
docker compose exec btc-mainnet sh -lc 'bitcoin-cli -rpcuser="$MAINNET_RPC_USER" -rpcpassword="$MAINNET_RPC_PASS" getconnectioncount'
docker compose exec btc-signet sh -lc 'bitcoin-cli -signet -rpcuser="$SIGNET_RPC_USER" -rpcpassword="$SIGNET_RPC_PASS" getconnectioncount'
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getconnectioncount'
```

Retorna a quantidade de conexoes P2P ativas. Em `regtest`, e normal retornar `0`.

### Lista de peers

```bash
docker compose exec btc-mainnet sh -lc 'bitcoin-cli -rpcuser="$MAINNET_RPC_USER" -rpcpassword="$MAINNET_RPC_PASS" getpeerinfo'
docker compose exec btc-signet sh -lc 'bitcoin-cli -signet -rpcuser="$SIGNET_RPC_USER" -rpcpassword="$SIGNET_RPC_PASS" getpeerinfo'
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getpeerinfo'
```

Mostra detalhes dos peers conectados: endereco, direcao da conexao, altura informada pelo peer, latencia, versao e flags.

## Verificar Mempool

### Estado da mempool

```bash
docker compose exec btc-mainnet sh -lc 'bitcoin-cli -rpcuser="$MAINNET_RPC_USER" -rpcpassword="$MAINNET_RPC_PASS" getmempoolinfo'
docker compose exec btc-signet sh -lc 'bitcoin-cli -signet -rpcuser="$SIGNET_RPC_USER" -rpcpassword="$SIGNET_RPC_PASS" getmempoolinfo'
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getmempoolinfo'
```

Mostra quantidade de transacoes, uso de memoria, tamanho maximo e taxas agregadas.

### Listar transacoes pendentes

```bash
docker compose exec btc-mainnet sh -lc 'bitcoin-cli -rpcuser="$MAINNET_RPC_USER" -rpcpassword="$MAINNET_RPC_PASS" getrawmempool'
docker compose exec btc-signet sh -lc 'bitcoin-cli -signet -rpcuser="$SIGNET_RPC_USER" -rpcpassword="$SIGNET_RPC_PASS" getrawmempool'
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getrawmempool'
```

Retorna os txids atualmente na mempool.

## Consultar Blocos

### Buscar hash por altura

Exemplo mainnet, altura `0`:

```bash
docker compose exec btc-mainnet sh -lc 'bitcoin-cli -rpcuser="$MAINNET_RPC_USER" -rpcpassword="$MAINNET_RPC_PASS" getblockhash 0'
```

Signet:

```bash
docker compose exec btc-signet sh -lc 'bitcoin-cli -signet -rpcuser="$SIGNET_RPC_USER" -rpcpassword="$SIGNET_RPC_PASS" getblockhash 0'
```

Regtest:

```bash
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getblockhash 0'
```

`getblockhash <altura>` retorna o hash do bloco na altura indicada.

### Consultar bloco por hash

```bash
docker compose exec btc-regtest sh -lc 'HASH=$(bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getbestblockhash); bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getblock "$HASH"'
```

Retorna dados do bloco: hash, confirmações, altura, tempo, transacoes e tamanho.

### Consultar cabecalho de bloco

```bash
docker compose exec btc-regtest sh -lc 'HASH=$(bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getbestblockhash); bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getblockheader "$HASH"'
```

Retorna somente o cabecalho do bloco, util para verificacoes rapidas.

## Wallet e Mineracao em Regtest

Mineracao deve ser usada apenas em `regtest`. Mainnet permanece com `disablewallet=1`; Signet pode manter wallet habilitada para a faucet local `corecraft_faucet`.

### Listar wallets carregadas

```bash
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" listwallets'
```

Mostra as wallets atualmente carregadas no processo Bitcoin Core.

### Listar wallets existentes no disco

```bash
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" listwalletdir'
```

Mostra wallets criadas no volume, mesmo que nao estejam carregadas.

### Criar wallet padrao do painel

```bash
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" createwallet corecraft'
```

Cria a wallet `corecraft`, usada pelos botoes do painel.

### Carregar wallet padrao

```bash
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" loadwallet corecraft'
```

Carrega a wallet `corecraft` quando ela ja existe no disco, mas ainda nao esta carregada.

### Gerar endereco

```bash
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getnewaddress'
```

Gera um endereco novo na wallet carregada.

### Minerar 1 bloco para um endereco automatico

```bash
docker compose exec btc-regtest sh -lc 'ADDR=$(bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getnewaddress); bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" generatetoaddress 1 "$ADDR"'
```

Gera um endereco e minera 1 bloco para ele.

### Minerar 101 blocos para amadurecer coinbase

```bash
docker compose exec btc-regtest sh -lc 'ADDR=$(bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getnewaddress); bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" generatetoaddress 101 "$ADDR"'
```

Em Bitcoin, recompensas coinbase precisam de 100 confirmações para serem gastas. Minerar 101 blocos deixa saldo maduro para testes.

### Ver saldo

```bash
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getbalance'
```

Mostra o saldo disponivel da wallet carregada.

## Wallet da Faucet em Signet

Esses comandos preparam a wallet usada pelo botao **Pingar Faucet**.

```bash
docker compose exec btc-signet sh -lc 'bitcoin-cli -signet -rpcuser="$SIGNET_RPC_USER" -rpcpassword="$SIGNET_RPC_PASS" createwallet corecraft_faucet'
docker compose exec btc-signet sh -lc 'bitcoin-cli -signet -rpcuser="$SIGNET_RPC_USER" -rpcpassword="$SIGNET_RPC_PASS" loadwallet corecraft_faucet'
docker compose exec btc-signet sh -lc 'bitcoin-cli -signet -rpcuser="$SIGNET_RPC_USER" -rpcpassword="$SIGNET_RPC_PASS" getbalance'
```

Depois envie fundos Signet de teste para um endereco dessa wallet:

```bash
docker compose exec btc-signet sh -lc 'bitcoin-cli -signet -rpcuser="$SIGNET_RPC_USER" -rpcpassword="$SIGNET_RPC_PASS" getnewaddress'
```

## Diagnostico de Credenciais RPC

Use estes comandos quando aparecer `Erro de autenticacao RPC` no painel.

```bash
docker compose exec btc-mainnet sh -lc 'bitcoin-cli -rpcuser="$MAINNET_RPC_USER" -rpcpassword="$MAINNET_RPC_PASS" getblockchaininfo >/dev/null && echo mainnet_rpc_ok'
docker compose exec btc-signet sh -lc 'bitcoin-cli -signet -rpcuser="$SIGNET_RPC_USER" -rpcpassword="$SIGNET_RPC_PASS" getblockchaininfo >/dev/null && echo signet_rpc_ok'
docker compose exec btc-regtest sh -lc 'bitcoin-cli -regtest -rpcuser="$REGTEST_RPC_USER" -rpcpassword="$REGTEST_RPC_PASS" getblockchaininfo >/dev/null && echo regtest_rpc_ok'
```

Se algum falhar com `Incorrect rpcuser or rpcpassword`, sincronize o `bitcoin.conf` com o `.env`:

```bash
python3 scripts/sync_rpcauth.py
docker compose up -d --force-recreate btc-mainnet btc-signet btc-regtest zmq-listener web-app
```

## Logs Uteis

```bash
docker compose logs -f btc-mainnet
docker compose logs -f btc-signet
docker compose logs -f btc-regtest
docker compose logs -f zmq-listener
docker compose logs -f web-app
```

Use logs dos nodes para acompanhar sincronizacao, peers, pruning, carregamento de wallet e tentativas incorretas de autenticacao RPC.
