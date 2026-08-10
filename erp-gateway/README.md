# ERP Gateway — Ciclone

Serviço HTTP que expõe, sob autenticação, as consultas ao ERP Ciclone para o app
OPTISTOCK. Existe porque o Ciclone só é alcançável pela VPN (`26.238.137.203`),
e a Vercel não está nessa rede.

**Ele não tem regra de negócio.** Envelopa `db.py`, `regras.py` e `movimentos.py`
— os mesmos módulos da ferramenta tkinter em `Apenas_Para_Consulta/`, sem cópia e
sem alteração.

## Onde ele fica na arquitetura

```
Browser
   │  supabase.functions.invoke('erp-consulta')
   ▼
Edge Function        valida JWT + exige profiles.role = 'gerente'
   │  HTTPS + header X-Gateway-Secret
   ▼
Cloudflare Tunnel    cloudflared, conexão de SAÍDA
   ▼
este serviço         127.0.0.1:8000 — sem porta aberta na máquina
   ▼
Ciclone (VPN)
```

Três propriedades que o desenho garante:

- O serviço **nunca é exposto ao browser**. Não há CORS de propósito.
- As credenciais do ERP **não saem desta máquina**. Nem Vercel, nem Supabase.
- Nenhuma porta aberta, nenhum port-forward, nenhum certificado a renovar.

## Instalação

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env      # e preencha GATEWAY_SECRET
```

`GATEWAY_SECRET` forte:

```powershell
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
```

**Credenciais do ERP:** se a ferramenta tkinter roda nesta mesma máquina, não
precisa repetir `ERP_USER`/`ERP_PASSWORD` — o gateway lê o `.env` dela como
fallback (o `.env` daqui tem precedência). Uma senha, um lugar.

## Execução

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

O `--host 127.0.0.1` não é opcional: quem publica é o `cloudflared`.

## Deixar de pé sozinho

```powershell
# PowerShell como Administrador
.\servico\instalar-gateway.ps1
```

Registra uma tarefa no Agendador do Windows que sobe o uvicorn e o reinicia se ele
cair — o processo já morreu sozinho durante o desenvolvimento sem deixar erro no
log, e o sintoma para quem usa é um 502 sem explicação.

Dispara **no boot, sem exigir login**, porque as duas dependências permitem:
`RvControlSvc` (a VPN do Ciclone) é serviço automático, e o gateway só conecta ao
banco por requisição — se subir antes da VPN, devolve 503 e se recupera sozinho.

## O túnel

Quem publica é o **Tailscale Funnel**, em
`https://desktop-297nu0m.tailecd207.ts.net`:

```powershell
tailscale funnel --bg 8000     # já configurado; persiste sozinho
tailscale funnel status        # conferir
```

O serviço `Tailscale` é automático e sobe no boot sem login, e a configuração do
Funnel fica guardada no nó — não há nada a reinstalar depois de um reboot.

⚠️ **Não renomeie o tailnet.** O hostname sai dele, e a Edge Function guarda essa
URL em `ERP_GATEWAY_URL`. Renomear quebra a integração em silêncio.

## Endpoints

| rota | auth | devolve |
|---|---|---|
| `GET /saude` | não | liveness do processo, sem tocar no ERP |
| `GET /saude/erp` | sim | testa VPN + credenciais de verdade |
| `GET /vendedores` | sim | `[codigo, nome, situacao]` |
| `GET /pedidos` | sim | linhas de pedido/nota classificadas (45 colunas) |
| `GET /movimentos` | sim | vendas e remessas agregadas por código auxiliar |

Auth = header `X-Gateway-Secret`. Não identifica a *pessoa* — quem faz isso é a
Edge Function, contra `profiles.role`. Aqui só se responde "quem chama é o nosso
backend?".

### `GET /pedidos`

`de`, `ate` (AAAA-MM-DD, obrigatórios) · `vendedores` (repetível; vazio = todos)
· `empresas` (padrão `EMPRESAS_PADRAO`) · `base_data` = `movimento` | `emissao`.

