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
      transitionTimingFunction: {
        // The house curve for UI motion: fast out, soft landing.
        out: 'cubic-bezier(.2,.8,.2,1)',
      },
      keyframes: {
        rise: { '0%': { opacity: '0', transform: 'translateY(14px)' }, '100%': { opacity: '1', transform: 'none' } },
        fade: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        float: { '0%,100%': { transform: 'translateY(0) rotate(-3deg)' }, '50%': { transform: 'translateY(-8px) rotate(-2deg)' } },
        bob: { '0%,100%': { transform: 'translateY(0) rotate(var(--r,0deg))' }, '50%': { transform: 'translateY(-8px) rotate(calc(var(--r,0deg) + 4deg))' } },
        stamp: { '0%': { opacity: '0', transform: 'scale(1.6) rotate(-14deg)' }, '100%': { opacity: '1', transform: 'scale(1) rotate(-8deg)' } },
        'globe-spin': { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        'orbit-spin': { from: { transform: 'rotateZ(0deg)' }, to: { transform: 'rotateZ(360deg)' } },
        'orbit-spin-rev': { from: { transform: 'rotateZ(0deg)' }, to: { transform: 'rotateZ(-360deg)' } },
      },
      animation: {
        rise: 'rise .6s cubic-bezier(.2,.8,.2,1) both',
        fade: 'fade .18s cubic-bezier(.2,.8,.2,1) both',
        float: 'float 7s ease-in-out infinite',
        bob: 'bob 6s ease-in-out infinite',
        stamp: 'stamp .5s cubic-bezier(.2,.8,.2,1) both',
        'globe-spin': 'globe-spin 28s linear infinite',
        'orbit-spin': 'orbit-spin 14s linear infinite',
        'orbit-spin-rev': 'orbit-spin-rev 14s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
