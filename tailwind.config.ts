import type { Config } from 'tailwindcss';

// ink (superficies/bordes) y slate (texto) son variables CSS → cambian con el
// tema (oscuro/claro). Los acentos se quedan fijos (se ven bien en ambos).
const inkVar = (n: string) => `rgb(var(--ink-${n}) / <alpha-value>)`;
const slateVar = (n: string) => `rgb(var(--slate-${n}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: inkVar('950'),
          900: inkVar('900'),
          800: inkVar('800'),
          700: inkVar('700'),
          600: inkVar('600'),
        },
        slate: {
          100: slateVar('100'),
          200: slateVar('200'),
          300: slateVar('300'),
          400: slateVar('400'),
          500: slateVar('500'),
          600: slateVar('600'),
        },
        brand: {
          DEFAULT: '#6366f1',
          soft: '#818cf8',
          deep: '#4f46e5',
        },
        accent: '#0891b2',
        urgent: '#e11d48',
        ok: '#059669',
        warn: '#d97706',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.14), 0 1px 2px rgba(0,0,0,0.10)',
        pop: '0 10px 40px -10px rgba(99,102,241,0.45)',
      },
      keyframes: {
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(225,29,72,0.45)' },
          '70%': { boxShadow: '0 0 0 10px rgba(225,29,72,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(225,29,72,0)' },
        },
        slideUp: {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        pulseRing: 'pulseRing 2s infinite',
        slideUp: 'slideUp 0.25s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
