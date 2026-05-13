import type { Config } from 'tailwindcss';

/**
 * Raven design tokens — mirror Coldbrain's design system so the two apps feel like siblings.
 * Light theme, indigo accent, neutral grays. Change a value here and it propagates everywhere.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: '#f6f7f9',         // page background
        panel: '#ffffff',       // cards, sidebar, dialogs
        subtle: '#f1f3f6',      // hover bg, table stripe
        fg: '#0b1220',          // primary text
        muted: '#5b6473',       // secondary text
        faint: '#98a2b3',       // tertiary / placeholders
        border: '#e4e7ec',
        'border-strong': '#d0d5dd',

        accent: '#4f46e5',          // indigo-600
        'accent-strong': '#4338ca', // indigo-700
        'accent-soft': '#eef2ff',   // indigo-50
        'accent-fg': '#ffffff',

        ok: '#15803d',
        'ok-soft': '#ecfdf5',
        warn: '#b45309',
        'warn-soft': '#fffbeb',
        err: '#b91c1c',
        'err-soft': '#fef2f2',
        info: '#1d4ed8',
        'info-soft': '#eff6ff',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(16,24,40,0.04)',
        focus: '0 0 0 4px rgba(79,70,229,0.12)',
        'focus-ring': '0 0 0 2px #ffffff, 0 0 0 4px #4f46e5',
        card: '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)',
        'card-hover': '0 2px 4px rgba(16,24,40,0.06), 0 4px 12px rgba(16,24,40,0.04)',
        sidebar: '0 2px 4px rgba(16,24,40,0.04)',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'slide-up': 'slide-up 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        'shimmer': 'shimmer 1.5s linear infinite',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
