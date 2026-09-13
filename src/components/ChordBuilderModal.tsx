import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, RotateCcw, X } from 'lucide-react';
import { PITCH_CLASS_NAMES, type ChordDefinition, type ProgressionChord } from '../musicEngine';
import { createProgressionChordFromPreset } from '../manualProgression';

type ChordDraft = Omit<ProgressionChord, 'id'>;

type ChordBuilderModalProps = {
  isOpen: boolean;
  defaultRootPitchClass: number;
  definitions: ChordDefinition[];
  editingChord: ProgressionChord | null;
  isAtLimit: boolean;
  onClose: () => void;
  onSave: (chord: ChordDraft) => void;
  onPreview: (pitchClasses: number[]) => void;
};

const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_KEYS = [
  { pitchClass: 1, left: 14.285 },
  { pitchClass: 3, left: 28.57 },
  { pitchClass: 6, left: 57.14 },
  { pitchClass: 8, left: 71.425 },
  { pitchClass: 10, left: 85.71 },
];

export function ChordBuilderModal({
  isOpen,
  defaultRootPitchClass,
  definitions,
  editingChord,
  isAtLimit,
  onClose,
  onSave,
  onPreview,
}: ChordBuilderModalProps) {
  const defaultDefinition = definitions[0];
  const [rootPitchClass, setRootPitchClass] = useState(defaultRootPitchClass);
  const [presetId, setPresetId] = useState(defaultDefinition?.id ?? '');
  const [selectedPitchClasses, setSelectedPitchClasses] = useState<number[]>([]);
  const [label, setLabel] = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);

  const applyPreset = (nextRoot: number, nextPresetId: string) => {
    const definition = definitions.find((entry) => entry.id === nextPresetId) ?? defaultDefinition;
    if (!definition) return;
    const draft = createProgressionChordFromPreset(nextRoot, definition);
    setRootPitchClass(draft.rootPitchClass);
    setPresetId(definition.id);
    setSelectedPitchClasses(draft.pitchClasses);
    setLabel(draft.label);
  };

  useEffect(() => {
    if (!isOpen || !defaultDefinition) return;
    if (editingChord) {
      setRootPitchClass(editingChord.rootPitchClass);
      setPresetId(editingChord.sourcePresetId ?? defaultDefinition.id);
      setSelectedPitchClasses([...editingChord.pitchClasses]);
      setLabel(editingChord.label);
    } else {
      const draft = createProgressionChordFromPreset(defaultRootPitchClass, defaultDefinition);
      setRootPitchClass(draft.rootPitchClass);
      setPresetId(defaultDefinition.id);
      setSelectedPitchClasses(draft.pitchClasses);
      setLabel(draft.label);
    }
    window.setTimeout(() => labelInputRef.current?.focus(), 0);
  }, [defaultDefinition, defaultRootPitchClass, editingChord, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const selectedNames = useMemo(
    () => Array.from({ length: 12 }, (_, offset) => (rootPitchClass + offset) % 12)
      .filter((pitchClass) => selectedPitchClasses.includes(pitchClass))
      .map((pitchClass) => PITCH_CLASS_NAMES[pitchClass]),
    [rootPitchClass, selectedPitchClasses],
  );

  if (!isOpen) return null;

  const togglePitchClass = (pitchClass: number) => {
    setSelectedPitchClasses((current) => current.includes(pitchClass)
      ? current.filter((entry) => entry !== pitchClass)
      : [...current, pitchClass]);
  };

  const renderPianoKey = (pitchClass: number, kind: 'white' | 'black', left?: number) => {
    const selected = selectedPitchClasses.includes(pitchClass);
    return (
      <button
        key={pitchClass}
        type="button"
        className={`piano-key piano-key-${kind} ${selected ? 'is-selected' : ''}`}
        style={left === undefined ? undefined : { left: `${left}%` }}
        aria-pressed={selected}
        aria-label={`${selected ? 'Remove' : 'Add'} ${PITCH_CLASS_NAMES[pitchClass]}`}
        onClick={() => togglePitchClass(pitchClass)}
      >
        <span>{PITCH_CLASS_NAMES[pitchClass]}</span>
      </button>
    );
  };

  const canSave = selectedPitchClasses.length > 0 && label.trim().length > 0 && (!isAtLimit || editingChord !== null);

  return (
    <div className="chord-modal-backdrop" role="presentation" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="chord-modal" role="dialog" aria-modal="true" aria-labelledby="chord-builder-title">
        <div className="chord-modal-header">
          <div><span className="eyebrow">MANUAL PROGRESSION</span><h2 id="chord-builder-title">{editingChord ? 'Edit chord' : 'Build chord'}</h2></div>
          <button type="button" className="icon-button" aria-label="Close chord builder" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="chord-builder-selectors">
          <label><span>Root</span><select value={rootPitchClass} onChange={(event) => applyPreset(Number(event.target.value), presetId)}>{PITCH_CLASS_NAMES.map((name, pitchClass) => <option key={name} value={pitchClass}>{name}</option>)}</select></label>
          <label><span>Chord preset</span><select value={presetId} onChange={(event) => applyPreset(rootPitchClass, event.target.value)}>
            {[...new Set(definitions.map((definition) => definition.category))].map((category) => (
              <optgroup key={category} label={category}>{definitions.filter((definition) => definition.category === category).map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}</optgroup>
            ))}
          </select></label>
        </div>

        <div className="piano-editor" aria-label="Chord pitch classes">
          <div className="piano-white-keys">{WHITE_KEYS.map((pitchClass) => renderPianoKey(pitchClass, 'white'))}</div>
          <div className="piano-black-keys">{BLACK_KEYS.map((key) => renderPianoKey(key.pitchClass, 'black', key.left))}</div>
        </div>

        <div className="selected-chord-notes"><span>Selected notes</span><strong>{selectedNames.length > 0 ? selectedNames.join('  ·  ') : 'Choose at least one note'}</strong></div>
        <label className="chord-name-field"><span>Chord name</span><input ref={labelInputRef} value={label} maxLength={48} onChange={(event) => setLabel(event.target.value)} placeholder="Name this chord" /></label>

        <div className="chord-modal-actions">
          <button type="button" className="quiet-button" disabled={selectedPitchClasses.length === 0} onClick={() => onPreview(selectedPitchClasses)}><Play size={14} fill="currentColor" />Preview</button>
          <button type="button" className="quiet-button" onClick={() => { setSelectedPitchClasses([]); setLabel(''); }}><RotateCcw size={14} />Clear</button>
          <button type="button" className="primary-button" disabled={!canSave} onClick={() => onSave({ rootPitchClass, pitchClasses: selectedPitchClasses, label: label.trim(), sourcePresetId: presetId })}>{editingChord ? 'Save chord' : 'Add to progression'}</button>
        </div>
        {isAtLimit && !editingChord && <p className="chord-limit-message">12 chord maximum reached. Edit or remove a card to continue.</p>}
      </section>
    </div>
  );
}

