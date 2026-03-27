# Melody Spark (Structured)

This zip contains a refactored version of the Melody Spark app split into:

- `src/core/melodyEngine.ts` — music theory, generation, progression scoring, MIDI export helpers
- `src/core/melodyPlayer.ts` — Tone.js playback wrapper
- `src/components/MelodySparkApp.tsx` — main React UI
- `src/components/StaffChordView.tsx` — notation widget
- `src/types/music.ts` — shared types and constants

## Run locally

```bash
npm install
npm run dev
```

## Integration ideas

- Import `generateMelody`, `buildChordFromDegree`, `makeMidiFile`, and related helpers from `src/core/melodyEngine.ts` in other apps.
- Reuse `MelodyPlayer` when you want Tone.js playback without the full UI.
- Embed `MelodySparkApp` directly in React apps, or copy only the engine/player files into another codebase.

## Notes

This package is intentionally dependency-light and uses basic HTML controls so it can run outside the original canvas/shadcn environment.
