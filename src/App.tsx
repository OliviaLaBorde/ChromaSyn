import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Upload, Music, Settings2, Info, ChevronDown, SlidersHorizontal, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMidiOutput } from './useMidiOutput';
import {
  DEFAULT_HARMONY_ENGINE_SETTINGS,
  DEFAULT_OCTAVE_SPAN,
  HARMONY_MODELS,
  SCALES,
  clamp,
  getClassicRgbDegree,
  getHarmonyResultForColor,
  getMidiLegatoNoteOffPlan,
  getMidiNoteTransition,
  getScaleDegreeForMidiNote,
  midiNoteToFrequency,
  midiNoteToName,
  parseChordProgression,
  rgbToHsb,
  type HarmonyEngineSettings,
  type HarmonyModelId,
  type HarmonyResult,
  type HsbColor,
  type Scale,
  type VoiceDescriptor,
  type VoiceId,
  type VoiceMappingById,
  type VoiceNoteById,
  type VoicingContext,
} from './musicEngine';

// --- Constants & Types ---

type ActiveVoiceNote = {
  voice: VoiceId;
  note: number | null;
};

type PendingMidiNoteOff = {
  id: number;
  note: number;
  timeoutId: number;
};

type HarmonySourceMode = 'image' | 'manual-progression';
type PedalPersonality = 'classic' | 'anchor' | 'inertia' | 'edge-walk';
type ControlPanelId = 'scale' | 'arp' | 'audio' | 'midi';
type FilterMode = 'lowpass' | 'highpass';
type AdsrSettings = {
  attackMs: number;
  decayMs: number;
  sustainLevel: number;
  releaseMs: number;
};

const DEFAULT_BASE_MIDI_NOTE = 48; // C3
const DEFAULT_MIDI_VELOCITY = 100;
const DEFAULT_MIDI_LEGATO_OVERLAP_MS = 35;
const DEFAULT_MANUAL_PROGRESSION = 'Dm9\nG13\nCmaj9\nA7alt';
const MELODIC_OSC_GAIN = 0.2;
const PEDAL_OSC_GAIN = 0.16;
const ARP_ACTIVE_GAIN = 0.4;
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
  { name: 'Dusk', gradient: 'linear-gradient(120deg, #1b1b3a 0%, #693668 35%, #a74482 65%, #f84aa7 100%)' },
  { name: 'Golden Teal Bands', gradient: 'linear-gradient(90deg, #0b1320 0%, #0ea5a5 40%, #f59e0b 75%, #fff1c1 100%)' },
  { name: 'Aurora bands', gradient: 'linear-gradient(180deg, #031926 0%, #0b7a75 33%, #00d1b2 55%, #f4f9e9 100%)' },
  { name: 'Bruised', gradient: 'linear-gradient(135deg, #0b0f1a 0%, #3a0ca3 30%, #7209b7 55%, #f72585 100%)' },
  { name: 'Sunrise', gradient: 'linear-gradient(90deg, #140f2d 0%, #c92c6d 35%, #ff7a00 65%, #ffe29a 100%)' },
  { name: 'Ocean', gradient: 'linear-gradient(110deg, #0a0f14 0%, #12324a 45%, #2aa198 70%, #d0f0e8 100%)' },
  { name: 'MidnightDesert', gradient: 'linear-gradient(145deg, #0d1b2a 0%, #415a77 35%, #e0a458 70%, #fef3c7 100%)' },
  { name: 'Triadic playground', gradient: 'conic-gradient(from 180deg, #ff005d, #00d4ff, #00ff85, #ffb703, #ff005d)' },
  { name: 'Tinted grayscale', gradient: 'linear-gradient(90deg, #101018 0%, #2a2a3a 35%, #7c7cff 70%, #f2f2ff 100%)' },
  { name: 'Scale Walker', gradient: 'special:scale-walk' },
];
const PRESET_HOTKEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'] as const;

const PANEL_SHELL_CLASS = 'bg-white/5 rounded-xl p-4 border border-white/10';
const OSCILLATOR_TYPE_OPTIONS: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle'];
const DEFAULT_ADSR: AdsrSettings = {
  attackMs: 20,
  decayMs: 1500,
  sustainLevel: 1,
  releaseMs: 260,
};
const ADSR_PRESETS: Array<{ name: string; values: AdsrSettings }> = [
  { name: 'Pluck', values: { attackMs: 5, decayMs: 120, sustainLevel: 0.2, releaseMs: 90 } },
  { name: 'Pad', values: { attackMs: 180, decayMs: 320, sustainLevel: 0.72, releaseMs: 520 } },
  { name: 'Organ', values: { attackMs: 8, decayMs: 40, sustainLevel: 0.92, releaseMs: 120 } },
  { name: 'Swell', values: { attackMs: 420, decayMs: 280, sustainLevel: 0.78, releaseMs: 700 } },
];

// --- Helper Functions ---

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

const isKeyboardInputTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element) return false;

  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || element.isContentEditable;
};

