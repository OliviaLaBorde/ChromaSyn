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

- **Modal Scale**: choose the active mode
- **Base Note (Freq + MIDI)**: shifts pitch center for both engines
- **Enable Pedal Tone**: adds a sustained pedal voice
- **Pedal Octave**: pedal register (`1x` highest, `3x` lowest)
- **Voice Toggles**: toggle Red/Green/Blue/Hue/Saturation/Brightness notes on/off
- **Arpeggiator**: cycles all enabled melodic voices while held
- **Sustain Hold (`Space`)**: hold active chord/pedal while exploring; click to replace
- **MIDI Velocity**: note-on velocity (1-127)
- **Mute web audio when MIDI ready**: prevents doubling when using DAW synths

## Notes

- Web Audio starts only after user interaction (browser policy).
- If no MIDI output is available, internal audio still works.
- This app does not send MIDI clock/transport.


## What's coming next!
- Color averaging across 5-10 pixels instead of a single pixel - which will mean bigger jumps to change chords (this will be an option)
- Custom chord mapping - dictate your own chord set and map the image to only those!
- Zone hotspots with assignable numpad keys so you can play the set chords with your numberpad
- Oscillator params - ADSR, filters, reverb, delay, compressor


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
