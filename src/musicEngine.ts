export type Scale = {
  name: string;
  intervals: number[];
};

export type VoiceId = 'r' | 'g' | 'b' | 'h' | 's' | 'v';
export type VoiceSource = 'rgb' | 'hsb';
export type HsbColor = { h: number; s: number; v: number };

export type VoiceDescriptor = {
  id: VoiceId;
  label: string;
  source: VoiceSource;
  defaultEnabled: boolean;
  detuneCents: number;
  gain: number;
};

export type VoiceMappingConfig = {
  enabled: boolean;
  inputRange: [number, number];
  octaveSpan: number;
  degreeBias: number;
};

export type VoiceMappingById = Record<VoiceId, VoiceMappingConfig>;

export type RawVoiceNote = {
  voice: VoiceId;
  rawValue: number;
  normalizedValue: number;
  midiNote: number;
  scaleStep: number;
  scaleDegree: number;
};

export type HarmonizedVoiceNote = RawVoiceNote & {
  outputMidiNote: number | null;
  harmonyRole?: ToneRole;
  harmonyAction?: HarmonyAction;
  voicingAction?: VoicingAction;
};

export type VoiceNoteById = Record<VoiceId, number | null>;

export type MidiNoteTransition = {
  nextNotesByVoice: VoiceNoteById;
  retainedNotes: number[];
  notesOff: number[];
  notesOn: number[];
};

export type MidiLegatoNoteOffPlan = {
  immediateNotesOff: number[];
  delayedNotesOff: number[];
};

export type HarmonyModelId = 'off' | 'lyrical' | 'open' | 'tension' | 'shell';
export type HarmonySourceId = 'image' | 'manual-progression';
export type VoicingStrategyId = 'none' | 'smooth';

export type ToneRole =
  | 'root'
  | 'third'
  | 'fifth'
  | 'sixth'
  | 'seventh'
  | 'ninth'
  | 'eleventh'
  | 'thirteenth'
  | 'flatNinth'
  | 'sharpNinth'
  | 'sharpEleventh'
  | 'flatThirteenth';
export type HarmonyAction = 'pass-through' | 'preserve' | 'remap' | 'suppress';
export type VoicingAction = 'preserve' | 'octave-shift' | 'range-shift';
export type HarmonicFunction = 'tonic' | 'predominant' | 'dominant';
export type ScaleDegree = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ScaleRelativeStructure = {
  type: 'scale';
  degrees: number[];
  weight: number;
  label: string;
};

export type ChromaticTone = {
  interval: number;
  role: ToneRole;
};

export type ChromaticStructure = {
  type: 'chromatic';
  intervals: Array<number | ChromaticTone>;
  weight: number;
  label: string;
};

export type HarmonyStructure = ScaleRelativeStructure | ChromaticStructure;

export type ManualHarmonyChord = {
  symbol: string;
  rootName: string;
  rootMidiNote: number;
  scaleStep: number;
  scaleDegree: ScaleDegree;
  harmonicFunction: HarmonicFunction;
  structure: ChromaticStructure;
};

export type ChordProgressionParseResult = {
  chords: ManualHarmonyChord[];
  invalidSymbols: string[];
};

export type HarmonyDegreeRule = {
  harmonicFunction: HarmonicFunction;
  structures: HarmonyStructure[];
};

export type HarmonicAnchor = {
  source?: HarmonySourceId;
  voice?: VoiceId;
  symbol?: string;
  midiNote: number;
  scaleStep: number;
  scaleDegree: ScaleDegree;
  harmonicFunction: HarmonicFunction;
};

export type HarmonicTargetTone = {
  role: ToneRole;
  relativeDegree?: number;
  semitoneInterval?: number;
  pitchClass: number;
  importance: number;
  support: number;
};

export type HarmonyModel = {
  id: HarmonyModelId;
  name: string;
  description: string;
  defaultDensity: number;
  toneImportance?: Partial<Record<ToneRole, number>>;
  degreeRules?: Partial<Record<ScaleDegree, HarmonyDegreeRule>>;
};

export type HarmonyEngineSettings = {
  modelId: HarmonyModelId;
  gravity: number;
  density: number;
};

export type VoicingSettings = {
  strategyId: VoicingStrategyId;
  minMidiNote: number;
  maxMidiNote: number;
  maxOctaveShift: number;
};

export type HarmonyResult = {
  modelId: HarmonyModelId;
  settings: HarmonyEngineSettings;
  rawVoices: RawVoiceNote[];
  voices: HarmonizedVoiceNote[];
  notesByVoice: VoiceNoteById;
  anchor?: HarmonicAnchor;
  targetTones?: HarmonicTargetTone[];
};

export type HarmonyContext = {
  scale: Scale;
  baseMidiNote: number;
  manualChord?: ManualHarmonyChord;
};

export type VoicingContext = {
  previousNotesByVoice?: Partial<Record<VoiceId, number | null>>;
};

