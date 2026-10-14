<#
.SYNOPSIS
    Testa, de qualquer máquina, se o IP dela está liberado para consultar o ERP.

.DESCRIPTION
    Responde UMA pergunta: "esta máquina chega no Postgres do Ciclone e é aceita
    por ele?".

    Um teste de porta (Test-NetConnection) NÃO responde isso. A porta pode estar
    aberta e o servidor recusar o IP logo depois, no pg_hba.conf — o resultado
    seria um "TcpTestSucceeded: True" enganoso. Por isso o script fala o
    protocolo do Postgres na mão: manda o StartupMessage e lê a PRIMEIRA
    resposta do servidor.

      'R' (pedido de autenticação)   -> IP LIBERADO. O servidor só chega a pedir
                                        senha depois de aprovar o IP no pg_hba.
      'E' citando pg_hba.conf        -> chegou no servidor, mas o acesso NÃO
                                        está liberado. A mensagem devolve o
                                        endereço COMO O SERVIDOR O VÊ — é esse
                                        que precisa ser autorizado. (Esta
                                        instalação responde em português, daí
                                        procurarmos o nome do arquivo e não a
                                        frase.)
      nada / conexão recusada        -> parou antes do Postgres: VPN fora do ar
                                        ou firewall no caminho.

    NENHUMA CREDENCIAL É USADA. O script desliga assim que o servidor pede
    autenticação, então roda em máquina sem .env e sem senha.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\testar-acesso-erp.ps1

.EXAMPLE
    # O pg_hba casa a TRINCA (IP, usuário, banco). Testar com o usuário real
    # elimina a dúvida de um "não liberado" que na verdade era o usuário.
    .\testar-acesso-erp.ps1 -Usuario meu_usuario_do_erp

.NOTES
    O ERP fica atrás da Radmin VPN (faixa 26.x). Se o host não responder,
    confira ANTES se a Radmin está conectada nesta máquina — sem ela o endereço
    26.238.137.203 simplesmente não existe para o computador.

    Códigos de saída: 0 = liberado, 1 = recusado pelo pg_hba, 2 = não chegou lá.

    ⚠️ ESTE ARQUIVO PRECISA CONTINUAR EM UTF-8 **COM BOM** — mesma armadilha
    descrita em servico/instalar-gateway.ps1: sem BOM, o PowerShell 5.1 lê os
    travessões como CP1252 e o script deixa de compilar.
#>

[CmdletBinding()]
param(
    [string]$Servidor        = $env:ERP_HOST,
    [int]   $Porta           = 5432,
    [string]$Banco           = 'ciclone',
    [string]$Usuario         = $env:ERP_USER,
    [int]   $TimeoutSegundos = 10
)

$ErrorActionPreference = 'Stop'

if (-not $Servidor) { $Servidor = '26.238.137.203' }
if (-not $Usuario)  { $Usuario  = 'powerbi' }
$timeoutMs = $TimeoutSegundos * 1000

function Write-Secao([string]$Texto) {
    Write-Host ''
    Write-Host $Texto -ForegroundColor Cyan
    Write-Host ('-' * $Texto.Length) -ForegroundColor DarkGray
}

# Lê a resposta INTEIRA numa tacada só.
#
# Não separe isto em "lê o cabeçalho, depois lê o corpo": o Postgres manda o
# ErrorResponse e derruba a conexão em seguida, e no Windows um RST DESCARTA o
# que ainda não foi lido do buffer. A segunda leitura morria com "Foi forçado o
# cancelamento de uma conexão existente pelo host remoto" e o script culpava o
# servidor de não falar Postgres — justamente no caso que ele deveria
# diagnosticar.
function Read-Resposta($Fluxo) {
    $buffer = New-Object byte[] 8192
    $total = 0
    try {
        do {
            $n = $Fluxo.Read($buffer, $total, $buffer.Length - $total)
            if ($n -le 0) { break }
            $total += $n
        } while ($Fluxo.DataAvailable -and $total -lt $buffer.Length)
    } catch {
        # Reset depois de já termos bytes é o comportamento normal aqui.
    }
    if ($total -eq 0) { return $null }
    $resultado = New-Object byte[] $total
    [Array]::Copy($buffer, $resultado, $total)
    return ,$resultado   # a vírgula impede o PowerShell de desenrolar o array
}

