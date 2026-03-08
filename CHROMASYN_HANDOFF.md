# ChromaSyn Handoff Summary (for new chat)

## Project path
- `c:\dev\ChromaSyn`

## High-level app
- React + Vite app that maps image pixel RGB values to modal scale notes.
- Produces both:
  - Internal Web Audio synth output
  - Web MIDI output for DAW/soft synth routing

## Major completed changes

### 1) Web MIDI output integration
- Added `src/useMidiOutput.ts` with:
  - `requestMIDIAccess({ sysex: false })`
  - output discovery + selected output
  - status/error handling
  - `sendNoteOn`, `sendNoteOff`, `allNotesOff`, `panic`
  - cleanup on unmount/output changes
- Added MIDI UI controls in `App.tsx`:
  - Enable MIDI button
  - output picker
  - status/error text
- MIDI behavior:
  - 3 RGB voices -> chord notes on channel 1
  - velocity configurable (now slider-controlled)
  - legato pitch replacement while dragging
  - note-offs on mouse-up/leave and safety cleanup

### 2) Web Audio control improvements
- Added option to mute internal Web Audio when MIDI is ready.
- Added dedicated oscillator volume slider (`Audio Engine` section).
- Master gain now follows `oscillatorVolume` rather than fixed value.

### 3) Pitch/mapping controls
- Replaced mode button list with compact mode dropdown.
- Added base note dropdown (shared by audio base frequency + MIDI base note).
- Added MIDI velocity slider.

### 4) Live data behavior
- Live RGB/degree panel updates on hover continuously (not only while clicked).
- Added pedal tone info in live data panel.

### 5) Pedal tone system
- Added 4th oscillator to mirror pedal tone (not MIDI-only anymore).
- Pedal tone enable + octave dropdown (`1x`, `2x`, `3x`).
- Base pedal rule set retained (original "classic" behavior).
- Added slight oscillator detune spread to reduce phase cancellation:
  - `OSC_DETUNE_CENTS = [-2.5, 0, 2.5, 1.2]`

### 6) Pedal personalities (experimental)
Implemented personality framework in `App.tsx`:
- `classic` (original behavior)
- `anchor`
- `inertia`
- `edge-walk`

Important constraints preserved:
- Pedal note duration model remains unchanged:
  - sustained while mouse is down
  - released on mouse-up
- Personalities affect pitch selection only, not rhythmic note lengths.

## Non-feature cleanup completed
- Removed unused AI Studio/Gemini scaffolding:
  - Removed `@google/genai` from dependencies/lock references
  - Removed `GEMINI_API_KEY` Vite define injection

## Current files of interest
- `src/App.tsx` (main logic/UI; most changes live here)
- `src/useMidiOutput.ts` (Web MIDI manager)
- `README.md` (expanded project documentation)
- `package.json`, `vite.config.ts`, `package-lock.json` cleaned from Gemini leftovers

## Notes for next chat
- This session had intermittent patch-tool issues; some edits were done via direct PowerShell text operations.
- If anything looks oddly formatted in JSX, run a quick lint/format pass locally.
- In this environment, `npm` was unavailable to the agent, so compile/runtime checks were not executed by the agent here.

## Suggested first action in next chat
1. Run local checks (`npm run lint`, then `npm run dev`) and fix any syntax/format regressions if present.
2. If stable, update README feature list to explicitly mention pedal personalities.
