# Plano de Melhoria e Redesenho — Página Panorama

**Data de Elaboração:** 24 de Agosto de 2026  
**Alvo:** `src/pages/Panorama.tsx` e ecossistema de visualização gerencial (`src/lib/panorama.ts`, `src/lib/panoramaComparativo.ts`, `src/hooks/usePanoramaQuery.ts`)  
**Objetivo:** Transformar a página **Panorama** de uma coleção de lentes segregadas em um **Hub Gerencial 360° Integrado e Intuitivo**, proporcionando visão panorâmica do negócio (fluxo x estoques x auditoria), navegação contínua entre níveis de detalhe e experiência de usuário de alto nível.

---

## 1. Sumário Executivo e Diagnóstico Atual

### 1.1 O Papel da Tela Panorama no Sistema
A tela **Panorama** é a principal lente gerencial sobre a movimentação e posição de estoque da empresa no ERP (Ciclone):
- Enquanto a tela **Consulta ao ERP** é voltada para **auditoria detalhada** (linha a linha de notas para identificar operações incorretas), o **Panorama** é voltado para **análise executiva**: *quanto entrou, quanto saiu, de qual marca/categoria, para onde foi e quanto temos em estoque*.
- O processamento pesado de agregação (`GROUP BY`) ocorre no PostgreSQL do gateway, trazendo conjuntos agregados compactos através da VPN. O cliente web então realiza recortes, agrupamentos e drill-downs locais de forma instantânea.

### 1.2 Principais Problemas Identificados (Pain Points)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             ESTADO ATUAL (SEGREGADO)                             │
├─────────────────┬─────────────────┬──────────────────┬───────────────────────────┤
│    [Saídas]     │   [Entradas]    │    [Estoque]     │       [Comparativo]       │
│  (Silo Isolado) │  (Silo Isolado) │  (Silo Isolado)  │ (Aba Rígida só Categoria) │
└────────┬────────┴────────┬────────┴────────┬─────────┴─────────────┬─────────────┘
         │                 │                 │                       │
         ▼                 ▼                 ▼                       ▼
  Troca de Lente    Troca de Lente    Troca de Lente         Sem série temporal,
  limpa o caminho   limpa o caminho   limpa o caminho        sem folha de produtos,
  percorrido        percorrido        percorrido             sem conexão com fluxo
