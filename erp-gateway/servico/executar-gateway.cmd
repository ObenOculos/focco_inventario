@echo off
REM Sobe o ERP Gateway com a saida em arquivo.
REM
REM Por que um .cmd em vez de chamar o python direto na tarefa agendada:
REM
REM   1. pythonw.exe NAO serve. Ele deixa sys.stdout/sys.stderr em None, e o
REM      uvicorn escreve log no stdout durante o startup -- o processo morre
REM      antes de abrir a porta, com LastTaskResult=1 e nenhum rastro.
REM   2. O Agendador nao faz redirecionamento de saida; precisa de um shell.
REM      Sem o log abaixo, uma queda do gateway fica invisivel de novo.
REM
REM Este arquivo e' ASCII de proposito: .cmd sofre com a codepage do console.

cd /d "%~dp0.."

echo. >> "servico\gateway.log"
echo ===== inicio %DATE% %TIME% ===== >> "servico\gateway.log"

".venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000 >> "servico\gateway.log" 2>&1

echo ===== fim %DATE% %TIME% (codigo %ERRORLEVEL%) ===== >> "servico\gateway.log"
