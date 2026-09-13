import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const sourceUrl = new URL('../src/musicEngine.ts', import.meta.url);
const source = fs.readFileSync(sourceUrl, 'utf8');
const chordCatalog = JSON.parse(fs.readFileSync(new URL('../src/data/chords.json', import.meta.url), 'utf8'));
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourceUrl.pathname,
});

const engine = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const defaultVoiceMapping = () =>
  Object.fromEntries(
    engine.VOICE_IDS.map((id) => [
      id,
      {
        enabled: true,
        inputRange: [0, 255],
        octaveSpan: engine.DEFAULT_OCTAVE_SPAN,
        degreeBias: 0,
      },
    ]),
  );

const voiceStubs = () => engine.VOICE_IDS.map((id) => ({ id }));

const rawVoice = (voice, midiNote, scaleStep) => ({
  voice,
  rawValue: 0,
  normalizedValue: 0,
  midiNote,
  scaleStep,
  scaleDegree: ((scaleStep % 7) + 7) % 7 + 1,
});

test('maps 0 and 255 to the current scale endpoints used by ChromaSyn today', () => {
  const ionian = engine.SCALES[0];

  assert.equal(engine.getScaleStep(0, 3, 0), 0);
  assert.equal(engine.getScaleDegree(0, 3, 0), 1);
  assert.equal(engine.getSemitones(ionian, 0, 3, 0), 0);
  assert.equal(engine.getScaleStep(255, 3, 0), 21);
  assert.equal(engine.getScaleDegree(255, 3, 0), 1);
  assert.equal(engine.getSemitones(ionian, 255, 3, 0), 36);
});

test('preserves degree bias behavior', () => {
  const ionian = engine.SCALES[0];

  assert.equal(engine.getScaleDegree(0, 3, 1), 2);
  assert.equal(engine.getMidiNote(ionian, 0, 48, 3, 1), 50);
  assert.equal(engine.getScaleDegree(0, 3, -1), 7);
  assert.equal(engine.getMidiNote(ionian, 0, 48, 3, -1), 47);
});

test('gets the current scale degree from an output MIDI note', () => {
  const ionian = engine.SCALES[0];

  assert.equal(engine.getScaleDegreeForMidiNote(ionian, 48, 48), 1);
  assert.equal(engine.getScaleDegreeForMidiNote(ionian, 48, 59), 7);
  assert.equal(engine.getScaleDegreeForMidiNote(ionian, 48, 65), 4);
  assert.equal(engine.getScaleDegreeForMidiNote(ionian, 48, 61), null);
});

test('parses manual chord progression symbols into harmonic contexts', () => {
  const result = engine.parseChordProgression('Dm9 G13 Cmaj9 A7alt nope', engine.SCALES[0], 48);

  assert.deepEqual(result.invalidSymbols, ['nope']);
  assert.deepEqual(result.chords.map((chord) => chord.symbol), ['Dm9', 'G13', 'Cmaj9', 'A7alt']);
  assert.deepEqual(
    result.chords.map((chord) => [chord.rootName, chord.rootMidiNote, chord.scaleDegree, chord.harmonicFunction]),
    [
      ['D', 50, 2, 'predominant'],
      ['G', 55, 5, 'dominant'],
      ['C', 48, 1, 'tonic'],
      ['A', 57, 6, 'dominant'],
    ],
  );
  assert.deepEqual(
    result.chords[3].structure.intervals.map((tone) => tone.role),
    ['root', 'third', 'seventh', 'flatNinth', 'sharpNinth', 'sharpEleventh', 'flatThirteenth'],
  );
});

test('validates the external chord catalog and generates arbitrary-root pitch classes', () => {
  const definitions = engine.validateChordCatalog(chordCatalog);
  const minor9 = definitions.find((definition) => definition.id === 'minor9');

  assert.equal(definitions.length, 28);
  assert.ok(minor9);
  assert.deepEqual(engine.getChordPitchClasses(2, minor9.intervals), [2, 5, 9, 0, 4]);
  assert.throws(
    () => engine.validateChordCatalog({ schemaVersion: 1, chords: [
      { id: 'duplicate', name: 'Duplicate', symbol: '', category: 'Test', intervals: [0, 12] },
    ] }),
    /duplicate pitch classes/i,
  );
});