export const SCALES: Scale[] = [
  { name: 'Ionian (Major)', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Aeolian (Minor)', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10] },
];

export const VOICE_IDS: VoiceId[] = ['r', 'g', 'b', 'h', 's', 'v'];

export const DEFAULT_OCTAVE_SPAN = 3;

export const DEFAULT_HARMONY_MODEL_ID: HarmonyModelId = 'off';

export const DEFAULT_HARMONY_ENGINE_SETTINGS: HarmonyEngineSettings = {
  modelId: DEFAULT_HARMONY_MODEL_ID,
  gravity: 0.7,
  density: 0.75,
};

export const DEFAULT_VOICING_SETTINGS: VoicingSettings = {
  strategyId: 'smooth',
  minMidiNote: 36,
  maxMidiNote: 84,
  maxOctaveShift: 24,
};

export const HARMONY_MODELS: HarmonyModel[] = [
  {
    id: 'off',
    name: 'Off',
    description: 'Preserve the original six-voice ChromaSyn mapping.',
    defaultDensity: 1,
  },
  {
    id: 'lyrical',
    name: 'Lyrical',
    description: 'Rich, restrained scale-relative extended harmony.',
    defaultDensity: 0.75,
    toneImportance: {
      root: 0.65,
      third: 1,
      fifth: 0.35,
      sixth: 0.8,
      seventh: 0.95,
      ninth: 0.85,
      eleventh: 0.3,
      thirteenth: 0.78,
    },
    degreeRules: {
      1: {
        harmonicFunction: 'tonic',
        structures: [
          { type: 'scale', degrees: [1, 3, 5, 7, 9], weight: 3, label: '9' },
          { type: 'scale', degrees: [1, 3, 6, 9], weight: 2, label: '6/9' },
        ],
      },
      2: {
        harmonicFunction: 'predominant',
        structures: [
          { type: 'scale', degrees: [1, 3, 5, 7, 9], weight: 3, label: 'm9' },
          { type: 'scale', degrees: [1, 3, 7, 9, 11], weight: 2, label: 'm11' },
        ],
      },
      3: {
        harmonicFunction: 'tonic',
        structures: [
          { type: 'scale', degrees: [1, 3, 5, 7, 9], weight: 2, label: 'm9' },
          { type: 'scale', degrees: [1, 3, 7, 9], weight: 3, label: 'guide 9' },
        ],
      },
      4: {
        harmonicFunction: 'predominant',
        structures: [
          { type: 'scale', degrees: [1, 3, 5, 7, 9], weight: 3, label: 'maj9' },
          { type: 'scale', degrees: [1, 3, 6, 9], weight: 2, label: '6/9' },
        ],
      },
      5: {
        harmonicFunction: 'dominant',
        structures: [
          { type: 'scale', degrees: [1, 3, 5, 7, 9, 13], weight: 3, label: '13' },
          { type: 'scale', degrees: [1, 3, 7, 9, 13], weight: 2, label: '9/13' },
        ],
      },
      6: {
        harmonicFunction: 'tonic',
        structures: [
          { type: 'scale', degrees: [1, 3, 5, 7, 9], weight: 2, label: 'm9' },
          { type: 'scale', degrees: [1, 3, 7, 9, 11], weight: 3, label: 'm11' },
        ],
      },
      7: {
        harmonicFunction: 'dominant',
        structures: [
          { type: 'scale', degrees: [1, 3, 5, 7, 9], weight: 2, label: 'half-dim 9' },
          { type: 'scale', degrees: [1, 3, 7, 9], weight: 3, label: 'guide 9' },
        ],
      },
    },
  },
  {
    id: 'open',
    name: 'Open',
    description: 'Modal suspended harmony with spacious fourths, fifths, and 9ths.',
    defaultDensity: 0.65,
    toneImportance: {
      root: 0.55,
      third: 0.15,
      fifth: 0.85,
      sixth: 0.45,
      seventh: 0.35,
      ninth: 0.9,
      eleventh: 1,
      thirteenth: 0.6,
    },
    degreeRules: {
      1: {
        harmonicFunction: 'tonic',
        structures: [
          { type: 'scale', degrees: [1, 2, 4, 5], weight: 4, label: 'sus add2' },
          { type: 'scale', degrees: [1, 4, 5, 9], weight: 3, label: 'sus 9' },
          { type: 'scale', degrees: [2, 4, 5, 11], weight: 2, label: 'no-root stack' },
        ],
      },
      2: {
        harmonicFunction: 'predominant',
        structures: [
          { type: 'scale', degrees: [1, 2, 4, 5], weight: 4, label: 'sus add2' },
          { type: 'scale', degrees: [1, 4, 5, 9], weight: 3, label: 'sus 9' },
          { type: 'scale', degrees: [2, 4, 5, 11], weight: 2, label: 'no-root stack' },
        ],
      },
      3: {
        harmonicFunction: 'tonic',
        structures: [
          { type: 'scale', degrees: [1, 2, 4, 5], weight: 4, label: 'sus add2' },
          { type: 'scale', degrees: [1, 4, 5, 9], weight: 3, label: 'sus 9' },
          { type: 'scale', degrees: [2, 4, 5, 11], weight: 2, label: 'no-root stack' },
        ],
      },
      4: {
        harmonicFunction: 'predominant',
        structures: [
          { type: 'scale', degrees: [1, 2, 4, 5], weight: 4, label: 'sus add2' },
          { type: 'scale', degrees: [1, 4, 5, 9], weight: 3, label: 'sus 9' },
          { type: 'scale', degrees: [2, 4, 5, 11], weight: 2, label: 'no-root stack' },
        ],
      },
      5: {
        harmonicFunction: 'dominant',
        structures: [
          { type: 'scale', degrees: [1, 2, 4, 5], weight: 4, label: 'sus add2' },
          { type: 'scale', degrees: [1, 4, 5, 9], weight: 3, label: 'sus 9' },
          { type: 'scale', degrees: [2, 4, 5, 13], weight: 2, label: 'sus 13' },
        ],
      },
      6: {
        harmonicFunction: 'tonic',
        structures: [
          { type: 'scale', degrees: [1, 2, 4, 5], weight: 4, label: 'sus add2' },
          { type: 'scale', degrees: [1, 4, 5, 9], weight: 3, label: 'sus 9' },
          { type: 'scale', degrees: [2, 4, 5, 11], weight: 2, label: 'no-root stack' },
        ],
      },
      7: {
        harmonicFunction: 'dominant',
        structures: [
          { type: 'scale', degrees: [1, 2, 4, 5], weight: 4, label: 'sus add2' },
          { type: 'scale', degrees: [1, 4, 5, 9], weight: 3, label: 'sus 9' },
          { type: 'scale', degrees: [2, 4, 5, 11], weight: 2, label: 'no-root stack' },
        ],
      },
    },
  },
  {
    id: 'tension',
    name: 'Tension',
    description: 'Functional dissonance with altered dominant color where scale-degree context supports it.',
    defaultDensity: 0.8,
    toneImportance: {
      root: 0.45,
      third: 0.9,
      fifth: 0.25,
      sixth: 0.5,
      seventh: 0.92,
      ninth: 0.58,
      eleventh: 0.4,
      thirteenth: 0.75,
      flatNinth: 1,
      sharpNinth: 0.95,
      sharpEleventh: 0.85,
      flatThirteenth: 0.8,
    },
    degreeRules: {
      1: {
        harmonicFunction: 'tonic',
        structures: [
          { type: 'scale', degrees: [1, 3, 7, 9, 11], weight: 3, label: 'maj9 color' },
          { type: 'scale', degrees: [1, 3, 6, 7, 9], weight: 2, label: 'maj13 color' },
        ],
      },
      2: {
        harmonicFunction: 'predominant',
        structures: [
          { type: 'scale', degrees: [1, 3, 7, 9, 11], weight: 3, label: 'm11' },
          { type: 'scale', degrees: [3, 7, 9, 11, 13], weight: 2, label: 'upper color' },
        ],
      },
      3: {
        harmonicFunction: 'tonic',
        structures: [
          { type: 'scale', degrees: [1, 3, 7, 9, 11], weight: 3, label: 'm11 color' },
          { type: 'scale', degrees: [3, 7, 9, 11], weight: 2, label: 'upper guide' },
        ],
      },
      4: {
        harmonicFunction: 'predominant',
        structures: [
          { type: 'scale', degrees: [1, 3, 7, 9, 13], weight: 3, label: 'maj13' },
          { type: 'scale', degrees: [3, 7, 9, 11], weight: 2, label: 'upper guide' },
        ],
      },
      5: {
        harmonicFunction: 'dominant',
        structures: [
          {
            type: 'chromatic',
            intervals: [
              { interval: 0, role: 'root' },
              { interval: 4, role: 'third' },
              { interval: 10, role: 'seventh' },
              { interval: 13, role: 'flatNinth' },
              { interval: 15, role: 'sharpNinth' },
              { interval: 18, role: 'sharpEleventh' },
              { interval: 21, role: 'thirteenth' },
            ],
            weight: 4,
            label: '7alt 13',
          },
          {
            type: 'chromatic',
            intervals: [
              { interval: 0, role: 'root' },
              { interval: 4, role: 'third' },
              { interval: 10, role: 'seventh' },
              { interval: 13, role: 'flatNinth' },
              { interval: 18, role: 'sharpEleventh' },
              { interval: 20, role: 'flatThirteenth' },
            ],
            weight: 3,
            label: '7 b9 #11 b13',
          },
          { type: 'scale', degrees: [1, 3, 7, 9, 13], weight: 2, label: '9/13' },
        ],
      },
      6: {
        harmonicFunction: 'tonic',
        structures: [
          { type: 'scale', degrees: [1, 3, 7, 9, 11], weight: 3, label: 'm11 color' },
          { type: 'scale', degrees: [3, 7, 9, 11, 13], weight: 2, label: 'upper color' },
        ],
      },
      7: {
        harmonicFunction: 'dominant',
        structures: [
          {
            type: 'chromatic',
            intervals: [
              { interval: 0, role: 'root' },
              { interval: 3, role: 'third' },
              { interval: 6, role: 'fifth' },
              { interval: 10, role: 'seventh' },
              { interval: 13, role: 'flatNinth' },
            ],
            weight: 3,
            label: 'leading half-dim b9',
          },
          { type: 'scale', degrees: [1, 3, 5, 7, 9], weight: 2, label: 'half-dim 9' },
        ],
      },
    },
  },
  {
    id: 'shell',
    name: 'Shell',
    description: 'Sparse guide-tone harmony with normal root omission.',
    defaultDensity: 0.35,
    toneImportance: {
      root: 0.15,
      third: 1,
      fifth: 0.1,
      sixth: 0.55,
      seventh: 0.98,
      ninth: 0.75,
      eleventh: 0.35,
      thirteenth: 0.45,
    },
    degreeRules: {
      1: {
        harmonicFunction: 'tonic',
        structures: [
          { type: 'scale', degrees: [3, 7], weight: 4, label: '3/7' },
          { type: 'scale', degrees: [3, 7, 9], weight: 3, label: '3/7/9' },
          { type: 'scale', degrees: [3, 6, 9], weight: 2, label: '3/6/9' },
        ],
      },
      2: {
        harmonicFunction: 'predominant',
        structures: [
          { type: 'scale', degrees: [3, 7], weight: 4, label: '3/7' },
          { type: 'scale', degrees: [3, 7, 9], weight: 3, label: '3/7/9' },
          { type: 'scale', degrees: [7, 9, 11], weight: 2, label: '7/9/11' },
        ],
      },
      3: {
        harmonicFunction: 'tonic',
        structures: [
          { type: 'scale', degrees: [3, 7], weight: 4, label: '3/7' },
          { type: 'scale', degrees: [3, 7, 9], weight: 3, label: '3/7/9' },
          { type: 'scale', degrees: [7, 9], weight: 2, label: '7/9' },
        ],
      },
      4: {
        harmonicFunction: 'predominant',
        structures: [
          { type: 'scale', degrees: [3, 7], weight: 4, label: '3/7' },
          { type: 'scale', degrees: [3, 7, 9], weight: 3, label: '3/7/9' },
          { type: 'scale', degrees: [3, 6, 9], weight: 2, label: '3/6/9' },
        ],
      },
      5: {
        harmonicFunction: 'dominant',
        structures: [
          { type: 'scale', degrees: [3, 7], weight: 4, label: '3/7' },
          { type: 'scale', degrees: [3, 7, 9], weight: 3, label: '3/7/9' },
          { type: 'scale', degrees: [3, 7, 13], weight: 2, label: '3/7/13' },
        ],
      },
      6: {
        harmonicFunction: 'tonic',
        structures: [
          { type: 'scale', degrees: [3, 7], weight: 4, label: '3/7' },
          { type: 'scale', degrees: [3, 7, 9], weight: 3, label: '3/7/9' },
          { type: 'scale', degrees: [7, 9, 11], weight: 2, label: '7/9/11' },
        ],
      },
      7: {
        harmonicFunction: 'dominant',
        structures: [
          { type: 'scale', degrees: [3, 7], weight: 4, label: '3/7' },
          { type: 'scale', degrees: [3, 7, 9], weight: 3, label: '3/7/9' },
          { type: 'scale', degrees: [3, 9], weight: 2, label: '3/9' },
        ],
      },
    },
  },
];

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const rgbToHsb = (r: number, g: number, b: number): HsbColor => {
  const rn = clamp(r / 255, 0, 1);
  const gn = clamp(g / 255, 0, 1);
  const bn = clamp(b / 255, 0, 1);
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === rn) hue = ((gn - bn) / delta) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  const saturation = max === 0 ? 0 : delta / max;
  const brightness = max;
  return { h: hue, s: saturation, v: brightness };
};

