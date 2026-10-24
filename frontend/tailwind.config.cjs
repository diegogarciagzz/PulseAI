/** Tailwind v3 config using the PULSE AI brand preset from the kit. */
module.exports = {
  presets: [require('./src/pulse/theme/tailwind.pulse.cjs')],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
};