```

1. **Segregação Excessiva de Dados (Silos Isolados)**:
   - As lentes `Saídas`, `Entradas`, `Estoque` (com sub-lentes `Interno`, `Externo`, `Inventário`) e `Comparativo` funcionam como compartimentos estanques.
   - *Exemplo de atrito:* Ao analisar as saídas da marca **OBEN**, o gestor não consegue ver de imediato quantas unidades entraram no mesmo período, nem quanto existe em estoque na empresa ou nas malas dos representantes. Para obter essa resposta, é necessário alternar de lente e reiniciar toda a navegação.
2. **Perda de Contexto no Drill-Down**:
   - A função `trocarLente` executa `recomecar()`, zerando o array de navegação (`caminho` e `rotulos`). O usuário perde o recorte de marca/tipo que estava investigando ao tentar cruzar informações.
3. **Navegação Linear Rígida ("Visão Túnel" de 1 nível por vez)**:
   - A árvore atual exibe apenas um nível por vez (`LinhaNivel`). O usuário clica em um item e a tela é inteiramente substituída pelo próximo nível.
   - Não há visão de **árvore expansível** (estilo *folder tree* / hierarquia com expansão inline como a existente no `PainelGestor.tsx`), o que impede comparar simultaneamente duas marcas ou tipos diferentes.
4. **Parâmetros e Filtros Desconectados e Espaçosos**:
   - O card de parâmetros ocupa uma altura excessiva no topo da página antes que o usuário veja qualquer dado.
   - O formulário muda abruptamente de formato dependendo da lente (em Estoque desaparecem datas; em Inventário desaparece o seletor de empresa).
   - O botão "Consultar" fica embutido na última coluna do grid de formulários, com baixo destaque visual.
5. **Série Temporal Passiva e Não-Interativa**:
   - A `SerieMensal` apenas renderiza barras estáticas de Saídas OU Entradas. Não permite comparar entradas x saídas no mesmo mês (para avaliar equilíbrio de compras vs vendas).
   - O gráfico não é interativo: clicar na coluna de um mês não filtra o restante da tela para detalhar aquele mês específico.
6. **Transição Truncada para a Folha de Produtos**:
   - A visualização de produtos individuais (SKUs) fica escondida atrás de um botão secundário no rodapé ("Ver produtos deste recorte").
   - Não há campo de busca/filtro instantâneo por código auxiliar ou nome do produto na folha, nem recursos de ordenação por coluna.

---

## 2. Nova Arquitetura de Informação & Conceito "Panorama 360°"

A nova arquitetura unifica as fontes de dados em um modelo **holístico**, onde o usuário tem uma **Visão Panorâmica Integrada** por padrão, podendo alternar a perspectiva de análise sem perder o filtro ou a categoria selecionada.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                      NOVA ARQUITETURA — PANORAMA 360°                            │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 1. BARRA DE CONTROLE UNIFICADA (Período Rápido | Empresa | Consulta / Atualizar) │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 2. FAIXA DE KPIS EXECUTIVOS CONECTADOS (Entrou | Saiu | Saldo | Estoque | Giro) │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 3. SÉRIE TEMPORAL DINÂMICA INTERATIVA (Entradas x Saídas x Saldo Mensal)         │
├──────────────────────────────────────────────────────────────────────────────────┤
│ 4. PAINEL DE EXPLORAÇÃO MULTIMODAL                                               │
│    ┌──────────────┬──────────────────┬─────────────────┬──────────────────────┐  │
│    │  [Visão 360° │ [Fluxos: Saídas/ │ [Posição Estoque│  [Matriz Analítica   │  │
│    │  Integrada]  │    Entradas]     │    & Malas]     │    & Auditoria]      │  │
│    ├──────────────┴──────────────────┴─────────────────┴──────────────────────┤  │
│    │  MODOS DE EXIBIÇÃO: (•) Sintético (Árvore)  ( ) Analítico (Cards) ( ) Tabela │
│    │  TRILHA DE NAVEGAÇÃO INTERATIVA: Todas › OBEN ▾ › RECEITUARIO ▾          │
│    │  HIERARQUIA EXPANSÍVEL COM INDICADORES MULTIDIMENSIONAIS                 │
│    │  FOLHA DE PRODUTOS COM BUSCA INSTANTÂNEA E DRAWER DE DETALHES            │
│    └──────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Os Quatro Modos de Perspectiva Integrada

1. **Visão 360° Integrada (Modo Padrão - Hub Executivo)**:
   - Cruza na mesma tabela/árvore: **Entradas**, **Saídas**, **Saldo do Período**, **Estoque Interno**, **Estoque Externo (Mala)**, **Contagem Física** e **Cobertura de Meses**.
   - Responde com um único olhar: *"Qual categoria tem maior giro? Onde temos excesso ou falta de estoque? O que entrou vs o que saiu?"*
2. **Fluxos de Movimentação (Saídas & Entradas Detalhadas)**:
   - Focado na movimentação comercial e fiscal.
   - Permite cruzar por *Tipo de Saída* (Venda, Bonificação, Remessa), *Tipo de Entrada* (Compra, Retorno, Devolução), *Fornecedor* e *Tipo de Pedido*.
3. **Posição de Estoque & Malas (Saldos, Mala e Inventários)**:
   - Focado na localização física do produto: *Na Empresa (Interno)* vs *Na Mala de Terceiros (Externo)* vs *Contagens de Inventário*.
   - Exibe alertas de divergência entre o saldo calculado pelo ERP e o contado pelos representantes.
4. **Matriz Analítica & Auditoria**:
   - Tabela densa configurável com ordenação em todas as colunas, busca por texto e botão de exportação para conferência profunda.

---

## 3. Diretrizes de Layout e Hierarquia Visual

O novo layout segue rigorosamente o [DESIGN_SYSTEM.md](file:///C:/Users/User/Documents/Inventario_App/DESIGN_SYSTEM.md):
- **Tipografia:** Plus Jakarta Sans com `tabular-nums` em todos os números comparáveis.
- **Tokens Semânticos:** Uso exclusivo de `primary`, `card`, `muted-foreground`, `success`, `warning`, `info` e `destructive`.
- **Raios de Borda & Superfícies:** Controles com `rounded-xl` (12px), superfícies/cards com `rounded-2xl` (16px), sombras sutis (`shadow-xs`).
- **Alvo de Toque e Altura:** 44px (`h-11`) nos botões e controles principais.

### 3.1 Seção 1: Barra de Controle e Filtros Compacta (`PanoramaBarraControle`)

Em vez de um card grande vertical que empurra o conteúdo para baixo, a barra de controle deve ser compacta, horizontal e elegante:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [ Trimestre ] [ Semestre ] [ Ano Corrente (Ativo) ] [ Personalizado ▾ ]  │ 01/01/26 a 24/08/26          │
│ Empresa: [ Ambas ▾ ]   Data Base: [ Movimento ▾ ]                        │ [  🔍 Consultar ERP (Enter) ] │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Atalhos de Período em Pílulas (Pill Buttons):** `Ano` (padrão), `Semestre`, `Trimestre`, `Mês Atual` e `Personalizado`.
- **Controle de Empresa e Data Base:** Menus suspensos integrados na mesma linha.
- **Botão Primário Destacado:** `Button variant="default"` com ícone de busca e estado de carregamento com spinner embutido.
- **Cache & Freshness Indicator:** Indicador discreto informando quando o dado foi consultado (ex: *"Dados atualizados às 14:32"*).

### 3.2 Seção 2: Faixa de KPIs Executivos Conectados (`PanoramaKpiRibbon`)

Apresenta a **equação contábil do estoque e do fluxo** de maneira clara, adaptando-se suavemente ao recorte selecionado:

| Card KPI | Grandeza Principal | Linha de Apoio / Contexto | Finalidade Gerencial |
|---|---|---|---|
| **Entradas** | `12.450 un.` (ou `R$ 480 mil`) | `+R$ 480.210` · 85 linhas | Total que ingressou na empresa (compras + devoluções) |
| **Saídas** | `18.230 un.` (ou `R$ 1,12 mi`) | `R$ 1.120.450` · Ticket: `R$ 61,46` | Total que saiu para clientes (vendas + bonificações) |
| **Saldo Período** | `−5.780 un.` (Badge de balanço) | `3.400 un.` transferidos para mala | Variação líquida do estoque total no intervalo |
| **Estoque Total** | `24.120 un.` (ou `R$ 1,45 mi`) | `14.200` interno · `9.920` em terceiros | Posição física atual somando empresa e malas |
| **Cobertura Geral** | `3,9 meses` | Ritmo de saída: `6.076 un./mês` | Autonomia de estoque antes de ruptura |
| **Divergência Mala** | `−142 un.` (se houver contagem) | Inventário físico vs ERP | Identificação precoce de perdas em consignação |

### 3.3 Seção 3: Série Temporal Comparativa Interativa (`PanoramaGraficoTemporal`)

A série mensal evolui de um gráfico simples para uma ferramenta interativa de diagnóstico:

```
 Movimentação Mensal (Entradas x Saídas x Saldo)                         [ Unidades | Valor ]
 30k ┤           █ [Saída]                  █
 20k ┤ ░ [Entrada]█                       ░ █           ░ █
 10k ┤ ░         █             ░ █        ░ █           ░ █
   0 ┼─┴─────────┴─────────────┴─┴────────┴─┴───────────┴─┴───────────────
      Jan/26      Fev/26        Mar/26     Abr/26        Mai/26 (Clique para filtrar)
