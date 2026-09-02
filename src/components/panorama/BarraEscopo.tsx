import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Segmentado } from '@/components/comparativo/Segmentado';
import { CaixaDeMarcacao } from '@/components/CaixaDeMarcacao';
import { ChevronDown, RefreshCw, SlidersHorizontal } from 'lucide-react';
import type { EscolhaEmpresa } from '@/hooks/useConsultaErpQuery';
import { MEDIDAS, type Medida } from '@/lib/panorama';
import {
  ATALHOS,
  dataCurta,
  intervaloDoAtalho,
  JANELAS_COBERTURA,
  type JanelaCobertura,
  type JanelaEfetiva,
} from '@/lib/panoramaPeriodo';

/** O switch do campo de cobertura. Duas opções, ambas visíveis — ver `Segmentado`. */
const MODOS_JANELA = [
  { valor: 'fixo' as const, rotulo: 'Fixo' },
  { valor: 'data' as const, rotulo: 'Data' },
];

/**
 * O painel de filtros do Panorama — tudo que define O QUE se vê, num lugar só.
 *
 * ## O que estava errado antes
 *
 * Os controles moravam em dois lugares por acidente de construção, não por desenho: os
 * de período e empresa numa faixa no topo, e a **base de cobertura** e as camadas
 * opcionais no cabeçalho da TABELA. A base de cobertura ali era o pior caso — ela não
 * molda a tabela, ela **muda o significado de um número que também aparece na faixa de
 * indicadores**, acima dela. Quem trocasse de 3m para 12m via o cartão "Cobertura" se
 * mexer sem ter tocado em nada perto dele.
 *
 * A regra que separa os dois grupos agora: **se muda o DADO ou o que ele significa,
 * mora aqui; se muda só o DESENHO da tabela, mora no cabeçalho dela.** Por isso "Ver
 * por" e "Expandir tudo" ficaram lá e todo o resto veio para cá.
 *
 * ## Retrátil, com resumo
 *
 * Recolhido, o painel vira uma linha que **diz o escopo em voz alta** ("Ano · Ambas ·
 * Cobertura mai–jul/26 · Quantidade"). Um painel que se fecha escondendo o próprio
 * estado é uma armadilha: a pessoa volta à tela dez minutos depois, lê um número
 * estranho e não tem como saber que ele está filtrado. O resumo é o que torna o
 * recolhimento seguro.
 *
 * Abre por padrão. Recolher é ato deliberado de quem já configurou e quer espaço para
 * ler — foi assim que o pedido veio, e é a ordem natural: primeiro se ajusta, depois se
 * analisa.
 *
 * ## As datas
 *
 * Atalhos e campos de data **convivem sempre**, sem sub-painel. A versão anterior
 * escondia os campos atrás de um botão "Datas" com estado próprio, e isso produzia uma
 * pergunta que ninguém sabia responder: o painel deveria abrir sozinho quando o
 * intervalo não batesse com nenhum atalho, mas então o botão não conseguia FECHAR nada.
 * Com os dois visíveis juntos, o atalho é um preenchedor dos campos — e o campo mostra
 * exatamente o que o atalho fez.
 *
 * ## A base da cobertura tem DUAS formas, num campo só
 *
 * O switch `Fixo | Data` troca o conteúdo do mesmo campo, e é de propósito que não são
 * dois filtros: "últimos 6 meses" e "de tal data a tal data" respondem à MESMA pergunta
 * — sobre qual histórico se mede o ritmo de saída. Dois campos separados criariam a
 * dúvida de qual está valendo, que é o pior estado possível para um número cuja base
 * já é difícil de manter na cabeça.
 *
 * Ir para "Data" **preenche** os campos com o intervalo que a base fixa produzia. Fixo
 * de 3 meses e Data de mai–jul/26 dão exatamente o mesmo número, então a troca não move
 * nada — só destrava a edição. É o que permitiu ao modo ser derivado da presença das
 * datas sem cair na armadilha do antigo botão "Datas".
 *
 * ## Nada vai ao ERP sem o botão
 *
 * Período, empresa e base da cobertura **esperam o clique**; medida, camadas e o
 * recorte de Diversos continuam instantâneos, porque são releitura do que já está na
 * memória. A distinção não é arbitrária: os primeiros mudam a PERGUNTA feita ao
 * Ciclone, os segundos mudam só a leitura da resposta que já veio.
 *
 * O preço dessa separação é a pessoa poder ficar olhando números velhos sem saber. É o
 * que `pendente` resolve — o botão vira "Consultar" cheio e um selo "filtros alterados"
 * acompanha o painel fechado, que é justamente onde os controles não estão à vista.
 */