// --- Components ---

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [currentScale, setCurrentScale] = useState<Scale>(SCALES[0]);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [isSustainKeyDown, setIsSustainKeyDown] = useState(false);
  const [isSustainLatched, setIsSustainLatched] = useState(false);
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
  const [isMidiLegatoEnabled, setIsMidiLegatoEnabled] = useState(false);
  const [midiLegatoOverlapMs, setMidiLegatoOverlapMs] = useState(DEFAULT_MIDI_LEGATO_OVERLAP_MS);
  const [isPedalToneEnabled, setIsPedalToneEnabled] = useState(false);
  const [pedalOctaveMultiplier, setPedalOctaveMultiplier] = useState<1 | 2 | 3>(1);
  const [pedalPersonality, setPedalPersonality] = useState<PedalPersonality>('classic');
  const [oscillatorVolume, setOscillatorVolume] = useState(50);
  const [oscillatorType, setOscillatorType] = useState<OscillatorType>('sawtooth');
  const [isMasterFilterEnabled, setIsMasterFilterEnabled] = useState(false);
  const [masterFilterMode, setMasterFilterMode] = useState<FilterMode>('lowpass');
  const [masterFilterCutoff, setMasterFilterCutoff] = useState(1800);
  const [masterFilterResonance, setMasterFilterResonance] = useState(1);
  const [adsr, setAdsr] = useState<AdsrSettings>(DEFAULT_ADSR);
  const [harmonyModelId, setHarmonyModelId] = useState<HarmonyModelId>(DEFAULT_HARMONY_ENGINE_SETTINGS.modelId);
  const [harmonyGravity, setHarmonyGravity] = useState(DEFAULT_HARMONY_ENGINE_SETTINGS.gravity);
  const [harmonySourceMode, setHarmonySourceMode] = useState<HarmonySourceMode>('image');
  const [manualProgressionText, setManualProgressionText] = useState(DEFAULT_MANUAL_PROGRESSION);
  const [manualProgressionIndex, setManualProgressionIndex] = useState(0);
  const [voiceMappingConfig, setVoiceMappingConfig] = useState<VoiceMappingById>(() => getDefaultVoiceMappingConfig());
  const [openPanels, setOpenPanels] = useState<Record<ControlPanelId, boolean>>({
    scale: true,
    arp: false,
    audio: false,
    midi: false,
  });
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isPresetBrowserOpen, setIsPresetBrowserOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
  const setupRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (isSetupOpen) setupRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [isSetupOpen]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);
  const masterFilterRef = useRef<BiquadFilterNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const activeMidiNotesRef = useRef<ActiveVoiceNote[]>(
    MELODIC_VOICES.map((voice) => ({ voice: voice.id, note: null })),
  );
  const latestHarmonyResultRef = useRef<HarmonyResult | null>(null);
  const latestRgbRef = useRef<{ r: number; g: number; b: number } | null>(null);
  const previousMidiOutputRef = useRef<string>('');
  const activePedalNoteRef = useRef<number | null>(null);
  const pendingMidiNoteOffsRef = useRef<PendingMidiNoteOff[]>([]);
  const pendingMidiNoteOffIdRef = useRef(0);
  const heldVoiceNotesRef = useRef<Partial<Record<VoiceId, number>> | null>(null);
  const heldPedalNoteRef = useRef<number | null>(null);
  const voiceGateStateRef = useRef<boolean[]>(Array.from({ length: TOTAL_OSCILLATORS }, () => false));
  const toastTimeoutRef = useRef<number | null>(null);
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
  const shouldKeepNotesActive = isMouseDown || isSustainLatched;
  const shouldFreezeArp = isSustainLatched;
  const selectedHarmonyModel = useMemo(
    () => HARMONY_MODELS.find((model) => model.id === harmonyModelId) ?? HARMONY_MODELS[0],
    [harmonyModelId],
  );
  const harmonySettings = useMemo<HarmonyEngineSettings>(
    () => ({
      ...DEFAULT_HARMONY_ENGINE_SETTINGS,
      modelId: harmonyModelId,
      gravity: harmonyGravity,
      density: selectedHarmonyModel.defaultDensity,
    }),
    [harmonyGravity, harmonyModelId, selectedHarmonyModel.defaultDensity],
  );
  const manualProgression = useMemo(
    () => parseChordProgression(manualProgressionText, currentScale, baseMidiNote),
    [baseMidiNote, currentScale, manualProgressionText],
  );
  const activeManualChord =
    harmonySourceMode === 'manual-progression' && manualProgression.chords.length > 0
      ? manualProgression.chords[manualProgressionIndex % manualProgression.chords.length]
      : undefined;
  const enabledVoiceIds = useMemo(
    () => MELODIC_VOICES.filter((voice) => voiceMappingConfig[voice.id].enabled).map((voice) => voice.id),
    [voiceMappingConfig],
  );

  const advanceManualProgression = useCallback(() => {
    if (manualProgression.chords.length === 0) return;
    setManualProgressionIndex((prev) => (prev + 1) % manualProgression.chords.length);
  }, [manualProgression.chords.length]);

  const resetManualProgression = useCallback(() => {
    setManualProgressionIndex(0);
  }, []);

  useEffect(() => {
    setManualProgressionIndex((prev) => {
      if (manualProgression.chords.length === 0) return 0;
      return prev % manualProgression.chords.length;
    });
  }, [manualProgression.chords.length]);

  useEffect(() => {
    if (harmonySourceMode !== 'manual-progression') return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isKeyboardInputTarget(event.target)) return;

      if (event.key === ']') {
        event.preventDefault();
        advanceManualProgression();
      } else if (event.key === '[') {
        event.preventDefault();
        resetManualProgression();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [advanceManualProgression, harmonySourceMode, resetManualProgression]);

  // Initialize Audio
  const initAudio = useCallback(() => {
    if (audioCtxRef.current) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    const masterFilter = ctx.createBiquadFilter();
    masterFilter.type = 'allpass';
    masterFilter.frequency.setValueAtTime(masterFilterCutoff, ctx.currentTime);
    masterFilter.Q.setValueAtTime(masterFilterResonance, ctx.currentTime);
    masterFilter.connect(masterGain);
    masterGain.connect(ctx.destination);
    masterFilterRef.current = masterFilter;
    masterGainRef.current = masterGain;

    // Create oscillators for all melodic voices plus the pedal oscillator.
    for (let i = 0; i < TOTAL_OSCILLATORS; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const voice = MELODIC_VOICES[i];
      const isPedal = i === PEDAL_OSC_INDEX;

      osc.type = isPedal ? 'triangle' : oscillatorType; // sine | square | sawtooth | triangle
      osc.detune.setValueAtTime(isPedal ? PEDAL_OSC_DETUNE_CENTS : (voice?.detuneCents ?? 0), ctx.currentTime);
      gain.gain.setValueAtTime(isPedal ? 0 : (voice?.gain ?? MELODIC_OSC_GAIN), ctx.currentTime);

      osc.connect(gain);
      gain.connect(masterFilter);
      osc.start();

      oscillatorsRef.current.push(osc);
      gainNodesRef.current.push(gain);
    }

    setIsAudioStarted(true);
  }, [masterFilterCutoff, masterFilterResonance, oscillatorType]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const nextImage = event.target?.result as string;
        setUploadedImage(nextImage);
        setImage(nextImage);
        setIsCanvasPopulated(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const loadPreset = useCallback((preset: (typeof PRESETS)[0]) => {
    setPendingPreset(preset);
    setIsCanvasPopulated(true);
    setImage(null);
  }, []);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 1800);
  }, []);

  const switchToUploadedImage = useCallback(() => {
    if (!uploadedImage) {
      showToast('No uploaded image available.');
      return;
    }
    setPendingPreset(null);
    setImage(uploadedImage);
    setIsCanvasPopulated(true);
  }, [showToast, uploadedImage]);

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (isKeyboardInputTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === 'a') {
        event.preventDefault();
        switchToUploadedImage();
        return;
      }

      const presetIndex = PRESET_HOTKEYS.indexOf(key as (typeof PRESET_HOTKEYS)[number]);
      if (presetIndex < 0) return;

      const preset = PRESETS[presetIndex];
      if (!preset) return;

      event.preventDefault();
      loadPreset(preset);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loadPreset, switchToUploadedImage]);

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

  const getCurrentHarmonyResult = useCallback(
    (r: number, g: number, b: number, hsb: HsbColor, voicingContext?: VoicingContext) => {
      return getHarmonyResultForColor(
        MELODIC_VOICES,
        currentScale,
        voiceMappingConfig,
        baseMidiNote,
        harmonySettings,
        r,
        g,
        b,
        hsb,
        activeManualChord ? { manualChord: activeManualChord } : undefined,
        voicingContext,
      );
    },
    [activeManualChord, baseMidiNote, currentScale, harmonySettings, voiceMappingConfig],
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

  const gateOnVoice = useCallback(
    (index: number, targetGain: number, now: number, retrigger = false) => {
      const gainNode = gainNodesRef.current[index];
      if (!gainNode) return;

      const attackSec = Math.max(0.001, adsr.attackMs / 1000);
      const decaySec = Math.max(0.001, adsr.decayMs / 1000);
      const sustainGain = clamp(adsr.sustainLevel, 0, 1) * targetGain;
      const gainParam = gainNode.gain;
      const currentValue = gainParam.value;

      gainParam.cancelScheduledValues(now);
      gainParam.setValueAtTime(retrigger ? 0 : currentValue, now);
      gainParam.linearRampToValueAtTime(targetGain, now + attackSec);
      gainParam.linearRampToValueAtTime(sustainGain, now + attackSec + decaySec);

      voiceGateStateRef.current[index] = true;
    },
    [adsr.attackMs, adsr.decayMs, adsr.sustainLevel],
  );

  const gateOffVoice = useCallback(
    (index: number, now: number) => {
      const gainNode = gainNodesRef.current[index];
      if (!gainNode) return;

      const releaseSec = Math.max(0.001, adsr.releaseMs / 1000);
      const gainParam = gainNode.gain;
      const currentValue = gainParam.value;

      gainParam.cancelScheduledValues(now);
      gainParam.setValueAtTime(currentValue, now);
      gainParam.linearRampToValueAtTime(0, now + releaseSec);

      voiceGateStateRef.current[index] = false;
    },
    [adsr.releaseMs],
  );

  const releaseAllAudioVoices = useCallback(
    (now?: number) => {
      const audioCtx = audioCtxRef.current;
      if (!audioCtx) return;
      const releaseAt = now ?? audioCtx.currentTime;
      for (let i = 0; i < TOTAL_OSCILLATORS; i++) {
        if (voiceGateStateRef.current[i]) {
          gateOffVoice(i, releaseAt);
        }
      }
    },
    [gateOffVoice],
  );

  const cancelPendingMidiNoteOff = useCallback((note: number) => {
    const pendingIndex = pendingMidiNoteOffsRef.current.findIndex((pendingNoteOff) => pendingNoteOff.note === note);
    if (pendingIndex === -1) return false;

    const [pendingNoteOff] = pendingMidiNoteOffsRef.current.splice(pendingIndex, 1);
    window.clearTimeout(pendingNoteOff.timeoutId);
    return true;
  }, []);

  const scheduleMidiNoteOff = useCallback(
    (note: number) => {
      const id = pendingMidiNoteOffIdRef.current + 1;
      pendingMidiNoteOffIdRef.current = id;
      const timeoutId = window.setTimeout(() => {
        const pendingIndex = pendingMidiNoteOffsRef.current.findIndex((pendingNoteOff) => pendingNoteOff.id === id);
        if (pendingIndex === -1) return;

        pendingMidiNoteOffsRef.current.splice(pendingIndex, 1);
        sendNoteOff(note);
      }, midiLegatoOverlapMs);

      pendingMidiNoteOffsRef.current.push({ id, note, timeoutId });
    },
    [midiLegatoOverlapMs, sendNoteOff],
  );

  const flushPendingMidiNoteOffs = useCallback(() => {
    const pendingNoteOffs = pendingMidiNoteOffsRef.current.splice(0);
    pendingNoteOffs.forEach((pendingNoteOff) => {
      window.clearTimeout(pendingNoteOff.timeoutId);
      sendNoteOff(pendingNoteOff.note);
    });
  }, [sendNoteOff]);

  const updateFrequencies = useCallback(
    (harmonyResult: HarmonyResult, r: number, g: number, b: number) => {
      if (!audioCtxRef.current || !isAudioStarted || !shouldUseWebAudio) return;

      const activeArpVoiceId = enabledVoiceIds.length > 0 ? enabledVoiceIds[arpIndex % enabledVoiceIds.length] : null;
      const now = audioCtxRef.current.currentTime;

      MELODIC_VOICES.forEach((voice, index) => {
        const osc = oscillatorsRef.current[index];
        const isEnabled = voiceMappingConfig[voice.id].enabled;
        const nextNote = harmonyResult.notesByVoice[voice.id];
        if (!osc) return;

        if (nextNote !== null) {
          osc.frequency.setTargetAtTime(midiNoteToFrequency(nextNote), now, 0.05);
        }

        const shouldBeActive = isEnabled && nextNote !== null && (!isArpEnabled ? shouldKeepNotesActive : activeArpVoiceId === voice.id);
        const isActive = voiceGateStateRef.current[index];

        if (shouldBeActive) {
          if (!isActive) {
            gateOnVoice(index, voice.gain, now);
          }
        } else if (isActive) {
          gateOffVoice(index, now);
        }
      });

      const pedalOsc = oscillatorsRef.current[PEDAL_OSC_INDEX];
      if (pedalOsc) {
        const pedalMidiNote = getPedalMidiNote(r, g, b, isMouseDown);
        if (pedalMidiNote === null) {
          if (voiceGateStateRef.current[PEDAL_OSC_INDEX]) {
            gateOffVoice(PEDAL_OSC_INDEX, now);
          }
        } else {
          pedalOsc.frequency.setTargetAtTime(midiNoteToFrequency(pedalMidiNote), now, 0.05);
          if (!voiceGateStateRef.current[PEDAL_OSC_INDEX] && shouldKeepNotesActive) {
            gateOnVoice(PEDAL_OSC_INDEX, PEDAL_OSC_GAIN, now);
          }
        }
      }
    },
    [
      arpIndex,
      enabledVoiceIds,
      getPedalMidiNote,
      gateOffVoice,
      gateOnVoice,
      isArpEnabled,
      isAudioStarted,
      isMouseDown,
      shouldKeepNotesActive,
      shouldUseWebAudio,
      voiceMappingConfig,
    ],
  );

  const clearActiveMidiNotes = useCallback(() => {
    flushPendingMidiNoteOffs();
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
    heldVoiceNotesRef.current = null;
    heldPedalNoteRef.current = null;
    latestHarmonyResultRef.current = null;
    latestRgbRef.current = null;
  }, [flushPendingMidiNoteOffs, sendNoteOff]);

  useEffect(() => {
    if (!isMidiLegatoEnabled) {
      flushPendingMidiNoteOffs();
    }
  }, [flushPendingMidiNoteOffs, isMidiLegatoEnabled]);

  const captureHeldNotes = useCallback(() => {
    heldVoiceNotesRef.current = activeMidiNotesRef.current.reduce((acc, voiceState) => {
      if (voiceState.note !== null) {
        acc[voiceState.voice] = voiceState.note;
      }
      return acc;
    }, {} as Partial<Record<VoiceId, number>>);
    heldPedalNoteRef.current = activePedalNoteRef.current;
  }, []);

  const setPedalMidiNote = useCallback(
    (nextNote: number | null) => {
      if (activePedalNoteRef.current === nextNote) return;

      if (isMidiLegatoEnabled && nextNote !== null) {
        if (!cancelPendingMidiNoteOff(nextNote)) {
          sendNoteOn(nextNote, midiVelocity);
        }
        if (activePedalNoteRef.current !== null) {
          scheduleMidiNoteOff(activePedalNoteRef.current);
        }
      } else {
        if (activePedalNoteRef.current !== null) {
          sendNoteOff(activePedalNoteRef.current);
        }
        if (nextNote !== null && !cancelPendingMidiNoteOff(nextNote)) {
          sendNoteOn(nextNote, midiVelocity);
        }
      }

      activePedalNoteRef.current = nextNote;
    },
    [cancelPendingMidiNoteOff, isMidiLegatoEnabled, midiVelocity, scheduleMidiNoteOff, sendNoteOff, sendNoteOn],
  );

  const applyMidiNotes = useCallback(
    (notes: VoiceNoteById, pedalNote: number | null) => {
      const activeArpVoiceId = enabledVoiceIds.length > 0 ? enabledVoiceIds[arpIndex % enabledVoiceIds.length] : null;
      const currentNotesByVoice = activeMidiNotesRef.current.reduce((currentNotes, activeVoice) => {
        currentNotes[activeVoice.voice] = activeVoice.note;
        return currentNotes;
      }, {} as Partial<Record<VoiceId, number | null>>);
      const targetNotesByVoice = MELODIC_VOICES.reduce((targetNotes, voice) => {
        const isEnabled = voiceMappingConfig[voice.id].enabled;
        targetNotes[voice.id] = !isEnabled
          ? null
          : isArpEnabled
            ? voice.id === activeArpVoiceId
              ? notes[voice.id]
              : null
            : notes[voice.id];
        return targetNotes;
      }, {} as Partial<Record<VoiceId, number | null>>);
      const transition = getMidiNoteTransition(currentNotesByVoice, targetNotesByVoice);

      if (isMidiLegatoEnabled) {
        const noteOffPlan = getMidiLegatoNoteOffPlan(currentNotesByVoice, targetNotesByVoice, transition.notesOff);
        transition.notesOn.forEach((note) => {
          if (!cancelPendingMidiNoteOff(note)) {
            sendNoteOn(note, midiVelocity);
          }
        });
        noteOffPlan.immediateNotesOff.forEach((note) => sendNoteOff(note));
        noteOffPlan.delayedNotesOff.forEach((note) => scheduleMidiNoteOff(note));
      } else {
        transition.notesOff.forEach((note) => sendNoteOff(note));
        transition.notesOn.forEach((note) => {
          if (!cancelPendingMidiNoteOff(note)) {
            sendNoteOn(note, midiVelocity);
          }
        });
      }

      activeMidiNotesRef.current.forEach((activeVoice) => {
        activeVoice.note = transition.nextNotesByVoice[activeVoice.voice];
      });

      setPedalMidiNote(pedalNote);
      if (isSustainLatched || isSustainKeyDown) {
        captureHeldNotes();
      }
    },
    [
      arpIndex,
      captureHeldNotes,
      enabledVoiceIds,
      isArpEnabled,
      isSustainKeyDown,
      isSustainLatched,
      isMidiLegatoEnabled,
      midiVelocity,
      cancelPendingMidiNoteOff,
      scheduleMidiNoteOff,
      sendNoteOff,
      sendNoteOn,
      setPedalMidiNote,
      voiceMappingConfig,
    ],
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
    if (!isArpEnabled || !isMouseDown || !isAudioStarted || shouldFreezeArp) {
      // Return to chord gates when arp is disabled and note gate is active.
      if (!isArpEnabled && isMouseDown && audioCtxRef.current) {
        const now = audioCtxRef.current.currentTime;
        MELODIC_VOICES.forEach((voice, index) => {
          const nextNote = latestHarmonyResultRef.current?.notesByVoice[voice.id] ?? null;
          const shouldBeActive = voiceMappingConfig[voice.id].enabled && nextNote !== null;
          const isActive = voiceGateStateRef.current[index];
          if (shouldBeActive && !isActive) {
            gateOnVoice(index, voice.gain, now);
          } else if (!shouldBeActive && isActive) {
            gateOffVoice(index, now);
          }
        });
        if (!isPedalToneEnabled && voiceGateStateRef.current[PEDAL_OSC_INDEX]) {
          gateOffVoice(PEDAL_OSC_INDEX, now);
        }
      }
      return;
    }

    if (enabledVoiceIds.length === 0) return;

    const interval = setInterval(() => {
      setArpIndex((prev) => (prev + 1) % enabledVoiceIds.length);
    }, arpSpeed);

    return () => clearInterval(interval);
  }, [arpSpeed, enabledVoiceIds.length, gateOffVoice, gateOnVoice, isArpEnabled, isAudioStarted, isMouseDown, isPedalToneEnabled, shouldFreezeArp, voiceMappingConfig]);

  // Update gains based on arpIndex
  useEffect(() => {
    if (!isArpEnabled || !isMouseDown || !audioCtxRef.current || shouldFreezeArp) return;

    const activeArpVoiceId = enabledVoiceIds.length > 0 ? enabledVoiceIds[arpIndex % enabledVoiceIds.length] : null;
    const now = audioCtxRef.current.currentTime;
    MELODIC_VOICES.forEach((voice, index) => {
      const nextNote = latestHarmonyResultRef.current?.notesByVoice[voice.id] ?? null;
      const shouldBeActive =
        voiceMappingConfig[voice.id].enabled && nextNote !== null && voice.id === activeArpVoiceId;
      const isActive = voiceGateStateRef.current[index];
      if (shouldBeActive) {
        gateOnVoice(index, ARP_ACTIVE_GAIN, now, true);
      } else if (isActive) {
        gateOffVoice(index, now);
      }
    });

    if (!isPedalToneEnabled && voiceGateStateRef.current[PEDAL_OSC_INDEX]) {
      gateOffVoice(PEDAL_OSC_INDEX, now);
    }
  }, [arpIndex, enabledVoiceIds, gateOffVoice, gateOnVoice, isArpEnabled, isMouseDown, isPedalToneEnabled, shouldFreezeArp, voiceMappingConfig]);

  // Update MIDI note allocation when arp/chord mode changes.
  useEffect(() => {
    if (!isMouseDown || !latestHarmonyResultRef.current || !latestRgbRef.current) return;
    const { r, g, b } = latestRgbRef.current;
    const harmonyResult = getCurrentHarmonyResult(r, g, b, currentHSB, {
      previousNotesByVoice: latestHarmonyResultRef.current.notesByVoice,
    });
    latestHarmonyResultRef.current = harmonyResult;
    applyMidiNotes(harmonyResult.notesByVoice, getPedalMidiNote(r, g, b, false));
  }, [applyMidiNotes, arpIndex, currentHSB, enabledVoiceIds, getCurrentHarmonyResult, getPedalMidiNote, isArpEnabled, isMouseDown, pedalOctaveMultiplier, voiceMappingConfig]);

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
      const harmonyResult = getCurrentHarmonyResult(
        r,
        g,
        b,
        hsb,
        emitMidi
          ? {
              previousNotesByVoice: latestHarmonyResultRef.current?.notesByVoice,
            }
          : undefined,
      );

      if (emitMidi) {
        updateFrequencies(harmonyResult, r, g, b);
      }

      if (!emitMidi) return;

      latestHarmonyResultRef.current = harmonyResult;
      applyMidiNotes(harmonyResult.notesByVoice, getPedalMidiNote(r, g, b, true));
    },
    [applyMidiNotes, getCurrentHarmonyResult, getPedalMidiNote, updateFrequencies],
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

    if (isSustainKeyDown) {
      setIsSustainLatched(true);
      captureHeldNotes();
    }
  };

  const handleMouseUp = useCallback(() => {
    setIsMouseDown(false);
    if (!isSustainLatched) {
      clearActiveMidiNotes();
      if (audioCtxRef.current) {
        releaseAllAudioVoices(audioCtxRef.current.currentTime);
      }
    }
    resetPedalPersonalityState();
  }, [clearActiveMidiNotes, isSustainLatched, releaseAllAudioVoices, resetPedalPersonalityState]);


  useEffect(() => {
    if (isMouseDown) return;
    resetPedalPersonalityState();
  }, [isMouseDown, isPedalToneEnabled, pedalPersonality, resetPedalPersonalityState]);
  useEffect(() => {
    if (previousMidiOutputRef.current && previousMidiOutputRef.current !== selectedOutputId) {
      clearActiveMidiNotes();
      if (audioCtxRef.current) {
        releaseAllAudioVoices(audioCtxRef.current.currentTime);
      }
      panic();
    }
    previousMidiOutputRef.current = selectedOutputId;
  }, [clearActiveMidiNotes, panic, releaseAllAudioVoices, selectedOutputId]);

  useEffect(() => {
    if (midiStatus === 'ready' || midiStatus === 'no-outputs' || midiStatus === 'disabled') return;
    clearActiveMidiNotes();
    if (audioCtxRef.current) {
      releaseAllAudioVoices(audioCtxRef.current.currentTime);
    }
    panic();
  }, [clearActiveMidiNotes, midiStatus, panic, releaseAllAudioVoices]);

  useEffect(() => {
    return () => {
      clearActiveMidiNotes();
      if (audioCtxRef.current) {
        releaseAllAudioVoices(audioCtxRef.current.currentTime);
      }
      panic();
    };
  }, [clearActiveMidiNotes, panic, releaseAllAudioVoices]);

  useEffect(() => {
    const hasActiveNotes = () => {
      return (
        activeMidiNotesRef.current.some((voiceState) => voiceState.note !== null) ||
        activePedalNoteRef.current !== null
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isKeyboardInputTarget(event.target)) return;
      event.preventDefault();
      if (!isSustainKeyDown) {
        setIsSustainKeyDown(true);
      }
      if (hasActiveNotes()) {
        setIsSustainLatched(true);
        captureHeldNotes();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || (!isSustainKeyDown && isKeyboardInputTarget(event.target))) return;
      event.preventDefault();
      setIsSustainKeyDown(false);
      setIsSustainLatched(false);

      if (!isMouseDown) {
        clearActiveMidiNotes();
        if (audioCtxRef.current) {
          releaseAllAudioVoices(audioCtxRef.current.currentTime);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [captureHeldNotes, clearActiveMidiNotes, isMouseDown, isSustainKeyDown, releaseAllAudioVoices]);

  useEffect(() => {
    if (!isAudioStarted || !audioCtxRef.current) return;
    const now = audioCtxRef.current.currentTime;
    MELODIC_VOICES.forEach((_, index) => {
      const osc = oscillatorsRef.current[index];
      if (!osc) return;
      osc.type = oscillatorType;
      osc.frequency.setTargetAtTime(osc.frequency.value, now, 0.01);
    });
  }, [isAudioStarted, oscillatorType]);

  useEffect(() => {
    if (!masterFilterRef.current || !audioCtxRef.current) return;
    const now = audioCtxRef.current.currentTime;
    const filter = masterFilterRef.current;
    filter.type = isMasterFilterEnabled ? masterFilterMode : 'allpass';
    filter.frequency.setTargetAtTime(masterFilterCutoff, now, 0.03);
    filter.Q.setTargetAtTime(masterFilterResonance, now, 0.03);
  }, [isMasterFilterEnabled, masterFilterCutoff, masterFilterMode, masterFilterResonance]);

  useEffect(() => {
    if (!masterGainRef.current || !audioCtxRef.current) return;
    const now = audioCtxRef.current.currentTime;
    const targetGain = shouldUseWebAudio && isAudioStarted ? webAudioTargetGain : 0;
    masterGainRef.current.gain.setTargetAtTime(targetGain, now, 0.05);
  }, [isAudioStarted, shouldUseWebAudio, webAudioTargetGain]);

  useEffect(() => {
    if (shouldUseWebAudio) return;
    if (!audioCtxRef.current) return;
    releaseAllAudioVoices(audioCtxRef.current.currentTime);
  }, [releaseAllAudioVoices, shouldUseWebAudio]);

  useEffect(() => {
    if (!isHelpOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHelpOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isHelpOpen]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

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
    const harmonyResult =
      shouldKeepNotesActive && latestHarmonyResultRef.current
        ? latestHarmonyResultRef.current
        : getCurrentHarmonyResult(currentRGB.r, currentRGB.g, currentRGB.b, currentHSB);
    return MELODIC_VOICES.map((voice) => {
      const config = voiceMappingConfig[voice.id];
      const voiceResult = harmonyResult.voices.find((entry) => entry.voice === voice.id);
      const outputMidiNote = voiceResult?.outputMidiNote ?? null;
      return {
        id: voice.id,
        label: voice.label,
        source: voice.source,
        enabled: config.enabled,
        degreeLabel: outputMidiNote === null ? '-' : (getScaleDegreeForMidiNote(currentScale, baseMidiNote, outputMidiNote)?.toString() ?? '-'),
        noteName: outputMidiNote === null ? 'Rest' : midiNoteToName(outputMidiNote),
      };
    });
  }, [baseMidiNote, currentHSB, currentRGB, currentScale, getCurrentHarmonyResult, shouldKeepNotesActive, voiceMappingConfig]);

  const togglePanel = useCallback((panelId: ControlPanelId) => {
    setOpenPanels((prev) => ({
      ...prev,
      [panelId]: !prev[panelId],
    }));
  }, []);

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
      <header className="instrument-header">
        <div className="brand"><span className="brand-mark" aria-hidden="true">◈</span><h1>ChromaSyn</h1><span className="brand-caption">COLOR INTO SOUND</span></div>
        <div className="header-actions">
          <span className="output-status"><i className={shouldUseWebAudio ? 'status-dot' : 'status-dot midi'} />{shouldUseWebAudio ? 'Internal audio' : 'MIDI output'}</span>
          <button className="quiet-button" onClick={() => setIsHelpOpen(true)}><Info size={15} />Help</button>
          <button className="quiet-button" aria-expanded={isSetupOpen} aria-controls="instrument-setup" onClick={() => setIsSetupOpen(!isSetupOpen)}><SlidersHorizontal size={15} />Setup</button>
          <button className="panic-button" onClick={() => {
            setIsMouseDown(false); setIsSustainKeyDown(false); setIsSustainLatched(false);
            heldVoiceNotesRef.current = null; heldPedalNoteRef.current = null;
            clearActiveMidiNotes();
            if (audioCtxRef.current) {
              const now = audioCtxRef.current.currentTime;
              gainNodesRef.current.forEach((node) => {
                node.gain.cancelScheduledValues(now);
                node.gain.setValueAtTime(0, now);
              });
              voiceGateStateRef.current.fill(false);
            }
            resetPedalPersonalityState();
            panic();
          }}><Square size={12} fill="currentColor" />Panic</button>
        </div>
      </header>

      <main className="instrument-workspace">
        <section className="musical-toolbar" aria-label="Musical controls">
          <label className="musical-field"><span>Base note</span><select value={baseMidiNote} onChange={(e) => setBaseMidiNote(Number(e.target.value))}>{BASE_NOTE_OPTIONS.map((option) => <option key={option.midiNote} value={option.midiNote}>{option.label}</option>)}</select></label>
          <label className="musical-field"><span>Scale / mode</span><select value={currentScale.name} onChange={(e) => { const scale = SCALES.find((entry) => entry.name === e.target.value); if (scale) setCurrentScale(scale); }}>{SCALES.map((scale) => <option key={scale.name}>{scale.name}</option>)}</select></label>
          <label className="musical-field"><span>Harmony source</span><select value={harmonySourceMode} onChange={(e) => setHarmonySourceMode(e.target.value as HarmonySourceMode)}><option value="image">Image-derived</option><option value="manual-progression">Manual · prototype</option></select></label>
          <label className="musical-field"><span>Harmony model</span><select value={harmonyModelId} onChange={(e) => setHarmonyModelId(e.target.value as HarmonyModelId)}>{HARMONY_MODELS.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
          <label className="musical-field gravity-field"><span>Gravity <b>{harmonyModelId === 'off' ? 'Bypassed' : `${Math.round(harmonyGravity * 100)}%`}</b></span><input aria-label="Harmonic gravity" type="range" min="0" max="100" value={Math.round(harmonyGravity * 100)} disabled={harmonyModelId === 'off'} onChange={(e) => setHarmonyGravity(Number(e.target.value) / 100)} /></label>
          <div className={`hold-indicator ${isSustainLatched ? 'is-held' : ''}`}><span>{isSustainLatched ? 'SUSTAINING' : 'SUSTAIN'}</span><kbd>SPACE</kbd></div>
        </section>

        <div className="image-heading">
          <div><span className="eyebrow">PLAY SURFACE</span><p>Explore a color. Find a sound.</p></div>
          <div className="header-actions">
            <button className="quiet-button" aria-expanded={isPresetBrowserOpen} aria-controls="preset-browser" onClick={() => setIsPresetBrowserOpen(!isPresetBrowserOpen)}>Presets <ChevronDown size={14} /></button>
            <label className="image-upload"><Upload size={15} />Load image<input aria-label="Load image" type="file" className="sr-only" accept="image/*" onChange={handleImageUpload} /></label>
          </div>
        </div>
        {isPresetBrowserOpen && <section id="preset-browser" aria-label="Image presets">          <div className="bg-white/5 rounded-2xl p-4 border border-white/10 mb-4 overflow-x-auto">
            <div className="flex items-center gap-2 text-zinc-400 mb-3">
              <Settings2 className="w-3.5 h-3.5" />
              <h2 className="text-[10px] font-bold uppercase tracking-widest">Preset Gradients</h2>
            </div>
            <div className="flex gap-3 pb-2">
              {PRESETS.map((preset, index) => (
                <button
                  key={preset.name}
                  onClick={() => { loadPreset(preset); setIsPresetBrowserOpen(false); }}
                  title={PRESET_HOTKEYS[index] ? `${preset.name} (${PRESET_HOTKEYS[index].toUpperCase()})` : preset.name}
                  className="flex-shrink-0 group relative w-24 space-y-2 text-center"
                >
                  <div
                    className="w-24 h-16 rounded-lg border border-white/10 shadow-lg transition-transform group-hover:scale-105 group-active:scale-95"
                    style={{ background: preset.gradient }}
                  />
                  <div className="text-[10px] text-zinc-500 font-medium leading-tight truncate w-full group-hover:text-zinc-300">{preset.name}</div>
                </button>
              ))}
            </div>
          </div>

</section>}
          <div className="image-stage">
            {!isCanvasPopulated ? (
              <div className="text-center space-y-3 p-6">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-white/10">
                  <Upload className="w-8 h-8 text-zinc-600" />
                </div>
                <div>
                  <h3 className="text-xl font-medium text-zinc-300">No Image Loaded</h3>
                  <p className="text-zinc-500 text-sm mt-1">Upload an image to start playin</p>
                </div>
              </div>
            ) : (
              <div className="image-surface relative cursor-none touch-none">
                <canvas
                  ref={canvasRef}
                  onMouseMove={handleMouseMove}
                  onMouseDown={handleMouseDown}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  className="performance-canvas"
                />

                {/* Custom Cursor */}
                <motion.div
                  className="absolute pointer-events-none z-10"
                  animate={{ x: cursorPos.x, y: cursorPos.y }}
                  transition={{ type: 'spring', damping: 10, stiffness: 750, mass: 0.1 }}
                  style={{ left: -20, top: -20 }}
                >
                  <div
                    className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                      isMouseDown
                        ? 'scale-125 border-pink-400 bg-pink-400/20 shadow-[0_0_20px_rgba(244,114,182,0.45)]'
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

          <div className="flex items-center justify-between text-[10px] text-zinc-400 uppercase tracking-widest px-2 stage-footer">
            <span>
              Canvas Resolution: {canvasRef.current?.width || 0}x{canvasRef.current?.height || 0}
            </span>
            <span>
              Audio Status:{' '}
              {shouldUseWebAudio ? (isAudioStarted ? 'Ready' : 'Waiting for Interaction') : 'Muted (MIDI Active)'}
            </span>
          </div>

        <section className="voice-monitor" aria-label="Live voices">
          <div className="monitor-heading"><span className="eyebrow">SIX VOICES</span><span>{shouldKeepNotesActive ? 'Output · held / playing' : 'Preview · hover the image'}</span></div>
          <div className="voice-strip">{liveVoiceRows.map((voice) => (
            <div key={voice.id} className={`voice-cell voice-${voice.id} ${voice.enabled ? '' : 'voice-muted'}`}>
              <label className="voice-label"><span><i />{voice.label}</span><input type="checkbox" aria-label={`Enable ${voice.label} voice`} checked={voice.enabled} onChange={(e) => setVoiceEnabled(voice.id, e.target.checked)} /></label>
              <div className="voice-pitch"><strong>{voice.enabled ? voice.noteName : 'Muted'}</strong><span>Deg {voice.enabled ? voice.degreeLabel : '—'}</span></div>
            </div>
          ))}</div>
          <div className="monitor-footer"><span>{harmonyModelId === 'off' ? 'Harmony off · original color mapping' : `${selectedHarmonyModel.name} · ${Math.round(harmonyGravity * 100)}% gravity`}</span><span>Pedal {isPedalToneEnabled && previewPedalNoteName ? `${previewPedalNoteName} · ${pedalPersonality}` : 'off'}</span><span>Arpeggiator {isArpEnabled ? `${arpSpeed} ms` : 'off'}</span></div>
        </section>

        {harmonySourceMode === 'manual-progression' && <details className="prototype-panel"><summary>Manual progression prototype · {activeManualChord?.symbol ?? 'No valid chords'}</summary>
                {harmonySourceMode === 'manual-progression' && (
                  <div className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-2">
                    <textarea
                      value={manualProgressionText}
                      onChange={(e) => setManualProgressionText(e.target.value)}
                      rows={4}
                      spellCheck={false}
                      className="w-full resize-y bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs font-mono text-zinc-200 min-h-20"
                    />
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono text-zinc-200">{activeManualChord?.symbol ?? 'No valid chords'}</span>
                      <span className="font-mono text-emerald-400">
                        {manualProgression.chords.length > 0
                          ? `${(manualProgressionIndex % manualProgression.chords.length) + 1}/${manualProgression.chords.length}`
                          : '0/0'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={resetManualProgression}
                        disabled={manualProgression.chords.length === 0}
                        title="Reset manual progression"
                        className="px-2 py-1 text-[10px] rounded-md border border-white/15 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 disabled:text-zinc-600 disabled:hover:bg-white/5"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={advanceManualProgression}
                        disabled={manualProgression.chords.length === 0}
                        title="Advance manual progression"
                        className="px-2 py-1 text-[10px] rounded-md border border-white/15 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 disabled:text-zinc-600 disabled:hover:bg-white/5"
                      >
                        Next
                      </button>
                    </div>
                    {manualProgression.invalidSymbols.length > 0 && (
                      <div className="text-[10px] text-amber-300">
                        Ignored: {manualProgression.invalidSymbols.join(', ')}
                      </div>
                    )}
                  </div>
                )}

        </details>}

        <section ref={setupRef} id="instrument-setup" className="setup-area" hidden={!isSetupOpen} aria-label="Instrument setup">
          <div className="monitor-heading"><div><span className="eyebrow">INSTRUMENT SETUP</span><p>Shape the sound and connect your instruments.</p></div><button className="quiet-button" onClick={() => setIsSetupOpen(false)}>Close setup</button></div>
          <div className="setup-grid">
          <section className={PANEL_SHELL_CLASS}>
            {renderPanelHeader('scale', 'Pedal tone', <Settings2 className="w-3.5 h-3.5" />)}
            {openPanels.scale && (
              <div className="mt-3 space-y-2.5">
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
                    aria-label="Enable arpeggiator"
                    aria-pressed={isArpEnabled}
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
              <div className="mt-3 space-y-3">
                <div className="space-y-1">
                  <div className="text-[9px] text-zinc-500 uppercase">Oscillator Type</div>
                  <select
                    value={oscillatorType}
                    onChange={(e) => setOscillatorType(e.target.value as OscillatorType)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
                  >
                    {OSCILLATOR_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
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
                <div className="pt-1 border-t border-white/5 space-y-2">
                  <div className="text-[9px] text-zinc-500 uppercase">ADSR Envelope</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ADSR_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => setAdsr(preset.values)}
                        className="px-2 py-1 text-[10px] rounded-md border border-white/15 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-zinc-500 uppercase">
                      <span>Attack</span>
                      <span>{adsr.attackMs}ms</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="1000"
                      step="1"
                      value={adsr.attackMs}
                      onChange={(e) => setAdsr((prev) => ({ ...prev, attackMs: parseInt(e.target.value, 10) }))}
                      className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-zinc-500 uppercase">
                      <span>Decay</span>
                      <span>{adsr.decayMs}ms</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="1500"
                      step="1"
                      value={adsr.decayMs}
                      onChange={(e) => setAdsr((prev) => ({ ...prev, decayMs: parseInt(e.target.value, 10) }))}
                      className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-zinc-500 uppercase">
                      <span>Sustain</span>
                      <span>{adsr.sustainLevel.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={adsr.sustainLevel}
                      onChange={(e) => setAdsr((prev) => ({ ...prev, sustainLevel: parseFloat(e.target.value) }))}
                      className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-zinc-500 uppercase">
                      <span>Release</span>
                      <span>{adsr.releaseMs}ms</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="2000"
                      step="1"
                      value={adsr.releaseMs}
                      onChange={(e) => setAdsr((prev) => ({ ...prev, releaseMs: parseInt(e.target.value, 10) }))}
                      className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-300 pt-1 border-t border-white/5">
                  <span>Master Filter</span>
                  <input
                    type="checkbox"
                    checked={isMasterFilterEnabled}
                    onChange={(e) => setIsMasterFilterEnabled(e.target.checked)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                </label>
                <div className="space-y-1">
                  <div className="text-[9px] text-zinc-500 uppercase">Filter Mode</div>
                  <select
                    value={masterFilterMode}
                    onChange={(e) => setMasterFilterMode(e.target.value as FilterMode)}
                    disabled={!isMasterFilterEnabled}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 disabled:text-zinc-500"
                  >
                    <option value="lowpass">Low-pass</option>
                    <option value="highpass">High-pass</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] text-zinc-500 uppercase">
                    <span>Cutoff</span>
                    <span>{masterFilterCutoff}Hz</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="12000"
                    step="10"
                    value={masterFilterCutoff}
                    onChange={(e) => setMasterFilterCutoff(parseInt(e.target.value, 10))}
                    disabled={!isMasterFilterEnabled}
                    className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] text-zinc-500 uppercase">
                    <span>Resonance (Q)</span>
                    <span>{masterFilterResonance.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="20"
                    step="0.1"
                    value={masterFilterResonance}
                    onChange={(e) => setMasterFilterResonance(parseFloat(e.target.value))}
                    disabled={!isMasterFilterEnabled}
                    className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                  />
                </div>
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
                <label className="flex items-center justify-between gap-2 text-xs text-zinc-300 pt-1 border-t border-white/5">
                  <span>Legato overlap</span>
                  <input
                    type="checkbox"
                    checked={isMidiLegatoEnabled}
                    onChange={(e) => setIsMidiLegatoEnabled(e.target.checked)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                </label>
                {isMidiLegatoEnabled && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-zinc-500 uppercase">
                      <span>Overlap</span>
                      <span>{midiLegatoOverlapMs}ms</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="200"
                      step="5"
                      value={midiLegatoOverlapMs}
                      onChange={(e) => setMidiLegatoOverlapMs(parseInt(e.target.value, 10))}
                      className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                )}
                {midiError && <div className="text-[11px] text-red-400">{midiError}</div>}
              </div>
            )}
          </section>

          </div>
        </section>
      </main>

      <AnimatePresence>
        {isHelpOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm p-4 sm:p-6"
            onClick={() => setIsHelpOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="max-w-2xl mx-auto mt-10 sm:mt-16 bg-[#101014] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <h2 className="text-sm font-semibold tracking-wide text-zinc-100">Getting Started</h2>
                <button
                  type="button"
                  onClick={() => setIsHelpOpen(false)}
                  className="px-2 py-1 text-xs rounded-md border border-white/15 text-zinc-300 hover:text-white hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <div className="p-5 space-y-5 text-sm text-zinc-300 max-h-[70vh] overflow-y-auto">
                <section className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">What ChromaSyn Does</h3>
                  <p>
                    ChromaSyn is a browser-based image sonification instrument that turns spatial color variation into harmonic exploration while locking the playable notes to a modal scale! 
                    It can output sound through the internal oscillators
                    and/or send notes over Web MIDI to your DAW or a hardware synth.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Quick Start</h3>
                  <ol className="list-decimal ml-5 space-y-1">
                    <li>Load an image or pick a preset gradient.</li>
                    <li>Choose a scale mode and base note in the controls.</li>
                    <li>Click and drag on the canvas to play notes from color regions.</li>
                    <li>Use <span className="font-mono">Space</span> to hold/sustain a chord while exploring.</li>
                    <li>Use preset hotkeys <span className="font-mono">z x c v b n m , . /</span> to load presets 1-10.</li>
                    <li>Press <span className="font-mono">A</span> to switch back to your uploaded image at any time.</li>
                  </ol>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Performance Tip</h3>
                  <p>
                    While holding <span className="font-mono">Space</span>, you can switch preset gradients and swap back to uploaded images
                    without interrupting sustained notes. You can even load a new image while sustaining for fluid transitions.
                  </p>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">MIDI Setup</h3>
                  <ol className="list-decimal ml-5 space-y-1">
                    <li>Create a virtual MIDI bus (loopMIDI on Windows or IAC on macOS).</li>
                    <li>Click <span className="font-medium">Enable MIDI</span> and select that destination.</li>
                    <li>In your DAW, set a MIDI track input to the same bus and load a synth.</li>
                    <li>Play from ChromaSyn and monitor notes in your DAW.</li>
                  </ol>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Understanding The Controls</h3>
                  <ul className="list-disc ml-5 space-y-1">
                    <li><span className="font-medium">Voice Toggles</span>: enable/disable RGB and HSB note voices.</li>
                    <li><span className="font-medium">Arpeggiator</span>: steps through enabled voices instead of full chord playback.</li>
                    <li><span className="font-medium">Audio Engine</span>: set waveform, volume, and optional master filter.</li>
                    <li><span className="font-medium">Pedal Tone</span>: adds a sustained foundational note based on RGB rules.</li>
                  </ul>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-5 right-5 z-[70] px-3 py-2 rounded-lg bg-black/85 border border-white/15 text-xs text-zinc-100 shadow-lg pointer-events-none"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Atmosphere */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}
