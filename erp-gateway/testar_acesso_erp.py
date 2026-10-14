#!/usr/bin/env python3
"""
Testa, de qualquer máquina, se o IP dela está liberado para consultar o ERP.

Versão Python do `testar-acesso-erp.ps1` — mesmo diagnóstico, mesmos códigos de
saída. Existem as duas porque a máquina a testar nem sempre tem as duas coisas:
o .ps1 roda em Windows pelado, este roda onde houver Python (inclusive Linux).

SÓ BIBLIOTECA PADRÃO, DE PROPÓSITO. Nada de `psycopg2`: o teste precisa rodar
numa máquina recém-chegada, antes de qualquer `pip install`. O protocolo do
Postgres é falado na mão aqui mesmo.

Um teste de porta (telnet, nc, socket.connect) NÃO responde a pergunta: a porta
pode estar aberta e o servidor recusar o IP logo depois, no pg_hba.conf. Por
isso mandamos o StartupMessage e olhamos a PRIMEIRA resposta do servidor:

    'R' (pedido de autenticação)    -> IP LIBERADO. O servidor só chega a pedir
                                       senha depois de aprovar o endereço.
    'E' citando pg_hba.conf         -> chegou no servidor, mas o acesso NÃO está
                                       liberado. A mensagem devolve o endereço
                                       COMO O SERVIDOR O VÊ.
    nada / conexão recusada         -> parou antes do Postgres: VPN fora do ar
                                       ou firewall no caminho.

NENHUMA CREDENCIAL É USADA. Desligamos assim que o servidor pede autenticação,
então o script roda em máquina sem .env e sem senha.

Uso:
    python testar_acesso_erp.py
    python testar_acesso_erp.py --usuario USUARIO_REAL

Saída: 0 = liberado, 1 = recusado pelo pg_hba, 2 = não chegou lá.
"""

import argparse
import os
import socket
import struct
import sys
import urllib.request

SERVIDOR_PADRAO = "26.238.137.203"
PORTA_PADRAO = 5432
BANCO_PADRAO = "ciclone"
USUARIO_PADRAO = "powerbi"


def decodificar(dados: bytes) -> str:
    """Decodifica texto vindo do servidor.

    A mensagem de erro chega ANTES de qualquer negociação de client_encoding,
    ou seja, na codificação do próprio servidor — e o Ciclone roda em WIN1252
    (ver ERP_ENCODING em config.py). Tratar tudo como UTF-8 entregava "usu?rio"
    e "sem encripta??o" justamente na frase que o operador precisa ler e
    repassar para quem administra o banco.
    """
    try:
        return dados.decode("utf-8")
    except UnicodeDecodeError:
        return dados.decode("cp1252", errors="replace")


def montar_startup(usuario: str, banco: str) -> bytes:
    """StartupMessage: tamanho + versão 3.0 + pares chave/valor terminados em \\0."""
    corpo = struct.pack("!i", 196608)  # protocolo 3.0
    for chave, valor in (("user", usuario), ("database", banco)):
        corpo += chave.encode("ascii") + b"\x00" + valor.encode("ascii") + b"\x00"
    corpo += b"\x00"
    return struct.pack("!i", len(corpo) + 4) + corpo


def ler_resposta(sock: socket.socket) -> bytes:
    """Lê a resposta inteira, tolerando o reset que vem logo atrás dela.

    O Postgres manda o ErrorResponse e derruba a conexão em seguida. Quando o
    RST chega antes de lermos tudo, o `recv` levanta ConnectionResetError — e o
    que já veio no buffer pode ser descartado pelo sistema. Por isso pegamos o
    máximo de uma vez e engolimos o erro SE já houver bytes: o diagnóstico está
    neles. Sem isto, o caso "acesso recusado" — justamente o que este script
    existe para explicar — virava um "servidor não fala Postgres".
    """
    dados = b""
    try:
        while True:
            pedaco = sock.recv(8192)
            if not pedaco:
                break
            dados += pedaco
            if len(dados) >= 5:
                # O campo de tamanho conta a si mesmo, mas não o byte de tipo.
                total = 1 + struct.unpack("!i", dados[1:5])[0]
                if len(dados) >= total:
                    break
    except (socket.timeout, ConnectionResetError, OSError):
        pass  # o que já chegou basta; se nada chegou, quem chamou trata
    return dados


