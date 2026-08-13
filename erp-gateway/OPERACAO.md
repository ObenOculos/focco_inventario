# Operação — o que fazer quando algo para

Guia para quando a **Consulta ao ERP** ou os **movimentos do Ciclone** pararem de
funcionar no app. Escrito para ser seguido sem precisar entender o sistema.

O `README.md` explica como as coisas funcionam. Este arquivo explica o que fazer.

---

## O básico: o que precisa estar de pé

O app na Vercel funciona sozinho. **Só as telas que falam com o Ciclone** dependem
da máquina do escritório:

| tela | depende do computador? |
|---|---|
| Inventário, Conferência, Histórico, Exportar XML | **não** |
| Comparar Inventários (sem movimentos) | **não** |
| Comparar Inventários (com remessas/vendas) | sim |
| Consulta ao ERP | sim |
| Atualizar produtos do Ciclone | sim |

Ou seja: **com o computador desligado, o app continua funcionando.** Vendedor conta
inventário, gerente aprova, tudo normal. O que some é a parte do ERP, e ela avisa
com "ERP indisponível" — não quebra a tela.

---

## Posso desligar o computador?

**Pode.** Não há nada a fazer antes: nenhum processo precisa ser encerrado com
cuidado, nenhum dado fica pela metade. A sincronização de produtos só grava no
passo final, e a reconciliação não escreve nada.

**Ao ligar de novo, tudo volta sozinho.** Não precisa fazer login no Windows nem
abrir nenhum programa:

| peça | como sobe |
|---|---|
| Radmin VPN (acesso ao Ciclone) | serviço `RvControlSvc`, automático |
| Tailscale (o endereço público) | serviço `Tailscale`, automático |
| Gateway (o programa que consulta) | tarefa agendada, gatilho de **boot** |

Dê uns **2 minutos** depois de ligar antes de testar — a VPN leva um tempo para
entrar na rede, e enquanto isso o app responde "ERP indisponível".

⚠️ **Ligado não pode virar suspenso.** Se a máquina dorme por inatividade, ela para
de responder mesmo estando ligada. Confira em *Configurações → Sistema → Energia*
que suspensão e hibernação estão desativadas.

---

## Verificar se está tudo funcionando

Abra o PowerShell e cole:

```powershell
# 1. O gateway está de pé?
Invoke-RestMethod http://127.0.0.1:8000/saude

# 2. O túnel está de pé? (atenção: NÃO testa a entrada pública — veja abaixo)
Invoke-RestMethod https://desktop-297nu0m.tailecd207.ts.net/saude
```

As duas devem responder `ok : True`.

⚠️ **As duas passarem não significa que o app funciona.** Rodados daqui, os dois
testes ficam dentro do tailnet e dão verde mesmo com a entrada pública da
Tailscale fora — que é justamente o caminho por onde o app chega. Para testar o
que o app enxerga, use o celular **com o Wi-Fi desligado** (passo 3 do
diagnóstico).

Para testar o Ciclone também (precisa do segredo, que está no `.env`):

```powershell
cd C:\Users\User\Documents\Inventario_App\erp-gateway
$seg = (Get-Content .env | Select-String '^GATEWAY_SECRET=').ToString().Split('=',2)[1].Trim()
Invoke-RestMethod https://desktop-297nu0m.tailecd207.ts.net/saude/erp -Headers @{'X-Gateway-Secret'=$seg}
```

Deve responder `erp : acessível`.

O teste que vale mais que todos: **abrir o app e ver se o seletor de vendedor
preenche** na tela Consulta ao ERP.

---

## Quando dá erro: siga nesta ordem

Cada passo elimina uma causa. Não pule.

### 1. O gateway está rodando?

```powershell
Invoke-RestMethod http://127.0.0.1:8000/saude
```

**Falhou?** A tarefa caiu. Reinicie:

```powershell
Stop-ScheduledTask -TaskName 'OPTISTOCK - ERP Gateway'
Start-ScheduledTask -TaskName 'OPTISTOCK - ERP Gateway'
```

Espere uns 15 segundos e teste de novo. Se continuar falhando, veja o motivo:

```powershell
Get-Content C:\Users\User\Documents\Inventario_App\erp-gateway\servico\gateway.log -Tail 30
```

### 2. A VPN do Ciclone está ativa?

```powershell
Test-NetConnection -ComputerName 26.238.137.203 -Port 5432 -InformationLevel Quiet
```

