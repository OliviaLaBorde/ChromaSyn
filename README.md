# ChromaSyn

ChromaSyn is a browser-based image sonification instrument. It turns spatial color variation into harmonic exploration!

It maps pixel color (RGB + HSB) to notes in a selected modal scale, then outputs:
- Internal Web Audio synthesis (up to 7 oscillators: 6 melodic voices `R/G/B/H/S/V` plus optional pedal tone)
- Web MIDI note events for routing into a DAW and soft synths

## Try it and make noise wooo!!

https://olivialaborde.github.io/ChromaSyn/

## Features

- Load your own image or use built-in gradient presets
- Hover the canvas to preview live per-voice note and scale degree data
- Click/drag to perform notes from sampled pixels
- Modal scale selector (Ionian, Dorian, Phrygian, etc.)
- Base note selector (shared by audio + MIDI mapping)
- Arpeggiator mode for all enabled melodic voices
- Individual RGB+HSB voice toggles
- MIDI output device picker (Web MIDI)
- Adjustable MIDI velocity
- Optional pedal tone with octave selector (`1x`, `2x`, `3x`)
- Option to mute internal Web Audio while MIDI is active
- Oscillator type selector (`sine`, `square`, `sawtooth`, `triangle`)
- ADSR envelope controls for internal oscillators (A/D/S/R + presets)
- Optional master filter (`low-pass`/`high-pass`) with cutoff + resonance
- Manual chord progressions with a preset/piano chord builder, draggable cards, chord preview, and 12-chord performance hotkeys

## How It Works

- R, G, B, Hue, Saturation, and Brightness values are quantized to scale degrees across ~3 octaves.
- Each channel drives one melodic voice.
- Pedal tone (when enabled) follows this rule:
  1. If any voice is degree `1`, pedal uses `1`
  2. Else if any degree repeats (for example `2-2-5`), pedal uses that repeated degree
  3. Else pedal degree is chosen from the sum `R+G+B`, mapped into the scale

## Requirements

- Node.js 18+ recommended
- A Chromium-based browser for Web MIDI (Chrome/Edge)
- For DAW routing: a virtual MIDI driver
  - Windows: loopMIDI
  - macOS: IAC Driver

## Run Locally

```bash
npm install
npm run dev
```

Default dev URL:
- `http://localhost:3000`

## Build for GitHub Pages

This project is configured to output production files to `docs/`.

```bash
npm run build
```

- Each build overwrites the previous `docs/` output (`emptyOutDir: true` in Vite config).
- Commit and push updated `docs/` contents to publish changes on GitHub Pages.

## MIDI to DAW Setup

1. Create/enable a virtual MIDI bus (loopMIDI/IAC).
2. In ChromaSyn, click **Enable MIDI** and select that output bus.
3. In your DAW, set a MIDI track input to the same bus.
4. Arm the track and load a soft synth.
5. Perform by clicking/dragging on the canvas.

## Controls Quick Reference

The desktop workspace keeps base note, scale, harmony source/model, and Gravity above the image. The six voice readouts below the image include their enable checkboxes. Open **Presets** to choose a gradient, or **Setup** for pedal, arpeggiator, audio/envelope/filter, and MIDI settings. **Panic** immediately silences internal audio and releases MIDI notes.

Choose **Manual Progression** as the Harmony Source to build a chord path. A chord preset populates the one-octave piano, and the selected notes remain freely editable. The active card strictly defines the legal pitch classes while the image, Harmony Model, density, and voice-leading determine how the six voices move through that chord. Progressions are saved in the current browser and support up to 12 chords.

- **Modal Scale**: choose the active mode
- **Base Note (Freq + MIDI)**: shifts pitch center for both engines
- **Enable Pedal Tone**: adds a sustained pedal voice
- **Pedal Octave**: pedal register (`1x` highest, `3x` lowest)
- **Voice Toggles**: toggle Red/Green/Blue/Hue/Saturation/Brightness notes on/off
- **Arpeggiator**: cycles all enabled melodic voices while held
- **Sustain Hold (`Space`)**: hold active chord/pedal while exploring; click to replace
- **Preset Hotkeys**: `z x c v b n m , . /` load gradient presets 1-10
- **Manual Progression Navigation**: `Q` next chord, `W` previous chord, `E` reset to chord 1; navigation wraps at either end
- **Manual Progression Direct Select**: `1`–`9` select positions 1–9, `0` selects 10, `-` selects 11, and `=` selects 12
- **Progression Cards**: click to select; use the card controls to preview, edit, or delete; drag cards to reorder them
- **Oscillator Type**: sets melodic waveform
- **ADSR Envelope**: shapes internal oscillator amplitude
- **Master Filter**: enables low-pass/high-pass shaping with cutoff and resonance
- **MIDI Velocity**: note-on velocity (1-127)
- **Mute web audio when MIDI ready**: prevents doubling when using DAW synths

## Notes

- Web Audio starts only after user interaction (browser policy).
- If no MIDI output is available, internal audio still works.
- This app does not send MIDI clock/transport.


## Future Enhancements

The detailed, canonical project backlog lives in [TODO.md](TODO.md). Planned directions include:

- More harmony/voice-leading ear testing, clearer inferred-anchor and voice-role feedback, and continued Manual Progression polish
- Mobile sustain controls, larger touch targets, and broader mobile-browser validation
- Optional multi-pixel color averaging and assignable image-zone hotspots
- Manual Progression extensions such as tone weights, register ranges, bass/inversion controls, and chord-catalog import/export
- MIDI input harmony following, MIDI clock/transport support, and a future rhythm interpretation layer
- Reverb, delay, and compression for the internal synth
- Validated custom JSON harmony models


## Contributing

Contributions are welcome.

1. Fork the repo and create a feature branch.
2. Make focused changes with clear commit messages.
3. Run local checks (`npm run dev` and `npm run build`).
4. If behavior changes, update `README.md`
5. Open a pull request with:
   - what changed
   - why it changed
   - screenshots/GIFs for UI changes
   - test notes (what you verified)

### Contribution Guidelines

- Keep PRs small and scoped.
- Avoid unrelated refactors in feature PRs.
- Preserve existing coding style and naming patterns.
- For audio/MIDI changes, include manual test steps (browser, MIDI routing, and expected behavior).
