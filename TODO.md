# ChromaSyn TODO

This is the single active backlog for ChromaSyn.

Last reviewed: 2026-09-13

## Testing and musical polish

- [ ] Ear-test and tune voice leading and register management across gradients, hard edges, low registers, and varied source images.
- [ ] Performance-test Manual Progression transitions, including sustained chord changes, card reordering, editing, and MIDI legato output.
- [ ] Add keyboard-accessible progression-card reordering and verify the full chord workflow without a mouse.
- [ ] Revisit anchor inference so correlated HSB voices do not unintentionally overpower RGB evidence.
- [ ] Evaluate whether Density should become a separate user control now that Gravity responds progressively.

## Mobile and touch

- [ ] Add a momentary on-screen sustain control and a clear touch-and-drag play hint.
- [ ] Harden the small-screen layout and enlarge touch targets for performance-critical controls.
- [ ] Add explicit mobile Web MIDI availability/fallback messaging.
- [ ] Validate touch cancellation, gesture prevention, and audio cleanup on iOS Safari and Android browsers.

## Play-surface and performance features

- [ ] Add optional neighborhood color averaging (roughly 5-10 pixels) for broader, less sensitive harmonic transitions.
- [ ] Add image-zone hotspots with assignable numpad shortcuts. These will be set as chords the manual chord progression path
- [ ] Expand the internal synth with reverb, delay, and compression.
- [ ] Add ability to maximize the play area to the view in a modal while still keeping hotkeys active - display chord progression in modal as well

## Manual Progression extensions

- [ ] Add per-tone selection weight/probability, with deterministic behavior available.
- [ ] Add per-chord register ranges.
- [ ] Separate harmonic root from bass realization, including slash chords and optional fixed bass octave.
- [ ] Add inversion and open/spread voicing biases.
- [ ] Support progression lengths beyond 12 without compromising the current direct-select hotkeys.
- [ ] Support validated import/export of user-editable chord catalogs.

## MIDI and rhythm

- [ ] Design and implement MIDI Input as a Harmony Source, including held-note tracking, ambiguity rules, display, panic, and source switching.
- [ ] Add MIDI clock and transport input as an isolated timing foundation.
- [ ] Design a rhythm interpretation layer that can use image data and transport timing without coupling harmony selection to scheduling.
- [ ] Consider an explicit MIDI retrigger output mode alongside Standard and Legato behavior.

## Harmony extensibility

- [ ] Support custom JSON harmony models with schema versioning, validation, useful errors, safe fallback, duplicate handling, reload behavior, and authoring examples.