**Deu `False`?** O Radmin não está na rede. Abra o Radmin VPN pelo ícone da bandeja
e confira se está conectado. Se o servidor do Ciclone estiver fora do ar, não há o
que fazer deste lado — o problema é lá.

### 3. O endereço público responde — **de fora**?

⚠️ **É aqui que o diagnóstico engana, então leia antes de testar.** Rodar o teste
nesta máquina **não prova nada** sobre o app: de dentro do tailnet o endereço
resolve direto para a própria máquina e responde normalmente mesmo quando a
entrada pública da Tailscale está fora. Foi exatamente isso em 12/08/2026 — todos
os testes daqui passando, `/saude/erp` em 200, e o app fora do ar por 22 minutos.

**O teste que vale:** pegue o celular, **desligue o Wi-Fi** (para sair do tailnet)
e abra no navegador:

```
https://desktop-297nu0m.tailecd207.ts.net/saude
```

Tem que aparecer `{"ok":true,"servico":"erp-gateway"}`. Essa rota é aberta e não
devolve nada sensível — pode abrir no celular sem problema.

**Apareceu?** O caminho público está inteiro e o problema não é desta máquina —
vá ao passo 4.

**Deu erro 502?** O túnel está de pé mas o gateway não — volte ao passo 1.

**Não carregou nada?** A entrada pública caiu. Confira o que esta máquina enxerga:

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" status
& "C:\Program Files\Tailscale\tailscale.exe" funnel status
```

O `status` deve mostrar a máquina; o `funnel status` deve dizer `Funnel on`. Se o
Funnel sumiu, religue:

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" funnel --bg 8000
```

Se o `funnel status` **já dizia `Funnel on`**, não há o que consertar deste lado:
a máquina está publicando e quem não está entregando é a Tailscale. Espere uns
minutos e teste de novo pelo celular. Religar o Funnel nesse caso é tentativa, não
procedimento — em 12/08/2026 não mudou nenhum registro observável e a volta veio
sem dar para saber se foi o comando ou a própria recuperação.

### 4. Nada disso resolveu

Reinicie o computador. É o caminho mais rápido — as três peças sobem sozinhas.

---

## Sintomas e o que significam

| o que aparece no app | causa provável | onde olhar |
|---|---|---|
| "ERP indisponível" | computador desligado, VPN caída ou gateway parado | passos 1 e 2 |
| "ERP indisponível" **com tudo aqui passando** | a entrada pública da Tailscale não está entregando | passo 3, e teste **pelo celular** |
| Spinner e depois "tentando novamente (2 de 3)" | instabilidade passageira | espere; ele se resolve sozinho |
| Erro 502 | gateway parado, túnel de pé | passo 1 |
| "Apenas gerentes consultam o ERP" | usuário logado é vendedor | não é falha |
| Consulta demora 30 s e falha | ERP lento naquele momento | tente de novo |

**Falha passageira é normal.** O caminho até o Ciclone passa por internet, túnel,
VPN e um banco que não é nosso. O app tenta 3 vezes antes de desistir; medimos a
mesma consulta levando 32 s numa vez e 2 s na seguinte.

---

## O que NUNCA fazer

**Não renomeie o tailnet no console da Tailscale.** O endereço
`desktop-297nu0m.tailecd207.ts.net` sai dele, e está gravado como segredo no
Supabase. Renomear quebra a integração **em silêncio** — o app passa a dizer "ERP
indisponível" sem nenhuma pista do porquê.

**Não renomeie o computador no Windows.** Mesmo motivo: o nome da máquina é a
primeira parte do endereço.

**Não desinstale o Radmin VPN nem o Tailscale.** São as duas pontas da ponte.

---

## Se o endereço mudar mesmo assim

Descubra o novo:

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" status --json | ConvertFrom-Json | Select-Object -Expand Self | Select-Object DNSName
```

E grave no Supabase (sem a barra final):

```powershell
cd C:\Users\User\Documents\Inventario_App
npx supabase secrets set ERP_GATEWAY_URL=https://NOVO-ENDERECO.ts.net
```

Não precisa republicar a Edge Function — ela lê o segredo a cada chamada.

---

## Trocar de máquina (mudar para o servidor)

Ver a seção **"Migrar para o servidor"** no `README.md`. Em resumo: copiar quatro
arquivos Python, instalar Tailscale e Radmin na máquina nova, rodar
`servico\instalar-gateway.ps1`, e trocar o secret pelo endereço novo.

Enquanto a migração não acontece, vale saber: **este computador é ponto único de
falha** para as telas de ERP. Nada se perde quando ele cai — só fica indisponível.