test('manual progression chords keep every model inside the authored pitch-class boundary', () => {
  const progressionChord = {
    id: 'c-major-custom',
    rootPitchClass: 0,
    pitchClasses: [0, 4, 7, 10],
    label: 'C7 custom',
  };
  const manualChord = engine.createManualHarmonyChord(progressionChord, engine.SCALES[0], 48);
  const rawVoices = [
    rawVoice('r', 49, 0),
    rawVoice('g', 54, 2),
    rawVoice('b', 57, 4),
    rawVoice('h', 61, 6),
    rawVoice('s', 66, 8),
    rawVoice('v', 71, 10),
  ];
  const allowed = new Set(progressionChord.pitchClasses);

  engine.HARMONY_MODELS.forEach((model) => {
    [0, 0.5, 1].forEach((gravity) => {
      const result = engine.resolveHarmony(
        rawVoices,
        { modelId: model.id, gravity, density: model.defaultDensity },
        { scale: engine.SCALES[0], baseMidiNote: 48, manualChord },
        { previousNotesByVoice: { r: 60, g: 64, b: 67 } },
      );
      result.voices.forEach((voice) => {
        if (voice.outputMidiNote !== null) assert.ok(allowed.has(((voice.outputMidiNote % 12) + 12) % 12));
      });
      assert.deepEqual(new Set(result.targetTones.map((tone) => tone.pitchClass)), allowed);
    });
  });
});

test('manual progression models cannot invent a color tone absent from the authored chord', () => {
  const manualChord = engine.createManualHarmonyChord(
    { rootPitchClass: 0, pitchClasses: [0, 4, 7], label: 'C' },
    engine.SCALES[0],
    48,
  );
  const result = engine.resolveHarmony(
    [rawVoice('r', 54, 3), rawVoice('g', 58, 5), rawVoice('b', 61, 7)],
    { modelId: 'tension', gravity: 1, density: 1 },
    { scale: engine.SCALES[0], baseMidiNote: 48, manualChord },
  );

  assert.deepEqual(result.targetTones.map((tone) => tone.pitchClass), [0, 4, 7]);
  assert.equal(result.targetTones.some((tone) => tone.pitchClass === 6), false);
});

test('normalizes voice ranges with the existing ordered-range behavior', () => {
  assert.equal(engine.normalizeVoiceInput(128, [0, 255]), 128);
  assert.equal(engine.normalizeVoiceInput(128, [255, 0]), 128);
  assert.equal(engine.normalizeVoiceInput(64, [64, 64]), 0);
});

test('converts RGB to HSB voice values used by the six-voice mapper', () => {
  const hsb = engine.rgbToHsb(0, 128, 255);

  assert.equal(Math.round(hsb.h), 210);
  assert.equal(Number(hsb.s.toFixed(3)), 1);
  assert.equal(Number(hsb.v.toFixed(3)), 1);
  assert.equal(engine.getRawVoiceValue('h', 0, 128, 255, { h: 180, s: 0.5, v: 0.25 }), 127.5);
  assert.equal(engine.getRawVoiceValue('s', 0, 128, 255, { h: 180, s: 0.5, v: 0.25 }), 127.5);
  assert.equal(engine.getRawVoiceValue('v', 0, 128, 255, { h: 180, s: 0.5, v: 0.25 }), 63.75);
});

test('maps all six RGB/HSB voices to the same MIDI notes as the inline app logic', () => {
  const rawVoices = engine.mapRawVoiceNotes(
    voiceStubs(),
    engine.SCALES[0],
    defaultVoiceMapping(),
    48,
    0,
    128,
    255,
    { h: 180, s: 0.5, v: 0.25 },
  );

  assert.deepEqual(rawVoices, [
    { voice: 'r', rawValue: 0, normalizedValue: 0, midiNote: 48, scaleStep: 0, scaleDegree: 1 },
    { voice: 'g', rawValue: 128, normalizedValue: 128, midiNote: 65, scaleStep: 10, scaleDegree: 4 },
    { voice: 'b', rawValue: 255, normalizedValue: 255, midiNote: 84, scaleStep: 21, scaleDegree: 1 },
    { voice: 'h', rawValue: 127.5, normalizedValue: 127.5, midiNote: 65, scaleStep: 10, scaleDegree: 4 },
    { voice: 's', rawValue: 127.5, normalizedValue: 127.5, midiNote: 65, scaleStep: 10, scaleDegree: 4 },
    { voice: 'v', rawValue: 63.75, normalizedValue: 63.75, midiNote: 57, scaleStep: 5, scaleDegree: 6 },
  ]);

  assert.deepEqual(
    engine.getVoiceMidiNotes(
      voiceStubs(),
      engine.SCALES[0],
      defaultVoiceMapping(),
      48,
      0,
      128,
      255,
      { h: 180, s: 0.5, v: 0.25 },
    ),
    { r: 48, g: 65, b: 84, h: 65, s: 65, v: 57 },
  );
});