```

- **Visualização Bicolor / Barras Lado a Lado:**
  - **Barras de Saída:** Cor `primary` (marca).
  - **Barras de Entrada:** Cor `info` ou `success` suave.
  - **Linha de Saldo Líquido:** Indicador sutil de tendência de acúmulo ou queima de estoque.
- **Interatividade Total (Cross-filtering):**
  - Clicar em um mês aplica um filtro temporal instantâneo na árvore e nos KPIs abaixo, com um chip de fechamento (ex: `Filtro ativo: Junho/2026 [X]`).

### 3.4 Seção 4: Painel de Exploração Multimodal (`PanoramaExplorador`)

Para atender tanto quem precisa de uma visão panorâmica rápida quanto quem precisa analisar categorias detalhadas, o painel central deve oferecer **3 Modos de Visualização** alternáveis:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TRILHA: [ 🏠 Todas ] › [ OBEN ▾ ] › [ RECEITUARIO ▾ ]          MEDIDA: [ Unidades (Ativo) | Valor ]   │
│ ABRIR POR: [ Marca ] [ Tipo ] [ Subtipo ] [ Grupo ] [ Vendedor ]  MODO: [ 🌳 Sintético | 🗂 Cards | 📊 Tabela ]│
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ (Visualização ativa conforme o modo selecionado)                                                       │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Modo A: Sintético (Árvore Hierárquica Expansível Inline)
- Inspirado no sucesso do `PainelGestor.tsx`.
- Permite expandir marcas, tipos e grupos diretamente na tabela sem navegar para uma página vazia.
- Cada linha exibe:
  - Nome da Categoria com ícone de expansão (`ChevronRight` / `ChevronDown`) e indentação visual proporcional ao nível.
  - Barras compactas de part-to-whole (participação no total).
  - Colunas integradas: **Entradas**, **Saídas**, **Estoque Interno**, **Estoque Mala**, **Cobertura**.
  - Ação rápida para abrir produtos daquele nó.

#### Modo B: Analítico (Cards Ricos com Barras de Participação)
- Ideal para comparar categorias irmãs no mesmo nível.
- Cards em grade responsiva (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`):
  - Título da Categoria + Badge de status cadastral (`Sem cadastro` quando não categorizado).
  - Barra de Progresso de Participação (`% do volume total`).
  - Blocos divididos: *Fluxo (Entrou / Saiu)* e *Estoque (Interno / Mala)*.
  - Indicador de Cobertura de Estoque (ex: `2.4 meses` com cor semântica: normal em verde/neutro, crítico < 1 mês em warning).

