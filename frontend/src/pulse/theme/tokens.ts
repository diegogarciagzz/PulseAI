// PULSE AI design tokens for TypeScript / React.
// Generated from design-tokens.json. Use CSS variables for styling; use these
// values where JS needs raw numbers or colours (charts, canvas, SVG gradients).

export const pulseTokens = {
  "color": {
    "bg": "#07111F",
    "bg-deep": "#040A14",
    "bg-sunken": "#0B1828",
    "surface-1": "#101D2E",
    "surface-2": "#17263A",
    "surface-3": "#1F3249",
    "border": "#2A4058",
    "border-soft": "#1C2C40",
    "text": "#F4F7FB",
    "text-secondary": "#B7C5D4",
    "text-muted": "#90A3B8",
    "accent": "#35E0ED",
    "accent-strong": "#8AF0F7",
    "accent-ink": "#07111F",
    "moment": "#BCFF47",
    "focus": "#35E0ED"
  },
  "colorLight": {
    "bg": "#F4F7FB",
    "bg-deep": "#E3EAF2",
    "bg-sunken": "#EAF0F6",
    "surface-1": "#FFFFFF",
    "surface-2": "#FFFFFF",
    "surface-3": "#EEF3F8",
    "border": "#D3DDE8",
    "border-soft": "#E4EBF2",
    "text": "#07111F",
    "text-secondary": "#33465B",
    "text-muted": "#4A5D72",
    "accent": "#077784",
    "accent-strong": "#35E0ED",
    "accent-ink": "#07111F",
    "moment": "#4D7A0A",
    "focus": "#077784"
  },
  "brand": {
    "deep-midnight": "#07111F",
    "graphite-navy": "#101D2E",
    "elevated-surface": "#17263A",
    "pulse-cyan": "#35E0ED",
    "electric-lime": "#BCFF47",
    "broadcast-white": "#F4F7FB",
    "muted-slate": "#90A3B8"
  },
  "status": {
    "verified": {
      "fg": "#45D6A0",
      "fgLight": "#0B7A53",
      "bg": "rgba(69,214,160,0.12)",
      "border": "rgba(69,214,160,0.40)",
      "label": "VERIFIED"
    },
    "corrected": {
      "fg": "#7AA8FF",
      "fgLight": "#2F63D6",
      "bg": "rgba(122,168,255,0.12)",
      "border": "rgba(122,168,255,0.40)",
      "label": "CORRECTED"
    },
    "unsupported": {
      "fg": "#FF6574",
      "fgLight": "#B42A37",
      "bg": "rgba(255,101,116,0.12)",
      "border": "rgba(255,101,116,0.40)",
      "label": "UNSUPPORTED"
    },
    "conflicted": {
      "fg": "#FFBE55",
      "fgLight": "#8F5A00",
      "bg": "rgba(255,190,85,0.12)",
      "border": "rgba(255,190,85,0.40)",
      "label": "CONFLICTED"
    },
    "unverified": {
      "fg": "#90A3B8",
      "fgLight": "#5B6E83",
      "bg": "rgba(144,163,184,0.10)",
      "border": "rgba(144,163,184,0.35)",
      "label": "UNVERIFIED"
    },
    "checking": {
      "fg": "#35E0ED",
      "fgLight": "#077784",
      "bg": "rgba(53,224,237,0.10)",
      "border": "rgba(53,224,237,0.40)",
      "label": "CHECKING"
    }
  },
  "team": {
    "north-city": {
      "primary": "#27B8F5",
      "secondary": "#0B1F3F",
      "tertiary": "#E8F7FF",
      "on-primary": "#0B1F3F",
      "chart": "#27B8F5"
    },
    "south-united": {
      "primary": "#FF5B2E",
      "secondary": "#22262D",
      "tertiary": "#F3E7D3",
      "accent": "#D9A441",
      "on-primary": "#22262D",
      "chart": "#FF6B3D"
    }
  },
  "pundit": {
    "analyst": {
      "accent": "#4CC9FF",
      "name": "Alex Mercer",
      "role": "The Analyst"
    },
    "fan": {
      "accent": "#BCFF47",
      "accent-warm": "#FF9F45",
      "name": "Mateo Reyes",
      "role": "The Fan"
    },
    "tactician": {
      "accent": "#A08CFF",
      "name": "Sofia Hart",
      "role": "The Tactician"
    }
  },
  "chart": {
    "series-1": "#35E0ED",
    "series-2": "#FF7A45",
    "series-3": "#BCFF47",
    "series-4": "#A08CFF",
    "series-5": "#FFBE55",
    "series-6": "#90A3B8",
    "grid": "rgba(144,163,184,0.12)",
    "axis": "#2A4058",
    "axis-label": "#90A3B8",
    "baseline": "rgba(244,247,251,0.35)",
    "momentum-home": "#27B8F5",
    "momentum-away": "#FF6B3D",
    "area-opacity": "0.28",
    "peak": "#BCFF47"
  },
  "font": {
    "display": "'Space Grotesk', 'Space Grotesk Variable', 'Inter', system-ui, sans-serif",
    "ui": "'Inter', 'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif",
    "mono": "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace"
  },
  "space": {
    "0": 0,
    "0-5": 2,
    "1": 4,
    "1-5": 6,
    "2": 8,
    "3": 12,
    "4": 16,
    "5": 20,
    "6": 24,
    "8": 32,
    "10": 40,
    "12": 48,
    "16": 64,
    "20": 80,
    "24": 96
  },
  "radius": {
    "none": 0,
    "xs": 4,
    "sm": 6,
    "md": 10,
    "lg": 14,
    "xl": 20,
    "2xl": 28,
    "pill": 999,
    "chamfer": 14
  },
  "duration": {
    "instant": 80,
    "fast": 150,
    "base": 240,
    "moderate": 320,
    "slow": 480,
    "draw": 1400,
    "live-loop": 1800,
    "scan-loop": 1600,
    "stagger": 90
  },
  "easing": {
    "standard": "cubic-bezier(0.2, 0, 0, 1)",
    "enter": "cubic-bezier(0.05, 0.7, 0.1, 1)",
    "exit": "cubic-bezier(0.3, 0, 0.8, 0.15)",
    "snap": "cubic-bezier(0.34, 1.56, 0.64, 1)",
    "linear": "linear"
  },
  "breakpoint": {
    "sm": 640,
    "md": 768,
    "lg": 1024,
    "xl": 1280,
    "2xl": 1536,
    "broadcast": 1920
  },
  "broadcast": {
    "canvas": {
      "width": 1920,
      "height": 1080
    },
    "action-safe": {
      "x": 67,
      "y": 38,
      "note": "3.5% inset"
    },
    "title-safe": {
      "x": 96,
      "y": 54,
      "note": "5% inset; all text inside"
    },
    "min-text": 22,
    "plate-skew-deg": 12
  }
} as const;

export type PulseStatus = keyof typeof pulseTokens.status;
export type PulseTeam = keyof typeof pulseTokens.team;
export type PulsePundit = keyof typeof pulseTokens.pundit;

export default pulseTokens;
