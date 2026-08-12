import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { PageLoader } from '@/components/PageLoader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  QrCode,
  Search,
  RefreshCcw,
  Download,
  Upload,
  MoreVertical,
  ClipboardCheck,
  Undo2,
  Filter,
} from 'lucide-react';
import { useIsHandheld } from '@/hooks/use-mobile';
import { useCodigosCorrecaoQuery } from '@/hooks/useCodigosCorrecaoQuery';
import { resolverCodigosImportados } from '@/lib/codigoAuxiliar';
import { StatusInventarioBadge } from '@/components/StatusInventarioBadge';
import { FiltroCategorias } from '@/components/FiltroCategorias';
import { SELECAO_VAZIA, temSelecao, type SelecaoCategorias } from '@/lib/categoriasProduto';
import {
  SESSAO_VAZIA,
  balancoDaRecontagem,
  desfazerRecontagemDoItem,
  existiaNaSessao,
  iniciarSessao,
  itensDoRecorte,
  jaRecontado,
  mesmaContagem,
  recontarRecorte,
  type ItemContagem,
  type SessaoRecontagem,
} from '@/lib/recontagem';
import { BarraCaptura } from '@/components/inventario/BarraCaptura';
import { UltimoBipe } from '@/components/inventario/UltimoBipe';
import { LinhaContagem } from '@/components/inventario/LinhaContagem';
import { DialogRevisarEnviar } from '@/components/inventario/DialogRevisarEnviar';
import { ImportInventarioModal, ImportedInventarioItem } from '@/components/ImportInventarioModal';
import { ExportInventarioModal } from '@/components/ExportInventarioModal';
import type { Json } from '@/integrations/supabase/types';

const PENDING_SYNC_KEY = 'inventario_pending_sync';
const NEW_ID_DRAFT_KEY = 'inventario_new_id_draft';

/**
 * Rascunho POR INVENTÁRIO.
 *
 * As chaves antigas eram globais (`inventario_items_draft`), então o rascunho do
 * inventário A podia ser restaurado ao abrir "Novo inventário" e sobrescrevê-lo. Já era
 * ruim; com a referência de recontagem no mesmo pacote, viraria contagem corrompida sem
 * aviso nenhum.
 */
const chaveRascunho = (id: string | null) =>
  id ? `inventario_rascunho_${id}` : 'inventario_rascunho_novo';

interface Rascunho {
  items: ItemContagem[];
  observacoes: string;
  sessao: SessaoRecontagem;
  /**
   * `updated_at` do inventário no momento em que este rascunho começou.
   *
   * É o que detecta que o inventário mudou POR FORA desta aba — outro aparelho enviou,
   * ou o gerente mexeu. O rascunho vence o banco por padrão, e sem este carimbo o
   * cenário abaixo apagava trabalho em silêncio: o vendedor envia pelo celular, abre no
   * desktop onde um rascunho velho ficou parado, o rascunho velho é restaurado, ele
   * envia — e o `salvar_inventario` substitui os itens, revertendo o que veio do celular.
   */
  gravadoEm?: string | null;
}

interface FichaProduto {
  nome_produto: string;
  marca: string | null;
  tipo: string | null;
  subtipo: string | null;
  grupo: string | null;
}

const CAMPOS_FICHA = 'codigo_auxiliar, nome_produto, marca, tipo, subtipo, grupo';

/** PostgREST não aceita um `in` ilimitado; o catálogo vem em lotes. */
const TAMANHO_LOTE = 200;

async function buscarFichas(codigos: string[]): Promise<Map<string, FichaProduto>> {
  const mapa = new Map<string, FichaProduto>();
  for (let i = 0; i < codigos.length; i += TAMANHO_LOTE) {
    const lote = codigos.slice(i, i + TAMANHO_LOTE);
    const { data } = await supabase.from('produtos').select(CAMPOS_FICHA).in('codigo_auxiliar', lote);
    for (const p of data ?? []) {
      mapa.set(p.codigo_auxiliar, {
        nome_produto: p.nome_produto,
        marca: p.marca,
        tipo: p.tipo,
        subtipo: p.subtipo,
        grupo: p.grupo,
      });
    }
  }
  return mapa;
}

const SEM_FICHA: Omit<FichaProduto, 'nome_produto'> = {
  marca: null,
  tipo: null,
  subtipo: null,
  grupo: null,
};

const isNetworkError = (err: unknown): boolean => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? '';
  return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('fetch');
};

