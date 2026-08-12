import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Check, ClipboardCheck, Keyboard, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIsHandheld } from '@/hooks/use-mobile';

/**
 * Captura de códigos.
 *
 * O CAMPO É O PRINCIPAL, NÃO A CÂMERA: o vendedor bipa com um leitor físico, e um leitor
 * físico se comporta como teclado — ele digita o código no campo em foco e manda um
 * Enter. Quem manda na captura é o campo; a câmera é o plano B para quando a máquina não
 * está por perto. Tratá-la como ação principal (era um botão grande, o campo escondido
 * atrás de um ícone) deixava a ferramenta de verdade em segundo plano.
 *
 * O foco é devolvido ao campo por código, e nunca via `autoFocus`: foco programático não
 * abre o teclado virtual no celular, e quem usa leitor físico não quer meia tela ocupada
 * por um teclado que ele não vai tocar. Tocar no campo continua abrindo o teclado para
 * quem precisa digitar à mão.
 *
 * No aparelho de mão a barra tem dois estados, um por vez, porque só cabe uma linha:
 * capturando (campo + câmera + fechar) e pronto para enviar (voltar a bipar + enviar).
 */
interface Props {
  /** Recebe o código lido. A câmera só volta a ler depois que a promessa resolve. */
  onCodigo: (codigo: string) => Promise<void>;
  onEnviar: () => void;
  podeEnviar: boolean;
  /** Um diálogo aberto tem o foco: devolvê-lo ao campo roubaria o teclado do diálogo. */
  suspenderFoco?: boolean;
  desabilitado?: boolean;
}