export const normalizeVoiceInput = (rawValue: number, range: [number, number]) => {
  const min = Math.min(range[0], range[1]);
  const max = Math.max(range[0], range[1]);
  if (max === min) return 0;
  return clamp(((rawValue - min) / (max - min)) * 255, 0, 255);
};

const positiveModulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

export const getScaleStep = (normalizedValue: number, octaveSpan: number, degreeBias: number) => {
  const steps = Math.max(7, Math.floor(octaveSpan) * 7);
  return Math.floor((clamp(normalizedValue, 0, 255) / 255) * steps) + Math.trunc(degreeBias);
};

export const getSemitonesForScaleStep = (scale: Scale, scaleStep: number) => {
  const octave = Math.floor(scaleStep / 7);
  const noteIndex = positiveModulo(scaleStep, 7);
  return octave * 12 + scale.intervals[noteIndex];
};

export const getSemitones = (scale: Scale, normalizedValue: number, octaveSpan: number, degreeBias: number) => {
  return getSemitonesForScaleStep(scale, getScaleStep(normalizedValue, octaveSpan, degreeBias));
};

export const midiNoteToFrequency = (midiNote: number) => {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
};

export const midiNoteToName = (midiNote: number) => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const clamped = Math.max(0, Math.min(127, midiNote));
  const name = names[clamped % 12];
  const octave = Math.floor(clamped / 12) - 1;
  return `${name}${octave}`;
};

export const getMidiNote = (scale: Scale, normalizedValue: number, baseMidiNote: number, octaveSpan: number, degreeBias: number) => {
  const semitones = getSemitones(scale, normalizedValue, octaveSpan, degreeBias);
  return baseMidiNote + semitones;
};

export const getScaleDegree = (normalizedValue: number, octaveSpan: number, degreeBias: number) => {
  return positiveModulo(getScaleStep(normalizedValue, octaveSpan, degreeBias), 7) + 1;
};

