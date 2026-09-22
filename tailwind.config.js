/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        border: token('border'),
        'border-strong': token('border-strong'),
        fg: token('fg'),
        muted: token('muted'),
        subtle: token('subtle'),
        brand: {
          DEFAULT: token('brand'),
          fg: token('brand-fg'),
          hover: token('brand-hover'),
          soft: token('brand-soft'),
        },
        teal: { DEFAULT: token('teal'), bright: token('teal-bright') },
        ring: token('ring'),
        overlay: token('overlay'),
        st: {
          'neutral-bg': token('st-neutral-bg'),
          'neutral-fg': token('st-neutral-fg'),
          'info-bg': token('st-info-bg'),
          'info-fg': token('st-info-fg'),
          'warning-bg': token('st-warning-bg'),
          'warning-fg': token('st-warning-fg'),
          'accent-bg': token('st-accent-bg'),
          'accent-fg': token('st-accent-fg'),
          'success-bg': token('st-success-bg'),
          'success-fg': token('st-success-fg'),
          'danger-bg': token('st-danger-bg'),
          'danger-fg': token('st-danger-fg'),
        },
      },
      borderRadius: {
        DEFAULT: 'var(--radius-sm)',
        md: 'var(--radius-sm)',
        lg: 'var(--radius)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        pop: '0 8px 24px -6px rgb(0 0 0 / 0.16), 0 2px 6px -2px rgb(0 0 0 / 0.08)',
      },
      screens: {
        xs: '390px',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')({ strategy: 'class' })],
};