# A mensagem de erro chega ANTES de qualquer negociação de client_encoding, ou
# seja, na codificação do próprio servidor — e o Ciclone roda em WIN1252 (ver
# ERP_ENCODING em config.py). Decodificar tudo como UTF-8 entregava "usu?rio" e
# "sem encripta??o" justamente na frase que o operador precisa ler e repassar.
# Tentamos UTF-8 com validação ESTRITA (para não silenciar o erro) e caímos para
# WIN1252 quando os bytes não formam UTF-8 válido.
function ConvertFrom-TextoServidor([byte[]]$Bytes, [int]$Inicio, [int]$Tamanho) {
    $estrito = New-Object System.Text.UTF8Encoding($false, $true)
    try   { return $estrito.GetString($Bytes, $Inicio, $Tamanho) }
    catch { return [System.Text.Encoding]::GetEncoding(1252).GetString($Bytes, $Inicio, $Tamanho) }
}

# O Postgres usa inteiros big-endian; o Windows é little-endian.
function ConvertFrom-Int32BE([byte[]]$Bytes, [int]$Inicio = 0) {
    return ([int]$Bytes[$Inicio]     -shl 24) -bor `
           ([int]$Bytes[$Inicio + 1] -shl 16) -bor `
           ([int]$Bytes[$Inicio + 2] -shl 8)  -bor `
            [int]$Bytes[$Inicio + 3]
}

Write-Host ''
Write-Host '=== Teste de acesso ao ERP Ciclone ===' -ForegroundColor White

# ---------------------------------------------------------------------------
# Quem é esta máquina
# ---------------------------------------------------------------------------
# Impresso ANTES do teste: se o acesso falhar, é este bloco que diz qual
# endereço pedir para liberarem.
Write-Secao 'Identidade desta máquina'
Write-Host ("  Computador  : {0}" -f $env:COMPUTERNAME)

try {
    $publico = Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 8
    Write-Host ("  IP público  : {0}" -f $publico) -ForegroundColor Yellow
} catch {
    Write-Host '  IP público  : não foi possível descobrir (sem internet?)' -ForegroundColor DarkYellow
}

try {
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object { $_.IPAddress -ne '127.0.0.1' } |
        Sort-Object IPAddress |
        ForEach-Object {
            $nota = if ($_.IPAddress -like '26.*') { '  <- Radmin VPN' } else { '' }
            Write-Host ("  IP local    : {0,-15} ({1}){2}" -f $_.IPAddress, $_.InterfaceAlias, $nota)
        }
} catch {
    Write-Host '  IP local    : (Get-NetIPAddress indisponível nesta versão do Windows)' -ForegroundColor DarkYellow
}

# ---------------------------------------------------------------------------
# 1. Chegar até o servidor
# ---------------------------------------------------------------------------
Write-Secao ("1. Alcançando {0}:{1}" -f $Servidor, $Porta)

$cliente     = New-Object System.Net.Sockets.TcpClient
$conectou    = $false
$erroConexao = $null
try {
    $async    = $cliente.BeginConnect($Servidor, $Porta, $null, $null)
    $conectou = $async.AsyncWaitHandle.WaitOne($timeoutMs, $false)
    if ($conectou) { $cliente.EndConnect($async) }
    else           { $erroConexao = "sem resposta em $TimeoutSegundos s" }
} catch {
    $conectou    = $false
    $erroConexao = $_.Exception.GetBaseException().Message
}

if (-not $conectou) {
    $cliente.Close()
    Write-Host ("  FALHOU: {0}" -f $erroConexao) -ForegroundColor Red
    Write-Host ''
    Write-Host 'RESULTADO: SEM ACESSO — a conexão nem chegou ao Postgres.' -ForegroundColor Red
    Write-Host ''
    Write-Host 'Não dá para dizer se o IP está liberado: o teste parou antes disso.' -ForegroundColor Yellow
    Write-Host 'Verifique, nesta ordem:' -ForegroundColor Yellow
    Write-Host '  1. A Radmin VPN está instalada e CONECTADA nesta máquina?'
    Write-Host '     (sem ela, o endereço 26.x não existe para este computador)'
    Write-Host '  2. O servidor do ERP está ligado e com a VPN dele no ar?'
    Write-Host '  3. Algum firewall/antivírus local bloqueia a saída na porta 5432?'
    exit 2
}

# A rota escolhida pelo sistema é o que decide o endereço de origem. Entre
# várias placas (Radmin, Tailscale, Ethernet), é ESTE o IP que o servidor vai
# enxergar e o único que adianta liberar no pg_hba — listar todos os IPs locais
# não diz qual deles sai por esta rota.
$origem = $cliente.Client.LocalEndPoint.Address.IPAddressToString

Write-Host '  OK: porta aberta e conexão TCP estabelecida.' -ForegroundColor Green
Write-Host ("  Esta conexão sai pelo IP {0} — é o que o servidor enxerga." -f $origem) -ForegroundColor Green
Write-Host '  (a porta aberta ainda NÃO significa acesso liberado: falta o pg_hba.conf)' -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
# 2. Perguntar ao Postgres se ele aceita este IP
# ---------------------------------------------------------------------------
Write-Secao ("2. O Postgres aceita este IP? (usuário '{0}', banco '{1}')" -f $Usuario, $Banco)

$saida = 2
try {
    $fluxo = $cliente.GetStream()
    $fluxo.ReadTimeout  = $timeoutMs
    $fluxo.WriteTimeout = $timeoutMs

    # StartupMessage: tamanho + versão 3.0 + pares chave/valor terminados em \0.
    $parametros = [System.Text.Encoding]::ASCII.GetBytes("user`0$Usuario`0database`0$Banco`0`0")
    $versao     = [byte[]](0x00, 0x03, 0x00, 0x00)
    $cabecalho  = [System.BitConverter]::GetBytes([int](4 + $versao.Length + $parametros.Length))
    if ([System.BitConverter]::IsLittleEndian) { [Array]::Reverse($cabecalho) }

    $fluxo.Write($cabecalho,  0, $cabecalho.Length)
    $fluxo.Write($versao,     0, $versao.Length)
    $fluxo.Write($parametros, 0, $parametros.Length)
    $fluxo.Flush()

    $resposta = Read-Resposta $fluxo
    if ($null -eq $resposta -or $resposta.Length -lt 5) {
        Write-Host '  O servidor fechou a conexão sem responder.' -ForegroundColor Red
        Write-Host ''
        Write-Host 'RESULTADO: INDEFINIDO — algo aceitou o TCP mas não fala Postgres.' -ForegroundColor Red
        Write-Host 'Suspeitas: firewall/proxy respondendo no lugar do banco, ou porta errada.' -ForegroundColor Yellow
        $cliente.Close()
        exit 2
    }

    # Formato: 1 byte de tipo + tamanho (int32, já contando a si mesmo) + corpo.
    $letra   = [char]$resposta[0]
    $tamanho = ConvertFrom-Int32BE $resposta 1
    $fim     = [Math]::Min($resposta.Length, 1 + $tamanho)   # exclusivo

    if ($letra -eq 'R') {
        $metodo = ConvertFrom-Int32BE $resposta 5
        $nome = switch ($metodo) {
            0       { 'sem senha (trust)' }
            3       { 'senha em texto puro' }
            5       { 'senha MD5' }
            10      { 'SCRAM-SHA-256' }
            default { "método $metodo" }
        }
        Write-Host ("  O servidor PEDIU autenticação ({0})." -f $nome) -ForegroundColor Green
        Write-Host '  Ele só chega a pedir senha DEPOIS de aprovar o IP no pg_hba.conf.' -ForegroundColor DarkGray
        Write-Host ''
        Write-Host 'RESULTADO: ACESSO LIBERADO para consulta.' -ForegroundColor Green
        Write-Host ''
        Write-Host 'Encerrado aqui de propósito: nenhuma senha foi enviada.' -ForegroundColor DarkGray
        Write-Host 'Falta só esta máquina ter as credenciais (ERP_USER / ERP_PASSWORD).' -ForegroundColor DarkGray
        $saida = 0
    }
    elseif ($letra -eq 'E') {
        # ErrorResponse: pares (código de 1 byte + texto terminado em \0), até um \0.
        $campos = @{}
        $i = 5
        while ($i -lt $fim -and $resposta[$i] -ne 0) {
            $codigo = [string][char]$resposta[$i]; $i++
            $inicio = $i
            while ($i -lt $fim -and $resposta[$i] -ne 0) { $i++ }
            $campos[$codigo] = ConvertFrom-TextoServidor $resposta $inicio ($i - $inicio)
            $i++
        }
        $sqlstate = $campos['C']
        $mensagem = $campos['M']
        Write-Host ("  O servidor RECUSOU. SQLSTATE {0}" -f $sqlstate) -ForegroundColor Red
        Write-Host ("  {0}" -f $mensagem) -ForegroundColor Red
        Write-Host ''

        # O servidor responde no idioma dele (a instalação do Ciclone está em
        # pt_BR: "nenhuma entrada em pg_hba.conf para o hospedeiro..."). Por isso
        # o teste procura o nome do ARQUIVO, que não é traduzido, e não a frase.
        #
        # Também não trate "sem encriptação" / "SSL off" como "o servidor exige
        # SSL": isso é só o descritor padrão do estado da conexão e aparece em
        # TODA recusa de pg_hba sem TLS.
        if ($mensagem -match 'pg_hba') {
            Write-Host 'RESULTADO: ACESSO NAO LIBERADO.' -ForegroundColor Red
            Write-Host ''
            Write-Host 'A máquina CHEGA no servidor, mas o pg_hba.conf não tem entrada para ela.' -ForegroundColor Yellow
            Write-Host 'A mensagem acima traz o endereço COMO O SERVIDOR O VÊ — é esse endereço' -ForegroundColor Yellow
            Write-Host 'que precisa ser liberado, e NÃO o IP público impresso lá em cima: dentro' -ForegroundColor Yellow
            Write-Host ("da Radmin VPN quem chega no banco é o {0}." -f $origem) -ForegroundColor Yellow
            Write-Host ''
            Write-Host 'Cuidado: o pg_hba casa a TRINCA (endereço, usuário, banco), e a recusa não' -ForegroundColor DarkYellow
            Write-Host ("diz qual dos três falhou. Este teste usou o usuário '{0}'; se não for o" -f $Usuario) -ForegroundColor DarkYellow
            Write-Host 'usuário que o app realmente usa, repita com:' -ForegroundColor DarkYellow
            Write-Host '  .\testar-acesso-erp.ps1 -Usuario USUARIO_REAL' -ForegroundColor DarkYellow
            $saida = 1
        } else {
            # Passou do pg_hba (senão o erro citaria o arquivo): o IP está OK e o
            # que sobrou é usuário ou banco inexistente.
            Write-Host 'RESULTADO: ACESSO LIBERADO.' -ForegroundColor Green
            Write-Host ''
            Write-Host 'O erro acima é POSTERIOR à checagem de IP (usuário ou banco inexistente),' -ForegroundColor Yellow
            Write-Host 'o que só acontece depois de o pg_hba.conf aprovar o endereço.' -ForegroundColor Yellow
            $saida = 0
        }
    }
    else {
        Write-Host ("  Resposta inesperada do servidor (tipo '{0}')." -f $letra) -ForegroundColor Red
        Write-Host ''
        Write-Host 'RESULTADO: INDEFINIDO.' -ForegroundColor Red
        $saida = 2
    }
}
finally {
    $cliente.Close()
}

Write-Host ''
exit $saida
