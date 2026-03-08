import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Upload, Music, Settings2, Info, ChevronDown, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMidiOutput } from './useMidiOutput';

// --- Constants & Types ---

type Scale = {
  name: string;
  intervals: number[]; // semitones from root
};

type VoiceId = 'r' | 'g' | 'b' | 'h' | 's' | 'v';
type VoiceSource = 'rgb' | 'hsb';
type HsbColor = { h: number; s: number; v: number };

type VoiceDescriptor = {
  id: VoiceId;
  label: string;
  source: VoiceSource;
  defaultEnabled: boolean;
  detuneCents: number;
  gain: number;
};

type ActiveVoiceNote = {
  voice: VoiceId;
  note: number | null;
};

type VoiceMappingConfig = {
  enabled: boolean;
  inputRange: [number, number];
  octaveSpan: number;
  degreeBias: number;
};

type VoiceMappingById = Record<VoiceId, VoiceMappingConfig>;

type PedalPersonality = 'classic' | 'anchor' | 'inertia' | 'edge-walk';
type ControlPanelId = 'scale' | 'arp' | 'audio' | 'midi';

const SCALES: Scale[] = [
  { name: 'Ionian (Major)', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Aeolian (Minor)', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10] },
];

const DEFAULT_BASE_MIDI_NOTE = 48; // C3
const DEFAULT_MIDI_VELOCITY = 100;
const MELODIC_OSC_GAIN = 0.2;
const PEDAL_OSC_GAIN = 0.16;
const ARP_ACTIVE_GAIN = 0.4;
const DEFAULT_OCTAVE_SPAN = 3;
const MELODIC_VOICES: VoiceDescriptor[] = [
  { id: 'r', label: 'Red', source: 'rgb', defaultEnabled: true, detuneCents: -2.5, gain: MELODIC_OSC_GAIN },
  { id: 'g', label: 'Green', source: 'rgb', defaultEnabled: true, detuneCents: 0, gain: MELODIC_OSC_GAIN },
  { id: 'b', label: 'Blue', source: 'rgb', defaultEnabled: true, detuneCents: 2.5, gain: MELODIC_OSC_GAIN },
  { id: 'h', label: 'Hue', source: 'hsb', defaultEnabled: true, detuneCents: -1.5, gain: MELODIC_OSC_GAIN },
  { id: 's', label: 'Saturation', source: 'hsb', defaultEnabled: true, detuneCents: 1.5, gain: MELODIC_OSC_GAIN },
  { id: 'v', label: 'Brightness', source: 'hsb', defaultEnabled: true, detuneCents: 3.2, gain: MELODIC_OSC_GAIN },
];
const PEDAL_OSC_INDEX = MELODIC_VOICES.length;
const TOTAL_OSCILLATORS = MELODIC_VOICES.length + 1;
const PEDAL_OSC_DETUNE_CENTS = 1.2;
const PEDAL_PERSONALITIES: Array<{ value: PedalPersonality; label: string }> = [
  { value: 'classic', label: 'Classic' },
  { value: 'anchor', label: 'Anchor' },
  { value: 'inertia', label: 'Inertia' },
  { value: 'edge-walk', label: 'Edge-Walk' },
];

const BASE_NOTE_OPTIONS = Array.from({ length: 61 }, (_, i) => {
  const midiNote = 24 + i; // C1..C6
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = names[midiNote % 12];
  const octave = Math.floor(midiNote / 12) - 1;
  return {
    midiNote,
    label: `${noteName}${octave}`,
  };
});

const PRESETS = [
  { name: 'Warm dusk pad', gradient: 'linear-gradient(120deg, #1b1b3a 0%, #693668 35%, #a74482 65%, #f84aa7 100%)' },
  { name: 'Teal -> gold ribbon', gradient: 'linear-gradient(90deg, #0b1320 0%, #0ea5a5 40%, #f59e0b 75%, #fff1c1 100%)' },
  { name: 'Aurora bands', gradient: 'linear-gradient(180deg, #031926 0%, #0b7a75 33%, #00d1b2 55%, #f4f9e9 100%)' },
  { name: 'Bruised fruit', gradient: 'linear-gradient(135deg, #0b0f1a 0%, #3a0ca3 30%, #7209b7 55%, #f72585 100%)' },
  { name: 'Analog sunrise', gradient: 'linear-gradient(90deg, #140f2d 0%, #c92c6d 35%, #ff7a00 65%, #ffe29a 100%)' },
  { name: 'Ocean metal', gradient: 'linear-gradient(110deg, #0a0f14 0%, #12324a 45%, #2aa198 70%, #d0f0e8 100%)' },
  { name: 'Desert night', gradient: 'linear-gradient(145deg, #0d1b2a 0%, #415a77 35%, #e0a458 70%, #fef3c7 100%)' },
  { name: 'Triadic playground', gradient: 'conic-gradient(from 180deg, #ff005d, #00d4ff, #00ff85, #ffb703, #ff005d)' },
  { name: 'Soft grayscale + tint', gradient: 'linear-gradient(90deg, #101018 0%, #2a2a3a 35%, #7c7cff 70%, #f2f2ff 100%)' },
  { name: 'Scale walk', gradient: 'special:scale-walk' },
];

const PANEL_SHELL_CLASS = 'bg-white/5 rounded-xl p-4 border border-white/10';

// --- Helper Functions ---

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const rgbToHsb = (r: number, g: number, b: number): HsbColor => {
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

const getDefaultVoiceMappingConfig = (): VoiceMappingById =>
  MELODIC_VOICES.reduce((acc, voice) => {
    acc[voice.id] = {
      enabled: voice.defaultEnabled,
      inputRange: [0, 255],
      octaveSpan: DEFAULT_OCTAVE_SPAN,
      degreeBias: 0,
    };
    return acc;
  }, {} as VoiceMappingById);

const normalizeVoiceInput = (rawValue: number, range: [number, number]) => {
  const min = Math.min(range[0], range[1]);
  const max = Math.max(range[0], range[1]);
  if (max === min) return 0;
  return clamp(((rawValue - min) / (max - min)) * 255, 0, 255);
};

const getSemitones = (scale: Scale, normalizedValue: number, octaveSpan: number, degreeBias: number) => {
  // Map 0-255 to scale degrees over a configurable octave span.
  const steps = Math.max(7, Math.floor(octaveSpan) * 7);
  const degree = Math.floor((clamp(normalizedValue, 0, 255) / 255) * steps) + Math.trunc(degreeBias);
  const octave = Math.floor(degree / 7);
  const noteIndex = ((degree % 7) + 7) % 7;
  return octave * 12 + scale.intervals[noteIndex];
};

const midiNoteToFrequency = (midiNote: number) => {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
};

const midiNoteToName = (midiNote: number) => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const clamped = Math.max(0, Math.min(127, midiNote));
  const name = names[clamped % 12];
  const octave = Math.floor(clamped / 12) - 1;
  return `${name}${octave}`;
};

const getMidiNote = (scale: Scale, normalizedValue: number, baseMidiNote: number, octaveSpan: number, degreeBias: number) => {
  const semitones = getSemitones(scale, normalizedValue, octaveSpan, degreeBias);
  return baseMidiNote + semitones;
};

const getScaleDegree = (normalizedValue: number, octaveSpan: number, degreeBias: number) => {
  const steps = Math.max(7, Math.floor(octaveSpan) * 7);
  const degree = Math.floor((clamp(normalizedValue, 0, 255) / 255) * steps) + Math.trunc(degreeBias);
  return ((degree % 7) + 7) % 7 + 1;
};

const getDegreeFromSum = (sum: number) => {
  const clamped = Math.max(0, Math.min(765, sum));
  const degreeIndex = Math.min(6, Math.floor((clamped / 765) * 7));
  return degreeIndex + 1;
};

const getRepeatedDegree = (degrees: number[]) => {
  const degreeCounts = new Map<number, number>();
  degrees.forEach((degree) => {
    degreeCounts.set(degree, (degreeCounts.get(degree) ?? 0) + 1);
  });
  return degrees.find((degree) => (degreeCounts.get(degree) ?? 0) >= 2) ?? null;
};

const stepDegreeToward = (from: number, to: number) => {
  if (from === to) return from;
  return from < to ? from + 1 : from - 1;
};

const getClassicRgbDegree = (value: number) => getScaleDegree(value, DEFAULT_OCTAVE_SPAN, 0);

// --- Components ---

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [currentScale, setCurrentScale] = useState<Scale>(SCALES[0]);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [currentRGB, setCurrentRGB] = useState({ r: 0, g: 0, b: 0 });
  const [currentHSB, setCurrentHSB] = useState<HsbColor>({ h: 0, s: 0, v: 0 });
  const [isAudioStarted, setIsAudioStarted] = useState(false);
  const [isArpEnabled, setIsArpEnabled] = useState(false);
  const [arpIndex, setArpIndex] = useState(0);
  const [arpSpeed, setArpSpeed] = useState(150); // ms
  const [isCanvasPopulated, setIsCanvasPopulated] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<typeof PRESETS[0] | null>(null);
  const [disableWebAudioWithMidi, setDisableWebAudioWithMidi] = useState(true);
  const [baseMidiNote, setBaseMidiNote] = useState(DEFAULT_BASE_MIDI_NOTE);
  const [midiVelocity, setMidiVelocity] = useState(DEFAULT_MIDI_VELOCITY);
  const [isPedalToneEnabled, setIsPedalToneEnabled] = useState(false);
  const [pedalOctaveMultiplier, setPedalOctaveMultiplier] = useState<1 | 2 | 3>(1);
  const [pedalPersonality, setPedalPersonality] = useState<PedalPersonality>('classic');
  const [oscillatorVolume, setOscillatorVolume] = useState(50);
  const [voiceMappingConfig, setVoiceMappingConfig] = useState<VoiceMappingById>(() => getDefaultVoiceMappingConfig());
  const [openPanels, setOpenPanels] = useState<Record<ControlPanelId, boolean>>({
    scale: true,
    arp: false,
    audio: false,
    midi: false,
  });
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);

  const {
    enable: enableMidi,
    outputs: midiOutputs,
    selectedOutputId,
    setSelectedOutputId,
    status: midiStatus,
    error: midiError,
    sendNoteOn,
    sendNoteOff,
    panic,
  } = useMidiOutput();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);
  const masterGainRef = useRef<GainNode | null>(null);
  const activeMidiNotesRef = useRef<ActiveVoiceNote[]>(
    MELODIC_VOICES.map((voice) => ({ voice: voice.id, note: null })),
  );
  const latestMidiNotesRef = useRef<Record<VoiceId, number> | null>(null);
  const latestRgbRef = useRef<{ r: number; g: number; b: number } | null>(null);
  const previousMidiOutputRef = useRef<string>('');
  const activePedalNoteRef = useRef<number | null>(null);
  const pedalDegreeRef = useRef<number | null>(null);
  const pedalPersonalityMemoryRef = useRef({
    anchorCandidate: null as number | null,
    anchorCount: 0,
    inertiaCandidate: null as number | null,
    inertiaCount: 0,
    edgeFlip: false,
  });
  const shouldUseWebAudio = !(disableWebAudioWithMidi && midiStatus === 'ready');
  const webAudioTargetGain = oscillatorVolume / 100;
  const enabledVoiceIds = useMemo(
    () => MELODIC_VOICES.filter((voice) => voiceMappingConfig[voice.id].enabled).map((voice) => voice.id),
    [voiceMappingConfig],
  );

  // Initialize Audio
  const initAudio = useCallback(() => {
    if (audioCtxRef.current) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    masterGain.connect(ctx.destination);
    masterGainRef.current = masterGain;

    // Create oscillators for all melodic voices plus the pedal oscillator.
    for (let i = 0; i < TOTAL_OSCILLATORS; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const voice = MELODIC_VOICES[i];
      const isPedal = i === PEDAL_OSC_INDEX;

      osc.type = isPedal ? 'triangle' : 'square'; // sine | square | sawtooth | triangle
      osc.detune.setValueAtTime(isPedal ? PEDAL_OSC_DETUNE_CENTS : (voice?.detuneCents ?? 0), ctx.currentTime);
      gain.gain.setValueAtTime(isPedal ? 0 : (voice?.gain ?? MELODIC_OSC_GAIN), ctx.currentTime);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start();

      oscillatorsRef.current.push(osc);
      gainNodesRef.current.push(gain);
    }

    setIsAudioStarted(true);
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target?.result as string);
        setIsCanvasPopulated(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const loadPreset = (preset: (typeof PRESETS)[0]) => {
    setPendingPreset(preset);
    setIsCanvasPopulated(true);
    setImage(null);
  };

  const drawPreset = useCallback((preset: (typeof PRESETS)[0]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 800;
    canvas.height = 600;

    if (preset.gradient.includes('linear-gradient')) {
      const match = preset.gradient.match(/linear-gradient\(([^,]+),\s*(.*)\)/);
      if (match) {
        const angleStr = match[1];
        const stopsStr = match[2];
        const angle = parseInt(angleStr) || 0;

        const rad = (angle - 90) * (Math.PI / 180);
        const x1 = 400 - Math.cos(rad) * 400;
        const y1 = 300 - Math.sin(rad) * 300;
        const x2 = 400 + Math.cos(rad) * 400;
        const y2 = 300 + Math.sin(rad) * 300;

        const lingrad = ctx.createLinearGradient(x1, y1, x2, y2);

        const stops = stopsStr.split(/,(?![^()]*\))/).map((s) => s.trim());
        stops.forEach((stop) => {
          const parts = stop.split(' ');
          const color = parts[0];
          const pos = parts[1];
          if (color && pos) {
            lingrad.addColorStop(parseInt(pos, 10) / 100, color);
          }
        });

        ctx.fillStyle = lingrad;
        ctx.fillRect(0, 0, 800, 600);
      }
    } else if (preset.gradient.includes('conic-gradient')) {
      const grad = ctx.createConicGradient(Math.PI, 400, 300);
      grad.addColorStop(0, '#ff005d');
      grad.addColorStop(0.25, '#00d4ff');
      grad.addColorStop(0.5, '#00ff85');
      grad.addColorStop(0.75, '#ffb703');
      grad.addColorStop(1, '#ff005d');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 800, 600);
    } else if (preset.gradient === 'special:scale-walk') {
      const steps = 8; // 1-7 then back to 1
      const stepWidth = 800 / steps;

      // Helper to get RGB value for a specific scale degree (1-indexed)
      const getVal = (deg: number) => {
        const unit = 255 / 21;
        return Math.floor((deg - 1) * unit + unit / 2);
      };

      for (let i = 0; i < steps; i++) {
        const n = (i % 7) + 1;
        const r = getVal(n);
        const g = getVal(n + 2);
        const b = getVal(n + 4);

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(i * stepWidth, 0, stepWidth, 600);

        // Add a subtle divider
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.strokeRect(i * stepWidth, 0, stepWidth, 600);
      }
    }
  }, []);

  // Handle pending preset drawing
  useEffect(() => {
    if (isCanvasPopulated && pendingPreset && canvasRef.current) {
      drawPreset(pendingPreset);
      setPendingPreset(null);
    }
  }, [isCanvasPopulated, pendingPreset, drawPreset]);

  const resetPedalPersonalityState = useCallback(() => {
    pedalDegreeRef.current = null;
    pedalPersonalityMemoryRef.current = {
      anchorCandidate: null,
      anchorCount: 0,
      inertiaCandidate: null,
      inertiaCount: 0,
      edgeFlip: false,
    };
  }, []);

  const resolvePedalDegree = useCallback(
    (r: number, g: number, b: number, advanceState: boolean) => {
      if (!isPedalToneEnabled) return null;

      const degrees = [getClassicRgbDegree(r), getClassicRgbDegree(g), getClassicRgbDegree(b)];
      const repeatedDegree = getRepeatedDegree(degrees);
      const hasTonic = degrees.includes(1);
      const classicDegree = hasTonic ? 1 : repeatedDegree ?? getDegreeFromSum(r + g + b);
      const currentDegree = pedalDegreeRef.current;

      if (pedalPersonality === 'classic') {
        if (advanceState) {
          pedalDegreeRef.current = classicDegree;
        }
        return classicDegree;
      }

      if (!advanceState) {
        return currentDegree ?? classicDegree;
      }

      const memory = pedalPersonalityMemoryRef.current;
      let resolvedDegree = currentDegree ?? classicDegree;

      if (pedalPersonality === 'anchor') {
        if (currentDegree === null || hasTonic || classicDegree === currentDegree) {
          resolvedDegree = classicDegree;
          memory.anchorCandidate = null;
          memory.anchorCount = 0;
        } else {
          if (memory.anchorCandidate === classicDegree) {
            memory.anchorCount += 1;
          } else {
            memory.anchorCandidate = classicDegree;
            memory.anchorCount = 1;
          }

          if (memory.anchorCount >= 3) {
            resolvedDegree = classicDegree;
            memory.anchorCandidate = null;
            memory.anchorCount = 0;
          } else {
            resolvedDegree = currentDegree;
          }
        }
      }

      if (pedalPersonality === 'inertia') {
        if (currentDegree === null || hasTonic || classicDegree === currentDegree) {
          resolvedDegree = classicDegree;
          memory.inertiaCandidate = null;
          memory.inertiaCount = 0;
        } else {
          const distance = Math.abs(classicDegree - currentDegree);
          if (distance >= 2) {
            resolvedDegree = classicDegree;
            memory.inertiaCandidate = null;
            memory.inertiaCount = 0;
          } else {
            if (memory.inertiaCandidate === classicDegree) {
              memory.inertiaCount += 1;
            } else {
              memory.inertiaCandidate = classicDegree;
              memory.inertiaCount = 1;
            }
            resolvedDegree = memory.inertiaCount >= 2 ? classicDegree : currentDegree;
          }
        }
      }

      if (pedalPersonality === 'edge-walk') {
        if (currentDegree === null || hasTonic || repeatedDegree !== null) {
          resolvedDegree = classicDegree;
          memory.edgeFlip = false;
        } else {
          memory.edgeFlip = !memory.edgeFlip;
          resolvedDegree = memory.edgeFlip ? stepDegreeToward(currentDegree, classicDegree) : classicDegree;
        }
      }

      pedalDegreeRef.current = resolvedDegree;
      return resolvedDegree;
    },
    [isPedalToneEnabled, pedalPersonality],
  );

  const getRawVoiceValue = useCallback((voiceId: VoiceId, r: number, g: number, b: number, hsb: HsbColor) => {
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
  }, []);

  const getVoiceMidiNotes = useCallback(
    (r: number, g: number, b: number, hsb: HsbColor) => {
      return MELODIC_VOICES.reduce((notes, voice) => {
        const config = voiceMappingConfig[voice.id];
        const rawValue = getRawVoiceValue(voice.id, r, g, b, hsb);
        const normalizedValue = normalizeVoiceInput(rawValue, config.inputRange);
        const note = getMidiNote(
          currentScale,
          normalizedValue,
          baseMidiNote,
          config.octaveSpan,
          config.degreeBias,
        );
        notes[voice.id] = clamp(note, 0, 127);
        return notes;
      }, {} as Record<VoiceId, number>);
    },
    [baseMidiNote, currentScale, getRawVoiceValue, voiceMappingConfig],
  );

  const getPedalMidiNote = useCallback(
    (r: number, g: number, b: number, advanceState: boolean) => {
      const pedalDegree = resolvePedalDegree(r, g, b, advanceState);
      if (pedalDegree === null) return null;

      const semitones = currentScale.intervals[pedalDegree - 1];
      const baseNote = baseMidiNote + semitones;
      const octaveOffset = (pedalOctaveMultiplier - 1) * 12;
      return Math.max(0, Math.min(127, baseNote - octaveOffset));
    },
    [baseMidiNote, currentScale.intervals, pedalOctaveMultiplier, resolvePedalDegree],
  );
  const updateFrequencies = useCallback(
    (r: number, g: number, b: number, hsb: HsbColor) => {
      if (!audioCtxRef.current || !isAudioStarted || !shouldUseWebAudio) return;

      const midiNotes = getVoiceMidiNotes(r, g, b, hsb);
      const activeArpVoiceId = enabledVoiceIds.length > 0 ? enabledVoiceIds[arpIndex % enabledVoiceIds.length] : null;
      const now = audioCtxRef.current.currentTime;

      MELODIC_VOICES.forEach((voice, index) => {
        const osc = oscillatorsRef.current[index];
        const gain = gainNodesRef.current[index];
        const isEnabled = voiceMappingConfig[voice.id].enabled;
        if (!osc) return;

        osc.frequency.setTargetAtTime(midiNoteToFrequency(midiNotes[voice.id]), now, 0.05);
        if (!gain) return;

        if (!isEnabled) {
          gain.gain.setTargetAtTime(0, now, 0.05);
          return;
        }

        if (!isArpEnabled) {
          gain.gain.setTargetAtTime(voice.gain, now, 0.05);
          return;
        }

        if (activeArpVoiceId === null) {
          gain.gain.setTargetAtTime(0, now, 0.05);
        }
      });

      const pedalOsc = oscillatorsRef.current[PEDAL_OSC_INDEX];
      const pedalGain = gainNodesRef.current[PEDAL_OSC_INDEX];
      if (pedalOsc && pedalGain) {
        const pedalMidiNote = getPedalMidiNote(r, g, b, isMouseDown);
        if (pedalMidiNote === null) {
          pedalGain.gain.setTargetAtTime(0, now, 0.05);
        } else {
          pedalOsc.frequency.setTargetAtTime(midiNoteToFrequency(pedalMidiNote), now, 0.05);
          pedalGain.gain.setTargetAtTime(PEDAL_OSC_GAIN, now, 0.05);
        }
      }
    },
    [
      arpIndex,
      enabledVoiceIds,
      getPedalMidiNote,
      getVoiceMidiNotes,
      isArpEnabled,
      isAudioStarted,
      isMouseDown,
      shouldUseWebAudio,
      voiceMappingConfig,
    ],
  );

  const setVoiceMidiNote = useCallback(
    (voice: VoiceId, nextNote: number | null) => {
      const activeVoice = activeMidiNotesRef.current.find((entry) => entry.voice === voice);
      if (!activeVoice || activeVoice.note === nextNote) return;

      if (activeVoice.note !== null) {
        sendNoteOff(activeVoice.note);
      }
      if (nextNote !== null) {
        sendNoteOn(nextNote, midiVelocity);
      }
      activeVoice.note = nextNote;
    },
    [midiVelocity, sendNoteOff, sendNoteOn],
  );

  const clearActiveMidiNotes = useCallback(() => {
    activeMidiNotesRef.current.forEach((activeVoice) => {
      if (activeVoice.note !== null) {
        sendNoteOff(activeVoice.note);
        activeVoice.note = null;
      }
    });

    if (activePedalNoteRef.current !== null) {
      sendNoteOff(activePedalNoteRef.current);
      activePedalNoteRef.current = null;
    }
  }, [sendNoteOff]);

  const setPedalMidiNote = useCallback(
    (nextNote: number | null) => {
      if (activePedalNoteRef.current === nextNote) return;

      if (activePedalNoteRef.current !== null) {
        sendNoteOff(activePedalNoteRef.current);
      }
      if (nextNote !== null) {
        sendNoteOn(nextNote, midiVelocity);
      }
      activePedalNoteRef.current = nextNote;
    },
    [midiVelocity, sendNoteOff, sendNoteOn],
  );

  const applyMidiNotes = useCallback(
    (notes: Record<VoiceId, number>, pedalNote: number | null) => {
      const activeArpVoiceId = enabledVoiceIds.length > 0 ? enabledVoiceIds[arpIndex % enabledVoiceIds.length] : null;

      MELODIC_VOICES.forEach((voice) => {
        const isEnabled = voiceMappingConfig[voice.id].enabled;
        const nextNote = !isEnabled
          ? null
          : isArpEnabled
            ? voice.id === activeArpVoiceId
              ? notes[voice.id]
              : null
            : notes[voice.id];
        setVoiceMidiNote(voice.id, nextNote);
      });

      setPedalMidiNote(pedalNote);
    },
    [arpIndex, enabledVoiceIds, isArpEnabled, setPedalMidiNote, setVoiceMidiNote, voiceMappingConfig],
  );

  // Arpeggiator Loop
  useEffect(() => {
    if (enabledVoiceIds.length === 0) {
      setArpIndex(0);
      return;
    }
    setArpIndex((prev) => prev % enabledVoiceIds.length);
  }, [enabledVoiceIds.length]);

  useEffect(() => {
    if (!isArpEnabled || !isMouseDown || !isAudioStarted) {
      // Reset gains if arp is disabled but mouse is down (back to chord mode)
      if (!isArpEnabled && isMouseDown && audioCtxRef.current) {
        const now = audioCtxRef.current.currentTime;
        MELODIC_VOICES.forEach((voice, index) => {
          const gainNode = gainNodesRef.current[index];
          gainNode?.gain.setTargetAtTime(voiceMappingConfig[voice.id].enabled ? voice.gain : 0, now, 0.05);
        });
        const pedalGain = gainNodesRef.current[PEDAL_OSC_INDEX];
        if (pedalGain) {
          pedalGain.gain.setTargetAtTime(isPedalToneEnabled ? PEDAL_OSC_GAIN : 0, now, 0.05);
        }
      }
      return;
    }

    if (enabledVoiceIds.length === 0) return;

    const interval = setInterval(() => {
      setArpIndex((prev) => (prev + 1) % enabledVoiceIds.length);
    }, arpSpeed);

    return () => clearInterval(interval);
  }, [arpSpeed, enabledVoiceIds.length, isArpEnabled, isAudioStarted, isMouseDown, isPedalToneEnabled, voiceMappingConfig]);

  // Update gains based on arpIndex
  useEffect(() => {
    if (!isArpEnabled || !isMouseDown || !audioCtxRef.current) return;

    const activeArpVoiceId = enabledVoiceIds.length > 0 ? enabledVoiceIds[arpIndex % enabledVoiceIds.length] : null;
    const now = audioCtxRef.current.currentTime;
    MELODIC_VOICES.forEach((voice, index) => {
      const gainNode = gainNodesRef.current[index];
      if (!gainNode) return;
      const targetGain =
        voiceMappingConfig[voice.id].enabled && voice.id === activeArpVoiceId ? ARP_ACTIVE_GAIN : 0;
      gainNode.gain.setTargetAtTime(targetGain, now, 0.02);
    });

    const pedalGain = gainNodesRef.current[PEDAL_OSC_INDEX];
    if (pedalGain) {
      pedalGain.gain.setTargetAtTime(isPedalToneEnabled ? PEDAL_OSC_GAIN : 0, now, 0.02);
    }
  }, [arpIndex, enabledVoiceIds, isArpEnabled, isMouseDown, isPedalToneEnabled, voiceMappingConfig]);

  // Update MIDI note allocation when arp/chord mode changes.
  useEffect(() => {
    if (!isMouseDown || !latestMidiNotesRef.current || !latestRgbRef.current) return;
    const { r, g, b } = latestRgbRef.current;
    applyMidiNotes(latestMidiNotesRef.current, getPedalMidiNote(r, g, b, false));
  }, [applyMidiNotes, arpIndex, enabledVoiceIds, getPedalMidiNote, isArpEnabled, isMouseDown, pedalOctaveMultiplier, voiceMappingConfig]);

  const sampleColor = useCallback(
    (x: number, y: number, emitMidi: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const pixel = ctx.getImageData(x, y, 1, 1).data;
      const r = pixel[0];
      const g = pixel[1];
      const b = pixel[2];
      const hsb = rgbToHsb(r, g, b);

      setCurrentRGB({ r, g, b });
      setCurrentHSB(hsb);
      latestRgbRef.current = { r, g, b };
      updateFrequencies(r, g, b, hsb);

      if (!emitMidi) return;

      const midiNotes = getVoiceMidiNotes(r, g, b, hsb);
      latestMidiNotesRef.current = midiNotes;
      applyMidiNotes(midiNotes, getPedalMidiNote(r, g, b, true));
    },
    [applyMidiNotes, getPedalMidiNote, getVoiceMidiNotes, updateFrequencies],
  );

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);

    setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    sampleColor(x, y, isMouseDown);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    resetPedalPersonalityState();
    if (!isAudioStarted && shouldUseWebAudio) {
      initAudio();
    }

    if (shouldUseWebAudio && audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    setIsMouseDown(true);

    // Trigger initial sound
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);
      sampleColor(x, y, true);
    }

    if (shouldUseWebAudio && masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.setTargetAtTime(webAudioTargetGain, audioCtxRef.current.currentTime, 0.1);
    }
  };

  const handleMouseUp = useCallback(() => {
    setIsMouseDown(false);
    clearActiveMidiNotes();
    resetPedalPersonalityState();

    if (shouldUseWebAudio && masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.1);
    }
  }, [clearActiveMidiNotes, resetPedalPersonalityState, shouldUseWebAudio]);


  useEffect(() => {
    if (isMouseDown) return;
    resetPedalPersonalityState();
  }, [isMouseDown, isPedalToneEnabled, pedalPersonality, resetPedalPersonalityState]);
  useEffect(() => {
    if (previousMidiOutputRef.current && previousMidiOutputRef.current !== selectedOutputId) {
      clearActiveMidiNotes();
      panic();
    }
    previousMidiOutputRef.current = selectedOutputId;
  }, [clearActiveMidiNotes, panic, selectedOutputId]);

  useEffect(() => {
    if (midiStatus === 'ready' || midiStatus === 'no-outputs' || midiStatus === 'disabled') return;
    clearActiveMidiNotes();
    panic();
  }, [clearActiveMidiNotes, midiStatus, panic]);

  useEffect(() => {
    return () => {
      clearActiveMidiNotes();
      panic();
    };
  }, [clearActiveMidiNotes, panic]);

  useEffect(() => {
    if (!masterGainRef.current || !audioCtxRef.current) return;
    const now = audioCtxRef.current.currentTime;
    const targetGain = shouldUseWebAudio && isMouseDown ? webAudioTargetGain : 0;
    masterGainRef.current.gain.setTargetAtTime(targetGain, now, 0.05);
  }, [isMouseDown, shouldUseWebAudio, webAudioTargetGain]);

  useEffect(() => {
    if (image && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        // Maintain aspect ratio
        const maxWidth = 800;
        const maxHeight = 600;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);
      };
      img.src = image;
    }
  }, [image]);

  const midiStatusText: Record<string, string> = {
    disabled: 'disabled',
    ready: 'ready',
    'no-outputs': 'no outputs',
    error: 'error',
    unsupported: 'unsupported',
  };

  const setVoiceEnabled = useCallback((voiceId: VoiceId, enabled: boolean) => {
    setVoiceMappingConfig((prev) => ({
      ...prev,
      [voiceId]: {
        ...prev[voiceId],
        enabled,
      },
    }));
  }, []);

  const liveVoiceRows = useMemo(() => {
    return MELODIC_VOICES.map((voice) => {
      const config = voiceMappingConfig[voice.id];
      const rawValue = getRawVoiceValue(voice.id, currentRGB.r, currentRGB.g, currentRGB.b, currentHSB);
      const normalizedValue = normalizeVoiceInput(rawValue, config.inputRange);
      const midiNote = clamp(
        getMidiNote(currentScale, normalizedValue, baseMidiNote, config.octaveSpan, config.degreeBias),
        0,
        127,
      );
      return {
        id: voice.id,
        label: voice.label,
        source: voice.source,
        enabled: config.enabled,
        degree: getScaleDegree(normalizedValue, config.octaveSpan, config.degreeBias),
        noteName: midiNoteToName(midiNote),
      };
    });
  }, [baseMidiNote, currentHSB, currentRGB, currentScale, getRawVoiceValue, voiceMappingConfig]);

  const togglePanel = useCallback((panelId: ControlPanelId) => {
    setOpenPanels((prev) => ({
      ...prev,
      [panelId]: !prev[panelId],
    }));
  }, []);
  const isSidebarOpen = isSidebarPinned || isSidebarHovered;

  const renderPanelHeader = useCallback(
    (panelId: ControlPanelId, title: string, icon: React.ReactNode) => {
      const isOpen = openPanels[panelId];
      return (
        <button
          type="button"
          onClick={() => togglePanel(panelId)}
          className="w-full flex items-center justify-between gap-3 text-zinc-300 hover:text-zinc-100 transition-colors"
          aria-expanded={isOpen}
        >
          <div className="flex items-center gap-2 text-zinc-400">
            {icon}
            <h2 className="text-[11px] font-bold uppercase tracking-widest">{title}</h2>
          </div>
          <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      );
    },
    [openPanels, togglePanel],
  );

  const previewPedalDegree = resolvePedalDegree(currentRGB.r, currentRGB.g, currentRGB.b, false);
  const previewPedalSemitones = previewPedalDegree ? currentScale.intervals[previewPedalDegree - 1] : null;
  const previewPedalBaseNote = previewPedalSemitones !== null ? baseMidiNote + previewPedalSemitones : null;
  const previewPedalOctaveOffset = (pedalOctaveMultiplier - 1) * 12;
  const previewPedalMidiNote =
    previewPedalBaseNote !== null ? Math.max(0, Math.min(127, previewPedalBaseNote - previewPedalOctaveOffset)) : null;
  const previewPedalNoteName = previewPedalMidiNote !== null ? midiNoteToName(previewPedalMidiNote) : null;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight text-pink-400 drop-shadow-[0_0_8px_rgba(236,72,153,0.35)]">ChromaSyn</h1>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 px-4 py-2 bg-pink-500 hover:bg-pink-400 text-white rounded-lg cursor-pointer transition-all active:scale-95 font-medium text-sm border border-pink-300/80 shadow-[0_0_14px_rgba(236,72,153,0.45)]">
              <Upload className="w-4 h-4" />
              <span>Load Image</span>
              <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
            </label>
          </div>
        </div>
      </header>

      <div
        className={`fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-[300px] transition-transform duration-200 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-[calc(100%-28px)]'
        }`}
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
      >
        <aside
          className={`relative h-full bg-[#0b0b0b]/95 backdrop-blur-md border-r border-white/10 px-2.5 py-3 space-y-3 ${
            isSidebarOpen ? 'overflow-y-auto' : 'overflow-hidden'
          }`}
        >
          <button
            type="button"
            onClick={() => setIsSidebarPinned((prev) => !prev)}
            className="absolute right-0 top-[13px] h-10 w-7 rounded-l-md bg-pink-500 border border-pink-300/80 shadow-[0_0_14px_rgba(236,72,153,0.55)] flex items-center justify-center text-white hover:bg-pink-400 hover:shadow-[0_0_18px_rgba(244,114,182,0.75)]"
            title={isSidebarPinned ? 'Unpin Controls' : 'Pin Controls'}
            aria-label={isSidebarPinned ? 'Unpin Controls' : 'Pin Controls'}
          >
            {isSidebarPinned ? <Lock className="w-4 h-4" /> : isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {/* live data feed */}
          <section className={`${PANEL_SHELL_CLASS} space-y-3`}>
            <div className="flex items-center gap-2 text-zinc-400">
              <Info className="w-3.5 h-3.5" />
              <h2 className="text-[11px] font-bold uppercase tracking-widest">Live Data</h2>
            </div>
            <div className="space-y-1.5">
              {liveVoiceRows.map((voice) => (
                <div key={voice.id} className="bg-black/40 rounded-lg p-2 border border-white/5">
                  <div className="flex items-center justify-between text-[9px] uppercase text-zinc-500">
                    <span>{voice.label}</span>
                    <span>{voice.source}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between font-mono text-xs">
                    <span className="text-zinc-200">{voice.enabled ? voice.noteName : 'Muted'}</span>
                    <span className="text-emerald-400">Deg {voice.degree}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-white/5">
              <div className="text-[9px] text-zinc-500 uppercase mb-1 text-center">Pedal Tone</div>
              <div className="text-center font-mono text-xs text-zinc-200">
                {isPedalToneEnabled && previewPedalDegree && previewPedalNoteName ? `Degree ${previewPedalDegree} - ${previewPedalNoteName} (${pedalPersonality})` : 'Disabled'}
              </div>
            </div>
          </section>

          <section className={PANEL_SHELL_CLASS}>
            {renderPanelHeader('scale', 'Modal Scale', <Settings2 className="w-3.5 h-3.5" />)}
            {openPanels.scale && (
              <div className="mt-3 space-y-2.5">
                <select
                  value={currentScale.name}
                  onChange={(e) => {
                    const selected = SCALES.find((scale) => scale.name === e.target.value);
                    if (selected) setCurrentScale(selected);
                  }}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
                >
                  {SCALES.map((scale) => (
                    <option key={scale.name} value={scale.name}>
                      {scale.name}
                    </option>
                  ))}
                </select>
                <div className="space-y-1">
                  <div className="text-[9px] text-zinc-500 uppercase">Base Note (Freq + MIDI)</div>
                  <select
                    value={String(baseMidiNote)}
                    onChange={(e) => setBaseMidiNote(parseInt(e.target.value, 10))}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
                  >
                    {BASE_NOTE_OPTIONS.map((option) => (
                      <option key={option.midiNote} value={option.midiNote}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                  <span>Enable Pedal Tone</span>
                  <input
                    type="checkbox"
                    checked={isPedalToneEnabled}
                    onChange={(e) => setIsPedalToneEnabled(e.target.checked)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                </label>
                <div className="space-y-1">
                  <div className="text-[9px] text-zinc-500 uppercase">Pedal Octave</div>
                  <select
                    value={String(pedalOctaveMultiplier)}
                    onChange={(e) => setPedalOctaveMultiplier(parseInt(e.target.value, 10) as 1 | 2 | 3)}
                    disabled={!isPedalToneEnabled}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 disabled:text-zinc-500"
                  >
                    <option value="1">1x</option>
                    <option value="2">2x</option>
                    <option value="3">3x</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <div className="text-[9px] text-zinc-500 uppercase">Pedal Personality</div>
                  <select
                    value={pedalPersonality}
                    onChange={(e) => setPedalPersonality(e.target.value as PedalPersonality)}
                    disabled={!isPedalToneEnabled}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 disabled:text-zinc-500"
                  >
                    {PEDAL_PERSONALITIES.map((personality) => (
                      <option key={personality.value} value={personality.value}>
                        {personality.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pt-2 border-t border-white/5 space-y-1.5">
                  <div className="text-[9px] text-zinc-500 uppercase">HSB Voices</div>
                  <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                    <span>Hue Note</span>
                    <input
                      type="checkbox"
                      checked={voiceMappingConfig.h.enabled}
                      onChange={(e) => setVoiceEnabled('h', e.target.checked)}
                      className="h-4 w-4 accent-emerald-500"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                    <span>Saturation Note</span>
                    <input
                      type="checkbox"
                      checked={voiceMappingConfig.s.enabled}
                      onChange={(e) => setVoiceEnabled('s', e.target.checked)}
                      className="h-4 w-4 accent-emerald-500"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                    <span>Brightness Note</span>
                    <input
                      type="checkbox"
                      checked={voiceMappingConfig.v.enabled}
                      onChange={(e) => setVoiceEnabled('v', e.target.checked)}
                      className="h-4 w-4 accent-emerald-500"
                    />
                  </label>
                </div>
              </div>
            )}
          </section>

          <section className={PANEL_SHELL_CLASS}>
            {renderPanelHeader('arp', 'Arpeggiator', <Music className="w-3.5 h-3.5" />)}
            {openPanels.arp && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-300">
                  <span>Enabled</span>
                  <button
                    onClick={() => setIsArpEnabled(!isArpEnabled)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${isArpEnabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                  >
                    <motion.div animate={{ x: isArpEnabled ? 20 : 2 }} className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm" />
                  </button>
                </div>
                {isArpEnabled && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-[9px] text-zinc-500 uppercase">
                      <span>Speed</span>
                      <span>{arpSpeed}ms</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="500"
                      step="10"
                      value={arpSpeed}
                      onChange={(e) => setArpSpeed(parseInt(e.target.value, 10))}
                      className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex gap-1 justify-center">
                      {Array.from({ length: Math.max(1, enabledVoiceIds.length) }, (_, i) => i).map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors ${isMouseDown && arpIndex === i ? 'bg-emerald-400' : 'bg-zinc-800'}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className={PANEL_SHELL_CLASS}>
            {renderPanelHeader('audio', 'Audio Engine', <Music className="w-3.5 h-3.5" />)}
            {openPanels.audio && (
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-[9px] text-zinc-500 uppercase">
                  <span>Osc Volume</span>
                  <span>{oscillatorVolume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={oscillatorVolume}
                  onChange={(e) => setOscillatorVolume(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            )}
          </section>

          <section className={PANEL_SHELL_CLASS}>
            {renderPanelHeader('midi', 'MIDI Output', <Settings2 className="w-3.5 h-3.5" />)}
            {openPanels.midi && (
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => void enableMidi()}
                  className="w-full px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg transition-all active:scale-95 font-medium text-xs"
                >
                  Enable MIDI
                </button>
                <div className="space-y-1">
                  <div className="text-[9px] text-zinc-500 uppercase">Destination</div>
                  <select
                    value={selectedOutputId}
                    onChange={(e) => setSelectedOutputId(e.target.value)}
                    disabled={midiOutputs.length === 0}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 disabled:text-zinc-500"
                  >
                    {midiOutputs.length === 0 ? (
                      <option value="">No MIDI outputs</option>
                    ) : (
                      midiOutputs.map((output) => (
                        <option key={output.id} value={output.id}>
                          {output.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="text-[9px] text-zinc-500 uppercase">Status: {midiStatusText[midiStatus] ?? midiStatus}</div>
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
                  <span>Mute web audio when MIDI ready</span>
                  <input
                    type="checkbox"
                    checked={disableWebAudioWithMidi}
                    onChange={(e) => setDisableWebAudioWithMidi(e.target.checked)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                </label>
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] text-zinc-500 uppercase">
                    <span>MIDI Velocity</span>
                    <span>{midiVelocity}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="127"
                    step="1"
                    value={midiVelocity}
                    onChange={(e) => setMidiVelocity(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                {midiError && <div className="text-[11px] text-red-400">{midiError}</div>}
              </div>
            )}
          </section>
        </aside>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Canvas Area */}
        <div className="space-y-4">
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10 mb-4 overflow-x-auto">
            <div className="flex items-center gap-2 text-zinc-400 mb-3">
              <Settings2 className="w-3.5 h-3.5" />
              <h2 className="text-[10px] font-bold uppercase tracking-widest">Preset Gradients</h2>
            </div>
            <div className="flex gap-3 pb-2">
              {PRESETS.map((preset) => (
                <button key={preset.name} onClick={() => loadPreset(preset)} className="flex-shrink-0 group relative w-24 space-y-2 text-center">
                  <div
                    className="w-24 h-16 rounded-lg border border-white/10 shadow-lg transition-transform group-hover:scale-105 group-active:scale-95"
                    style={{ background: preset.gradient }}
                  />
                  <div className="text-[10px] text-zinc-500 font-medium leading-tight truncate w-full group-hover:text-zinc-300">{preset.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="relative group rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl min-h-[400px] flex items-center justify-center">
            {!isCanvasPopulated ? (
              <div className="text-center space-y-4 p-12">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-white/10">
                  <Upload className="w-8 h-8 text-zinc-600" />
                </div>
                <div>
                  <h3 className="text-xl font-medium text-zinc-300">No Image Loaded</h3>
                  <p className="text-zinc-500 text-sm mt-1">Upload an image to start playin</p>
                </div>
              </div>
            ) : (
              <div className="relative cursor-none touch-none">
                <canvas
                  ref={canvasRef}
                  onMouseMove={handleMouseMove}
                  onMouseDown={handleMouseDown}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  className="block max-w-full h-auto"
                />

                {/* Custom Cursor */}
                <motion.div
                  className="absolute pointer-events-none z-10"
                  animate={{ x: cursorPos.x, y: cursorPos.y }}
                  transition={{ type: 'spring', damping: 20, stiffness: 300, mass: 0.5 }}
                  style={{ left: -20, top: -20 }}
                >
                  <div
                    className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                      isMouseDown
                        ? 'scale-125 border-emerald-400 bg-emerald-400/20 shadow-[0_0_20px_rgba(52,211,153,0.4)]'
                        : 'border-white/50 bg-white/10'
                    }`}
                  >
                    <div className="w-1 h-1 bg-white rounded-full" />
                  </div>
                </motion.div>

                {/* Floating Info Overlay */}
                <AnimatePresence>
                  {isMouseDown && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/80 backdrop-blur-md border border-white/10 rounded-full flex items-center gap-4 text-xs font-mono pointer-events-none"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        <span>{currentRGB.r}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span>{currentRGB.g}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span>{currentRGB.b}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[10px] text-zinc-600 uppercase tracking-widest px-2">
            <span>
              Canvas Resolution: {canvasRef.current?.width || 0}x{canvasRef.current?.height || 0}
            </span>
            <span>
              Audio Status:{' '}
              {shouldUseWebAudio ? (isAudioStarted ? 'Ready' : 'Waiting for Interaction') : 'Muted (MIDI Active)'}
            </span>
          </div>
        </div>
      </main>

      {/* Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}


























