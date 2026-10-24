// Optional Tailwind CSS preset for PULSE AI. Works with Tailwind v3 (presets: [require('./tailwind.pulse.cjs')])
// For Tailwind v4, import pulse-theme.css and map variables with @theme instead.
module.exports = {
  theme: {
    extend: {
      colors: {
        pulse: {
          bg: 'var(--pulse-bg)', 'bg-deep': 'var(--pulse-bg-deep)', sunken: 'var(--pulse-bg-sunken)',
          s1: 'var(--pulse-surface-1)', s2: 'var(--pulse-surface-2)', s3: 'var(--pulse-surface-3)',
          border: 'var(--pulse-border)', 'border-soft': 'var(--pulse-border-soft)',
          text: 'var(--pulse-text)', 'text-2': 'var(--pulse-text-secondary)', muted: 'var(--pulse-text-muted)',
          accent: 'var(--pulse-accent)', moment: 'var(--pulse-moment)',
          cyan: '#35E0ED', lime: '#BCFF47', midnight: '#07111F',
          verified: 'var(--pulse-status-verified)', corrected: 'var(--pulse-status-corrected)',
          unsupported: 'var(--pulse-status-unsupported)', conflicted: 'var(--pulse-status-conflicted)',
          unverified: 'var(--pulse-status-unverified)', checking: 'var(--pulse-status-checking)',
          ncf: '#27B8F5', 'ncf-navy': '#0B1F3F', suf: '#FF5B2E', 'suf-graphite': '#22262D',
          analyst: '#4CC9FF', fan: '#BCFF47', tactician: '#A08CFF',
        },
      },
      fontFamily: {
        display: ['Space Grotesk', 'Space Grotesk Variable', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'Inter Variable', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: { xs: '4px', sm: '6px', md: '10px', lg: '14px', xl: '20px', '2xl': '28px' },
      boxShadow: {
        e1: 'var(--pulse-shadow-e1)', e2: 'var(--pulse-shadow-e2)', e3: 'var(--pulse-shadow-e3)',
        'glow-accent': 'var(--pulse-shadow-glow-accent)', 'glow-moment': 'var(--pulse-shadow-glow-moment)',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)', enter: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
        exit: 'cubic-bezier(0.3, 0, 0.8, 0.15)', snap: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      screens: { broadcast: '1920px' },
    },
  },
};
