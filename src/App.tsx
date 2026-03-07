import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Music, Settings2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMidiOutput } from './useMidiOutput';

// --- Constants & Types ---

type Scale = {
  name: string;
  intervals: number[]; // semitones from root
};

type VoiceIndex = 0 | 1 | 2;

type ActiveVoiceNote = {
  voice: VoiceIndex;
  note: number | null;
};

const SCALES: Scale[] = [
  { name: 'Ionian (Major)', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Aeolian (Minor)', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10] },
];

const VOICES: VoiceIndex[] = [0, 1, 2];
const PEDAL_OSC_INDEX = 3;
const DEFAULT_BASE_MIDI_NOTE = 48; // C3
const DEFAULT_MIDI_VELOCITY = 100;
const RGB_OSC_GAIN = 0.2;
const PEDAL_OSC_GAIN = 0.16;

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

// --- Helper Functions ---

const getSemitones = (scale: Scale, value: number) => {
  // Map 0-255 to a scale degree over ~3 octaves
  const degree = Math.floor((value / 255) * 21); // 3 octaves * 7 notes
  const octave = Math.floor(degree / 7);
  const noteIndex = degree % 7;
  return octave * 12 + scale.intervals[noteIndex];
};

const midiNoteToFrequency = (midiNote: number) => {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
};

const getFrequency = (scale: Scale, value: number, baseFrequency: number) => {
  const semitones = getSemitones(scale, value);
  return baseFrequency * Math.pow(2, semitones / 12);
};

const getMidiNote = (scale: Scale, value: number, baseMidiNote: number) => {
  const semitones = getSemitones(scale, value);
  return baseMidiNote + semitones;
};

const getScaleDegree = (value: number) => {
  return (Math.floor((value / 255) * 21) % 7) + 1;
};

const getDegreeFromSum = (sum: number) => {
  const clamped = Math.max(0, Math.min(765, sum));
  const degreeIndex = Math.min(6, Math.floor((clamped / 765) * 7));
  return degreeIndex + 1;
};

const selectPedalDegree = (rDegree: number, gDegree: number, bDegree: number, rgbSum: number) => {
  const degrees = [rDegree, gDegree, bDegree];
  if (degrees.includes(1)) return 1;

  const degreeCounts = new Map<number, number>();
  degrees.forEach((degree) => {
    degreeCounts.set(degree, (degreeCounts.get(degree) ?? 0) + 1);
  });
  const repeated = degrees.find((degree) => (degreeCounts.get(degree) ?? 0) >= 2);
  return repeated ?? getDegreeFromSum(rgbSum);
};

// --- Components ---

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [currentScale, setCurrentScale] = useState<Scale>(SCALES[0]);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [currentRGB, setCurrentRGB] = useState({ r: 0, g: 0, b: 0 });
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
  const activeMidiNotesRef = useRef<ActiveVoiceNote[]>([
    { voice: 0, note: null },
    { voice: 1, note: null },
    { voice: 2, note: null },
  ]);
  const latestMidiNotesRef = useRef<number[] | null>(null);
  const latestRgbRef = useRef<{ r: number; g: number; b: number } | null>(null);
  const previousMidiOutputRef = useRef<string>('');
  const activePedalNoteRef = useRef<number | null>(null);
  const shouldUseWebAudio = !(disableWebAudioWithMidi && midiStatus === 'ready');
  const baseFrequency = midiNoteToFrequency(baseMidiNote);

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

    // Create 4 oscillators: 3 for R/G/B plus 1 pedal oscillator.
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = i === PEDAL_OSC_INDEX ? 'triangle' : 'square'; // sine | square | sawtooth | triangle
      gain.gain.setValueAtTime(i === PEDAL_OSC_INDEX ? 0 : RGB_OSC_GAIN, ctx.currentTime);

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

  const updateFrequencies = useCallback(
    (r: number, g: number, b: number) => {
      if (!audioCtxRef.current || !isAudioStarted || !shouldUseWebAudio) return;

      const values = [r, g, b];
      const now = audioCtxRef.current.currentTime;

      VOICES.forEach((i) => {
        const osc = oscillatorsRef.current[i];
        if (!osc) return;
        const freq = getFrequency(currentScale, values[i], baseFrequency);
        osc.frequency.setTargetAtTime(freq, now, 0.05);

        // If not in arpeggiator mode, ensure all gains are up
        if (!isArpEnabled && gainNodesRef.current[i]) {
          gainNodesRef.current[i].gain.setTargetAtTime(RGB_OSC_GAIN, now, 0.05);
        }
      });

      const pedalOsc = oscillatorsRef.current[PEDAL_OSC_INDEX];
      const pedalGain = gainNodesRef.current[PEDAL_OSC_INDEX];
      if (pedalOsc && pedalGain) {
        if (!isPedalToneEnabled) {
          pedalGain.gain.setTargetAtTime(0, now, 0.05);
        } else {
          const pedalDegree = selectPedalDegree(getScaleDegree(r), getScaleDegree(g), getScaleDegree(b), r + g + b);
          const semitones = currentScale.intervals[pedalDegree - 1];
          const baseNote = baseMidiNote + semitones;
          const octaveOffset = (pedalOctaveMultiplier - 1) * 12;
          const pedalMidiNote = Math.max(0, Math.min(127, baseNote - octaveOffset));
          pedalOsc.frequency.setTargetAtTime(midiNoteToFrequency(pedalMidiNote), now, 0.05);
          pedalGain.gain.setTargetAtTime(PEDAL_OSC_GAIN, now, 0.05);
        }
      }
    },
    [baseFrequency, baseMidiNote, currentScale, isAudioStarted, isArpEnabled, isPedalToneEnabled, pedalOctaveMultiplier, shouldUseWebAudio],
  );

  const getMidiNotes = useCallback(
    (r: number, g: number, b: number) => {
      return [
        getMidiNote(currentScale, r, baseMidiNote),
        getMidiNote(currentScale, g, baseMidiNote),
        getMidiNote(currentScale, b, baseMidiNote),
      ];
    },
    [baseMidiNote, currentScale],
  );

  const getPedalMidiNote = useCallback(
    (r: number, g: number, b: number) => {
      if (!isPedalToneEnabled) return null;

      const pedalDegree = selectPedalDegree(getScaleDegree(r), getScaleDegree(g), getScaleDegree(b), r + g + b);

      const semitones = currentScale.intervals[pedalDegree - 1];
      const baseNote = baseMidiNote + semitones;
      const octaveOffset = (pedalOctaveMultiplier - 1) * 12;
      return Math.max(0, Math.min(127, baseNote - octaveOffset));
    },
    [baseMidiNote, currentScale.intervals, isPedalToneEnabled, pedalOctaveMultiplier],
  );

  const setVoiceMidiNote = useCallback(
    (voice: VoiceIndex, nextNote: number | null) => {
      const activeVoice = activeMidiNotesRef.current[voice];
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
    (notes: number[], pedalNote: number | null) => {
      if (notes.length < 3) return;

      if (isArpEnabled) {
        VOICES.forEach((voice) => {
          const nextNote = voice === arpIndex ? notes[voice] : null;
          setVoiceMidiNote(voice, nextNote);
        });
      } else {
        VOICES.forEach((voice) => {
          setVoiceMidiNote(voice, notes[voice]);
        });
      }

      setPedalMidiNote(pedalNote);
    },
    [arpIndex, isArpEnabled, setPedalMidiNote, setVoiceMidiNote],
  );

  // Arpeggiator Loop
  useEffect(() => {
    if (!isArpEnabled || !isMouseDown || !isAudioStarted) {
      // Reset gains if arp is disabled but mouse is down (back to chord mode)
      if (!isArpEnabled && isMouseDown && audioCtxRef.current) {
        const now = audioCtxRef.current.currentTime;
        VOICES.forEach((voice) => {
          const gainNode = gainNodesRef.current[voice];
          gainNode?.gain.setTargetAtTime(RGB_OSC_GAIN, now, 0.05);
        });
        const pedalGain = gainNodesRef.current[PEDAL_OSC_INDEX];
        if (pedalGain) {
          pedalGain.gain.setTargetAtTime(isPedalToneEnabled ? PEDAL_OSC_GAIN : 0, now, 0.05);
        }
      }
      return;
    }

    const interval = setInterval(() => {
      setArpIndex((prev) => (prev + 1) % 3);
    }, arpSpeed);

    return () => clearInterval(interval);
  }, [arpSpeed, isArpEnabled, isAudioStarted, isMouseDown, isPedalToneEnabled]);

  // Update gains based on arpIndex
  useEffect(() => {
    if (!isArpEnabled || !isMouseDown || !audioCtxRef.current) return;

    const now = audioCtxRef.current.currentTime;
    VOICES.forEach((voice) => {
      const gainNode = gainNodesRef.current[voice];
      if (!gainNode) return;
      const targetGain = voice === arpIndex ? 0.4 : 0;
      gainNode.gain.setTargetAtTime(targetGain, now, 0.02);
    });

    const pedalGain = gainNodesRef.current[PEDAL_OSC_INDEX];
    if (pedalGain) {
      pedalGain.gain.setTargetAtTime(isPedalToneEnabled ? PEDAL_OSC_GAIN : 0, now, 0.02);
    }
  }, [arpIndex, isArpEnabled, isMouseDown, isPedalToneEnabled]);

  // Update MIDI note allocation when arp/chord mode changes.
  useEffect(() => {
    if (!isMouseDown || !latestMidiNotesRef.current || !latestRgbRef.current) return;
    const { r, g, b } = latestRgbRef.current;
    applyMidiNotes(latestMidiNotesRef.current, getPedalMidiNote(r, g, b));
  }, [applyMidiNotes, arpIndex, baseMidiNote, currentScale, getPedalMidiNote, isArpEnabled, isMouseDown, isPedalToneEnabled, pedalOctaveMultiplier]);

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

      setCurrentRGB({ r, g, b });
      latestRgbRef.current = { r, g, b };
      updateFrequencies(r, g, b);

      if (!emitMidi) return;

      const midiNotes = getMidiNotes(r, g, b);
      latestMidiNotesRef.current = midiNotes;
      applyMidiNotes(midiNotes, getPedalMidiNote(r, g, b));
    },
    [applyMidiNotes, getMidiNotes, getPedalMidiNote, updateFrequencies],
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
      masterGainRef.current.gain.setTargetAtTime(0.5, audioCtxRef.current.currentTime, 0.1);
    }
  };

  const handleMouseUp = useCallback(() => {
    setIsMouseDown(false);
    clearActiveMidiNotes();

    if (shouldUseWebAudio && masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.1);
    }
  }, [clearActiveMidiNotes, shouldUseWebAudio]);

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
    const targetGain = shouldUseWebAudio && isMouseDown ? 0.5 : 0;
    masterGainRef.current.gain.setTargetAtTime(targetGain, now, 0.05);
  }, [isMouseDown, shouldUseWebAudio]);

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

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">ChromaSyn</h1>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg cursor-pointer transition-all active:scale-95 font-medium text-sm shadow-lg shadow-emerald-500/10">
              <Upload className="w-4 h-4" />
              <span>Load Image</span>
              <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
            </label>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Controls */}
        <aside className="lg:col-span-1 space-y-6">
          <section className="bg-white/5 rounded-2xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <Settings2 className="w-4 h-4" />
              <h2 className="text-xs font-bold uppercase tracking-widest">Modal Scale</h2>
            </div>
            <div className="space-y-3">
              <select
                value={currentScale.name}
                onChange={(e) => {
                  const selected = SCALES.find((scale) => scale.name === e.target.value);
                  if (selected) setCurrentScale(selected);
                }}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200"
              >
                {SCALES.map((scale) => (
                  <option key={scale.name} value={scale.name}>
                    {scale.name}
                  </option>
                ))}
              </select>
              <div className="space-y-1">
                <div className="text-[10px] text-zinc-500 uppercase">Base Note (Freq + MIDI)</div>
                <select
                  value={String(baseMidiNote)}
                  onChange={(e) => setBaseMidiNote(parseInt(e.target.value, 10))}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200"
                >
                  {BASE_NOTE_OPTIONS.map((option) => (
                    <option key={option.midiNote} value={option.midiNote}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center justify-between gap-3 text-xs text-zinc-300">
                <span>Enable Pedal Tone</span>
                <input
                  type="checkbox"
                  checked={isPedalToneEnabled}
                  onChange={(e) => setIsPedalToneEnabled(e.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
              </label>
              <div className="space-y-1">
                <div className="text-[10px] text-zinc-500 uppercase">Pedal Octave</div>
                <select
                  value={String(pedalOctaveMultiplier)}
                  onChange={(e) => setPedalOctaveMultiplier(parseInt(e.target.value, 10) as 1 | 2 | 3)}
                  disabled={!isPedalToneEnabled}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 disabled:text-zinc-500"
                >
                  <option value="1">1x</option>
                  <option value="2">2x</option>
                  <option value="3">3x</option>
                </select>
              </div>
            </div>
          </section>

          <section className="bg-white/5 rounded-2xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4" />
                <h2 className="text-xs font-bold uppercase tracking-widest">Arpeggiator</h2>
              </div>
              <button
                onClick={() => setIsArpEnabled(!isArpEnabled)}
                className={`w-10 h-5 rounded-full transition-colors relative ${isArpEnabled ? 'bg-emerald-500' : 'bg-zinc-700'}`}
              >
                <motion.div animate={{ x: isArpEnabled ? 20 : 2 }} className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm" />
              </button>
            </div>

            {isArpEnabled && (
              <div className="space-y-3 pt-2">
                <div className="flex justify-between text-[10px] text-zinc-500 uppercase">
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
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${isMouseDown && arpIndex === i ? 'bg-emerald-400' : 'bg-zinc-800'}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="bg-white/5 rounded-2xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <Settings2 className="w-4 h-4" />
              <h2 className="text-xs font-bold uppercase tracking-widest">MIDI Output</h2>
            </div>
            <button
              onClick={() => void enableMidi()}
              className="w-full px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg transition-all active:scale-95 font-medium text-sm"
            >
              Enable MIDI
            </button>
            <div className="space-y-2">
              <div className="text-[10px] text-zinc-500 uppercase">Destination</div>
              <select
                value={selectedOutputId}
                onChange={(e) => setSelectedOutputId(e.target.value)}
                disabled={midiOutputs.length === 0}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 disabled:text-zinc-500"
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
            <div className="text-[10px] text-zinc-500 uppercase">Status: {midiStatusText[midiStatus] ?? midiStatus}</div>
            <label className="flex items-center justify-between gap-3 text-xs text-zinc-300">
              <span>Mute web audio when MIDI ready</span>
              <input
                type="checkbox"
                checked={disableWebAudioWithMidi}
                onChange={(e) => setDisableWebAudioWithMidi(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
            </label>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] text-zinc-500 uppercase">
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
          </section>

          <section className="bg-white/5 rounded-2xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center gap-2 text-zinc-400 mb-2">
              <Info className="w-4 h-4" />
              <h2 className="text-xs font-bold uppercase tracking-widest">Live Data</h2>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-black/40 rounded-xl p-3 border border-white/5 text-center">
                <div className="text-[10px] text-zinc-500 uppercase mb-1">Red</div>
                <div className="text-xl font-mono text-emerald-400">{currentRGB.r}</div>
              </div>
              <div className="bg-black/40 rounded-xl p-3 border border-white/5 text-center">
                <div className="text-[10px] text-zinc-500 uppercase mb-1">Green</div>
                <div className="text-xl font-mono text-emerald-400">{currentRGB.g}</div>
              </div>
              <div className="bg-black/40 rounded-xl p-3 border border-white/5 text-center">
                <div className="text-[10px] text-zinc-500 uppercase mb-1">Blue</div>
                <div className="text-xl font-mono text-emerald-400">{currentRGB.b}</div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5">
              <div className="text-[10px] text-zinc-500 uppercase mb-3 text-center">Current Degrees</div>
              <div className="flex justify-center gap-4 text-3xl font-mono font-bold text-white">
                <span>{getScaleDegree(currentRGB.r)}</span>
                <span className="text-zinc-700">/</span>
                <span>{getScaleDegree(currentRGB.g)}</span>
                <span className="text-zinc-700">/</span>
                <span>{getScaleDegree(currentRGB.b)}</span>
              </div>
            </div>
          </section>
        </aside>

        {/* Canvas Area */}
        <div className="lg:col-span-3 space-y-4">
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
                  <p className="text-zinc-500 text-sm mt-1">Upload an image to start your sonic journey</p>
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
