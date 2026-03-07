# ChromaSyn

ChromaSyn is a browser-based image sonification instrument.

It maps pixel color (RGB) to notes in a selected modal scale, then outputs:
- Internal Web Audio synthesis (4 oscillators: R, G, B, and optional pedal tone)
- Web MIDI note events for routing into a DAW and soft synths

## Features

- Load your own image or use built-in gradient presets
- Hover the canvas to preview live RGB + scale degree data
- Click/drag to perform notes from sampled pixels
- Modal scale selector (Ionian, Dorian, Phrygian, etc.)
- Base note selector (shared by audio + MIDI mapping)
- Arpeggiator mode for RGB voices
- MIDI output device picker (Web MIDI)
- Adjustable MIDI velocity
- Optional pedal tone with octave selector (`1x`, `2x`, `3x`)
- Option to mute internal Web Audio while MIDI is active

## How It Works

- R, G, B values are quantized to scale degrees across ~3 octaves.
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
- **Arpeggiator**: cycles RGB voices while held
- **MIDI Velocity**: note-on velocity (1-127)
- **Mute web audio when MIDI ready**: prevents doubling when using DAW synths

## Notes

- Web Audio starts only after user interaction (browser policy).
- If no MIDI output is available, internal audio still works.
- This app does not send MIDI clock/transport.