#### Modo C: Tabela Matriz Detalhada
- Ideal para exportação e análise quantitativa densa.
- Colunas ordenáveis com cabeçalhos interativos (`CabecalhoOrdenavel`):
  - Categoria / Agrupador
  - Qtd. Entradas | Valor Entradas
  - Qtd. Saídas | Valor Saídas
  - Saldo do Período
  - Estoque Interno (Empresa)
  - Estoque Externo (Mala)
  - Estoque Inventariado (Contado)
  - Divergência (Contado - ERP)
  - Cobertura (Meses)

---

## 4. Navegação entre Níveis de Detalhe e Folha de Produtos

### 4.1 Trilha de Navegação Contextual e Interativa (Breadcrumbs Inteligentes)
A trilha deixa de ser um texto estático e se torna uma ferramenta de navegação ágil:
- Cada segmento do caminho percorrido (ex: `OBEN`) ganha um botão dropdown com categorias irmãs (`POWER`, `CORE EYES`), permitindo alternar de marca com 1 clique sem precisar voltar à raiz.
- Botão "Voltar um nível" (`ChevronLeft`) e "Voltar ao início" (`Home`).

### 4.2 Folha de Produtos Renovada (`PanoramaProdutosSheet` ou Painel Embutido)
Quando o usuário atinge o nível de produto (folha):
1. **Busca Rápida Instantânea:** Campo de pesquisa por código auxiliar (ex: `OB1190 A01`) ou nome do produto, filtrando em tempo real no cliente.
2. **Visualização em Cards ou Tabela Densa:**
   - Código Auxiliar em destaque monoespacado (`font-mono font-bold text-sm`).
   - Estoque atual na empresa, estoque em vendedores e volume vendido no período.
   - Badge indicativo de situação cadastral (Ativo/Inativo no ERP).