test('Harmony Off passes through every raw voice without suppression or remapping', () => {
  const rawVoices = engine.mapRawVoiceNotes(
    voiceStubs(),
    engine.SCALES[1],
    defaultVoiceMapping(),
    50,
    12,
    34,
    56,
    { h: 270, s: 0.25, v: 0.75 },
  );
  const result = engine.resolveHarmony(rawVoices, { modelId: 'off', gravity: 5, density: -1 });

  assert.equal(result.modelId, 'off');
  assert.deepEqual(result.settings, { modelId: 'off', gravity: 1, density: 0 });
  assert.deepEqual(
    result.voices.map((voice) => ({ voice: voice.voice, midiNote: voice.midiNote, outputMidiNote: voice.outputMidiNote })),
    rawVoices.map((voice) => ({ voice: voice.voice, midiNote: voice.midiNote, outputMidiNote: voice.midiNote })),
  );
  assert.deepEqual(result.notesByVoice, Object.fromEntries(rawVoices.map((voice) => [voice.voice, voice.midiNote])));
});

test('Lyrical at zero gravity passes through like the raw six-voice mapper', () => {
  const rawVoices = [
    rawVoice('r', 48, 0),
    rawVoice('g', 52, 2),
    rawVoice('b', 55, 4),
    rawVoice('h', 59, 6),
    rawVoice('s', 62, 8),
    rawVoice('v', 65, 10),
  ];
  const result = engine.resolveHarmony(
    rawVoices,
    { modelId: 'lyrical', gravity: 0, density: 0.75 },
    { scale: engine.SCALES[0], baseMidiNote: 48 },
  );

  assert.deepEqual(result.notesByVoice, { r: 48, g: 52, b: 55, h: 59, s: 62, v: 65 });
  assert.deepEqual(result.voices.map((voice) => voice.harmonyAction), Array(6).fill('pass-through'));
});

test('gravity progressively replaces raw notes with model suppression and remapping', () => {
  const rawVoices = [
    rawVoice('r', 48, 0),
    rawVoice('g', 60, 7),
    rawVoice('b', 53, 3),
    rawVoice('h', 57, 5),
    rawVoice('s', 65, 10),
    rawVoice('v', 69, 12),
  ];
  const resolveAt = (gravity) =>
    engine.resolveHarmony(
      rawVoices,
      { modelId: 'lyrical', gravity, density: 0.75 },
      { scale: engine.SCALES[0], baseMidiNote: 48 },
    );
  const changedVoiceCount = (result) =>
    result.voices.filter((voice, index) => voice.outputMidiNote !== rawVoices[index].midiNote).length;

  const zero = resolveAt(0);
  const whisper = resolveAt(0.01);
  const low = resolveAt(0.1);
  const middle = resolveAt(0.5);
  const high = resolveAt(0.8);
  const full = resolveAt(1);
  const gravityStages = [zero, whisper, low, middle, high, full];
  const changedCounts = gravityStages.map(changedVoiceCount);
  const outputSignatures = gravityStages.map((result) => JSON.stringify(result.notesByVoice));

  assert.equal(changedCounts[0], 0);
  assert.ok(changedVoiceCount(whisper) > 0);
  assert.ok(changedCounts.every((count, index) => index === 0 || count >= changedCounts[index - 1]));
  assert.ok(new Set(outputSignatures).size >= 4);
  assert.ok(changedVoiceCount(middle) > changedVoiceCount(low));
  assert.ok(low.voices.some((voice) => voice.harmonyAction === 'suppress'));
  assert.ok(high.voices.some((voice) => voice.harmonyAction === 'remap'));
});

test('voice leading leaves low-gravity pass-through voices at their raw pitches', () => {
  const rawVoices = [
    rawVoice('r', 96, 28),
    rawVoice('g', 97, 29),
  ];
  const result = engine.resolveHarmony(
    rawVoices,
    { modelId: 'lyrical', gravity: 0.01, density: 0.75 },
    { scale: engine.SCALES[0], baseMidiNote: 48 },
    { previousNotesByVoice: { r: 60, g: 61 } },
  );

  assert.equal(result.notesByVoice.r, 96);
  assert.equal(result.voices[0].harmonyAction, 'pass-through');
  assert.equal(result.voices[0].voicingAction, undefined);
  assert.equal(result.voices[1].harmonyAction, 'suppress');
});