export const getScaleDegreeForMidiNote = (scale: Scale, baseMidiNote: number, midiNote: number) => {
  const basePitchClass = positiveModulo(Math.round(baseMidiNote), 12);
  const notePitchClass = positiveModulo(Math.round(midiNote), 12);
  const intervalFromBase = positiveModulo(notePitchClass - basePitchClass, 12);
  const degreeIndex = scale.intervals.findIndex((interval) => positiveModulo(interval, 12) === intervalFromBase);

  return degreeIndex === -1 ? null : degreeIndex + 1;
};

const NOTE_PITCH_CLASSES: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

const CHORD_SYMBOL_PATTERN = /^([a-gA-G])([#b]?)(.*)$/;

const getScaleStepForMidiNote = (scale: Scale, baseMidiNote: number, midiNote: number) => {
  const intervalFromBase = positiveModulo(Math.round(midiNote) - Math.round(baseMidiNote), 12);
  const exactDegreeIndex = scale.intervals.findIndex((interval) => positiveModulo(interval, 12) === intervalFromBase);
  if (exactDegreeIndex !== -1) return exactDegreeIndex;

  return scale.intervals.reduce(
    (best, interval, index) => {
      const scaleInterval = positiveModulo(interval, 12);
      const ascendingDistance = positiveModulo(scaleInterval - intervalFromBase, 12);
      const descendingDistance = positiveModulo(intervalFromBase - scaleInterval, 12);
      const distance = Math.min(ascendingDistance, descendingDistance);

      if (distance < best.distance) return { index, distance };
      return best;
    },
    { index: 0, distance: Number.POSITIVE_INFINITY },
  ).index;
};

const normalizeChordSuffix = (suffix: string) => suffix.trim().replace(/\s+/g, '').toLowerCase();

const isMajorChordSuffix = (suffix: string) => suffix.startsWith('maj') || suffix.startsWith('ma');

const isMinorChordSuffix = (suffix: string) =>
  suffix.startsWith('min') || suffix.startsWith('-') || (suffix.startsWith('m') && !isMajorChordSuffix(suffix));

const chordTone = (interval: number, role: ToneRole): ChromaticTone => ({ interval, role });

const getManualChordTones = (normalizedSuffix: string): ChromaticTone[] => {
  const isAlt = normalizedSuffix.includes('alt');
  if (isAlt) {
    return [
      chordTone(0, 'root'),
      chordTone(4, 'third'),
      chordTone(10, 'seventh'),
      chordTone(13, 'flatNinth'),
      chordTone(15, 'sharpNinth'),
      chordTone(18, 'sharpEleventh'),
      chordTone(20, 'flatThirteenth'),
    ];
  }

  const hasMajorQuality = isMajorChordSuffix(normalizedSuffix);
  const hasMinorQuality = isMinorChordSuffix(normalizedSuffix);
  const hasSuspension = normalizedSuffix.includes('sus');
  const hasSixNine = normalizedSuffix.includes('6/9') || normalizedSuffix.includes('69');
  const hasThirteenth = normalizedSuffix.includes('13') || normalizedSuffix.includes('b13');
  const hasEleventh = normalizedSuffix.includes('11') || normalizedSuffix.includes('#11') || hasThirteenth;
  const hasNinth =
    normalizedSuffix.includes('9') ||
    normalizedSuffix.includes('b9') ||
    normalizedSuffix.includes('#9') ||
    hasEleventh ||
    hasThirteenth;
  const hasSeventh = !hasSixNine && (normalizedSuffix.includes('7') || hasNinth || hasEleventh || hasThirteenth);
  const tones: ChromaticTone[] = [chordTone(0, 'root')];

  tones.push(hasSuspension ? chordTone(5, 'eleventh') : chordTone(hasMinorQuality ? 3 : 4, 'third'));

  if (!normalizedSuffix.includes('no5')) {
    const fifthInterval = normalizedSuffix.includes('b5') ? 6 : normalizedSuffix.includes('#5') || normalizedSuffix.includes('+') ? 8 : 7;
    tones.push(chordTone(fifthInterval, 'fifth'));
  }

  if ((normalizedSuffix.includes('6') || hasSixNine) && !hasSeventh && !hasThirteenth) {
    tones.push(chordTone(9, 'sixth'));
  }

  if (hasSeventh) {
    tones.push(chordTone(hasMajorQuality ? 11 : 10, 'seventh'));
  }

  if (normalizedSuffix.includes('b9')) {
    tones.push(chordTone(13, 'flatNinth'));
  } else if (normalizedSuffix.includes('#9')) {
    tones.push(chordTone(15, 'sharpNinth'));
  } else if (hasNinth) {
    tones.push(chordTone(14, 'ninth'));
  }

  if (normalizedSuffix.includes('#11')) {
    tones.push(chordTone(18, 'sharpEleventh'));
  } else if (hasEleventh && !hasThirteenth) {
    tones.push(chordTone(17, 'eleventh'));
  }

  if (normalizedSuffix.includes('b13')) {
    tones.push(chordTone(20, 'flatThirteenth'));
  } else if (hasThirteenth) {
    tones.push(chordTone(21, 'thirteenth'));
  }

  return tones;
};

const getManualChordHarmonicFunction = (normalizedSuffix: string, scaleDegree: ScaleDegree): HarmonicFunction => {
  const hasDominantQuality =
    normalizedSuffix.includes('alt') ||
    (!isMajorChordSuffix(normalizedSuffix) && !isMinorChordSuffix(normalizedSuffix) && /(?:7|9|11|13)/.test(normalizedSuffix));

  if (hasDominantQuality || scaleDegree === 5 || scaleDegree === 7) return 'dominant';
  if (scaleDegree === 2 || scaleDegree === 4) return 'predominant';
  return 'tonic';
};

export const parseChordSymbol = (symbol: string, scale: Scale, baseMidiNote: number): ManualHarmonyChord | null => {
  const trimmedSymbol = symbol.trim();
  if (!trimmedSymbol) return null;

  const match = trimmedSymbol.match(CHORD_SYMBOL_PATTERN);
  if (!match) return null;

  const rootName = `${match[1].toUpperCase()}${match[2]}`;
  const rootPitchClass = NOTE_PITCH_CLASSES[rootName];
  if (rootPitchClass === undefined) return null;

  const basePitchClass = positiveModulo(Math.round(baseMidiNote), 12);
  const rootMidiNote = Math.round(clamp(baseMidiNote + positiveModulo(rootPitchClass - basePitchClass, 12), 0, 127));
  const scaleStep = getScaleStepForMidiNote(scale, baseMidiNote, rootMidiNote);
  const scaleDegree = (positiveModulo(scaleStep, 7) + 1) as ScaleDegree;
  const normalizedSuffix = normalizeChordSuffix(match[3]);
  const intervals = getManualChordTones(normalizedSuffix);

  return {
    symbol: trimmedSymbol,
    rootName,
    rootMidiNote,
    scaleStep,
    scaleDegree,
    harmonicFunction: getManualChordHarmonicFunction(normalizedSuffix, scaleDegree),
    structure: {
      type: 'chromatic',
      intervals,
      weight: 5,
      label: normalizedSuffix || 'major',
    },
  };
};

export const parseChordProgression = (
  progressionText: string,
  scale: Scale,
  baseMidiNote: number,
): ChordProgressionParseResult => {
  return progressionText
    .split(/[\s,;|]+/)
    .map((symbol) => symbol.trim())
    .filter(Boolean)
    .reduce(
      (result, symbol) => {
        const chord = parseChordSymbol(symbol, scale, baseMidiNote);
        if (chord) result.chords.push(chord);
        else result.invalidSymbols.push(symbol);

        return result;
      },
      { chords: [], invalidSymbols: [] } as ChordProgressionParseResult,
    );
};

export const getRawVoiceValue = (voiceId: VoiceId, r: number, g: number, b: number, hsb: HsbColor) => {
  switch (voiceId) {
    case 'r':
      return r;
    case 'g':
      return g;
    case 'b':
      return b;
    case 'h':
      return (clamp(hsb.h, 0, 360) / 360) * 255;
    case 's':
      return clamp(hsb.s, 0, 1) * 255;
    case 'v':
      return clamp(hsb.v, 0, 1) * 255;
    default:
      return 0;
  }
};

export const getClassicRgbDegree = (value: number) => getScaleDegree(value, DEFAULT_OCTAVE_SPAN, 0);

export const mapRawVoiceNotes = (
  voices: Array<Pick<VoiceDescriptor, 'id'>>,
  scale: Scale,
  voiceMappingConfig: VoiceMappingById,
  baseMidiNote: number,
  r: number,
  g: number,
  b: number,
  hsb: HsbColor,
): RawVoiceNote[] => {
  return voices.map((voice) => {
    const config = voiceMappingConfig[voice.id];
    const rawValue = getRawVoiceValue(voice.id, r, g, b, hsb);
    const normalizedValue = normalizeVoiceInput(rawValue, config.inputRange);
    const scaleStep = getScaleStep(normalizedValue, config.octaveSpan, config.degreeBias);
    const midiNote = baseMidiNote + getSemitonesForScaleStep(scale, scaleStep);

    return {
      voice: voice.id,
      rawValue,
      normalizedValue,
      midiNote: clamp(midiNote, 0, 127),
      scaleStep,
      scaleDegree: positiveModulo(scaleStep, 7) + 1,
    };
  });
};

export const getVoiceMidiNotes = (
  voices: Array<Pick<VoiceDescriptor, 'id'>>,
  scale: Scale,
  voiceMappingConfig: VoiceMappingById,
  baseMidiNote: number,
  r: number,
  g: number,
  b: number,
  hsb: HsbColor,
) => {
  return mapRawVoiceNotes(voices, scale, voiceMappingConfig, baseMidiNote, r, g, b, hsb).reduce((notes, voiceNote) => {
    notes[voiceNote.voice] = voiceNote.midiNote;
    return notes;
  }, {} as Record<VoiceId, number>);
};

const createEmptyVoiceNotes = (): VoiceNoteById => ({
  r: null,
  g: null,
  b: null,
  h: null,
  s: null,
  v: null,
});

const normalizeVoiceNotes = (notesByVoice: Partial<Record<VoiceId, number | null>>): VoiceNoteById => {
  const normalizedNotes = createEmptyVoiceNotes();
  VOICE_IDS.forEach((voiceId) => {
    const midiNote = notesByVoice[voiceId];
    normalizedNotes[voiceId] = midiNote === null || midiNote === undefined ? null : Math.round(clamp(midiNote, 0, 127));
  });

  return normalizedNotes;
};

const countMidiNotes = (notesByVoice: Partial<Record<VoiceId, number | null>>) => {
  return VOICE_IDS.reduce((counts, voiceId) => {
    const midiNote = notesByVoice[voiceId];
    if (midiNote === null || midiNote === undefined) return counts;

    const roundedMidiNote = Math.round(clamp(midiNote, 0, 127));
    counts.set(roundedMidiNote, (counts.get(roundedMidiNote) ?? 0) + 1);
    return counts;
  }, new Map<number, number>());
};

const pushRepeatedMidiNotes = (notes: number[], midiNote: number, count: number) => {
  for (let i = 0; i < count; i++) notes.push(midiNote);
};

export const getMidiNoteTransition = (
  currentNotesByVoice: Partial<Record<VoiceId, number | null>>,
  targetNotesByVoice: Partial<Record<VoiceId, number | null>>,
): MidiNoteTransition => {
  const nextNotesByVoice = normalizeVoiceNotes(targetNotesByVoice);
  const currentCounts = countMidiNotes(currentNotesByVoice);
  const targetCounts = countMidiNotes(nextNotesByVoice);
  const midiNotes = Array.from(new Set([...currentCounts.keys(), ...targetCounts.keys()])).sort((a, b) => a - b);
  const retainedNotes: number[] = [];
  const notesOff: number[] = [];
  const notesOn: number[] = [];

  midiNotes.forEach((midiNote) => {
    const currentCount = currentCounts.get(midiNote) ?? 0;
    const targetCount = targetCounts.get(midiNote) ?? 0;
    const retainedCount = Math.min(currentCount, targetCount);

    pushRepeatedMidiNotes(retainedNotes, midiNote, retainedCount);
    pushRepeatedMidiNotes(notesOff, midiNote, currentCount - retainedCount);
    pushRepeatedMidiNotes(notesOn, midiNote, targetCount - retainedCount);
  });

  return {
    nextNotesByVoice,
    retainedNotes,
    notesOff,
    notesOn,
  };
};

export const getMidiLegatoNoteOffPlan = (
  currentNotesByVoice: Partial<Record<VoiceId, number | null>>,
  targetNotesByVoice: Partial<Record<VoiceId, number | null>>,
  notesOff: number[],
): MidiLegatoNoteOffPlan => {
  const currentNotes = normalizeVoiceNotes(currentNotesByVoice);
  const targetNotes = normalizeVoiceNotes(targetNotesByVoice);
  const legatoOffCounts = VOICE_IDS.reduce((counts, voiceId) => {
    const currentNote = currentNotes[voiceId];
    const targetNote = targetNotes[voiceId];
    if (currentNote === null || targetNote === null || currentNote === targetNote) return counts;

    counts.set(currentNote, (counts.get(currentNote) ?? 0) + 1);
    return counts;
  }, new Map<number, number>());
  const immediateNotesOff: number[] = [];
  const delayedNotesOff: number[] = [];

  notesOff.forEach((note) => {
    const remainingLegatoCount = legatoOffCounts.get(note) ?? 0;
    if (remainingLegatoCount > 0) {
      delayedNotesOff.push(note);
      legatoOffCounts.set(note, remainingLegatoCount - 1);
      return;
    }

    immediateNotesOff.push(note);
  });

  return {
    immediateNotesOff,
    delayedNotesOff,
  };
};

const getHarmonyModel = (modelId: HarmonyModelId) => {
  return HARMONY_MODELS.find((model) => model.id === modelId) ?? HARMONY_MODELS[0];
};

const normalizeHarmonySettings = (settings: HarmonyEngineSettings): HarmonyEngineSettings => ({
  modelId: settings.modelId,
  gravity: clamp(settings.gravity, 0, 1),
  density: clamp(settings.density, 0, 1),
});

const normalizeVoicingSettings = (settings: VoicingSettings): VoicingSettings => {
  const minMidiNote = Math.round(clamp(Math.min(settings.minMidiNote, settings.maxMidiNote), 0, 127));
  const maxMidiNote = Math.round(clamp(Math.max(settings.minMidiNote, settings.maxMidiNote), 0, 127));

  return {
    strategyId: settings.strategyId,
    minMidiNote,
    maxMidiNote,
    maxOctaveShift: Math.max(0, Math.round(settings.maxOctaveShift / 12) * 12),
  };
};

const getPitchClass = (midiNote: number) => positiveModulo(Math.round(midiNote), 12);

const getScaleDegreeFromStep = (scaleStep: number): ScaleDegree => {
  return (positiveModulo(scaleStep, 7) + 1) as ScaleDegree;
};

const getToneRoleForScaleDegree = (relativeDegree: number): ToneRole => {
  const simpleDegree = positiveModulo(relativeDegree - 1, 7) + 1;
  if (simpleDegree === 1) return 'root';
  if (simpleDegree === 2) return 'ninth';
  if (simpleDegree === 3) return 'third';
  if (simpleDegree === 4) return 'eleventh';
  if (simpleDegree === 5) return 'fifth';
  if (simpleDegree === 6) return relativeDegree >= 13 ? 'thirteenth' : 'sixth';
  return 'seventh';
};

const getToneImportance = (model: HarmonyModel, role: ToneRole) => {
  return model.toneImportance?.[role] ?? 0.5;
};

const createPassThroughHarmonyResult = (
  rawVoices: RawVoiceNote[],
  settings: HarmonyEngineSettings,
  action: HarmonyAction = 'pass-through',
): HarmonyResult => {
  const voices = rawVoices.map((voiceNote) => ({
    ...voiceNote,
    outputMidiNote: voiceNote.midiNote,
    harmonyAction: action,
  }));

  const notesByVoice = voices.reduce((notes, voiceNote) => {
    notes[voiceNote.voice] = voiceNote.outputMidiNote;
    return notes;
  }, createEmptyVoiceNotes());

  return {
    modelId: settings.modelId,
    settings,
    rawVoices,
    voices,
    notesByVoice,
  };
};

const getPitchClassSupport = (rawVoices: RawVoiceNote[]) => {
  return rawVoices.reduce((support, voiceNote) => {
    const pitchClass = getPitchClass(voiceNote.midiNote);
    support.set(pitchClass, (support.get(pitchClass) ?? 0) + 1);
    return support;
  }, new Map<number, number>());
};

const chooseAnchor = (rawVoices: RawVoiceNote[], model: HarmonyModel): HarmonicAnchor | null => {
  if (rawVoices.length === 0) return null;

  const pitchClassSupport = getPitchClassSupport(rawVoices);
  const scaleDegreeSupport = rawVoices.reduce((support, voiceNote) => {
    const degree = getScaleDegreeFromStep(voiceNote.scaleStep);
    support.set(degree, (support.get(degree) ?? 0) + 1);
    return support;
  }, new Map<ScaleDegree, number>());

  const best = rawVoices.reduce(
    (currentBest, voiceNote, index) => {
      const scaleDegree = getScaleDegreeFromStep(voiceNote.scaleStep);
      const degreeSupport = scaleDegreeSupport.get(scaleDegree) ?? 0;
      const pitchSupport = pitchClassSupport.get(getPitchClass(voiceNote.midiNote)) ?? 0;
      const score = degreeSupport * 2 + pitchSupport - index / 100;

      if (!currentBest || score > currentBest.score) {
        return { voiceNote, score };
      }

      return currentBest;
    },
    null as { voiceNote: RawVoiceNote; score: number } | null,
  );

  if (!best) return null;

  const scaleDegree = getScaleDegreeFromStep(best.voiceNote.scaleStep);
  const harmonicFunction = model.degreeRules?.[scaleDegree]?.harmonicFunction ?? 'tonic';

  return {
    source: 'image',
    voice: best.voiceNote.voice,
    midiNote: best.voiceNote.midiNote,
    scaleStep: best.voiceNote.scaleStep,
    scaleDegree,
    harmonicFunction,
  };
};

const createManualAnchor = (manualChord: ManualHarmonyChord): HarmonicAnchor => ({
  source: 'manual-progression',
  symbol: manualChord.symbol,
  midiNote: manualChord.rootMidiNote,
  scaleStep: manualChord.scaleStep,
  scaleDegree: manualChord.scaleDegree,
  harmonicFunction: manualChord.harmonicFunction,
});

const buildTargetTones = (
  model: HarmonyModel,
  anchor: HarmonicAnchor,
  context: HarmonyContext,
  structure: HarmonyStructure,
  supportByPitchClass: Map<number, number>,
): HarmonicTargetTone[] => {
  if (structure.type === 'chromatic') {
    return structure.intervals.map((intervalRule) => {
      const interval = typeof intervalRule === 'number' ? intervalRule : intervalRule.interval;
      const midiNote = anchor.midiNote + interval;
      const pitchClass = getPitchClass(midiNote);
      const role = typeof intervalRule === 'number' ? (interval === 0 ? 'root' : 'ninth') : intervalRule.role;

      return {
        role,
        semitoneInterval: interval,
        pitchClass,
        importance: getToneImportance(model, role),
        support: supportByPitchClass.get(pitchClass) ?? 0,
      };
    });
  }

  return structure.degrees.map((relativeDegree) => {
    const role = getToneRoleForScaleDegree(relativeDegree);
    const scaleStep = anchor.scaleStep + relativeDegree - 1;
    const midiNote = context.baseMidiNote + getSemitonesForScaleStep(context.scale, scaleStep);
    const pitchClass = getPitchClass(midiNote);

    return {
      role,
      relativeDegree,
      pitchClass,
      importance: getToneImportance(model, role),
      support: supportByPitchClass.get(pitchClass) ?? 0,
    };
  });
};

const scoreStructure = (structure: HarmonyStructure, targetTones: HarmonicTargetTone[]) => {
  const supportScore = targetTones.reduce((sum, tone) => sum + tone.support * tone.importance, 0);
  const colorScore = targetTones.reduce((sum, tone) => sum + tone.importance, 0) / Math.max(1, targetTones.length);
  return structure.weight + supportScore + colorScore * 0.5;
};

const chooseStructure = (
  model: HarmonyModel,
  anchor: HarmonicAnchor,
  context: HarmonyContext,
  supportByPitchClass: Map<number, number>,
) => {
  const rule = model.degreeRules?.[anchor.scaleDegree] ?? model.degreeRules?.[1];
  const structures = rule?.structures ?? [];
  if (structures.length === 0) return null;

  return structures.reduce(
    (best, structure, index) => {
      const targetTones = buildTargetTones(model, anchor, context, structure, supportByPitchClass);
      const score = scoreStructure(structure, targetTones) - index / 1000;

      if (!best || score > best.score) {
        return { structure, targetTones, score };
      }

      return best;
    },
    null as { structure: HarmonyStructure; targetTones: HarmonicTargetTone[]; score: number } | null,
  );
};

const getMidiCandidatesForPitchClass = (pitchClass: number, minMidiNote: number, maxMidiNote: number) => {
  const candidates: number[] = [];
  for (let midiNote = getPitchClass(pitchClass); midiNote <= maxMidiNote; midiNote += 12) {
    if (midiNote >= minMidiNote) candidates.push(midiNote);
  }

  return candidates;
};

const getNearestMidiForPitchClass = (pitchClass: number, nearMidiNote: number) => {
  let bestNote = pitchClass;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let midiNote = pitchClass; midiNote <= 127; midiNote += 12) {
    const distance = Math.abs(midiNote - nearMidiNote);
    if (distance < bestDistance || (distance === bestDistance && midiNote < bestNote)) {
      bestNote = midiNote;
      bestDistance = distance;
    }
  }

  return bestNote;
};

const getNearestMidiForPitchClassInRange = (pitchClass: number, nearMidiNote: number, minMidiNote: number, maxMidiNote: number) => {
  return getMidiCandidatesForPitchClass(pitchClass, minMidiNote, maxMidiNote).reduce(
    (best, midiNote) => {
      const distance = Math.abs(midiNote - nearMidiNote);
      if (distance < best.distance || (distance === best.distance && midiNote < best.midiNote)) {
        return { midiNote, distance };
      }

      return best;
    },
    { midiNote: clamp(nearMidiNote, minMidiNote, maxMidiNote), distance: Number.POSITIVE_INFINITY },
  ).midiNote;
};

const getLowRegisterMinimumSpacing = (lowerMidiNote: number) => {
  if (lowerMidiNote < 48) return 7;
  if (lowerMidiNote < 55) return 5;
  if (lowerMidiNote < 60) return 3;
  return 1;
};

const getLowRegisterSpacingPenalty = (candidate: number, placedMidiNotes: number[]) => {
  return placedMidiNotes.reduce((penalty, placedMidiNote) => {
    const lowerMidiNote = Math.min(candidate, placedMidiNote);
    const upperMidiNote = Math.max(candidate, placedMidiNote);
    const distance = upperMidiNote - lowerMidiNote;
    const minimumSpacing = getLowRegisterMinimumSpacing(lowerMidiNote);

    if (distance >= minimumSpacing) return penalty;

    const spacingWeight = lowerMidiNote < 48 ? 6 : lowerMidiNote < 55 ? 4 : 2;
    return penalty + (minimumSpacing - distance) * spacingWeight;
  }, 0);
};

const findNearestTargetTone = (targetTones: HarmonicTargetTone[], midiNote: number) => {
  return targetTones.reduce(
    (best, tone) => {
      const outputMidiNote = getNearestMidiForPitchClass(tone.pitchClass, midiNote);
      const distance = Math.abs(outputMidiNote - midiNote);
      const score = distance - tone.importance * 0.1 - tone.support * 0.05;

      if (!best || score < best.score) {
        return { tone, outputMidiNote, distance, score };
      }

      return best;
    },
    null as { tone: HarmonicTargetTone; outputMidiNote: number; distance: number; score: number } | null,
  );
};

type VoiceCandidate = HarmonizedVoiceNote & {
  priority: number;
};

const scoreVoiceCandidate = (tone: HarmonicTargetTone | undefined, distance: number, voiceIndex: number, gravity: number) => {
  if (!tone) return -voiceIndex / 1000;
  return tone.importance * 2 + tone.support * (0.55 + gravity * 0.35) - distance / 12 - voiceIndex / 1000;
};

const applyDensityAndDeduplication = (
  candidates: VoiceCandidate[],
  density: number,
): HarmonizedVoiceNote[] => {
  const maxVoiceCount = Math.max(1, Math.min(candidates.length, Math.round(1 + density * (candidates.length - 1))));
  const selectedIndexes = new Set<number>();
  const usedPitchClasses = new Set<number>();

  candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.outputMidiNote !== null)
    .sort((a, b) => b.candidate.priority - a.candidate.priority)
    .forEach(({ candidate, index }) => {
      if (selectedIndexes.size >= maxVoiceCount || candidate.outputMidiNote === null) return;
      const pitchClass = getPitchClass(candidate.outputMidiNote);
      if (usedPitchClasses.has(pitchClass)) return;

      usedPitchClasses.add(pitchClass);
      selectedIndexes.add(index);
    });

  return candidates.map((candidate, index) => {
    const { priority: _priority, ...voiceNote } = candidate;
    if (candidate.outputMidiNote === null || selectedIndexes.has(index)) return voiceNote;

    return {
      ...voiceNote,
      outputMidiNote: null,
      harmonyAction: 'suppress',
    };
  });
};

