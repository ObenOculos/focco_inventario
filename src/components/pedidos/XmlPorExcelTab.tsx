import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileDown, FileCode, Loader2, Upload, AlertTriangle, Store } from 'lucide-react';
import { gerarXmlRetornoCiclone, downloadXml, downloadXmlsAsZip } from '@/lib/gerarXmlCiclone';

interface ItemLido {
  linha: number;
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade: number;
  valor_unitario: number;
}

interface ErroLinha {
  linha: number;
  mensagem: string;
}

const LOJAS = [
  { codigo: 1, nome: 'Loja 01' },
  { codigo: 2, nome: 'Loja 02' },
];

const COLUNAS_OBRIGATORIAS = ['codigo_auxiliar', 'nome_produto', 'quantidade', 'valor_unitario'];

function normalizeKey(s: string) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function parseNumero(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  const s = String(v).trim().replace(/\./g, '').replace(',', '.');
  return Number(s);
}

export function XmlPorExcelTab() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [codigoVendedor, setCodigoVendedor] = useState('');
  const [nomeVendedor, setNomeVendedor] = useState('');
  const [tabela, setTabela] = useState<'venda' | 'remessa'>('venda');
  const [segmentos, setSegmentos] = useState<number>(1);
  const [nomeArquivo, setNomeArquivo] = useState<string>('');
  const [itens, setItens] = useState<ItemLido[]>([]);
  const [erros, setErros] = useState<ErroLinha[]>([]);
  const [loading, setLoading] = useState(false);

  const totais = useMemo(() => {
    const qtd = itens.reduce((a, i) => a + i.quantidade, 0);
    const valor = itens.reduce((a, i) => a + i.quantidade * i.valor_unitario, 0);
    return { qtd, valor };
  }, [itens]);

  const handleBaixarModelo = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      COLUNAS_OBRIGATORIAS,
      ['MOD001 PRETO', 'Produto Exemplo', 1, 100.0],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Itens');
    XLSX.writeFile(wb, 'modelo-xml-ciclone.xlsx');
  };

  const handleArquivo = async (file: File) => {
    setNomeArquivo(file.name);
    setItens([]);
    setErros([]);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (rows.length === 0) {
        toast.error('Planilha vazia.');
        return;
      }

      // normalize keys
      const normRows = rows.map((r) => {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(r)) out[normalizeKey(k)] = r[k];
        return out;
      });

      const headers = Object.keys(normRows[0]);
      const faltantes = COLUNAS_OBRIGATORIAS.filter((c) => !headers.includes(c));
      if (faltantes.length) {
        toast.error('Colunas obrigatórias ausentes', { description: faltantes.join(', ') });
        return;
      }

      const errosAcc: ErroLinha[] = [];
      const itensAcc: ItemLido[] = [];

      normRows.forEach((r, idx) => {
        const linha = idx + 2; // header + 1-index
        const codigo = String(r.codigo_auxiliar ?? '').trim();
        const nome = String(r.nome_produto ?? '').trim();
        const quantidade = parseNumero(r.quantidade);
        const valor = parseNumero(r.valor_unitario);

        if (!codigo) {
          errosAcc.push({ linha, mensagem: 'codigo_auxiliar vazio' });
          return;
        }
        if (!nome) {
          errosAcc.push({ linha, mensagem: 'nome_produto vazio' });
          return;
        }
        if (!Number.isFinite(quantidade) || quantidade <= 0) {
          errosAcc.push({ linha, mensagem: 'quantidade inválida (deve ser > 0)' });
          return;
        }
        if (!Number.isFinite(valor) || valor < 0) {
          errosAcc.push({ linha, mensagem: 'valor_unitario inválido' });
          return;
        }
        itensAcc.push({
          linha,
          codigo_auxiliar: codigo,
          nome_produto: nome,
          quantidade,
          valor_unitario: valor,
        });
      });

      setItens(itensAcc);
      setErros(errosAcc);

      if (itensAcc.length === 0) {
        toast.error('Nenhuma linha válida encontrada.');
      } else if (errosAcc.length) {
        toast.warning(`${itensAcc.length} item(ns) carregado(s), ${errosAcc.length} com erro.`);
      } else {
        toast.success(`${itensAcc.length} item(ns) carregado(s).`);
      }
    } catch (err) {
      toast.error('Falha ao ler planilha.', {
        description: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  };

  const handleGerarXml = async (loja: { codigo: number; nome: string }) => {
    if (!codigoVendedor.trim() || !nomeVendedor.trim()) {
      toast.error('Informe o código e o nome do vendedor.');
      return;
    }
    if (itens.length === 0) {
      toast.error('Nenhum item válido para gerar XML.');
      return;
    }
    if (erros.length) {
      toast.error('Corrija os erros da planilha antes de gerar.');
      return;
    }

    setLoading(true);
    try {
      const requested = Math.max(1, Math.min(10, segmentos));
      const effectiveSegmentos = Math.min(requested, itens.length);
      if (effectiveSegmentos < requested) {
        toast.warning(`Só há ${itens.length} item(ns). Gerando ${effectiveSegmentos} pedido(s).`);
      }
      const buckets: ItemLido[][] = Array.from({ length: effectiveSegmentos }, () => []);
      itens.forEach((item, idx) => buckets[idx % effectiveSegmentos].push(item));

      const dataIso = new Date().toISOString().slice(0, 10);
      const arquivos = buckets.map((bucket, i) => {
        const sufixo = effectiveSegmentos > 1 ? `-parte${i + 1}` : '';
        const xml = gerarXmlRetornoCiclone({
          codigoVendedor: codigoVendedor.trim(),
          nomeVendedor: nomeVendedor.trim(),
          codigoLoja: loja.codigo,
          itens: bucket.map((it) => ({
            codigo_auxiliar: it.codigo_auxiliar,
            nome_produto: it.nome_produto,
            quantidade: it.quantidade,
            valor_unitario: it.valor_unitario,
          })),
          sequencia: effectiveSegmentos > 1 ? i + 1 : undefined,
        });
        const nome = `retorno-ciclone-${tabela}-loja${loja.codigo}-${codigoVendedor.trim()}${sufixo}-${dataIso}.xml`;
        return { nome, conteudo: xml };
      });

      if (arquivos.length > 1) {
        const zipName = `retorno-ciclone-${tabela}-loja${loja.codigo}-${codigoVendedor.trim()}-${effectiveSegmentos}partes-${dataIso}.zip`;
        await downloadXmlsAsZip(arquivos, zipName);
        toast.success(`ZIP gerado com ${effectiveSegmentos} XMLs.`);
      } else {
        downloadXml(arquivos[0].conteudo, arquivos[0].nome);
        toast.success('XML gerado com sucesso.');
      }
    } catch (err) {
      toast.error('Falha ao gerar XML.', {
        description: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            XML Ciclone a partir de Excel
          </CardTitle>
          <CardDescription>
            Sem consulta ao banco. Importe a planilha, informe vendedor e loja, e gere o XML no
            mesmo formato Ciclone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Cabeçalho */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="xlsx-codigo-vendedor">Código do vendedor</Label>
              <Input
                id="xlsx-codigo-vendedor"
                name="codigo_vendedor"
                autoComplete="off"
                placeholder="Ex: 1234"
                value={codigoVendedor}
                onChange={(e) => setCodigoVendedor(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="xlsx-nome-vendedor">Nome do vendedor</Label>
              <Input
                id="xlsx-nome-vendedor"
                name="nome_vendedor"
                autoComplete="off"
                placeholder="Ex: João da Silva"
                value={nomeVendedor}
                onChange={(e) => setNomeVendedor(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="xlsx-tabela">Tabela de preço</Label>
              <Select value={tabela} onValueChange={(v) => setTabela(v as 'venda' | 'remessa')}>
                <SelectTrigger id="xlsx-tabela">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="venda">Venda</SelectItem>
                  <SelectItem value="remessa">Remessa</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O valor unitário é lido da planilha. Este campo só compõe o nome do arquivo.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="xlsx-segmentos">Segmentos (1–10)</Label>
              <Input
                id="xlsx-segmentos"
                name="segmentos"
                type="number"
                min={1}
                max={10}
                value={segmentos}
                onChange={(e) => setSegmentos(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              />
              <p className="text-xs text-muted-foreground">
                {segmentos === 1
                  ? 'Gera 1 XML único.'
                  : `Divide os itens em ${segmentos} pedidos (round-robin) e baixa um ZIP.`}
              </p>
            </div>
          </div>

          {/* Upload */}
          <div className="space-y-2">
            <Label>Planilha (.xlsx ou .csv)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Escolher arquivo
              </Button>
              <Button variant="ghost" onClick={handleBaixarModelo}>
                <FileDown className="h-4 w-4 mr-2" />
                Baixar modelo
              </Button>
              {nomeArquivo && (
                <span className="text-sm text-muted-foreground truncate">{nomeArquivo}</span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleArquivo(f);
                  e.target.value = '';
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Colunas obrigatórias: <code>codigo_auxiliar</code>, <code>nome_produto</code>,{' '}
              <code>quantidade</code>, <code>valor_unitario</code>.
            </p>
          </div>

          {/* Resumo */}
          {(itens.length > 0 || erros.length > 0) && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{itens.length} item(ns) válidos</Badge>
              <Badge variant="secondary">Σ qtd: {totais.qtd}</Badge>
              <Badge variant="secondary">
                Σ valor: {totais.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </Badge>
              {erros.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {erros.length} erro(s)
                </Badge>
              )}
            </div>
          )}

          {/* Erros */}
          {erros.length > 0 && (
            <div className="rounded border border-destructive/50 bg-destructive/5 p-3 max-h-48 overflow-auto text-sm">
              <p className="font-semibold mb-1">Erros encontrados:</p>
              <ul className="space-y-0.5">
                {erros.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    Linha {e.linha}: {e.mensagem}
                  </li>
                ))}
                {erros.length > 50 && <li>… e mais {erros.length - 50}</li>}
              </ul>
            </div>
          )}

          {/* Pré-visualização */}
          {itens.length > 0 && (
            <div className="border rounded max-h-80 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-16">Linha</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Valor unit.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.slice(0, 200).map((it) => (
                    <TableRow key={it.linha}>
                      <TableCell className="text-muted-foreground">{it.linha}</TableCell>
                      <TableCell className="font-mono text-xs">{it.codigo_auxiliar}</TableCell>
                      <TableCell>{it.nome_produto}</TableCell>
                      <TableCell className="text-right">{it.quantidade}</TableCell>
                      <TableCell className="text-right">
                        {it.valor_unitario.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {itens.length > 200 && (
                <p className="text-xs text-muted-foreground p-2">
                  Exibindo 200 de {itens.length} linhas. Todas serão incluídas no XML.
                </p>
              )}
            </div>
          )}

          {/* Lojas */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Gerar XML para a loja</p>
            <div className="grid grid-cols-2 gap-4">
              {LOJAS.map((loja) => (
                <Button
                  key={loja.codigo}
                  variant="outline"
                  className="h-24 flex flex-col gap-2 text-base"
                  disabled={loading || itens.length === 0 || erros.length > 0}
                  onClick={() => handleGerarXml(loja)}
                >
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <Store className="h-6 w-6" />
                  )}
                  {loja.nome}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
