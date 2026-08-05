import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        // Estados semânticos. Cada um expõe o mesmo contrato de 4 tons — ver
        // DESIGN_SYSTEM.md. `subtle` é fundo, `strong` é o texto sobre esse fundo.
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          subtle: 'hsl(var(--destructive-subtle))',
          strong: 'hsl(var(--destructive-strong))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          subtle: 'hsl(var(--success-subtle))',
          strong: 'hsl(var(--success-strong))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          subtle: 'hsl(var(--warning-subtle))',
          strong: 'hsl(var(--warning-strong))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
          subtle: 'hsl(var(--info-subtle))',
          strong: 'hsl(var(--info-strong))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Superfície própria do menu lateral, fora do tema da página — ver index.css.
        // (O grupo `chart-*` continua removido: o `recharts` saiu na limpeza e nenhuma
        // classe do projeto o referenciava.)
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          foreground: 'hsl(var(--sidebar-foreground))',
          muted: 'hsl(var(--sidebar-muted))',
          accent: 'hsl(var(--sidebar-accent))',
          border: 'hsl(var(--sidebar-border))',
          active: 'hsl(var(--sidebar-active))',
          'active-foreground': 'hsl(var(--sidebar-active-foreground))',
        },
      },
      // Escala inteira derivada de `--radius` (0.625rem = 10px). Antes só sm/md/lg
      // eram derivados: `rounded-xl` e `rounded-2xl` — juntos, 125 usos, a maioria do
      // sistema — ficavam nos valores estáticos do Tailwind e não acompanhavam o token.
      // Os números finais são idênticos aos de antes; o que muda é passarem a ser
      // governados por uma variável só.
      borderRadius: {
        sm: 'calc(var(--radius) - 4px)', // 6px  — chips, marcadores
        md: 'calc(var(--radius) - 2px)', // 8px  — itens de menu, elementos internos
        lg: 'var(--radius)', // 10px — badges
        xl: 'calc(var(--radius) + 2px)', // 12px — controles: botão, input, select
        '2xl': 'calc(var(--radius) + 6px)', // 16px — superfícies: card, modal, alerta
      },
      keyframes: {
        // Indicador de carregamento do sistema: pontos que "respiram" em onda.
        //
        // O repouso é o estado PEQUENO, e o pico é o crescimento — é o crescer que
        // viaja da esquerda para a direita. O pico acontece a 30% do ciclo e a volta ao
        // repouso se completa em 60%, deixando uma cauda de descanso; com três pontos
        // defasados em 1/3 do ciclo, os picos caem em 30%, 63% e 96%, perfeitamente
        // espaçados e sem instante algum sem movimento.
        //
        // `scale` a partir do centro não altera a caixa ocupada, então a onda nunca
        // empurra o que está ao redor.
        respirar: {
          '0%, 60%, 100%': { transform: 'scale(0.7)', opacity: '0.4' },
          '30%': { transform: 'scale(1)', opacity: '1' },
        },
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        // 1.5s divide exatamente por 3, o que permite o defasamento de 0,5s por ponto —
        // ver `PageLoader`. Mudar a duração exige mudar os atrasos junto, ou a onda
        // deixa de ser uniforme.
        respirar: 'respirar 1.5s ease-in-out infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
      // Degrau abaixo de `text-xs`, para badge e marcador — o padrão de badge do sistema
      // (herdado da tela Exportar XML) pede 10px, que não existe na escala do Tailwind.
      // Registrado como token para não virar `text-[10px]` espalhado pelas telas.
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
      fontFamily: {
        sans: [
          'Plus Jakarta Sans',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'Noto Sans',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace',
        ],
      },
      boxShadow: {
        '2xs': 'var(--shadow-2xs)',
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        '2xl': 'var(--shadow-2xl)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