interface Props {
  de: string;
  ate: string;
  empresa: EscolhaEmpresa;
  baseData: 'movimento' | 'emissao';
  medida: Medida;
  janela: JanelaCobertura;
  /** A base já resolvida, venha do modo que vier. É o que se exibe. */
  janelaEfetiva: JanelaEfetiva;
  modoJanela: 'fixo' | 'data';
  /**
   * O intervalo COMO FOI DIGITADO, para os campos do modo Data.
   *
   * Separado de `janelaEfetiva` de propósito: o campo mostra a escolha da pessoa, a
   * linha abaixo mostra o que o cálculo fez com ela. Reescrever o próprio input ao
   * normalizar faria a data escolhida saltar sozinha, e um controle que corrige o que
   * você acabou de digitar parece quebrado mesmo quando está certo.
   */
  janelaDe: string;
  janelaAte: string;
  custo: boolean;
  inventario: boolean;
  ocultarDiversos: boolean;
  carregando: boolean;
  onPeriodo: (de: string, ate: string) => void;
  onEmpresa: (e: EscolhaEmpresa) => void;
  onBaseData: (b: 'movimento' | 'emissao') => void;
  onMedida: (m: Medida) => void;
  onJanela: (j: JanelaCobertura) => void;
  onModoJanela: (m: 'fixo' | 'data') => void;
  onJanelaData: (de: string, ate: string) => void;
  /**
   * Há filtro de consulta mexido desde a última ida ao ERP.
   *
   * Muda o botão de "Atualizar" para "Consultar" em destaque. Sem isso o painel vira
   * uma armadilha: a pessoa mexe em tudo, olha a tela e lê números do filtro anterior
   * sem nenhum sinal de que eles ficaram velhos.
   */
  pendente: boolean;
  /** Já houve alguma consulta. Falso na primeira visita, antes do primeiro clique. */
  jaConsultou: boolean;
  /**
   * Por que a consulta não pode ser feita, em português, ou `null`.
   *
   * Vem de fora e não é calculado aqui: a página precisa da mesma resposta para barrar
   * a ação, e a regra tem de existir num lugar só — ver `impedimentoDaConsulta`.
   */
  impedimento: string | null;
  onCusto: (v: boolean) => void;
  onInventario: (v: boolean) => void;
  onOcultarDiversos: (v: boolean) => void;
  aberto: boolean;
  onAberto: (v: boolean) => void;
  onAtualizar: () => void;
}

const EMPRESA_ROTULO: Record<EscolhaEmpresa, string> = {
  ambas: 'Ambas as empresas',
  '1': 'Empresa 1',
  '2': 'Empresa 2',
};

/** Título de seção. São quatro, e é o que dá nome à finalidade de cada grupo. */
function Secao({
  titulo,
  ajuda,
  acao,
  children,
}: {
  titulo: string;
  ajuda?: string;
  /** Controle que governa o próprio campo — mora na linha do título, não abaixo dele. */
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex min-h-[1.75rem] items-center justify-between gap-2">
        <p
          className={`text-2xs font-semibold uppercase tracking-wider text-muted-foreground ${
            ajuda ? 'cursor-help' : ''
          }`}
          title={ajuda}
        >
          {titulo}
          {ajuda && <span aria-hidden> ⓘ</span>}
        </p>
        {acao}
      </div>
      {children}
    </div>
  );
}