test('voice leading is opt-in and leaves static harmony resolution unchanged without previous context', () => {
  const rawVoices = [rawVoice('r', 84, 21)];
  const result = engine.resolveHarmony(
    rawVoices,
    { modelId: 'lyrical', gravity: 1, density: 1 },
    { scale: engine.SCALES[0], baseMidiNote: 48 },
  );

  assert.deepEqual(result.notesByVoice, { r: 84, g: null, b: null, h: null, s: null, v: null });
  assert.equal(result.voices[0].voicingAction, undefined);
});

test('voice leading keeps the same pitch class close to the previous note for a voice', () => {
  const rawVoices = [rawVoice('r', 84, 21)];
  const result = engine.resolveHarmony(
    rawVoices,
    { modelId: 'lyrical', gravity: 1, density: 1 },
    { scale: engine.SCALES[0], baseMidiNote: 48 },
    { previousNotesByVoice: { r: 60 } },
  );

  assert.deepEqual(result.notesByVoice, { r: 60, g: null, b: null, h: null, s: null, v: null });
  assert.equal(result.voices[0].harmonyRole, 'root');
  assert.equal(result.voices[0].harmonyAction, 'preserve');
  assert.equal(result.voices[0].voicingAction, 'octave-shift');
});

test('voice leading keeps Harmony Off as an exact bypass even with previous context', () => {
  const rawVoices = [rawVoice('r', 84, 21)];
  const result = engine.resolveHarmony(
    rawVoices,
    { modelId: 'off', gravity: 1, density: 1 },
    { scale: engine.SCALES[0], baseMidiNote: 48 },
    { previousNotesByVoice: { r: 60 } },
  );

  assert.deepEqual(result.notesByVoice, { r: 84, g: null, b: null, h: null, s: null, v: null });
  assert.equal(result.voices[0].voicingAction, undefined);
});

test('voice leading constrains harmonized notes to the default voicing range when active', () => {
  const rawVoices = [rawVoice('r', 96, 28)];
  const result = engine.resolveHarmony(
    rawVoices,
    { modelId: 'lyrical', gravity: 1, density: 1 },
    { scale: engine.SCALES[0], baseMidiNote: 48 },
    {},
  );

  assert.deepEqual(result.notesByVoice, { r: 84, g: null, b: null, h: null, s: null, v: null });
  assert.equal(result.voices[0].voicingAction, 'range-shift');
});

test('voice leading spreads crowded low-register chord tones while preserving pitch classes', () => {
  const voices = [
    { ...rawVoice('r', 36, -7), outputMidiNote: 36, harmonyRole: 'root', harmonyAction: 'preserve' },
    { ...rawVoice('g', 40, -5), outputMidiNote: 40, harmonyRole: 'third', harmonyAction: 'preserve' },
    { ...rawVoice('b', 43, -3), outputMidiNote: 43, harmonyRole: 'fifth', harmonyAction: 'preserve' },
  ];
  const result = engine.applyVoiceLeading({
    modelId: 'lyrical',
    settings: { modelId: 'lyrical', gravity: 1, density: 1 },
    rawVoices: voices,
    voices,
    notesByVoice: { r: 36, g: 40, b: 43, h: null, s: null, v: null },
  });

  assert.deepEqual(result.notesByVoice, { r: 36, g: 52, b: 43, h: null, s: null, v: null });
  assert.deepEqual([result.notesByVoice.r % 12, result.notesByVoice.g % 12, result.notesByVoice.b % 12], [0, 4, 7]);
  assert.equal(result.voices.find((voice) => voice.voice === 'g').voicingAction, 'octave-shift');
});

test('MIDI transitions retain a note that moves between ChromaSyn voices', () => {
  const transition = engine.getMidiNoteTransition(
    { r: 60, g: 64, b: null, h: null, s: null, v: null },
    { r: null, g: 60, b: 67, h: null, s: null, v: null },
  );

  assert.deepEqual(transition.nextNotesByVoice, { r: null, g: 60, b: 67, h: null, s: null, v: null });
  assert.deepEqual(transition.retainedNotes, [60]);
  assert.deepEqual(transition.notesOff, [64]);
  assert.deepEqual(transition.notesOn, [67]);
});