3. **Drawer Lateral de Inspeção Rápida (Sheet):**
   - Ao clicar em qualquer produto da lista, abre uma gaveta lateral (*Slide-over Drawer*) com o histórico consolidado daquele SKU:
     - Foto do saldo por filial/empresa.
     - Lista de quais representantes estão com aquele modelo na mala e suas respectivas quantidades.
     - Últimas entradas e saídas fiscais registradas no ERP.

---

## 5. Arquitetura de Componentes e Estratégia de Implementação

Para garantir código limpo, testável e manutenível, o arquivo monolítico `Panorama.tsx` (atualmente com 1.103 linhas) será decomposto em uma pasta modular `src/components/panorama/`:

```
src/
├── components/
│   └── panorama/
│       ├── PanoramaBarraControle.tsx      # Barra compacta de período, datas e empresa
│       ├── PanoramaKpiRibbon.tsx          # Faixa de KPIs integrados e coerentes
│       ├── PanoramaGraficoTemporal.tsx    # Série mensal interativa Entradas x Saídas
│       ├── PanoramaTrilhaNavegacao.tsx    # Breadcrumb inteligente com seletores de salto
│       ├── PanoramaVisualizacaoArvore.tsx # Modo Sintético (tabela hierárquica expansível)
│       ├── PanoramaVisualizacaoCards.tsx  # Modo Analítico (cards de categorias)
│       ├── PanoramaVisualizacaoTabela.tsx # Modo Matriz analítica tabular
│       ├── PanoramaListaProdutos.tsx      # Folha de produtos com busca e ordenação
│       └── PanoramaDrawerProduto.tsx      # Gaveta lateral de inspeção 360° do SKU
├── hooks/
│   ├── usePanoramaQuery.ts                # (Existente - mantido e otimizado)
│   └── usePanoramaEstado.ts               # Hook de estado para URL SearchParams e persistência
├── lib/
│   ├── panorama.ts                        # (Existente - funções puras de agregação)
│   └── panoramaComparativo.ts             # (Existente - funções puras de cruzamento)
└── pages/
    └── Panorama.tsx                       # Página orquestradora limpa (~150-200 linhas)
```

### 5.1 Otimização de Performance e Gerenciamento de Consultas
- **Preservação das Consultas sob Demanda:**
  - A conexão VPN com o Ciclone continua sendo protegida: as consultas disparam apenas quando o usuário confirma os parâmetros ou troca o período principal.
  - O cache do **TanStack Query** (`staleTime: 10 * 60 * 1000`) garante que navegar entre visões ou recortes não gere tráfego de rede repetido.
- **Sincronização de Estado via URL (`usePanoramaEstado`):**
  - Persistir parâmetros (`de`, `ate`, `empresa`, `visao`, `caminho`, `medida`) nos parâmetros de busca da URL (`URLSearchParams`).
  - **Benefício:** Permite ao gestor copiar o link da tela com um recorte específico (ex: `?marca=OBEN&tipo=SOLAR&periodo=semestre`) e compartilhar com outro usuário ou salvar como favorito no navegador.

---

## 6. Roteiro de Execução Passo a Passo (Fases de Implementação)