const resolveModelHarmony = (
  rawVoices: RawVoiceNote[],
  model: HarmonyModel,
  settings: HarmonyEngineSettings,
  context: HarmonyContext,
): HarmonyResult => {
  if (settings.gravity <= 0.05 || !model.degreeRules) {
    return createPassThroughHarmonyResult(rawVoices, settings);
  }

  const supportByPitchClass = getPitchClassSupport(rawVoices);
  const anchor = context.manualChord ? createManualAnchor(context.manualChord) : chooseAnchor(rawVoices, model);
  if (!anchor) return createPassThroughHarmonyResult(rawVoices, settings);

  const selectedStructure = context.manualChord
    ? {
        structure: context.manualChord.structure,
        targetTones: buildTargetTones(model, anchor, context, context.manualChord.structure, supportByPitchClass),
        score: 0,
      }
    : chooseStructure(model, anchor, context, supportByPitchClass);
  if (!selectedStructure) return createPassThroughHarmonyResult(rawVoices, settings);

  const targetTones = selectedStructure.targetTones;
  const toneByPitchClass = new Map(targetTones.map((tone) => [tone.pitchClass, tone]));
  const remapLimit = 1 + Math.round(settings.gravity * 7);

  const candidates = rawVoices.map((voiceNote, index): VoiceCandidate => {
    const preservedTone = toneByPitchClass.get(getPitchClass(voiceNote.midiNote));
    if (preservedTone) {
      return {
        ...voiceNote,
        outputMidiNote: voiceNote.midiNote,
        harmonyRole: preservedTone.role,
        harmonyAction: 'preserve',
        priority: scoreVoiceCandidate(preservedTone, 0, index, settings.gravity),
      };
    }

    const nearestTone = findNearestTargetTone(targetTones, voiceNote.midiNote);
    if (!nearestTone || nearestTone.distance > remapLimit) {
      return {
        ...voiceNote,
        outputMidiNote: null,
        harmonyAction: 'suppress',
        priority: -index / 1000,
      };
    }

    return {
      ...voiceNote,
      outputMidiNote: nearestTone.outputMidiNote,
      harmonyRole: nearestTone.tone.role,
      harmonyAction: 'remap',
      priority: scoreVoiceCandidate(nearestTone.tone, nearestTone.distance, index, settings.gravity),
    };
  });

  const voices = applyDensityAndDeduplication(candidates, settings.density);
  const notesByVoice = voices.reduce((notes, voiceNote) => {
    notes[voiceNote.voice] = voiceNote.outputMidiNote;
    return notes;
  }, createEmptyVoiceNotes());

  return {
    modelId: settings.modelId,
    settings,
    rawVoices,
    voices,
    notesByVoice,
    anchor,
    targetTones,
  };
};