test('MIDI transitions reconcile duplicate note counts without unnecessary retriggers', () => {
  const transition = engine.getMidiNoteTransition(
    { r: 60, g: 60, b: 64, h: null, s: null, v: null },
    { r: 60, g: null, b: 64, h: 67, s: null, v: null },
  );

  assert.deepEqual(transition.retainedNotes, [60, 64]);
  assert.deepEqual(transition.notesOff, [60]);
  assert.deepEqual(transition.notesOn, [67]);
});

test('MIDI legato planning delays only note-offs from voices moving to another note', () => {
  const currentNotes = { r: 60, g: 67, b: 72, h: null, s: null, v: null };
  const targetNotes = { r: 64, g: null, b: 72, h: null, s: null, v: null };
  const transition = engine.getMidiNoteTransition(currentNotes, targetNotes);
  const noteOffPlan = engine.getMidiLegatoNoteOffPlan(currentNotes, targetNotes, transition.notesOff);

  assert.deepEqual(transition.notesOff, [60, 67]);
  assert.deepEqual(transition.notesOn, [64]);
  assert.deepEqual(noteOffPlan.delayedNotesOff, [60]);
  assert.deepEqual(noteOffPlan.immediateNotesOff, [67]);
});

test('MIDI legato planning delays only the changed duplicate note instance', () => {
  const currentNotes = { r: 60, g: 60, b: null, h: null, s: null, v: null };
  const targetNotes = { r: 64, g: null, b: null, h: null, s: null, v: null };
  const transition = engine.getMidiNoteTransition(currentNotes, targetNotes);
  const noteOffPlan = engine.getMidiLegatoNoteOffPlan(currentNotes, targetNotes, transition.notesOff);

  assert.deepEqual(transition.notesOff, [60, 60]);
  assert.deepEqual(transition.notesOn, [64]);
  assert.deepEqual(noteOffPlan.delayedNotesOff, [60]);
  assert.deepEqual(noteOffPlan.immediateNotesOff, [60]);
});

test('manual chord progression context overrides image-derived anchor evidence', () => {
  const manualChord = engine.parseChordSymbol('Cmaj9', engine.SCALES[0], 48);
  const rawVoices = [
    rawVoice('r', 48, 0),
    rawVoice('g', 52, 2),
    rawVoice('b', 55, 4),
    rawVoice('h', 69, 12),
    rawVoice('s', 79, 18),
    rawVoice('v', 55, 4),
  ];
  const result = engine.resolveHarmony(
    rawVoices,
    { modelId: 'shell', gravity: 1, density: 0.35 },
    { scale: engine.SCALES[0], baseMidiNote: 48, manualChord },
  );

  assert.equal(result.anchor.source, 'manual-progression');
  assert.equal(result.anchor.symbol, 'Cmaj9');
  assert.equal(result.anchor.midiNote, 48);
  assert.equal(result.anchor.scaleDegree, 1);
  assert.deepEqual(result.targetTones.map((tone) => tone.role), ['root', 'third', 'fifth', 'seventh', 'ninth']);
  assert.deepEqual(result.targetTones.map((tone) => tone.pitchClass), [0, 4, 7, 11, 2]);
});

test('Lyrical deterministically uses duplicate image evidence before final deduplication', () => {
  const rawVoices = [
    rawVoice('r', 48, 0),
    rawVoice('g', 48, 0),
    rawVoice('b', 57, 5),
    rawVoice('h', 57, 5),
    rawVoice('s', 62, 8),
    rawVoice('v', 53, 3),
  ];
  const settings = { modelId: 'lyrical', gravity: 1, density: 1 };
  const context = { scale: engine.SCALES[0], baseMidiNote: 48 };
  const first = engine.resolveHarmony(rawVoices, settings, context);
  const second = engine.resolveHarmony(rawVoices, settings, context);

  assert.deepEqual(first, second);
  assert.equal(first.anchor.scaleDegree, 1);
  assert.deepEqual(first.targetTones.map((tone) => tone.role), ['root', 'third', 'sixth', 'ninth']);
  assert.deepEqual(first.notesByVoice, { r: 48, g: null, b: 57, h: null, s: 62, v: 52 });
  assert.deepEqual(
    first.voices.map((voice) => [voice.voice, voice.harmonyAction, voice.harmonyRole ?? null]),
    [
      ['r', 'preserve', 'root'],
      ['g', 'suppress', 'root'],
      ['b', 'preserve', 'sixth'],
      ['h', 'suppress', 'sixth'],
      ['s', 'preserve', 'ninth'],
      ['v', 'remap', 'third'],
    ],
  );
});