Recomendamos que a implementação ocorra em **5 fases estruturadas**, permitindo validação visual e funcional em cada etapa:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CRONOGRAMA DE IMPLEMENTAÇÃO                           │
├─────────┬──────────────────────────────────────────┬────────────────────────┤
│ Fase 1  │ Modularização & Barra de Controle        │ Componentes base e URL │
├─────────┼──────────────────────────────────────────┼────────────────────────┤
│ Fase 2  │ Hub 360° & Árvore Hierárquica Expansível │ Visão unificada        │
├─────────┼──────────────────────────────────────────┼────────────────────────┤
│ Fase 3  │ Gráfico Temporal Interativo              │ Entradas x Saídas      │
├─────────┼──────────────────────────────────────────┼────────────────────────┤
│ Fase 4  │ Folha de Produtos com Busca & Drawer     │ Detalhamento de SKUs   │
├─────────┼──────────────────────────────────────────┼────────────────────────┤
│ Fase 5  │ Responsividade Mobile, Polish & Testes   │ Validação final        │
└─────────┴──────────────────────────────────────────┴────────────────────────┘
```

### Fase 1: Modularização da Estrutura & Nova Barra de Controle
1. Criar o diretório `src/components/panorama/`.
2. Desenvolver `PanoramaBarraControle.tsx` substituindo o card pesado de parâmetros por uma barra horizontal compacta com atalhos de período (`Trimestre`, `Semestre`, `Ano`, `Personalizado`).
3. Implementar `usePanoramaEstado.ts` para sincronizar o estado da navegação com a URL.

### Fase 2: Hub 360° & Visualização em Árvore Hierárquica
1. Criar `PanoramaKpiRibbon.tsx` consolidando os cartões de indicadores em um único vocabulário que integra fluxo e saldo de estoque.
2. Criar `PanoramaVisualizacaoArvore.tsx` trazendo a experiência de expansão inline (como a do `PainelGestor.tsx`), permitindo abrir e fechar marcas e tipos na mesma tela.
3. Criar `PanoramaTrilhaNavegacao.tsx` com navegação rápida.

### Fase 3: Série Temporal Comparativa Interativa
1. Atualizar `PanoramaGraficoTemporal.tsx` para plotar Entradas vs Saídas simultaneamente no mesmo período.
2. Implementar evento de clique nas barras mensais para filtrar o restante da página para o mês selecionado.

### Fase 4: Folha de Produtos com Busca e Drawer de SKU
1. Criar `PanoramaListaProdutos.tsx` com campo de busca por SKU/código auxiliar, ordenação por colunas e badges de situação cadastral.
2. Criar `PanoramaDrawerProduto.tsx` utilizando componente de Sheet/Dialog para exibir a ficha completa do produto (saldo interno + saldos nas malas de vendedores).

### Fase 5: Ajustes Finais, Responsividade e Testes de Qualidade
1. Testar o comportamento responsivo em telas móveis (<768px) e tablets, garantindo que as tabelas se adaptem a cartões limpos.
2. Validar a conformidade com as regras do [DESIGN_SYSTEM.md](file:///C:/Users/User/Documents/Inventario_App/DESIGN_SYSTEM.md).
3. Executar verificações de compilação e qualidade: `npm run typecheck && npm run build && npm run lint`.

---

## 7. Comparativo: Antes vs Depois

| Aspecto | Como É Hoje (Antes) | Como Ficará (Depois) |
|---|---|---|
| **Integração de Dados** | 4 lentes isoladas em silos; o usuário não vê estoque enquanto analisa fluxo de vendas. | **Hub 360° Integrado**: Fluxos (Entradas/Saídas) e Posição de Estoque na mesma interface. |
| **Continuidade de Navegação** | Trocar de lente limpa o drill-down e força a recomeçar do zero. | **Preservação de Contexto**: O recorte (`OBEN › RECEITUARIO`) é mantido em todas as perspectivas. |
| **Hierarquia Visual** | Navegação linear rígida (1 nível por vez); visão de túnel. | **Árvore Hierárquica Expansível**: Visualização da árvore inteira com expansão inline. |
| **Ocupação do Topo** | Card vertical pesado com formulários e botões dispersos. | **Barra Compacta**: Atalhos rápidos de período, seletores alinhados e botão de consulta claro. |
| **Série Temporal** | Gráfico passivo de uma única série isolada. | **Gráfico Interativo Bicolor**: Entradas vs Saídas com clique para filtrar o mês. |
| **Acesso a Produtos** | Botão secundário no rodapé que substitui a tela por uma lista simples. | **Folha com Busca & Drawer**: Pesquisa instantânea por código auxiliar e gaveta de detalhes do SKU. |
| **Compartilhamento** | O estado vive apenas na memória local do componente React. | **URLs Compartilháveis**: Filtros e recortes sincronizados em parâmetros de busca na URL. |

---

## 8. Conclusão

Este plano resolve a causa-raiz da segregação de dados da página **Panorama**. Ao unificar as grandezas comerciais e de estoque em uma interface fluida, o gestor ganha clareza imediata sobre o panorama geral da empresa e tem a liberdade de aprofundar em qualquer nível de detalhe com facilidade, mantendo sempre o contexto da sua análise.