const chooseVoicedMidiNote = (
  outputMidiNote: number,
  previousMidiNote: number | null | undefined,
  settings: VoicingSettings,
  placedMidiNotes: number[] = [],
) => {
  const pitchClass = getPitchClass(outputMidiNote);
  const inRangeOutputMidiNote = getNearestMidiForPitchClassInRange(
    pitchClass,
    outputMidiNote,
    settings.minMidiNote,
    settings.maxMidiNote,
  );
  const candidates = getMidiCandidatesForPitchClass(pitchClass, settings.minMidiNote, settings.maxMidiNote);
  const octaveBoundedCandidates = candidates.filter(
    (candidate) => Math.abs(candidate - inRangeOutputMidiNote) <= settings.maxOctaveShift,
  );
  const availableCandidates = octaveBoundedCandidates.length > 0 ? octaveBoundedCandidates : candidates;
  const referenceMidiNote = previousMidiNote ?? inRangeOutputMidiNote;

  const selected = availableCandidates.reduce(
    (best, candidate) => {
      const motionCost = Math.abs(candidate - referenceMidiNote);
      const displacementCost = Math.abs(candidate - inRangeOutputMidiNote) * 0.15;
      const lowRegisterPenalty = candidate < 48 ? (48 - candidate) * 0.04 : 0;
      const spacingPenalty = getLowRegisterSpacingPenalty(candidate, placedMidiNotes);
      const score = motionCost + displacementCost + lowRegisterPenalty + spacingPenalty;

      if (
        score < best.score ||
        (score === best.score && Math.abs(candidate - inRangeOutputMidiNote) < Math.abs(best.midiNote - inRangeOutputMidiNote)) ||
        (score === best.score &&
          Math.abs(candidate - inRangeOutputMidiNote) === Math.abs(best.midiNote - inRangeOutputMidiNote) &&
          candidate < best.midiNote)
      ) {
        return { midiNote: candidate, score };
      }

      return best;
    },
    { midiNote: inRangeOutputMidiNote, score: Number.POSITIVE_INFINITY },
  ).midiNote;

  const voicingAction: VoicingAction =
    selected === outputMidiNote ? 'preserve' : outputMidiNote === inRangeOutputMidiNote ? 'octave-shift' : 'range-shift';

  return {
    outputMidiNote: selected,
    voicingAction,
  };
};

