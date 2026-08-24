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
import { CalendarRange, RefreshCw } from 'lucide-react';
import type { EscolhaEmpresa } from '@/hooks/useConsultaErpQuery';
import { MEDIDAS, type Medida } from '@/lib/panorama';
import { ATALHOS, intervaloDoAtalho } from '@/lib/panoramaPeriodo';

/**
 * Barra de escopo — o que vale para a tela inteira.
 *
 * Antes era um cartão alto de formulário que ocupava a primeira dobra e mudava de forma
 * conforme a aba. Como agora existe uma tela só, existe um escopo só, numa faixa
 * horizontal — e o número aparece antes de ela precisar de atenção.
 *
 * ⚠️ **Só as DATAS ficam no painel recolhível.** Empresa e data base moraram lá por um
 * tempo, para economizar largura, e o efeito foi um defeito: o painel só abria quando o
 * período era diferente do padrão, então escolher "Ano" — que É o padrão — fazia os dois
 * filtros sumirem da tela. Escopo que vale sempre precisa estar sempre alcançável; o que
 * é recolhível é o caso incomum, e o caso incomum aqui é digitar data na mão.
 *
 * Pelo mesmo motivo `datasAbertas` é estado de INTERFACE e não derivado do período.
 * Derivado, o botão "Datas" não abria nada partindo do padrão: ele calculava "já estou
 * fechado" e não tinha como mudar de ideia.
 */

interface Props {
  de: string;
  ate: string;
  empresa: EscolhaEmpresa;
  baseData: 'movimento' | 'emissao';
  medida: Medida;
  datasAbertas: boolean;
  carregando: boolean;
  onPeriodo: (de: string, ate: string) => void;
  onEmpresa: (e: EscolhaEmpresa) => void;
  onBaseData: (b: 'movimento' | 'emissao') => void;
  onMedida: (m: Medida) => void;
  onDatasAbertas: (v: boolean) => void;
  onAtualizar: () => void;
}

export function BarraEscopo({
  de,
  ate,
  empresa,
  baseData,
  medida,
  datasAbertas,
  carregando,
  onPeriodo,
  onEmpresa,
  onBaseData,
  onMedida,
  onDatasAbertas,
  onAtualizar,
}: Props) {
  const periodoInvalido = de > ate;
  /** Nenhum atalho corresponde ao intervalo atual — foi digitado à mão. */
  const semAtalho = !ATALHOS.some((a) => {
    const alvo = intervaloDoAtalho(a.meses);
    return de === alvo.de && ate === alvo.ate;
  });

  const pilula = (ativo: boolean) =>
    `rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
      ativo
        ? 'bg-primary text-primary-foreground'
        : 'bg-muted/60 text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Período
          </span>
          {ATALHOS.map((a) => {
            const alvo = intervaloDoAtalho(a.meses);
            const ativo = de === alvo.de && ate === alvo.ate;
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => {
                  onDatasAbertas(false);
                  onPeriodo(alvo.de, alvo.ate);
                }}
                className={pilula(ativo)}
              >
                {a.rotulo}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={datasAbertas || semAtalho}
            aria-expanded={datasAbertas || semAtalho}
            onClick={() => onDatasAbertas(!datasAbertas)}
            title="Escolher as datas na mão"
            className={`flex items-center gap-1 ${pilula(datasAbertas || semAtalho)}`}
          >
            <CalendarRange size={13} />
            Datas
          </button>
        </div>

        {/* Empresa e data base valem SEMPRE — nunca recolhidas. */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={empresa} onValueChange={(v) => onEmpresa(v as EscolhaEmpresa)}>
            <SelectTrigger className="h-8 w-auto gap-1.5 px-2.5 text-xs" aria-label="Empresa">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ambas">Ambas as empresas</SelectItem>
              <SelectItem value="1">Empresa 1</SelectItem>
              <SelectItem value="2">Empresa 2</SelectItem>
            </SelectContent>
          </Select>
          <Select value={baseData} onValueChange={(v) => onBaseData(v as 'movimento' | 'emissao')}>
            <SelectTrigger
              className="h-8 w-auto gap-1.5 px-2.5 text-xs"
              aria-label="Data que delimita o período"
              title="Qual data delimita o período: a do movimento da nota ou a da emissão"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="movimento">Data do movimento</SelectItem>
              <SelectItem value="emissao">Data de emissão</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Segmentado
            nome="Medida"
            opcoes={MEDIDAS}
            valor={medida}
            // Arrow, e não o setter direto: passar `SetStateAction` faz o tipo disputar
            // a inferência de `T` com as opções e o TypeScript alarga os dois para string.
            onValor={(v) => onMedida(v)}
            tamanho="sm"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={onAtualizar}
            disabled={carregando || periodoInvalido}
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
            {carregando ? 'Consultando' : 'Atualizar'}
          </Button>
        </div>
      </div>

      {(datasAbertas || semAtalho) && (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="panorama-de">De</Label>
            <Input
              id="panorama-de"
              type="date"
              value={de}
              onChange={(e) => onPeriodo(e.target.value, ate)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="panorama-ate">Até</Label>
            <Input
              id="panorama-ate"
              type="date"
              value={ate}
              onChange={(e) => onPeriodo(de, e.target.value)}
            />
          </div>
        </div>
      )}

      {periodoInvalido && (
        <p className="mt-2 text-sm text-destructive-strong">
          A data inicial não pode ser posterior à final.
        </p>
      )}
    </div>
  );
}