def ler_campos_erro(corpo: bytes) -> dict:
    """ErrorResponse: pares (código de 1 byte + texto terminado em \\0), até um \\0."""
    campos = {}
    for pedaco in corpo.split(b"\x00"):
        if len(pedaco) < 2:
            continue
        campos[chr(pedaco[0])] = decodificar(pedaco[1:])
    return campos


def descobrir_ip_publico(timeout: float) -> str:
    try:
        with urllib.request.urlopen("https://api.ipify.org", timeout=timeout) as r:
            return r.read().decode("ascii").strip()
    except Exception:
        return ""


def listar_ips_locais() -> list:
    try:
        infos = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
        return sorted({info[4][0] for info in infos if info[4][0] != "127.0.0.1"})
    except socket.gaierror:
        return []


def secao(texto: str) -> None:
    print()
    print(texto)
    print("-" * len(texto))


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Testa se esta máquina tem acesso liberado ao ERP Ciclone.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--servidor", default=os.getenv("ERP_HOST", SERVIDOR_PADRAO))
    ap.add_argument("--porta", type=int, default=int(os.getenv("ERP_PORT", PORTA_PADRAO)))
    ap.add_argument("--banco", default=os.getenv("ERP_DATABASE", BANCO_PADRAO))
    ap.add_argument("--usuario", default=os.getenv("ERP_USER", USUARIO_PADRAO))
    ap.add_argument("--timeout", type=float, default=10.0)
    args = ap.parse_args()

    print()
    print("=== Teste de acesso ao ERP Ciclone ===")

    # ------------------------------------------------------------------
    # Quem é esta máquina
    # ------------------------------------------------------------------
    # Impresso ANTES do teste: se o acesso falhar, é este bloco que diz qual
    # endereço pedir para liberarem.
    secao("Identidade desta máquina")
    print(f"  Computador  : {socket.gethostname()}")

    publico = descobrir_ip_publico(min(args.timeout, 8))
    print(f"  IP público  : {publico or 'não foi possível descobrir (sem internet?)'}")

    for ip in listar_ips_locais():
        nota = "  <- Radmin VPN" if ip.startswith("26.") else ""
        print(f"  IP local    : {ip}{nota}")

    # ------------------------------------------------------------------
    # 1. Chegar até o servidor
    # ------------------------------------------------------------------
    secao(f"1. Alcançando {args.servidor}:{args.porta}")

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(args.timeout)
    try:
        sock.connect((args.servidor, args.porta))
    except OSError as erro:
        sock.close()
        print(f"  FALHOU: {erro}")
        print()
        print("RESULTADO: SEM ACESSO - a conexão nem chegou ao Postgres.")
        print()
        print("Não dá para dizer se o IP está liberado: o teste parou antes disso.")
        print("Verifique, nesta ordem:")
        print("  1. A Radmin VPN está instalada e CONECTADA nesta máquina?")
        print("     (sem ela, o endereço 26.x não existe para este computador)")
        print("  2. O servidor do ERP está ligado e com a VPN dele no ar?")
        print("  3. Algum firewall/antivírus local bloqueia a saída na porta 5432?")
        return 2

    # A rota escolhida pelo sistema é o que decide o endereço de origem. Entre
    # várias placas (Radmin, Tailscale, Ethernet), é ESTE o IP que o servidor
    # vai enxergar e o único que adianta liberar no pg_hba.
    origem = sock.getsockname()[0]
    print("  OK: porta aberta e conexão TCP estabelecida.")
    print(f"  Esta conexão sai pelo IP {origem} - é o que o servidor enxerga.")
    print("  (a porta aberta ainda NÃO significa acesso liberado: falta o pg_hba.conf)")

    # ------------------------------------------------------------------
    # 2. Perguntar ao Postgres se ele aceita este IP
    # ------------------------------------------------------------------
    secao(f"2. O Postgres aceita este IP? (usuário '{args.usuario}', banco '{args.banco}')")

    try:
        sock.sendall(montar_startup(args.usuario, args.banco))
        resposta = ler_resposta(sock)
    finally:
        sock.close()

    if len(resposta) < 5:
        print("  O servidor fechou a conexão sem responder.")
        print()
        print("RESULTADO: INDEFINIDO - algo aceitou o TCP mas não fala Postgres.")
        print("Suspeitas: firewall/proxy respondendo no lugar do banco, ou porta errada.")
        return 2

    tipo = chr(resposta[0])
    fim = min(len(resposta), 1 + struct.unpack("!i", resposta[1:5])[0])
    corpo = resposta[5:fim]

    if tipo == "R":
        metodo = struct.unpack("!i", corpo[:4])[0]
        nomes = {
            0: "sem senha (trust)",
            3: "senha em texto puro",
            5: "senha MD5",
            10: "SCRAM-SHA-256",
        }
        print(f"  O servidor PEDIU autenticação ({nomes.get(metodo, f'método {metodo}')}).")
        print("  Ele só chega a pedir senha DEPOIS de aprovar o IP no pg_hba.conf.")
        print()
        print("RESULTADO: ACESSO LIBERADO para consulta.")
        print()
        print("Encerrado aqui de propósito: nenhuma senha foi enviada.")
        print("Falta só esta máquina ter as credenciais (ERP_USER / ERP_PASSWORD).")
        return 0

    if tipo == "E":
        campos = ler_campos_erro(corpo)
        mensagem = campos.get("M", "(sem mensagem)")
        print(f"  O servidor RECUSOU. SQLSTATE {campos.get('C', '?')}")
        print(f"  {mensagem}")
        print()

        # O servidor responde no idioma dele (esta instalação está em pt_BR:
        # "nenhuma entrada em pg_hba.conf para o hospedeiro..."). Por isso
        # procuramos o nome do ARQUIVO, que não é traduzido, e não a frase.
        #
        # E não trate "sem encriptação" / "SSL off" como "o servidor exige SSL":
        # é só o descritor padrão do estado da conexão e aparece em TODA recusa
        # de pg_hba sem TLS.
        if "pg_hba" in mensagem:
            print("RESULTADO: ACESSO NAO LIBERADO.")
            print()
            print("A máquina CHEGA no servidor, mas o pg_hba.conf não tem entrada para ela.")
            print("A mensagem acima traz o endereço COMO O SERVIDOR O VÊ - é esse endereço")
            print("que precisa ser liberado, e NÃO o IP público impresso lá em cima: dentro")
            print(f"da Radmin VPN quem chega no banco é o {origem}.")
            print()
            print("Cuidado: o pg_hba casa a TRINCA (endereço, usuário, banco), e a recusa não")
            print(f"diz qual dos três falhou. Este teste usou o usuário '{args.usuario}'; se não")
            print("for o usuário que o app realmente usa, repita com:")
            print("  python testar_acesso_erp.py --usuario USUARIO_REAL")
            return 1

        # Passou do pg_hba (senão o erro citaria o arquivo): o endereço está OK
        # e o que sobrou é usuário ou banco inexistente.
        print("RESULTADO: ACESSO LIBERADO.")
        print()
        print("O erro acima é POSTERIOR à checagem de endereço (usuário ou banco")
        print("inexistente), o que só acontece depois de o pg_hba.conf aprovar a origem.")
        return 0

    print(f"  Resposta inesperada do servidor (tipo '{tipo}').")
    print()
    print("RESULTADO: INDEFINIDO.")
    return 2


if __name__ == "__main__":
    sys.exit(main())