export const applyVoiceLeading = (
  harmonyResult: HarmonyResult,
  voicingContext: VoicingContext = {},
  voicingSettings: VoicingSettings = DEFAULT_VOICING_SETTINGS,
): HarmonyResult => {
  const settings = normalizeVoicingSettings(voicingSettings);
  if (settings.strategyId === 'none') return harmonyResult;

  const placedMidiNotes: number[] = [];
  const voicedNotesByVoice = new Map<VoiceId, { outputMidiNote: number; voicingAction: VoicingAction }>();

  harmonyResult.voices
    .map((voiceNote, index) => ({ voiceNote, index }))
    .filter(({ voiceNote }) => voiceNote.outputMidiNote !== null)
    .sort((a, b) => {
      const aNote = a.voiceNote.outputMidiNote ?? 0;
      const bNote = b.voiceNote.outputMidiNote ?? 0;
      if (aNote !== bNote) return aNote - bNote;
      return a.index - b.index;
    })
    .forEach(({ voiceNote }) => {
      if (voiceNote.outputMidiNote === null) return;
      const voicedNote = chooseVoicedMidiNote(
        voiceNote.outputMidiNote,
        voicingContext.previousNotesByVoice?.[voiceNote.voice],
        settings,
        placedMidiNotes,
      );

      placedMidiNotes.push(voicedNote.outputMidiNote);
      voicedNotesByVoice.set(voiceNote.voice, voicedNote);
    });

  const voices = harmonyResult.voices.map((voiceNote) => {
    const voicedNote = voicedNotesByVoice.get(voiceNote.voice);
    if (!voicedNote || voicedNote.voicingAction === 'preserve') return voiceNote;
    return {
      ...voiceNote,
      outputMidiNote: voicedNote.outputMidiNote,
      voicingAction: voicedNote.voicingAction,
    };
  });
  const notesByVoice = voices.reduce((notes, voiceNote) => {
    notes[voiceNote.voice] = voiceNote.outputMidiNote;
    return notes;
  }, createEmptyVoiceNotes());

  return {
    ...harmonyResult,
    voices,
    notesByVoice,
  };
};