test('built-in harmony models expose Off, Lyrical, Open, Tension, and Shell in UI order', () => {
  assert.deepEqual(
    engine.HARMONY_MODELS.map((model) => [model.id, model.defaultDensity]),
    [
      ['off', 1],
      ['lyrical', 0.75],
      ['open', 0.65],
      ['tension', 0.8],
      ['shell', 0.35],
    ],
  );
});

test('Open at zero gravity passes through like the raw six-voice mapper', () => {
  const rawVoices = [
    rawVoice('r', 48, 0),
    rawVoice('g', 52, 2),
    rawVoice('b', 55, 4),
    rawVoice('h', 59, 6),
    rawVoice('s', 62, 8),
    rawVoice('v', 65, 10),
  ];
  const result = engine.resolveHarmony(
    rawVoices,
    { modelId: 'open', gravity: 0, density: 0.65 },
    { scale: engine.SCALES[0], baseMidiNote: 48 },
  );

  assert.deepEqual(result.notesByVoice, { r: 48, g: 52, b: 55, h: 59, s: 62, v: 65 });
  assert.deepEqual(result.voices.map((voice) => voice.harmonyAction), Array(6).fill('pass-through'));
});

test('Open favors suspended modal tones over defining thirds', () => {
  const rawVoices = [
    rawVoice('r', 48, 0),
    rawVoice('g', 52, 2),
    rawVoice('b', 55, 4),
    rawVoice('h', 50, 1),
    rawVoice('s', 57, 5),
    rawVoice('v', 48, 0),
  ];
  const first = engine.resolveHarmony(
    rawVoices,
    { modelId: 'open', gravity: 1, density: 0.65 },
    { scale: engine.SCALES[0], baseMidiNote: 48 },
  );
  const second = engine.resolveHarmony(
    rawVoices,
    { modelId: 'open', gravity: 1, density: 0.65 },
    { scale: engine.SCALES[0], baseMidiNote: 48 },
  );

  assert.deepEqual(first, second);
  assert.equal(first.anchor.scaleDegree, 1);
  assert.deepEqual(first.targetTones.map((tone) => tone.role), ['root', 'ninth', 'eleventh', 'fifth']);
  assert.deepEqual(first.notesByVoice, { r: 48, g: 53, b: 55, h: 50, s: null, v: null });
  assert.deepEqual(
    first.voices.map((voice) => [voice.voice, voice.harmonyAction, voice.harmonyRole ?? null]),
    [
      ['r', 'preserve', 'root'],
      ['g', 'remap', 'eleventh'],
      ['b', 'preserve', 'fifth'],
      ['h', 'preserve', 'ninth'],
      ['s', 'suppress', 'fifth'],
      ['v', 'suppress', 'root'],
    ],
  );
});

test('Tension at zero gravity passes through like the raw six-voice mapper', () => {
  const rawVoices = [
    rawVoice('r', 48, 0),
    rawVoice('g', 52, 2),
    rawVoice('b', 55, 4),
    rawVoice('h', 59, 6),
    rawVoice('s', 62, 8),
    rawVoice('v', 65, 10),
  ];
  const result = engine.resolveHarmony(
    rawVoices,
    { modelId: 'tension', gravity: 0, density: 0.8 },
    { scale: engine.SCALES[0], baseMidiNote: 48 },
  );

  assert.deepEqual(result.notesByVoice, { r: 48, g: 52, b: 55, h: 59, s: 62, v: 65 });
  assert.deepEqual(result.voices.map((voice) => voice.harmonyAction), Array(6).fill('pass-through'));
});

