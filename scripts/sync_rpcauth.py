#!/usr/bin/env python3
"""Sincroniza os valores rpcauth do bitcoin.conf com as senhas do .env.

O script nao imprime usuarios, senhas nem hashes. Ele le as variaveis
<REDE>_RPC_USER e <REDE>_RPC_PASS do .env, gera novos valores rpcauth e
substitui apenas as linhas rpcauth dentro das secoes [main], [signet] e
[regtest] do bitcoin.conf local.
"""

import argparse
import hmac
import os
import secrets
from hashlib import sha256
from pathlib import Path


NETWORK_ENV = {
    "main": ("MAINNET_RPC_USER", "MAINNET_RPC_PASS"),
    "signet": ("SIGNET_RPC_USER", "SIGNET_RPC_PASS"),
    "regtest": ("REGTEST_RPC_USER", "REGTEST_RPC_PASS"),
}


def load_env(path):
    """Carrega um arquivo .env simples sem expandir valores."""
    values = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def rpcauth(user, password):
    """Gera a linha rpcauth no formato aceito pelo Bitcoin Core."""
    salt = secrets.token_hex(16)
    digest = hmac.new(salt.encode("utf-8"), password.encode("utf-8"), sha256).hexdigest()
    return f"rpcauth={user}:{salt}${digest}"


def replace_section_rpcauth(lines, section, new_line):
    """Substitui ou insere rpcauth dentro de uma secao bitcoin.conf."""
    section_header = f"[{section}]"
    inside = False
    replaced = False
    output = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            if inside and not replaced:
                output.append(new_line)
                replaced = True
            inside = stripped == section_header

        if inside and stripped.startswith("rpcauth="):
            if not replaced:
                output.append(new_line)
                replaced = True
            continue

        output.append(line)

    if inside and not replaced:
        output.append(new_line)
        replaced = True

    if not replaced:
        raise RuntimeError(f"Secao {section_header} nao encontrada em bitcoin.conf")

    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--bitcoin-conf", default="bitcoin.conf")
    args = parser.parse_args()

    env_path = Path(args.env_file)
    conf_path = Path(args.bitcoin_conf)

    env = load_env(env_path)
    lines = conf_path.read_text(encoding="utf-8").splitlines()

    for section, (user_key, pass_key) in NETWORK_ENV.items():
        user = env.get(user_key) or os.getenv(user_key)
        password = env.get(pass_key) or os.getenv(pass_key)
        if not user or not password:
            raise RuntimeError(f"Variaveis ausentes: {user_key}/{pass_key}")
        lines = replace_section_rpcauth(lines, section, rpcauth(user, password))

    conf_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("rpcauth sincronizado para mainnet, signet e regtest")


if __name__ == "__main__":
    main()