export const resolveHarmony = (
  rawVoices: RawVoiceNote[],
  settings: HarmonyEngineSettings = DEFAULT_HARMONY_ENGINE_SETTINGS,
  context?: HarmonyContext,
  voicingContext?: VoicingContext,
  voicingSettings: VoicingSettings = DEFAULT_VOICING_SETTINGS,
): HarmonyResult => {
  const normalizedSettings = normalizeHarmonySettings(settings);
  const model = getHarmonyModel(normalizedSettings.modelId);

  if (model.id === 'off' || !context) {
    return createPassThroughHarmonyResult(rawVoices, normalizedSettings);
  }

  const harmonyResult = resolveModelHarmony(rawVoices, model, normalizedSettings, context);
  if (!voicingContext || !harmonyResult.anchor) return harmonyResult;

  return applyVoiceLeading(harmonyResult, voicingContext, voicingSettings);
};

export const getHarmonyResultForColor = (
  voices: Array<Pick<VoiceDescriptor, 'id'>>,
  scale: Scale,
  voiceMappingConfig: VoiceMappingById,
  baseMidiNote: number,
  harmonySettings: HarmonyEngineSettings,
  r: number,
  g: number,
  b: number,
  hsb: HsbColor,
  harmonyContext?: Partial<Pick<HarmonyContext, 'manualChord'>>,
  voicingContext?: VoicingContext,
  voicingSettings?: VoicingSettings,
) => {
  return resolveHarmony(
    mapRawVoiceNotes(voices, scale, voiceMappingConfig, baseMidiNote, r, g, b, hsb),
    harmonySettings,
    { scale, baseMidiNote, ...harmonyContext },
    voicingContext,
    voicingSettings,
  );
};