Mesmo caminho da aba de Consulta do tkinter: consulta bruta → `enriquecer`
(classificações, sinais S1/S2) → `marcar_papel` (vínculo do vendedor).

⚠️ **Devolve notas canceladas** (`situacao_nota = "Cancelada"`), de propósito —
a tela de auditoria precisa vê-las. Quem consome tem que exibir a situação.

### `GET /movimentos`

`vendedor` (obrigatório, um só) · `de`, `ate` · `empresas` · `base_data`.

Devolve `[key, codigo_auxiliar, nome, remessa, venda]`. Canceladas já saem, e
acessórios também (`movimentos.py`).

Devolve **o fato do ERP e para por aí**. A conta
`q2_esperado = q1 + remessa − venda` fica no app, junto dos inventários — uma
cópia só da fórmula.

## Proteções

| o quê | padrão | variável |
|---|---|---|
| Timeout de consulta (no Postgres, via `PGOPTIONS`) | 30 s | `ERP_STATEMENT_TIMEOUT_MS` |
| Teto de linhas por resposta → HTTP 413 | 20.000 | `GATEWAY_MAX_LINHAS` |
| Docs interativas (`/docs`, `/redoc`) | desligadas | `GATEWAY_DOCS_URL` |

Falha de banco vira **HTTP 503**, não 500. É o que permite a tela dizer "ERP
indisponível" em vez de "erro inesperado" — VPN caída não é bug do app.

Sem cache e sem rate limit, por ora. Ver os tempos medidos abaixo antes de
adicionar qualquer um dos dois.

## Desempenho medido (2026-08-07, PC do usuário)

| chamada | linhas | tempo |
|---|---|---|
| `/vendedores` | 30 | < 1 s |
| `/pedidos` vendedor 8, 14 dias | 7 | 375 ms |
| `/movimentos` vendedor 8, 70 dias | 844 | **5,2 s** |

Os 5,2 s do `/movimentos` são o custo real da reconciliação: janela larga, todos
os produtos, mais o `apply` linha a linha do `enriquecer`. Aceitável para uma
consulta que o usuário dispara de propósito, mas a tela precisa de estado de
carregamento — não é instantâneo.

## Melhorias planejadas

**Sincronizar `produtos` direto do Ciclone** (registrado em 2026-08-10, sem data).

Hoje a tabela `produtos` do Supabase é atualizada por **upload manual**. Com o
gateway no ar, dá para buscar da fonte. A forma preferida é começar por um botão
*"Atualizar banco de dados dos produtos"*, e só depois pensar em automação.

Motivo concreto: a coluna "Dif. em R$" da tela de comparação usa
`produtos.valor_produto` (Supabase), enquanto o `comparativo.py` usa
`db.valores_por_produto` (Ciclone, preço de venda atacado). Os dois números
divergem hoje — essa sincronização é o que fecharia a diferença.

O SQL já existe (`db.valores_por_produto`); falta o endpoint e a escrita no
Supabase, que é operação de gerente e passa por RLS.

⚠️ Se a sincronização falhar, a tela **não pode** exibir valor velho como se
fosse novo. Foi assim que o antigo `estoque_real` mostrou ~100% de acuracidade
sobre zero linhas.

## Migrar para o servidor

O serviço já é portátil; nada de caminho fixo no código.

1. Copie `config.py`, `db.py`, `regras.py` e `movimentos.py` para `./ciclone`.
2. Remova (ou comente) `CICLONE_MODULES` do `.env` — o padrão já é `./ciclone`.
3. Garanta a VPN do Ciclone no servidor e preencha `ERP_USER`/`ERP_PASSWORD`
   no `.env` (lá não haverá a ferramenta tkinter para servir de fallback).
4. Mova o `cloudflared` junto, com o mesmo hostname. Nada muda no app.

A partir do passo 1 as regras de `movimentos.py` (`TIPOS_VENDA`,
`TIPOS_REMESSA`, `OPERACOES_SEM_MOVIMENTO_ESTOQUE`) passam a ter **duas cópias**:
a do servidor e a da sua ferramenta local. Se elas mudarem com alguma frequência,
é o momento de promovê-las a tabela no Supabase.