export function BarraEscopo({
  de,
  ate,
  empresa,
  baseData,
  medida,
  janela,
  janelaEfetiva,
  modoJanela,
  janelaDe,
  janelaAte,
  custo,
  inventario,
  ocultarDiversos,
  carregando,
  onPeriodo,
  onEmpresa,
  onBaseData,
  onMedida,
  onJanela,
  onModoJanela,
  onJanelaData,
  pendente,
  jaConsultou,
  impedimento,
  onCusto,
  onInventario,
  onOcultarDiversos,
  aberto,
  onAberto,
  onAtualizar,
}: Props) {

  const atalhoAtivo = ATALHOS.find((a) => {
    const alvo = intervaloDoAtalho(a.meses);
    return de === alvo.de && ate === alvo.ate;
  });

  /** Nunca consultou, ou mexeu em algo que exige nova ida ao ERP. */
  const precisaConsultar = !jaConsultou || pendente;

  const pilula = (ativo: boolean) =>
    `rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
      ativo
        ? 'bg-primary text-primary-foreground'
        : 'bg-muted/60 text-muted-foreground hover:text-foreground'
    }`;

  /**
   * O escopo em uma linha, para quando o painel está fechado.
   *
   * Só o que MUDA a leitura entra. A medida entra porque troca a unidade de tudo; as
   * camadas entram com um `+` porque acrescentam colunas que não estariam ali; o
   * recorte de Diversos entra porque SUBTRAI linhas — o mais perigoso de esquecer.
   */
  const resumo = [
    atalhoAtivo ? atalhoAtivo.rotulo : `${dataCurta(de)} a ${dataCurta(ate)}`,
    EMPRESA_ROTULO[empresa],
    `Cobertura ${janelaEfetiva.rotulo}`,
    MEDIDAS.find((m) => m.valor === medida)?.rotulo ?? medida,
    ocultarDiversos ? 'sem Diversos' : null,
    custo ? '+ custo' : null,
    inventario ? '+ inventário' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="rounded-2xl border border-border/80 bg-card shadow-xs">
      {/* Cabeçalho SEMPRE visível: o resumo, o gatilho e o Atualizar. Atualizar fica de
          fora do corpo retrátil de propósito — é a ação mais repetida da tela e não
          pode exigir dois cliques quando o painel está fechado. */}
      <div className="flex flex-wrap items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => onAberto(!aberto)}
          aria-expanded={aberto}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-0.5 text-left transition-colors hover:bg-muted/40"
        >
          <SlidersHorizontal size={15} className="shrink-0 text-muted-foreground" />
          <span className="text-sm font-semibold">Filtros</span>
          {/* O resumo some quando o painel está aberto: ali embaixo estão os controles
              de verdade, e repetir o estado logo acima deles é ruído. */}
          {!aberto && (
            <span className="min-w-0 truncate text-xs text-muted-foreground">{resumo}</span>
          )}
          {/* O aviso acompanha o painel FECHADO com prioridade: é ali que a pessoa não
              está vendo os controles e pode achar que os números já são os novos. */}
          {pendente && jaConsultou && (
            <span className="shrink-0 rounded-lg bg-warning-subtle px-2 py-0.5 text-2xs font-semibold text-warning-strong">
              filtros alterados
            </span>
          )}
          <ChevronDown
            size={15}
            aria-hidden
            className={`ms-auto shrink-0 text-muted-foreground transition-transform ${
              aberto ? 'rotate-180' : ''
            }`}
          />
        </button>
        {/* Um botão só, com dois papéis, e o visual diz qual está valendo.
            Cheio = "há coisa nova para buscar"; contornado = "está em dia, mas você
            pode reconsultar". Dois botões separados fariam a pessoa escolher entre
            palavras que ela não tem como distinguir. */}
        <Button
          variant={precisaConsultar ? 'default' : 'outline'}
          size="sm"
          onClick={onAtualizar}
          disabled={carregando || impedimento !== null}
        >
          <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          {carregando ? 'Consultando' : precisaConsultar ? 'Consultar' : 'Atualizar'}
        </Button>
      </div>

      {aberto && (
        <div className="grid grid-cols-1 gap-5 border-t border-border/60 p-4 md:grid-cols-2 xl:grid-cols-4">
          {/* ── 1. Período ─────────────────────────────────────────────── */}
          <Secao
            titulo="Período da análise"
            ajuda="Delimita o que ENTROU e o que SAIU. Não afeta o estoque, que é sempre o saldo de hoje, nem a cobertura, que tem base própria."
          >
            <div className="flex flex-wrap gap-1.5">
              {ATALHOS.map((a) => {
                const alvo = intervaloDoAtalho(a.meses);
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={atalhoAtivo?.id === a.id}
                    onClick={() => onPeriodo(alvo.de, alvo.ate)}
                    className={pilula(atalhoAtivo?.id === a.id)}
                  >
                    {a.rotulo}
                  </button>
                );
              })}
            </div>
            {/* Os campos ficam SEMPRE visíveis: o atalho preenche os dois, e ver o que
                ele preencheu é o que ensina o que "Trimestre" significa aqui. */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="panorama-de" className="text-2xs">
                  De
                </Label>
                <Input
                  id="panorama-de"
                  type="date"
                  value={de}
                  onChange={(e) => onPeriodo(e.target.value, ate)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="panorama-ate" className="text-2xs">
                  Até
                </Label>
                <Input
                  id="panorama-ate"
                  type="date"
                  value={ate}
                  onChange={(e) => onPeriodo(de, e.target.value)}
                />
              </div>
            </div>
            <Select value={baseData} onValueChange={(v) => onBaseData(v as 'movimento' | 'emissao')}>
              <SelectTrigger aria-label="Data que delimita o período">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="movimento">Contar pela data do movimento</SelectItem>
                <SelectItem value="emissao">Contar pela data de emissão</SelectItem>
              </SelectContent>
            </Select>
          </Secao>

          {/* ── 2. Cobertura ───────────────────────────────────────────── */}
          <Secao
            titulo="Base da cobertura"
            ajuda="Sobre qual histórico de saída se calcula por quanto tempo o estoque dura. Só meses COMPLETOS entram: o mês corrente fica de fora por estar pela metade."
            acao={
              // O switch governa ESTE campo, então mora na linha do título dele — não
              // é um filtro a mais, é a forma do mesmo filtro. `Segmentado` porque as
              // duas opções ficam visíveis: com um toggle escondendo metade da escolha,
              // "Fixo" e "Data" seriam indistinguíveis de um liga/desliga.
              <Segmentado
                nome="Como calcular a base da cobertura"
                opcoes={MODOS_JANELA}
                valor={modoJanela}
                onValor={(v) => onModoJanela(v)}
                tamanho="sm"
              />
            }
          >
            {modoJanela === 'fixo' ? (
              <div className="flex flex-wrap gap-1.5">
                {JANELAS_COBERTURA.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={janela === n}
                    onClick={() => onJanela(n)}
                    className={pilula(janela === n)}
                  >
                    {n} meses
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="cobertura-de" className="text-2xs">
                    De
                  </Label>
                  <Input
                    id="cobertura-de"
                    type="date"
                    value={janelaDe}
                    onChange={(e) => onJanelaData(e.target.value, janelaAte)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cobertura-ate" className="text-2xs">
                    Até
                  </Label>
                  <Input
                    id="cobertura-ate"
                    type="date"
                    value={janelaAte}
                    onChange={(e) => onJanelaData(janelaDe, e.target.value)}
                  />
                </div>
              </div>
            )}
            {/* O intervalo EFETIVO, sempre. No modo fixo é a prova de que a base não
                acompanha o período; no modo data é onde a normalização aparece — quem
                digitar "até hoje" vê o fim recuar para o último mês fechado, com o
                motivo escrito, em vez de levar uma cobertura inflada em silêncio. */}
            {janelaEfetiva.meses === 0 ? (
              <p className="text-2xs leading-relaxed text-destructive-strong">
                {/* Campo vazio e intervalo impossível são problemas diferentes: falar de
                    "essas datas" quando não há datas manda a pessoa procurar o erro no
                    lugar errado. */}
                {!janelaDe || !janelaAte
                  ? 'Preencha as duas datas da base.'
                  : 'Sem mês completo entre essas datas. O mês corrente não conta — ele ainda está pela metade.'}
              </p>
            ) : (
              <p className="text-2xs leading-relaxed text-muted-foreground">
                Usando{' '}
                <span className="font-semibold tabular-nums">{janelaEfetiva.rotulo}</span> ·{' '}
                {janelaEfetiva.meses} {janelaEfetiva.meses === 1 ? 'mês' : 'meses'}.
                {janelaEfetiva.recuado
                  ? ' O fim recuou para o último mês fechado — o corrente ainda está pela metade.'
                  : ' Independe do período acima.'}
              </p>
            )}
          </Secao>

          {/* ── 3. Dados ───────────────────────────────────────────────── */}
          <Secao titulo="Dados">
            <Select value={empresa} onValueChange={(v) => onEmpresa(v as EscolhaEmpresa)}>
              <SelectTrigger aria-label="Empresa">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ambas">Ambas as empresas</SelectItem>
                <SelectItem value="1">Empresa 1</SelectItem>
                <SelectItem value="2">Empresa 2</SelectItem>
              </SelectContent>
            </Select>
            <div className="space-y-1">
              <Label className="text-2xs">Medida</Label>
              <Segmentado
                nome="Medida"
                opcoes={MEDIDAS}
                valor={medida}
                // Arrow, e não o setter direto: passar `SetStateAction` faz o tipo
                // disputar a inferência de `T` com as opções e o TypeScript alarga os
                // dois para string.
                onValor={(v) => onMedida(v)}
              />
            </div>
            <CaixaDeMarcacao
              marcado={ocultarDiversos}
              onMarcado={onOcultarDiversos}
              descricao="Tira o balde de sobras do cadastro de todos os números."
            >
              Ocultar Diversos
            </CaixaDeMarcacao>
          </Secao>

          {/* ── 4. Camadas ─────────────────────────────────────────────── */}
          <Secao
            titulo="Camadas extras"
            ajuda="Informação complementar. O Panorama é uma leitura do ERP; estas camadas acrescentam colunas a ela sem substituí-la."
          >
            <CaixaDeMarcacao
              marcado={custo}
              onMarcado={onCusto}
              descricao="Margem sob as saídas e o estoque a custo. Usa o custo de HOJE — não o da época da venda."
            >
              Custo e margem
            </CaixaDeMarcacao>
            <CaixaDeMarcacao
              marcado={inventario}
              onMarcado={onInventario}
              descricao="A contagem dos representantes ao lado do saldo do ERP."
            >
              Dados dos inventários
            </CaixaDeMarcacao>
          </Secao>
        </div>
      )}

      {/* Fica FORA do corpo retrátil: um impedimento escondido dentro do painel fechado
          deixaria o botão desabilitado sem nenhuma explicação à vista. */}
      {impedimento && (
        <p className="border-t border-border/60 px-4 py-2 text-sm text-destructive-strong">
          {impedimento}
        </p>
      )}
    </div>
  );
}