export default function Inventario() {
  const { profile, user } = useAuth();
  const { inventarioId } = useParams<{ inventarioId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const handheld = useIsHandheld();

  /**
   * Contagem nova ou inventário já gravado — e nada além disso.
   *
   * Não há "modo corrigir" separado de "modo recontar": até o vendedor mandar recontar um
   * recorte, nada foi zerado e ele pode ajustar qualquer número na mão. O que muda quando
   * o inventário já existe é só que os números na tela vieram de antes, e por isso um
   * bipe precisa perguntar se soma ou reconta.
   */
  const emRevisao = !!inventarioId;

  const [items, setItems] = useState<ItemContagem[]>([]);
  const [sessao, setSessao] = useState<SessaoRecontagem>(SESSAO_VAZIA);
  const [escopo, setEscopo] = useState<SelecaoCategorias>(SELECAO_VAZIA);
  const [observacoes, setObservacoes] = useState('');
  const [observacoesGerente, setObservacoesGerente] = useState('');
  const [busca, setBusca] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(!!inventarioId);
  const [isLoaded, setIsLoaded] = useState(false);
  const [editingInventarioId, setEditingInventarioId] = useState<string | null>(null);
  const [inventarioInfo, setInventarioInfo] = useState<{
    data_inventario: string;
    status: string;
  } | null>(null);

  const [ultimoCodigo, setUltimoCodigo] = useState<string | null>(null);
  const [podeDesfazerBipe, setPodeDesfazerBipe] = useState(false);

  const [showRevisar, setShowRevisar] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showLimparTudo, setShowLimparTudo] = useState(false);
  const [showConfirmarRecorte, setShowConfirmarRecorte] = useState(false);
  const [showDescartar, setShowDescartar] = useState(false);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [produtoNaoCadastrado, setProdutoNaoCadastrado] = useState<string | null>(null);
  /**
   * A rede de segurança contra o `1 + 2 = 3`: bipar, em recontagem, um produto que ainda
   * está com a contagem original nunca soma calado — pergunta uma vez, e a partir daí o
   * produto está recontado e os bipes seguintes seguem direto.
   */
  const [decisaoBipe, setDecisaoBipe] = useState<{ codigo: string; nome: string; atual: number } | null>(
    null
  );

  // Espelhos síncronos: `processCode` decide fora do ciclo de render e leria estado
  // velho em bipes rápidos.
  const itemsRef = useRef<ItemContagem[]>([]);
  const sessaoRef = useRef<SessaoRecontagem>(SESSAO_VAZIA);
  /** A contagem como está no banco. Vazia em inventário novo, que não tem o que descartar. */
  const gravadoRef = useRef<{ items: ItemContagem[]; observacoes: string }>({
    items: [],
    observacoes: '',
  });
  /** `updated_at` do inventário carregado — carimbo de validade do rascunho. */
  const gravadoEmRef = useRef<string | null>(null);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    sessaoRef.current = sessao;
  }, [sessao]);

  const { data: codigosCorrecao = [] } = useCodigosCorrecaoQuery();

  // ─── Rascunho ─────────────────────────────────────────────

  const chave = chaveRascunho(inventarioId ?? null);

  /**
   * Trava o rascunho enquanto o vendedor descarta e sai.
   *
   * Sem isto o descarte podia ressuscitar: `limparRascunho` apaga a chave, mas o efeito
   * abaixo grava de novo a qualquer mudança de estado antes de a navegação desmontar a
   * tela — e o vendedor voltaria a encontrar exatamente o que mandou jogar fora.
   */
  const descartandoRef = useRef(false);

  const limparRascunho = useCallback(() => {
    localStorage.removeItem(chave);
    if (!inventarioId) localStorage.removeItem(NEW_ID_DRAFT_KEY);
  }, [chave, inventarioId]);

  useEffect(() => {
    if (!isLoaded || descartandoRef.current) return;
    const rascunho: Rascunho = {
      items,
      observacoes,
      sessao,
      gravadoEm: gravadoEmRef.current,
    };
    localStorage.setItem(chave, JSON.stringify(rascunho));
  }, [items, observacoes, sessao, isLoaded, chave]);

  const lerRascunho = (): Rascunho | null => {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return null;
    try {
      const r = JSON.parse(bruto) as Rascunho;
      return Array.isArray(r.items) && r.items.length > 0 ? r : null;
    } catch {
      localStorage.removeItem(chave);
      return null;
    }
  };

  /**
   * Id estável para inventário NOVO. Retentativa após queda de conexão reusa o mesmo id,
   * e o RPC é idempotente — nunca cria inventário duplicado.
   */
  const getOrCreateNewInventarioId = (): string => {
    const existente = localStorage.getItem(NEW_ID_DRAFT_KEY);
    if (existente) return existente;
    const id = crypto.randomUUID();
    localStorage.setItem(NEW_ID_DRAFT_KEY, id);
    return id;
  };

  // ─── Carregamento ─────────────────────────────────────────

  const carregarInventario = useCallback(async () => {
    if (!profile?.codigo_vendedor || !inventarioId) return;

    try {
      const { data, error } = await supabase
        .from('inventarios')
        .select('*, itens_inventario(*)')
        .eq('id', inventarioId)
        .eq('codigo_vendedor', profile.codigo_vendedor)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (!data) {
        toast.error('Inventário não encontrado ou você não tem permissão para abri-lo.');
        navigate('/historico');
        return;
      }

      const fichas = await buscarFichas(data.itens_inventario.map((i) => i.codigo_auxiliar));
      const carregados: ItemContagem[] = data.itens_inventario.map((i) => {
        const ficha = fichas.get(i.codigo_auxiliar);
        return {
          codigo_auxiliar: i.codigo_auxiliar,
          nome_produto: i.nome_produto || ficha?.nome_produto || '',
          quantidade_fisica: i.quantidade_fisica,
          quantidade_anterior: i.quantidade_anterior,
          marca: ficha?.marca ?? null,
          tipo: ficha?.tipo ?? null,
          subtipo: ficha?.subtipo ?? null,
          grupo: ficha?.grupo ?? null,
        };
      });

      setEditingInventarioId(data.id);
      setObservacoes(data.observacoes || '');
      setObservacoesGerente(data.observacoes_gerente || '');
      setInventarioInfo({ data_inventario: data.data_inventario, status: data.status });

      // O que está GRAVADO, guardado à parte mesmo quando o rascunho vence na tela: é
      // para cá que "Descartar alterações" volta, e é contra isto que se sabe se há
      // trabalho não enviado.
      gravadoRef.current = { items: carregados, observacoes: data.observacoes || '' };
      gravadoEmRef.current = data.updated_at;

      // O rascunho vence o banco quando existe: é trabalho que o vendedor já fez e ainda
      // não enviou. Sem isto, recarregar a página no meio de uma recontagem de 80 itens
      // jogava tudo fora em silêncio.
      //
      // MENOS quando o inventário mudou por fora desde que o rascunho começou. Aí o
      // banco vence: um rascunho velho restaurado por cima de um envio feito de outro
      // aparelho reverteria aquele envio no próximo "Enviar", sem nada na tela indicando
      // que isso aconteceu. Descartar é a perda menor, e ela é anunciada.
      const rascunho = lerRascunho();
      const rascunhoVencido =
        !!rascunho && !!rascunho.gravadoEm && rascunho.gravadoEm !== data.updated_at;

      if (rascunho && !rascunhoVencido) {
        setItems(rascunho.items);
        setSessao(rascunho.sessao);
        if (rascunho.observacoes) setObservacoes(rascunho.observacoes);
        toast.info('Retomamos de onde você parou.');
      } else {
        setItems(carregados);
        setSessao(iniciarSessao(carregados));
        if (rascunhoVencido) {
          limparRascunho();
          toast.warning('Este inventário mudou em outro lugar', {
            description:
              'O que estava guardado neste aparelho ficou desatualizado e foi descartado. A tela mostra a contagem que está gravada agora.',
          });
        }
      }
    } catch (e) {
      console.error('Erro ao carregar inventário:', e);
      toast.error('Erro ao carregar o inventário');
      navigate('/historico');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.codigo_vendedor, inventarioId, navigate]);

  useEffect(() => {
    if (!profile?.codigo_vendedor) return;

    if (inventarioId) {
      carregarInventario().finally(() => {
        setCarregando(false);
        setIsLoaded(true);
      });
    } else {
      const rascunho = lerRascunho();
      if (rascunho) {
        setItems(rascunho.items);
        setSessao(rascunho.sessao);
        setObservacoes(rascunho.observacoes);
        toast.info('Rascunho carregado automaticamente.');
      }
      setIsLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.codigo_vendedor, inventarioId]);

  // ─── Captura ──────────────────────────────────────────────

  const getCodigoCorrigido = async (codigo: string) => {
    const { data } = await supabase
      .from('codigos_correcao')
      .select('cod_auxiliar_correto')
      .eq('cod_errado', codigo)
      .maybeSingle();
    return data
      ? { codigoFinal: data.cod_auxiliar_correto, foiCorrigido: true }
      : { codigoFinal: codigo, foiCorrigido: false };
  };

  /**
   * Soma 1 ao item, ou o cria no topo. Tudo dentro do functional update: chamadas
   * concorrentes (bipes rápidos) nunca produzem duas linhas do mesmo código — origem do
   * erro de SKU duplicado que o RPC precisava consolidar.
   */
  const somarUm = (codigo: string, ficha: FichaProduto) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.codigo_auxiliar === codigo);
      if (idx === -1) {
        const novo: ItemContagem = {
          codigo_auxiliar: codigo,
          nome_produto: ficha.nome_produto,
          quantidade_fisica: 1,
          quantidade_anterior: null,
          marca: ficha.marca,
          tipo: ficha.tipo,
          subtipo: ficha.subtipo,
          grupo: ficha.grupo,
        };
        return [novo, ...prev];
      }
      const copia = [...prev];
      const atual = copia[idx];
      copia[idx] = { ...atual, quantidade_fisica: atual.quantidade_fisica + 1 };
      const [movido] = copia.splice(idx, 1);
      copia.unshift(movido);
      return copia;
    });
    setUltimoCodigo(codigo);
    setPodeDesfazerBipe(true);
  };

  /** Zera o item e o marca como recontado, já contando o bipe que provocou a decisão. */
  const recontarItemAgora = (codigo: string) => {
    const base = sessaoRef.current.baseline[codigo] ?? 0;
    setItems((prev) =>
      prev.map((i) =>
        i.codigo_auxiliar === codigo
          ? { ...i, quantidade_fisica: 1, quantidade_anterior: base }
          : i
      )
    );
    setSessao((s) => ({ ...s, recontados: [...new Set([...s.recontados, codigo])] }));
    setUltimoCodigo(codigo);
    setPodeDesfazerBipe(true);
  };

  const processarCodigo = async (bruto: string) => {
    const codigo = bruto.trim().toUpperCase();
    if (!codigo) return;

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(50);
      } catch {
        /* navegador sem permissão de vibração */
      }
    }

    const { codigoFinal, foiCorrigido } = await getCodigoCorrigido(codigo);
    if (foiCorrigido) toast.info(`Código corrigido: ${codigo} → ${codigoFinal}`);

    const existente = itemsRef.current.find((i) => i.codigo_auxiliar === codigoFinal);

    if (existente) {
      const s = sessaoRef.current;
      if (emRevisao && existiaNaSessao(s, codigoFinal) && !jaRecontado(s, codigoFinal)) {
        setDecisaoBipe({
          codigo: codigoFinal,
          nome: existente.nome_produto,
          atual: existente.quantidade_fisica,
        });
        return;
      }
      somarUm(codigoFinal, {
        nome_produto: existente.nome_produto,
        marca: existente.marca,
        tipo: existente.tipo,
        subtipo: existente.subtipo,
        grupo: existente.grupo,
      });
      return;
    }

    const { data: produto } = await supabase
      .from('produtos')
      .select(CAMPOS_FICHA)
      .eq('codigo_auxiliar', codigoFinal)
      .maybeSingle();

    if (!produto) {
      setProdutoNaoCadastrado(codigoFinal);
      return;
    }

    somarUm(codigoFinal, {
      nome_produto: produto.nome_produto,
      marca: produto.marca,
      tipo: produto.tipo,
      subtipo: produto.subtipo,
      grupo: produto.grupo,
    });
  };

  const desfazerUltimoBipe = () => {
    if (!ultimoCodigo) return;
    setItems((prev) =>
      prev
        .map((i) =>
          i.codigo_auxiliar === ultimoCodigo
            ? { ...i, quantidade_fisica: Math.max(0, i.quantidade_fisica - 1) }
            : i
        )
        // Item criado pelo bipe desfeito não deve ficar como linha zerada: ele nunca fez
        // parte da contagem. Zerar aqui significaria "contei e não tem", que é outra
        // informação.
        .filter((i) => !(i.codigo_auxiliar === ultimoCodigo && i.quantidade_fisica === 0 && !existiaNaSessao(sessaoRef.current, i.codigo_auxiliar)))
    );
    setPodeDesfazerBipe(false);
  };

  // ─── Edição da lista ──────────────────────────────────────

  const definirQuantidade = (codigo: string, quantidade: number) => {
    // Cria objeto novo em vez de mutar: a versão anterior copiava o array e alterava o
    // item dentro dele, então a referência guardada em outro lugar mudava junto.
    setItems((prev) =>
      prev.map((i) =>
        i.codigo_auxiliar === codigo ? { ...i, quantidade_fisica: Math.max(0, quantidade) } : i
      )
    );
    setPodeDesfazerBipe(false);
  };

  const removerItem = (codigo: string) => {
    setItems((prev) => prev.filter((i) => i.codigo_auxiliar !== codigo));
    if (ultimoCodigo === codigo) setUltimoCodigo(null);
  };

  const desfazerRecontagem = (codigo: string) => {
    const r = desfazerRecontagemDoItem(itemsRef.current, codigo, sessaoRef.current);
    setItems(r.items);
    setSessao(r.sessao);
  };

  const aplicarRecorte = () => {
    const r = recontarRecorte(itemsRef.current, escopo, sessaoRef.current);
    setItems(r.items);
    setSessao(r.sessao);
    setShowConfirmarRecorte(false);
    setUltimoCodigo(null);
    toast.success(`${itensDoRecorte(itemsRef.current, escopo).length} produto(s) prontos para recontagem.`);
  };

  /**
   * Volta a tela para a contagem que está no banco.
   *
   * NADA foi gravado até o vendedor enviar — o inventário no banco continua intacto o
   * tempo todo. O problema é que, da cadeira dele, uma recontagem que ele começou e não
   * quer mais parece perdida: o rascunho guarda o estado zerado e a tela o restaura na
   * próxima visita. Isto é o caminho de volta, e por isso ele repõe a lista E limpa o
   * rascunho — deixar um dos dois faria a alteração descartada voltar sozinha depois.
   */
  const descartarAlteracoes = () => {
    const gravado = gravadoRef.current;
    setItems(gravado.items);
    setObservacoes(gravado.observacoes);
    setSessao(iniciarSessao(gravado.items));
    setUltimoCodigo(null);
    setPodeDesfazerBipe(false);
    setEscopo(SELECAO_VAZIA);
    limparRascunho();
    setShowDescartar(false);
    toast.success('Alterações descartadas', {
      description: 'A contagem voltou a ser a que está gravada.',
    });
  };

  /** Sai da tela jogando fora o rascunho — o "sair sem salvar" do aviso de saída. */
  const sairSemSalvar = () => {
    descartandoRef.current = true;
    limparRascunho();
    blocker.proceed?.();
  };

  const limparTudo = () => {
    setItems([]);
    setObservacoes('');
    setSessao(SESSAO_VAZIA);
    setUltimoCodigo(null);
    limparRascunho();
    setShowLimparTudo(false);
    toast.success('Todos os itens foram removidos.');
  };

  const importarItens = async (importados: ImportedInventarioItem[], obs?: string) => {
    // Os códigos do arquivo passam pelas mesmas regras do scanner: tabela de correção e
    // confronto com o cadastro. Sem isso, uma cor grafada 'C02' aqui e 'C2' no scanner
    // virava dois produtos, e a comparação acusava divergência dos dois lados para um
    // produto que nunca se moveu.
    const resolucao = await resolverCodigosImportados(importados, codigosCorrecao);
    const fichas = await buscarFichas(resolucao.items.map((i) => i.codigo_auxiliar));

    setItems((prev) => {
      const mapa = new Map<string, ItemContagem>();
      prev.forEach((i) => mapa.set(i.codigo_auxiliar, { ...i }));
      resolucao.items.forEach((i) => {
        const existente = mapa.get(i.codigo_auxiliar);
        if (existente) {
          existente.quantidade_fisica += i.quantidade_fisica;
          return;
        }
        const ficha = fichas.get(i.codigo_auxiliar);
        mapa.set(i.codigo_auxiliar, {
          codigo_auxiliar: i.codigo_auxiliar,
          nome_produto: i.nome_produto,
          quantidade_fisica: i.quantidade_fisica,
          quantidade_anterior: null,
          ...(ficha
            ? { marca: ficha.marca, tipo: ficha.tipo, subtipo: ficha.subtipo, grupo: ficha.grupo }
            : SEM_FICHA),
        });
      });
      return Array.from(mapa.values());
    });

    if (obs && !observacoes) setObservacoes(obs);
    toast.success(`${resolucao.items.length} item(ns) importado(s).`);

    const ajustes = [
      resolucao.corrigidos && `${resolucao.corrigidos} código(s) corrigido(s)`,
      resolucao.normalizados && `${resolucao.normalizados} ajustado(s) à grafia do cadastro`,
      resolucao.fundidos && `${resolucao.fundidos} linha(s) unificada(s)`,
    ].filter(Boolean);
    if (ajustes.length > 0) toast.info(ajustes.join(' · '));

    if (resolucao.desconhecidos.length > 0) {
      const amostra = resolucao.desconhecidos.slice(0, 3).join(', ');
      const resto = resolucao.desconhecidos.length - 3;
      toast.warning(
        `${resolucao.desconhecidos.length} código(s) sem produto cadastrado: ${amostra}` +
          (resto > 0 ? ` e mais ${resto}` : '') +
          '. Foram importados como vieram.'
      );
    }
  };

  // ─── Envio ────────────────────────────────────────────────

  const resetarAposEnvio = () => {
    limparRascunho();
    localStorage.removeItem(PENDING_SYNC_KEY);
    setItems([]);
    setObservacoes('');
    setSessao(SESSAO_VAZIA);
    setUltimoCodigo(null);
    setEditingInventarioId(null);
    setObservacoesGerente('');
    setInventarioInfo(null);
    // A referência do "gravado" acompanha o reset. Sem isto, a lista vazia passaria a
    // divergir do que o ref ainda guarda, `temAlteracoes` viraria true logo depois de um
    // envio BEM-SUCEDIDO, e o aviso de saída dispararia na navegação para o histórico.
    gravadoRef.current = { items: [], observacoes: '' };
  };

  const enviar = async () => {
    if (!profile?.codigo_vendedor || !user) {
      toast.error('Você precisa ter um código de vendedor configurado');
      return;
    }
    if (items.length === 0) {
      toast.error('Adicione pelo menos um item para enviar o inventário');
      return;
    }

    setEnviando(true);
    const editando = !!editingInventarioId;
    const id = editingInventarioId ?? getOrCreateNewInventarioId();
    // Itens com quantidade 0 SEGUEM no payload de propósito: "contei e não tem" é
    // informação diferente de "não contei", e é justamente o que a recontagem produz.
    const payload = items.map((i) => ({
      codigo_auxiliar: i.codigo_auxiliar,
      nome_produto: i.nome_produto,
      quantidade_fisica: i.quantidade_fisica,
      quantidade_anterior: i.quantidade_anterior,
    }));

    try {
      const { error } = await supabase.rpc('salvar_inventario', {
        p_inventario_id: id,
        p_observacoes: observacoes,
        p_items: payload as unknown as Json,
        p_status: 'pendente',
      });
      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      resetarAposEnvio();
      setShowRevisar(false);
      toast.success(
        editando ? 'Contagem atualizada e enviada ao gerente!' : 'Contagem enviada ao gerente!'
      );
      navigate('/historico');
    } catch (error) {
      console.error('Erro ao salvar inventário:', error);

      if (isNetworkError(error)) {
        localStorage.setItem(
          PENDING_SYNC_KEY,
          JSON.stringify({ inventarioId: id, observacoes, items: payload })
        );
        resetarAposEnvio();
        setShowRevisar(false);
        toast.warning('Sem conexão no momento', {
          description: 'A contagem foi guardada e será enviada assim que a conexão voltar.',
        });
        // Sai da tela igual ao caminho de sucesso. Ficar parado num inventário vazio,
        // depois de a fila já ter engolido a contagem, faz parecer que o envio apagou
        // tudo — e o vendedor recontaria por cima do que já está na fila.
        navigate('/historico');
      } else {
        const err = error as { message?: string; details?: string };
        toast.error('Erro ao salvar', { description: err?.message || err?.details || 'Erro desconhecido' });
      }
    } finally {
      setEnviando(false);
    }
  };

  /** Reenvia o que ficou pendente por falta de conexão. Idempotente pelo id estável. */
  const sincronizarPendencia = async () => {
    const bruto = localStorage.getItem(PENDING_SYNC_KEY);
    if (!bruto) return;

    let payload: { inventarioId: string; observacoes: string; items: unknown[] };
    try {
      payload = JSON.parse(bruto);
    } catch {
      localStorage.removeItem(PENDING_SYNC_KEY);
      return;
    }

    const { error } = await supabase.rpc('salvar_inventario', {
      p_inventario_id: payload.inventarioId,
      p_observacoes: payload.observacoes,
      p_items: payload.items as unknown as Json,
      p_status: 'pendente',
    });

    if (!error) {
      localStorage.removeItem(PENDING_SYNC_KEY);
      await queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      toast.success('Contagem sincronizada!');
    } else if (!isNetworkError(error)) {
      // Erro definitivo (ex.: inventário já aprovado): retentar não resolve.
      localStorage.removeItem(PENDING_SYNC_KEY);
      toast.error('Não foi possível sincronizar a contagem pendente', {
        description: error.message,
      });
    }
    // Erro de rede: mantém a fila para a próxima tentativa.
  };

  useEffect(() => {
    sincronizarPendencia();
    const aoVoltar = () => sincronizarPendencia();
    window.addEventListener('online', aoVoltar);
    return () => window.removeEventListener('online', aoVoltar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Derivados ────────────────────────────────────────────

  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const porEscopo = itensDoRecorte(items, escopo);
    if (!termo) return porEscopo;

    const corretosDoTermo = new Set(
      codigosCorrecao
        .filter((c) => c.cod_errado.toLowerCase().includes(termo))
        .map((c) => c.cod_auxiliar_correto.toLowerCase())
    );

    return porEscopo.filter((i) => {
      const codigo = i.codigo_auxiliar.toLowerCase();
      return (
        codigo.includes(termo) ||
        (i.nome_produto || '').toLowerCase().includes(termo) ||
        corretosDoTermo.has(codigo)
      );
    });
  }, [items, escopo, busca, codigosCorrecao]);

  const balanco = useMemo(() => balancoDaRecontagem(items, sessao), [items, sessao]);
  const totalPecas = balanco.totalPecas;
  const itemDestaque = useMemo(
    () => items.find((i) => i.codigo_auxiliar === ultimoCodigo) ?? null,
    [items, ultimoCodigo]
  );
  const alvosDoRecorte = useMemo(() => itensDoRecorte(items, escopo), [items, escopo]);
  const filtrando = temSelecao(escopo) || busca.trim() !== '';

  /** Há trabalho na tela que ainda não foi para o banco. */
  const temAlteracoes = useMemo(
    () =>
      emRevisao &&
      (!mesmaContagem(items, gravadoRef.current.items) ||
        observacoes !== gravadoRef.current.observacoes),
    [emRevisao, items, observacoes]
  );

  /**
   * Só avisa ao sair quando há mesmo o que perder.
   *
   * O aviso disparava por `items.length > 0`, então um inventário aberto e fechado sem
   * encostar em nada perguntava "sair sem enviar?" — e aviso que aparece quando não
   * precisa é aviso que o vendedor aprende a fechar sem ler, justo antes da vez em que
   * importava. Em contagem nova qualquer item é trabalho não enviado; em inventário
   * gravado, só o que difere do banco.
   */
  const temTrabalhoNaoEnviado = emRevisao ? temAlteracoes : items.length > 0;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      temTrabalhoNaoEnviado && currentLocation.pathname !== nextLocation.pathname && !enviando
  );

  /**
   * Refresh, fechar a aba, tocar em "voltar" para fora do app — o `useBlocker` não vê
   * nada disso, porque nada disso é navegação do router. Só o `beforeunload` alcança.
   *
   * O aviso é o do NAVEGADOR, com o texto genérico dele ("as alterações podem não ser
   * salvas"): Chrome, Firefox e Safari ignoram mensagem customizada há anos. O nosso
   * "Sair sem enviar?", com as três saídas, continua valendo só para a navegação interna
   * — não há como reproduzi-lo aqui.
   *
   * Rede de segurança, não proteção principal: o rascunho já é gravado a cada mudança, e
   * recarregar a página devolve a contagem de onde parou. Isto existe porque perder a
   * tela no meio de uma contagem desorienta mesmo quando o dado está a salvo.
   */
  useEffect(() => {
    if (!temTrabalhoNaoEnviado || enviando) return;
    const aoTentarSair = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aoTentarSair);
    return () => window.removeEventListener('beforeunload', aoTentarSair);
  }, [temTrabalhoNaoEnviado, enviando]);

  /**
   * Com um diálogo aberto, o campo de captura NÃO pode puxar o foco de volta: o leitor
   * físico escreveria o próximo bipe dentro do campo escondido atrás do diálogo, e as
   * teclas do próprio diálogo (Enter, Esc) parariam de responder.
   */
  const algumDialogoAberto =
    showRevisar ||
    showImport ||
    showExport ||
    showLimparTudo ||
    showConfirmarRecorte ||
    !!produtoNaoCadastrado ||
    !!decisaoBipe ||
    blocker.state === 'blocked';

  // ─── Render ───────────────────────────────────────────────

  if (!profile?.codigo_vendedor) {
    return (
      <AppLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <QrCode size={44} className="mx-auto mb-4 text-muted-foreground/50" />
              <h2 className="mb-2 text-xl font-bold">Código de vendedor necessário</h2>
              <p className="text-sm text-muted-foreground">
                Você precisa ter um código de vendedor configurado para contar. Fale com o gerente.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (carregando) {
    return (
      <AppLayout>
        <PageLoader />
      </AppLayout>
    );
  }

  const textos = emRevisao
    ? {
        titulo: 'Corrigir Contagem',
        descricao:
          'Ajuste o que precisar. Para recontar de verdade, escolha um recorte e zere a contagem dele.',
      }
    : {
        titulo: 'Novo Inventário',
        descricao: 'Bipe os produtos para montar sua contagem.',
      };

  return (
    /* Sem a barra de navegação do app: contar é trabalho contínuo, e navegar para outra
       tela no meio não faz parte do fluxo. O rodapé inteiro passa a ser da captura, e a
       gaveta do cabeçalho continua sendo a saída. */
    <AppLayout semBarraInferior>
      {/* A folga embaixo é a altura da barra fixa de captura. Sem ela, o último produto
          da lista — normalmente o que o vendedor acabou de bipar — fica atrás dos
          botões, e ele rola até o fim achando que perdeu o item. */}
      <div className={`mx-auto max-w-4xl space-y-6 ${handheld ? 'pb-36' : ''}`}>
        <PageHeader
          title={textos.titulo}
          description={textos.descricao}
          action={
            /* No aparelho de mão o "Revisar e enviar" mora na barra do rodapé; repetido
               aqui em cima seriam duas ações primárias competindo na mesma tela. */
            handheld ? undefined : (
              <Button onClick={() => setShowRevisar(true)} disabled={items.length === 0}>
                <ClipboardCheck className="mr-2" size={16} />
                Revisar e enviar
              </Button>
            )
          }
        />

        {/* Contexto: em qual inventário ele está mexendo e o que o gerente pediu. */}
        {inventarioInfo && (
          <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <StatusInventarioBadge status={inventarioInfo.status} />
              <p className="text-sm text-muted-foreground">
                Contagem de{' '}
                <span className="font-medium text-foreground">
                  {format(new Date(inventarioInfo.data_inventario), "dd/MM/yyyy 'às' HH:mm", {
                    locale: ptBR,
                  })}
                </span>
              </p>
              {emRevisao && sessao.recontados.length > 0 && (
                <Badge variant="info" className="px-2.5 py-0.5 text-2xs">
                  {sessao.recontados.length} de {items.length} recontados
                </Badge>
              )}
              {/* Dizer que há trabalho pendente é o que dá sentido ao "Descartar": sem
                  isto o vendedor não sabe se o que ele vê é o que está gravado. */}
              {temAlteracoes && (
                <Badge variant="warning" className="px-2.5 py-0.5 text-2xs">
                  Alterações não enviadas
                </Badge>
              )}
            </div>

            {observacoesGerente && (
              <div className="mt-3 rounded-xl border border-warning/30 bg-warning-subtle p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-warning-strong">
                  O gerente pediu
                </p>
                <p className="mt-1 text-sm font-medium text-warning-strong">{observacoesGerente}</p>
              </div>
            )}
          </div>
        )}

        <BarraCaptura
          onCodigo={processarCodigo}
          onEnviar={() => setShowRevisar(true)}
          podeEnviar={items.length > 0}
          suspenderFoco={algumDialogoAberto}
        />

        {itemDestaque && (
          <UltimoBipe
            item={itemDestaque}
            onQuantidade={(q) => definirQuantidade(itemDestaque.codigo_auxiliar, q)}
            onDesfazer={desfazerUltimoBipe}
            podeDesfazer={podeDesfazerBipe}
          />
        )}

        <Card>
          <CardHeader className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              {/* O contador desce para a linha de baixo: ao lado do título ele empurrava
                  os botões e, em número grande, quebrava a linha de qualquer jeito. */}
              <div className="min-w-0">
                <CardTitle>Contagem</CardTitle>
                <p className="mt-1 text-xs font-medium text-muted-foreground tabular-nums">
                  {items.length} {items.length === 1 ? 'produto' : 'produtos'} · {totalPecas}{' '}
                  {totalPecas === 1 ? 'peça' : 'peças'}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant={mostrarFiltros ? 'secondary' : 'outline'}
                  size="iconSm"
                  aria-label={mostrarFiltros ? 'Fechar busca e filtros' : 'Buscar e filtrar'}
                  aria-expanded={mostrarFiltros}
                  onClick={() => {
                    // Fechar limpa o recorte: filtro escondido é filtro esquecido, e a
                    // lista "sumida" viraria um bug que o vendedor não sabe explicar.
                    if (mostrarFiltros) {
                      setBusca('');
                      setEscopo(SELECAO_VAZIA);
                    }
                    setMostrarFiltros(!mostrarFiltros);
                  }}
                >
                  {/* Filtro, e não lupa: o botão abre a busca E o recorte por categoria.
                      A lupa continua existindo, dentro do campo de busca, onde ela de
                      fato significa "procurar". */}
                  <Filter size={16} />
                </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="iconSm" aria-label="Mais ações">
                    <MoreVertical size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => setShowImport(true)}>
                    <Upload size={16} className="mr-2" />
                    Importar de um arquivo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowExport(true)} disabled={items.length === 0}>
                    <Download size={16} className="mr-2" />
                    Exportar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {/* Uma opção por contexto. Num inventário já gravado o que o vendedor
                      quer ao desistir é VOLTAR ao que está salvo, não esvaziar a lista —
                      e oferecer "apagar tudo" ali seria entregar a alavanca errada para
                      quem só queria dar meia-volta. Em contagem nova não há para onde
                      voltar, então a saída é recomeçar. */}
                  {emRevisao ? (
                    <DropdownMenuItem
                      onClick={() => setShowDescartar(true)}
                      disabled={!temAlteracoes}
                      className="text-destructive focus:text-destructive"
                    >
                      <Undo2 size={16} className="mr-2" />
                      Descartar alterações
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => setShowLimparTudo(true)}
                      disabled={items.length === 0}
                      className="text-destructive focus:text-destructive"
                    >
                      <RefreshCcw size={16} className="mr-2" />
                      Apagar a lista inteira
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>

            <div className="space-y-3">
              {/* Busca e filtros ficam FECHADOS por padrão.
                  Abertos, o campo "Procurar por código ou nome" tinha a mesma cara do
                  campo de bipar e ficava logo abaixo dele — dois campos de texto quase
                  idênticos disputando o mesmo gesto, e o vendedor digitando o código no
                  lugar errado. Recurso secundário não pode competir com o principal. */}
              {mostrarFiltros && (
                <>
                  <div className="relative">
                    <Search
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      size={16}
                    />
                    <Input
                      id="busca-contagem"
                      name="busca"
                      placeholder="Procurar na lista por código ou nome…"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  <FiltroCategorias
                    linhas={items}
                    selecao={escopo}
                    onSelecao={setEscopo}
                    comSeparador={false}
                  />
                </>
              )}

              {emRevisao && alvosDoRecorte.length > 0 && (
                <Button
                  variant="outline"
                  className="w-full font-semibold"
                  onClick={() => setShowConfirmarRecorte(true)}
                >
                  <RefreshCcw className="mr-2" size={16} />
                  Recontar {temSelecao(escopo) ? 'estes' : 'todos os'} {alvosDoRecorte.length}{' '}
                  produto(s)
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {itensFiltrados.length === 0 ? (
              <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-8 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  {filtrando
                    ? 'Nenhum produto neste recorte.'
                    : 'Nenhum produto ainda. Comece bipando.'}
                </p>
                {filtrando && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setBusca('');
                      setEscopo(SELECAO_VAZIA);
                    }}
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>
            ) : (
              /* Sem paginação: o item bipado vai para o topo, e com páginas de 10 quem
                 estivesse na página 2 bipava e não via nada acontecer na tela. */
              <ul className="overflow-hidden rounded-xl border border-border/80">
                {itensFiltrados.map((item) => (
                  <LinhaContagem
                    key={item.codigo_auxiliar}
                    item={item}
                    emRevisao={emRevisao}
                    recontado={jaRecontado(sessao, item.codigo_auxiliar)}
                    destacado={item.codigo_auxiliar === ultimoCodigo}
                    onQuantidade={(q) => definirQuantidade(item.codigo_auxiliar, q)}
                    onRemover={() => removerItem(item.codigo_auxiliar)}
                    onDesfazerRecontagem={() => desfazerRecontagem(item.codigo_auxiliar)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Diálogos ─────────────────────────────────────── */}

      <DialogRevisarEnviar
        open={showRevisar}
        onOpenChange={setShowRevisar}
        balanco={balanco}
        emRevisao={emRevisao}
        totalProdutos={items.length}
        observacoes={observacoes}
        onObservacoes={setObservacoes}
        onConfirmar={enviar}
        enviando={enviando}
      />

      <AlertDialog
        open={!!decisaoBipe}
        onOpenChange={(aberto) => !aberto && setDecisaoBipe(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Este produto ainda está com a contagem antiga</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono">{decisaoBipe?.codigo}</span> está com{' '}
              <strong className="tabular-nums">{decisaoBipe?.atual}</strong> da contagem anterior. O
              que você quer fazer com este bipe?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* "Somar" NÃO pode ser o `AlertDialogCancel`: Esc e o toque fora do diálogo
              disparam o cancelar, e o padrão de fuga viraria justamente a soma acidental
              que esta tela existe para impedir. Sair sem escolher descarta o bipe, que é
              o desfecho seguro — o vendedor bipa de novo. */}
          <AlertDialogFooter className="flex-col gap-2 sm:gap-0">
            <AlertDialogAction
              onClick={() => {
                if (decisaoBipe) recontarItemAgora(decisaoBipe.codigo);
                setDecisaoBipe(null);
              }}
            >
              Recontar — começar do zero (fica 1)
            </AlertDialogAction>
            <Button
              variant="outline"
              onClick={() => {
                if (decisaoBipe) {
                  const item = itemsRef.current.find((i) => i.codigo_auxiliar === decisaoBipe.codigo);
                  if (item) {
                    somarUm(decisaoBipe.codigo, {
                      nome_produto: item.nome_produto,
                      marca: item.marca,
                      tipo: item.tipo,
                      subtipo: item.subtipo,
                      grupo: item.grupo,
                    });
                  }
                }
                setDecisaoBipe(null);
              }}
            >
              Somar à contagem anterior (fica {(decisaoBipe?.atual ?? 0) + 1})
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showConfirmarRecorte} onOpenChange={setShowConfirmarRecorte}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recontar {alvosDoRecorte.length} produto(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              A contagem destes produtos vai para zero e você reconta bipando. O número antigo fica
              guardado como referência, e o que não for bipado termina em zero. Os produtos fora
              deste recorte não mudam.
              {/* Com o filtro fechado por padrão, "recontar todos" é o único caminho
                  visível — e zerar o inventário inteiro sem saber que dava para recortar
                  por marca é o engano caro que essa frase evita. */}
              {!temSelecao(escopo) && (
                <span className="mt-2 block font-medium text-foreground">
                  Quer recontar só uma parte? Cancele, toque no filtro e escolha a marca, o tipo ou
                  o grupo antes de recontar.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={aplicarRecorte}>Recontar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!produtoNaoCadastrado}
        onOpenChange={(aberto) => !aberto && setProdutoNaoCadastrado(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Produto não cadastrado</AlertDialogTitle>
            <AlertDialogDescription>
              O código <strong className="font-mono">{produtoNaoCadastrado}</strong> não está no
              sistema. Fale com o gerente para cadastrá-lo antes de incluí-lo na contagem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setProdutoNaoCadastrado(null)}>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showLimparTudo} onOpenChange={setShowLimparTudo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar a lista inteira?</AlertDialogTitle>
            <AlertDialogDescription>
              Os {items.length} produtos saem da lista e o rascunho é descartado. Isto não é o mesmo
              que recontar: aqui os produtos somem, em vez de irem para zero. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={limparTudo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Apagar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blocker.state === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair sem enviar?</AlertDialogTitle>
            <AlertDialogDescription>
              {emRevisao
                ? 'Nada foi gravado ainda: o inventário continua como estava. Você pode guardar o que fez para continuar depois, ou sair sem salvar e deixar tudo como está.'
                : 'Sua contagem fica guardada neste aparelho e você pode voltar depois. Ela só chega ao gerente quando você enviar.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Três saídas porque o momento de sair é justamente quando a pergunta "eu
              quero mesmo isto?" aparece. "Guardar" é a primeira e a que o dedo acha
              primeiro; "sair sem salvar" é destrutiva e está rotulada como tal. */}
          <AlertDialogFooter className="flex-col gap-2 sm:gap-0">
            <AlertDialogAction onClick={() => blocker.proceed?.()}>
              Guardar e sair
            </AlertDialogAction>
            <AlertDialogAction
              onClick={sairSemSalvar}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sair sem salvar
            </AlertDialogAction>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              Continuar contando
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDescartar} onOpenChange={setShowDescartar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            {/* A redação lidera pelo que é PRESERVADO. A versão anterior dizia "o
                inventário não é apagado": uma negação que ainda coloca "apagar" diante
                dos olhos, e foi exatamente essa ambiguidade que fez o vendedor achar que
                tinha perdido a contagem gravada. */}
            <AlertDialogTitle>Voltar para a contagem gravada?</AlertDialogTitle>
            <AlertDialogDescription>
              Seu inventário continua no histórico, inteiro, com os produtos e as quantidades que
              você já enviou. O que sai é só o que você mexeu depois de abrir esta tela e ainda não
              enviou — as quantidades voltam a ser as que já estão salvas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={descartarAlteracoes}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Voltar para a gravada
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportInventarioModal
        open={showImport}
        onOpenChange={setShowImport}
        onImport={importarItens}
      />

      <ExportInventarioModal
        open={showExport}
        onOpenChange={setShowExport}
        items={items}
        observacoes={observacoes}
        codigoVendedor={profile?.codigo_vendedor}
        editingInventarioId={editingInventarioId}
      />
    </AppLayout>
  );
}
