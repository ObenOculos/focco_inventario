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
        // Removidos daqui e do index.css: o grupo `sidebar-*` (8 tokens) e `chart-*`
        // (5 tokens). O componente `ui/sidebar` e o `recharts` saíram na limpeza, e
        // nenhuma classe do projeto referenciava esses tokens — eram 13 variáveis que
        // pareciam parte do sistema sem governar nada. A sidebar real usa `card` e
        // `border`, como qualquer outra superfície.
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
