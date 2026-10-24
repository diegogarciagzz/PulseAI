# Brand kit integration

Source: `../pulse-ai-brand-kit` (313 files per its manifest). The original kit is untouched. Only what the application needs was copied.

## What was copied

| Kit path | App path | Used by |
| --- | --- | --- |
| `src/theme/*` (design-tokens.json, pulse-theme.css, tokens.ts, tailwind.pulse.cjs) | `frontend/src/pulse/theme/` | global theme, Tailwind preset |
| `src/components/*.tsx` (PulseLogo, icons, Pitch, MatchPulseChart, NarrativeVar, MatchChrome) | `frontend/src/pulse/components/` | every view |
| `src/broadcast/Overlays.tsx`, `pulse-broadcast.css` | `frontend/src/pulse/broadcast/` | used by the Broadcast tab: eleven of the kit's twelve overlays, driven by live match data (CSS loaded globally) |
| `src/index.ts` | `frontend/src/pulse/index.ts` | single import point |
| `public/assets/brand/` (logos, favicon, manifest) | `frontend/public/assets/brand/` | header logo, favicon, PWA manifest |
| `public/assets/teams/` (both clubs: badges, small, mono, avatars, jerseys, palettes) | `frontend/public/assets/teams/` | scoreboard, verdict jersey, stat colours |
| `public/assets/pundits/` (portraits, speaking, cutouts, avatars, thumbs, nameplates, icons) | `frontend/public/assets/pundits/` | AI Studio cards, votes, hero avatars |
| `public/assets/icons/` (football, product, verification, sprite) | `frontend/public/assets/icons/` | VAR banners, status imagery |
| `public/assets/pitch/` (fields, markers, defs) | `frontend/public/assets/pitch/` | reference; the app renders the inline `Pitch` component |
| `public/assets/match-pulse/` (markers, waveform motifs, live indicator, clock ring) | `frontend/public/assets/match-pulse/` | chart markers, jump chips, insight cards |
| `public/assets/narrative-var/` (stamps, chips, evidence meters, frames, scan animations) | `frontend/public/assets/narrative-var/` | verdict stamp, empty state frame |
| `public/assets/broadcast/` (plates for scoreboard, lower thirds, overlays) | `frontend/public/assets/broadcast/` | available for overlay previews |
| `public/assets/backgrounds/` | `frontend/public/assets/backgrounds/` | scoreboard contour wash, studio hero |
| `public/assets/marketing/illustrations/*.png`, `hero/pulse-ai-showcase-background.png` | `frontend/public/assets/marketing/` | README and docs |

Not copied: `*/mockups/` PNGs (reference renders with sample numbers; the kit forbids shipping them as UI), `src/mockups`, `src/marketing` HTML sources, the ZIP, `brand-book.html`.

Result: 257 asset files, 7.1 MB in `frontend/public/assets`.

## Components reused directly

`PulseLogo`, `PulseLoader`, `pulseIcons` / all status icons, `StatusBadge`, `EvidenceMeter`, `VerificationProgress`, `ClaimCard`, `Correction`, `VAR_DESCRIPTION`, `LiveIndicator`, `MatchClock`, `Score`, `TEAMS`, `PUNDITS`, `PunditCard`, `Pitch`, `PassArrow`, `ShotMarker`, `RecoveryMarker`, `AttackingDirection`, `EventHighlight`, `MatchPulseChart`. Lucide provides the utility icons the kit's `lucide-map.json` designates (play, pause, rotate-ccw, skip-forward, fast-forward, sparkles, info, alert).

## Adaptations (the only edits to kit code)

1. `src/pulse/components/MatchPulseChart.tsx`: added optional props `onEventClick`, `selectedId`, an optional `id` on `PulseEvent`, a lime selection ring and a slightly larger goal marker (32 px). Visual rules of the kit are otherwise unchanged. Reason: the spec requires clicking a momentum peak to open its evidence; the kit component only supported hover.
2. `src/pulse/broadcast/Overlays.tsx`: `MomentumToast` takes an optional `deltaLabel` (default `LAST 10 MIN`, the kit's original text) so the toast can label what its number measures (pulse shift, shots in a pressure spell).
3. `tsconfig` compatibility: the kit components compile unchanged under Vite's strict TypeScript 6 configuration (`verbatimModuleSyntax`, `erasableSyntaxOnly`). No changes were needed.

## Design system usage

- Theme: `pulse-theme.css` loaded globally; `body.pulse-root`; dark theme.
- Fonts: Space Grotesk, Inter, IBM Plex Mono via Fontsource (SIL OFL), as the kit prescribes. No font files are committed.
- Tailwind v3 with `tailwind.pulse.cjs` as a preset (preflight disabled so the kit CSS wins). Application layout classes live in `src/styles/app.css` and only use `--pulse-*` variables, the kit's spacing, radii, shadows and status colours. Lime is reserved for moments (goals, Player of the Match, "Start debate").
- Status is never colour alone: the kit's `StatusBadge` renders icon plus label everywhere a verdict is shown; stamps from `narrative-var/stamps/` appear on the verdict card.
- Favicon, apple touch icon and web manifest come from `assets/brand/favicon/`.

## Attribution

All artwork is original to the PULSE AI brand kit. No real league, club, broadcaster, sponsor or technology-company marks are used. "Built with Microsoft Foundry" is stated in text only.