test('Tension uses altered dominant colors only when the anchor behaves as dominant', () => {
  const rawVoices = [
    rawVoice('r', 55, 4),
    rawVoice('g', 55, 4),
    rawVoice('b', 59, 6),
    rawVoice('h', 65, 10),
    rawVoice('s', 57, 5),
    rawVoice('v', 62, 8),
  ];
  const first = engine.resolveHarmony(
    rawVoices,
    { modelId: 'tension', gravity: 1, density: 0.8 },
    { scale: engine.SCALES[0], baseMidiNote: 48 },
  );
  const second = engine.resolveHarmony(
    rawVoices,
    { modelId: 'tension', gravity: 1, density: 0.8 },
    { scale: engine.SCALES[0], baseMidiNote: 48 },
  );

  assert.deepEqual(first, second);
  assert.equal(first.anchor.scaleDegree, 5);
  assert.equal(first.anchor.harmonicFunction, 'dominant');
  assert.deepEqual(first.targetTones.map((tone) => tone.role), [
    'root',
    'third',
    'seventh',
    'flatNinth',
    'sharpNinth',
    'sharpEleventh',
    'thirteenth',
  ]);
  assert.deepEqual(first.notesByVoice, { r: 55, g: null, b: 59, h: 65, s: 56, v: 61 });
  assert.deepEqual(
    first.voices.map((voice) => [voice.voice, voice.harmonyAction, voice.harmonyRole ?? null]),
    [
      ['r', 'preserve', 'root'],
      ['g', 'suppress', 'root'],
      ['b', 'preserve', 'third'],
      ['h', 'preserve', 'seventh'],
      ['s', 'remap', 'flatNinth'],
      ['v', 'remap', 'sharpEleventh'],
    ],
  );
});

test('Tension keeps tonic anchors scale-relative instead of forcing altered dominant color', () => {
  const rawVoices = [
    rawVoice('r', 48, 0),
    rawVoice('g', 48, 0),
    rawVoice('b', 52, 2),
    rawVoice('h', 59, 6),
    rawVoice('s', 62, 8),
    rawVoice('v', 65, 10),
  ];
  const result = engine.resolveHarmony(
    rawVoices,
    { modelId: 'tension', gravity: 1, density: 0.8 },
    { scale: engine.SCALES[0], baseMidiNote: 48 },
  );
  const alteredRoles = new Set(['flatNinth', 'sharpNinth', 'sharpEleventh', 'flatThirteenth']);

  assert.equal(result.anchor.scaleDegree, 1);
  assert.equal(result.anchor.harmonicFunction, 'tonic');
  assert.deepEqual(result.targetTones.map((tone) => tone.role), ['root', 'third', 'seventh', 'ninth', 'eleventh']);
  assert.equal(result.targetTones.some((tone) => alteredRoles.has(tone.role)), false);
});

test('Shell at zero gravity passes through like the raw six-voice mapper', () => {
  const rawVoices = [
    rawVoice('r', 48, 0),
    rawVoice('g', 52, 2),
    rawVoice('b', 55, 4),
    rawVoice('h', 59, 6),
    rawVoice('s', 62, 8),
    rawVoice('v', 65, 10),
  ];
  const result = engine.resolveHarmony(
    rawVoices,
    { modelId: 'shell', gravity: 0, density: 0.35 },
    { scale: engine.SCALES[0], baseMidiNote: 48 },
  );

  assert.deepEqual(result.notesByVoice, { r: 48, g: 52, b: 55, h: 59, s: 62, v: 65 });
  assert.deepEqual(result.voices.map((voice) => voice.harmonyAction), Array(6).fill('pass-through'));
});

test('Shell omits roots and fifths when guide tones are available', () => {
  const rawVoices = [
    rawVoice('r', 48, 0),
    rawVoice('g', 52, 2),
    rawVoice('b', 59, 6),
    rawVoice('h', 55, 4),
    rawVoice('s', 62, 8),
    rawVoice('v', 48, 0),
  ];
  const result = engine.resolveHarmony(
    rawVoices,
    { modelId: 'shell', gravity: 1, density: 0.35 },
    { scale: engine.SCALES[0], baseMidiNote: 48 },
  );

  assert.equal(result.anchor.scaleDegree, 1);
  assert.deepEqual(result.targetTones.map((tone) => tone.role), ['third', 'seventh']);
  assert.deepEqual(result.notesByVoice, { r: null, g: 52, b: 59, h: null, s: null, v: null });
  assert.deepEqual(
    result.voices.map((voice) => [voice.voice, voice.harmonyAction, voice.harmonyRole ?? null]),
    [
      ['r', 'suppress', 'seventh'],
      ['g', 'preserve', 'third'],
      ['b', 'preserve', 'seventh'],
      ['h', 'suppress', 'third'],
      ['s', 'suppress', 'third'],
      ['v', 'suppress', 'seventh'],
    ],
  );
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`All ${tests.length} music engine tests passed.`);
}
