import chordCatalog from './data/chords.json';
import defaultProgression from './data/defaultProgression.json';
import {
  PITCH_CLASS_NAMES,
  getChordPitchClasses,
  validateChordCatalog,
  type ChordDefinition,
  type HarmonySourceId,
  type ProgressionChord,
} from './musicEngine';

export const MAX_PROGRESSION_CHORDS = 12;
export const CHORD_DEFINITIONS: ChordDefinition[] = validateChordCatalog(chordCatalog);

const STORAGE_KEY = 'chromasyn.manual-progression.v1';
const STORAGE_SCHEMA_VERSION = 2;

export type ManualProgressionSession = {
  chords: ProgressionChord[];
  activeChordId: string | null;
  harmonySource: HarmonySourceId;
  revoiceOnChordChange: boolean;
};

type DefaultProgressionSeed = {
  id: string;
  rootPitchClass: number;
  presetId: string;
};

export const createProgressionChordId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `chord-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

export const createProgressionChordFromPreset = (
  rootPitchClass: number,
  definition: ChordDefinition,
): Omit<ProgressionChord, 'id'> => {
  const normalizedRoot = ((Math.round(rootPitchClass) % 12) + 12) % 12;
  return {
    rootPitchClass: normalizedRoot,
    pitchClasses: getChordPitchClasses(normalizedRoot, definition.intervals),
    label: `${PITCH_CLASS_NAMES[normalizedRoot]}${definition.symbol}`,
    sourcePresetId: definition.id,
  };
};

export const createDefaultManualProgression = (): ProgressionChord[] => {
  if (defaultProgression.schemaVersion !== 1 || !Array.isArray(defaultProgression.chords)) {
    throw new Error('Default progression has an unsupported schema.');
  }

  const usedIds = new Set<string>();
  return (defaultProgression.chords as DefaultProgressionSeed[]).map((seed) => {
    if (!seed.id?.trim() || usedIds.has(seed.id)) {
      throw new Error(`Default progression contains an invalid or duplicate chord ID: ${seed.id}`);
    }
    if (!Number.isInteger(seed.rootPitchClass) || seed.rootPitchClass < 0 || seed.rootPitchClass > 11) {
      throw new Error(`Default progression chord ${seed.id} has an invalid root pitch class.`);
    }

    const definition = CHORD_DEFINITIONS.find((candidate) => candidate.id === seed.presetId);
    if (!definition) {
      throw new Error(`Default progression chord ${seed.id} references missing preset ${seed.presetId}.`);
    }

    usedIds.add(seed.id);
    return {
      id: seed.id,
      ...createProgressionChordFromPreset(seed.rootPitchClass, definition),
    };
  });
};

const createDefaultSession = (): ManualProgressionSession => {
  const chords = createDefaultManualProgression();
  return {
    chords,
    activeChordId: chords[0]?.id ?? null,
    harmonySource: 'image',
    revoiceOnChordChange: false,
  };
};

export const reorderProgression = (chords: ProgressionChord[], draggedId: string, targetId: string) => {
  const fromIndex = chords.findIndex((chord) => chord.id === draggedId);
  const toIndex = chords.findIndex((chord) => chord.id === targetId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return chords;

  const reordered = [...chords];
  const [draggedChord] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, draggedChord);
  return reordered;
};

export const getProgressionHotkeyIndex = (key: string) => {
  const directKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
  return directKeys.indexOf(key);
};

const normalizeStoredChord = (value: unknown): ProgressionChord | null => {
  if (!value || typeof value !== 'object') return null;
  const chord = value as Partial<ProgressionChord>;
  if (!chord.id || typeof chord.id !== 'string' || !chord.label || typeof chord.label !== 'string') return null;
  if (!Number.isInteger(chord.rootPitchClass) || !Array.isArray(chord.pitchClasses) || chord.pitchClasses.length === 0) return null;
  const pitchClasses = [...new Set(chord.pitchClasses.filter((pitchClass) => Number.isInteger(pitchClass)).map((pitchClass) => ((pitchClass % 12) + 12) % 12))];
  if (pitchClasses.length === 0) return null;
  return {
    id: chord.id,
    rootPitchClass: ((chord.rootPitchClass % 12) + 12) % 12,
    pitchClasses,
    label: chord.label.slice(0, 48),
    sourcePresetId: typeof chord.sourcePresetId === 'string' ? chord.sourcePresetId : undefined,
  };
};

export const loadManualProgressionSession = (): ManualProgressionSession => {
  if (typeof window === 'undefined') return createDefaultSession();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSession();
    const parsed = JSON.parse(raw) as {
      schemaVersion?: unknown;
      chords?: unknown;
      activeChordId?: unknown;
      harmonySource?: unknown;
      revoiceOnChordChange?: unknown;
    };
    if ((parsed.schemaVersion !== 1 && parsed.schemaVersion !== STORAGE_SCHEMA_VERSION) || !Array.isArray(parsed.chords)) {
      return createDefaultSession();
    }
    const storedChords = parsed.chords
      .map(normalizeStoredChord)
      .filter((chord): chord is ProgressionChord => chord !== null)
      .slice(0, MAX_PROGRESSION_CHORDS);
    const chords = parsed.schemaVersion === 1 && storedChords.length === 0
      ? createDefaultManualProgression()
      : storedChords;
    const requestedActiveId = typeof parsed.activeChordId === 'string' ? parsed.activeChordId : null;
    return {
      chords,
      activeChordId: chords.some((chord) => chord.id === requestedActiveId) ? requestedActiveId : (chords[0]?.id ?? null),
      harmonySource: parsed.harmonySource === 'manual-progression' ? 'manual-progression' : 'image',
      revoiceOnChordChange: parsed.revoiceOnChordChange === true,
    };
  } catch {
    return createDefaultSession();
  }
};

export const saveManualProgressionSession = (session: ManualProgressionSession) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: STORAGE_SCHEMA_VERSION, ...session }));
  } catch {
    // The progression still works in-memory when storage is unavailable.
  }
};
