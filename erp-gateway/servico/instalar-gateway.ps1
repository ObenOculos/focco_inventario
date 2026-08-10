<#
.SYNOPSIS
    Registra o ERP Gateway como tarefa automática do Windows.

.DESCRIPTION
    Cria uma tarefa no Agendador que sobe o uvicorn e o mantém de pé, para que o
    gateway não dependa de alguém deixar uma janela do PowerShell aberta.

    DISPARA NO BOOT, SEM PRECISAR DE LOGIN. Duas coisas tornam isso seguro:

      - A VPN do Ciclone sobe sozinha: `RvControlSvc` (Radmin VPN Control Service)
        é serviço com início automático. O que roda na sessão do usuário é apenas
        a interface gráfica (`RvRvpnGui`), que a rede não precisa.
      - O gateway não conecta ao banco no import: `db.conectar()` abre conexão a
        cada requisição. Se o uvicorn subir antes da VPN, as primeiras chamadas
        devolvem 503 e ele se recupera sozinho quando a VPN chega — não trava.

    O principal usa S4U ("executar estando o usuário conectado ou não"), que
    dispensa guardar senha e mantém o contexto do usuário dono do projeto.

.NOTES
    Requer PowerShell como Administrador.

    ⚠️ ESTE ARQUIVO PRECISA CONTINUAR EM UTF-8 **COM BOM**.
    Sem BOM, o Windows PowerShell 5.1 o lê como CP1252 e cada travessão "—"
    (E2 80 94) vira "â€"", cujo 0x94 é U+201D — uma aspa curva que o PowerShell
    aceita como delimitador de string. O script deixa de compilar com um erro
    que aponta para a linha errada. Editores que salvam "UTF-8 sem BOM" por
    padrão reintroduzem a falha em silêncio.
    Desinstalar:  Unregister-ScheduledTask -TaskName 'OPTISTOCK - ERP Gateway' -Confirm:$false
#>

#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

$NomeTarefa = 'OPTISTOCK - ERP Gateway'
$Raiz       = Split-Path -Parent $PSScriptRoot
$Python     = Join-Path $Raiz '.venv\Scripts\python.exe'
$Lancador   = Join-Path $PSScriptRoot 'executar-gateway.cmd'
$Log        = Join-Path $PSScriptRoot 'gateway.log'

if (-not (Test-Path $Python)) {
    throw "Não encontrei o Python do venv em '$Raiz\.venv\Scripts'. Rode primeiro: python -m venv .venv"
}
if (-not (Test-Path $Lancador)) {
    throw "executar-gateway.cmd não encontrado em '$PSScriptRoot'."
}

if (-not (Test-Path (Join-Path $Raiz 'main.py'))) {
    throw "main.py não encontrado em '$Raiz'. Rode este script de dentro de erp-gateway\servico."
}
if (-not (Test-Path (Join-Path $Raiz '.env'))) {
    throw "'.env' não encontrado em '$Raiz'. Copie o .env.example e preencha GATEWAY_SECRET."
}

Write-Host "Gateway em : $Raiz"
Write-Host "Python     : $Python"
Write-Host "Log        : $Log"

# O lançador é um .cmd porque o Agendador não redireciona saída, e sem log uma
# queda do gateway fica invisível — foi assim que ele morreu em silêncio antes.
$acao = New-ScheduledTaskAction `
    -Execute $Lancador `
    -WorkingDirectory $PSScriptRoot

$gatilho = New-ScheduledTaskTrigger -AtStartup

# Reinício automático é o ponto do exercício: o processo já morreu sozinho durante
# o desenvolvimento sem deixar erro no log, e o sintoma para o usuário final é um
# 502 sem explicação.
$config = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -RestartCount 999 `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

# S4U: roda com o usuário conectado ou não, sem guardar senha.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited

if (Get-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue) {
    Write-Host "Tarefa já existe — substituindo."
    Unregister-ScheduledTask -TaskName $NomeTarefa -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $NomeTarefa `
    -Action $acao `
    -Trigger $gatilho `
    -Settings $config `
    -Principal $principal `
    -Description 'Sobe o ERP Gateway (FastAPI) que atende as consultas do OPTISTOCK ao ERP Ciclone. Escuta só em 127.0.0.1; quem publica é o túnel.' | Out-Null

Write-Host "`nTarefa '$NomeTarefa' registrada." -ForegroundColor Green

Start-ScheduledTask -TaskName $NomeTarefa
Write-Host 'Iniciando...'

# O uvicorn leva alguns segundos para abrir a porta; tenta por até 30 s em vez de
# olhar uma vez e concluir errado.
$ok = $false
foreach ($tentativa in 1..15) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest 'http://127.0.0.1:8000/saude' -UseBasicParsing -TimeoutSec 5
        Write-Host "`nGateway respondendo: $($r.Content)" -ForegroundColor Green
        $ok = $true
        break
    } catch {
        Write-Host '.' -NoNewline
    }
}

if (-not $ok) {
    Write-Warning "`nO gateway não respondeu em 30 s. O motivo está no log:"
    Write-Warning "  Get-Content '$Log' -Tail 30"
    if (Test-Path $Log) {
        Write-Host "`n--- últimas linhas do log ---" -ForegroundColor Yellow
        Get-Content $Log -Tail 15
    }
}