export function BarraCaptura({
  onCodigo,
  onEnviar,
  podeEnviar,
  suspenderFoco = false,
  desabilitado = false,
}: Props) {
  const handheld = useIsHandheld();
  const [cameraAberta, setCameraAberta] = useState(false);
  const [capturando, setCapturando] = useState(true);
  const [codigo, setCodigo] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const campoRef = useRef<HTMLInputElement | null>(null);

  const focarCampo = () => campoRef.current?.focus();

  // O leitor físico só escreve onde há foco. Sem isto, um toque em qualquer lugar da
  // tela tira o foco do campo e os bipes seguintes se perdem no vazio — sem erro, sem
  // aviso, e o vendedor só descobre ao conferir o total no fim.
  useEffect(() => {
    if (suspenderFoco || cameraAberta || !capturando || desabilitado) return;
    focarCampo();
  }, [suspenderFoco, cameraAberta, capturando, desabilitado]);

  const pararCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        /* já parado — não há o que desfazer */
      }
      scannerRef.current = null;
    }
    setCameraAberta(false);
  };

  // A câmera é um recurso do aparelho: sair da tela sem soltá-la deixa o LED aceso e
  // impede outro app de usá-la até o navegador ser fechado.
  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => undefined);
      scannerRef.current = null;
    };
  }, []);

  const aoLer = async (texto: string) => {
    // Pausa antes de processar: sem isso a câmera dispara o mesmo código dezenas de
    // vezes enquanto ele continua no enquadramento.
    try {
      await scannerRef.current?.pause(true);
    } catch {
      /* pausar é otimização, não requisito */
    }
    await onCodigo(texto);
    try {
      scannerRef.current?.resume();
    } catch {
      /* ignora */
    }
  };

  useEffect(() => {
    if (!cameraAberta) return;
    let cancelado = false;

    (async () => {
      try {
        // O nó só existe depois que o overlay renderiza.
        await new Promise((r) => setTimeout(r, 80));
        if (cancelado) return;
        const leitor = new Html5Qrcode('leitor-codigo');
        scannerRef.current = leitor;
        await leitor.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (texto) => void aoLer(texto),
          () => undefined
        );
      } catch {
        toast.error('Não foi possível abrir a câmera', {
          description: 'Verifique a permissão de câmera do navegador.',
        });
        setCameraAberta(false);
      }
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraAberta]);

  const enviarCodigo = async () => {
    const valor = codigo.trim();
    if (!valor) return;
    setCodigo('');
    await onCodigo(valor);
    // Quem bipa, bipa vários seguidos: o campo tem que estar pronto para o próximo.
    focarCampo();
  };

  /**
   * O campo é o herói da tela, e o tamanho é o que diz isso.
   *
   * 56px e texto grande fogem do padrão de 44px de propósito: é o único controle da tela
   * que o vendedor usa centenas de vezes seguidas, e era confundido com o campo de busca,
   * que tinha exatamente a mesma cara. Altura, fonte e o rótulo acima resolvem a dúvida
   * "em qual dos dois eu bipo?" antes de ela existir.
   */
  const campo = (
    <Input
      ref={campoRef}
      id="codigo-captura"
      name="codigo_captura"
      placeholder="Bipe ou digite"
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      value={codigo}
      disabled={desabilitado}
      onChange={(e) => setCodigo(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && void enviarCodigo()}
      className="h-14 flex-1 font-mono text-lg font-semibold tracking-wide"
    />
  );

  const rotuloCampo = (
    <label
      htmlFor="codigo-captura"
      className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
    >
      Bipe ou digite o código
    </label>
  );

  const botaoCamera = (
    /* 56px como o campo e o confirmar ao lado. Estava em 44px só no desktop e destoava
       da linha inteira — altura de controle é alinhamento, não decoração. */
    <Button
      variant="outline"
      size="icon"
      className="size-14 shrink-0"
      aria-label="Bipar com a câmera"
      title="Bipar com a câmera"
      disabled={desabilitado}
      onClick={() => setCameraAberta(true)}
    >
      <Camera size={20} />
    </Button>
  );

  const controlesHandheld = capturando ? (
    <div className="space-y-2">
      {/* O "fechar" sobe para a linha do rótulo: embaixo ele roubava largura do campo,
          que é justamente o que precisa ser grande. */}
      <div className="flex items-center justify-between">
        {rotuloCampo}
        <button
          type="button"
          onClick={() => {
            campoRef.current?.blur();
            setCapturando(false);
          }}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <X size={12} />
          Fechar
        </button>
      </div>
      <div className="flex items-center gap-2">
        {campo}
        {botaoCamera}
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Button className="flex-1 font-semibold" size="lg" onClick={() => setCapturando(true)}>
        <Keyboard className="mr-2" size={18} />
        Voltar a bipar
      </Button>
      <Button variant="outline" size="lg" disabled={!podeEnviar} onClick={onEnviar}>
        <ClipboardCheck className="mr-2" size={18} />
        Enviar
      </Button>
    </div>
  );

  const controlesDesktop = (
    <div className="space-y-2">
      {rotuloCampo}
      <div className="flex items-center gap-2">
        {campo}
        <Button
          size="icon"
          className="size-14 shrink-0"
          aria-label="Adicionar o código digitado"
          disabled={desabilitado || !codigo.trim()}
          onClick={() => void enviarCodigo()}
        >
          <Check size={20} />
        </Button>
        {botaoCamera}
      </div>
    </div>
  );

  return (
    <>
      {handheld ? (
        /* Colada no rodapé: a tela de contagem esconde a barra de navegação do app
           (`semBarraInferior`), justamente para que a captura fique onde o polegar
           alcança sem disputar espaço com navegação que ninguém usa enquanto bipa. */
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-card/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg backdrop-blur-md">
          {controlesHandheld}
        </div>
      ) : (
        <div className="sticky top-4 z-20 rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
          {controlesDesktop}
        </div>
      )}

      {cameraAberta && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center justify-between border-b border-border/80 p-4">
            <p className="text-base font-semibold tracking-tight">Aponte para o código</p>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Fechar a câmera"
              onClick={() => void pararCamera()}
            >
              <X size={20} />
            </Button>
          </div>
          <div id="leitor-codigo" className="flex-1 bg-muted" />
          <div className="border-t border-border/80 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button variant="outline" size="lg" className="w-full" onClick={() => void pararCamera()}>
              Terminei de bipar
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
