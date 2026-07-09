import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // T1 brand-ish, calm command-center palette
        ink: {
          950: '#0a0b0f',
          900: '#12141c',
          800: '#1a1d29',
          700: '#242838',
          600: '#333849',
        },
        brand: {
          DEFAULT: '#6366f1',
          soft: '#818cf8',
          deep: '#4f46e5',
        },
        accent: '#22d3ee',
        urgent: '#f43f5e',
        ok: '#34d399',
        warn: '#fbbf24',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.24)',
        pop: '0 10px 40px -10px rgba(99,102,241,0.5)',
      },
      keyframes: {
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(244,63,94,0.45)' },
          '70%': { boxShadow: '0 0 0 10px rgba(244,63,94,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(244,63,94,0)' },
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
