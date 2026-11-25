import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f3ede4',
        night: { DEFAULT: '#122315', 800: '#1a3320', 700: '#233f2a' },
        navy: '#0a071b',
        ink: { DEFAULT: '#122315', soft: '#333333', mute: '#626d66' },
        sage: '#566053',
        moss: '#999c91',
        river: '#73d3eb',
        sun: '#ffed52',
        lichen: '#77e46e',
        frost: '#e5e7eb',
        brand: {
          50: '#eaf9e8',
          100: '#d6f5d2',
          200: '#aeeaa8',
          400: '#77e46e',
          500: '#55dd4a',
          600: '#45c43a',
          700: '#2b8a24',
          900: '#122315',
        },
        gold: { 300: '#77e46e', 400: '#55dd4a', 500: '#45c43a' },
        cedi: '#c8402f',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-display)', 'Impact', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 12px 40px rgba(10,7,27,.12)',
        cheque: '0 12px 40px rgba(10,7,27,.28)',
        chip: '0 8px 24px rgba(10,7,27,.18)',
      },
      keyframes: {
        rise: { '0%': { opacity: '0', transform: 'translateY(14px)' }, '100%': { opacity: '1', transform: 'none' } },
        float: { '0%,100%': { transform: 'translateY(0) rotate(-3deg)' }, '50%': { transform: 'translateY(-8px) rotate(-2deg)' } },
        bob: { '0%,100%': { transform: 'translateY(0) rotate(var(--r,0deg))' }, '50%': { transform: 'translateY(-8px) rotate(calc(var(--r,0deg) + 4deg))' } },
        stamp: { '0%': { opacity: '0', transform: 'scale(1.6) rotate(-14deg)' }, '100%': { opacity: '1', transform: 'scale(1) rotate(-8deg)' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        dash: { to: { strokeDashoffset: '0' } },
        'pulse-soft': { '0%,100%': { opacity: '1' }, '50%': { opacity: '.45' } },
        'bounce-dot': {
          '0%,100%': { transform: 'translateY(0)', opacity: '.5' },
          '40%': { transform: 'translateY(-5px)', opacity: '1' },
        },
      },
      animation: {
        rise: 'rise .6s cubic-bezier(.2,.8,.2,1) both',
        float: 'float 7s ease-in-out infinite',
        bob: 'bob 6s ease-in-out infinite',
        stamp: 'stamp .5s cubic-bezier(.2,.8,.2,1) both',
        marquee: 'marquee 36s linear infinite',
        dash: 'dash 2.4s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        'bounce-dot': 'bounce-dot 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
