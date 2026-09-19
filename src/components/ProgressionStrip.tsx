import React, { useState } from 'react';
import { GripVertical, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { PITCH_CLASS_NAMES, type ProgressionChord } from '../musicEngine';

type ProgressionStripProps = {
  chords: ProgressionChord[];
  activeChordId: string | null;
  maxChords: number;
  revoiceOnChordChange: boolean;
  onAdd: () => void;
  onSelect: (id: string) => void;
  onEdit: (chord: ProgressionChord) => void;
  onDelete: (id: string) => void;
  onPreview: (pitchClasses: number[]) => void;
  onReorder: (draggedId: string, targetId: string) => void;
  onRevoiceOnChordChange: (enabled: boolean) => void;
};

const POSITION_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

export function ProgressionStrip({
  chords,
  activeChordId,
  maxChords,
  revoiceOnChordChange,
  onAdd,
  onSelect,
  onEdit,
  onDelete,
  onPreview,
  onReorder,
  onRevoiceOnChordChange,
}: ProgressionStripProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  return (
    <section className="progression-strip" aria-label="Manual chord progression">
      <div className="progression-strip-heading">
        <div><span className="eyebrow">CHORD PATH</span><p>{chords.length}/12 · Q next · W back · E reset</p></div>
        <div className="progression-strip-actions">
          <label className="progression-revoice" title="Immediately reshape sounding notes when the active chord changes">
            <input
              type="checkbox"
              checked={revoiceOnChordChange}
              onChange={(event) => onRevoiceOnChordChange(event.target.checked)}
            />
            <span>Live revoice</span>
          </label>
          <button type="button" className="quiet-button" disabled={chords.length >= maxChords} onClick={onAdd}><Plus size={14} />Add chord</button>
        </div>
      </div>
      <div className="progression-card-track">
        {chords.map((chord, index) => {
          const isActive = chord.id === activeChordId;
          return (
            <article
              key={chord.id}
              className={`progression-card ${isActive ? 'is-active' : ''} ${draggedId === chord.id ? 'is-dragging' : ''}`}
              draggable
              onDragStart={(event) => { setDraggedId(chord.id); event.dataTransfer.effectAllowed = 'move'; }}
              onDragEnd={() => setDraggedId(null)}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
              onDrop={(event) => { event.preventDefault(); if (draggedId) onReorder(draggedId, chord.id); setDraggedId(null); }}
            >
              <button type="button" className="progression-card-main" aria-current={isActive ? 'true' : undefined} onClick={() => onSelect(chord.id)}>
                <span className="progression-position"><GripVertical size={13} /><b>{index + 1}</b><kbd>{POSITION_KEYS[index]}</kbd></span>
                <strong>{chord.label}</strong>
                <span>{chord.pitchClasses.map((pitchClass) => PITCH_CLASS_NAMES[pitchClass]).join(' · ')}</span>
              </button>
              <div className="progression-card-actions">
                <button type="button" aria-label={`Preview ${chord.label}`} title="Preview chord" onClick={() => onPreview(chord.pitchClasses)}><Play size={13} fill="currentColor" /></button>
                <button type="button" aria-label={`Edit ${chord.label}`} title="Edit chord" onClick={() => onEdit(chord)}><Pencil size={13} /></button>
                <button type="button" aria-label={`Delete ${chord.label}`} title="Delete chord" onClick={() => onDelete(chord.id)}><Trash2 size={13} /></button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
