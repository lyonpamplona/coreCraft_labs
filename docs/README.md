# Documentacao Tecnica

Este diretorio descreve o coreCraft Multi-Node no estado atual do codigo.

Leitura recomendada:

1. [Guia de apresentacao do projeto](apresentacao.md): narrativa executiva, proposta, arquitetura resumida e roteiro de demo.
2. [Tutorial da plataforma](tutorial-plataforma.md): passo a passo de uso e explicacao detalhada das funcoes da tela.
3. [Redesign da interface IDE](redesign-interface-ide.md): organizacao visual, areas da tela e regras de uso.
4. [Refatoracao do painel IDE](refatoracao-painel.md): separacao do template, arquivos CSS/JS e validacao visual.
5. [Arquitetura](arquitetura.md): componentes, containers e limites do sistema.
6. [Fluxos do sistema](fluxos.md): terminal RPC multi-rede, dashboard, WebSocket e ZMQ.
7. [Modulos e responsabilidades](modulos.md): papel de cada arquivo.
8. [Configuracao e operacao](configuracao.md): portas, dependencias, execucao e troubleshooting.
9. [Guia de comandos](comandos.md): comandos de uso, operacao, RPC, logs e diagnostico.
10. [Relatorio tecnico do estado atual](relatorio-tecnico-estado-atual.md): analise do codigo, riscos, achados e recomendacoes.
11. [bitcoin-cli via Docker](bitcoin-cli-docker.md): comandos diretos nos containers para verificar redes, mempool, peers, blocos e wallet regtest.
12. [Mapa do codigo](codigo.md): funcoes, classes, contratos e pontos de extensao.

O objetivo do projeto e oferecer um ambiente local para estudo, automacao e observabilidade de nodes Bitcoin Core em `mainnet`, `signet` e `regtest`.
