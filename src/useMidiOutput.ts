import { useCallback, useEffect, useRef, useState } from 'react';

type MidiStatus = 'disabled' | 'ready' | 'no-outputs' | 'error' | 'unsupported';

type MidiOutputInfo = {
  id: string;
  name: string;
  manufacturer?: string;
};

type MidiOutputPort = {
  id: string;
  name?: string;
  manufacturer?: string;
  send: (data: number[]) => void;
};

type MidiAccessLike = {
  outputs: Map<string, MidiOutputPort>;
  onstatechange: ((event: unknown) => void) | null;
};

type MidiNavigator = Navigator & {
  requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MidiAccessLike>;
};

const MIDI_CHANNEL = 1;

const clampByte = (value: number) => Math.max(0, Math.min(127, Math.round(value)));

const statusByte = (base: number, channel: number) => base + Math.max(0, Math.min(15, channel - 1));

export function useMidiOutput() {
  const [outputs, setOutputs] = useState<MidiOutputInfo[]>([]);
  const [selectedOutputId, setSelectedOutputIdState] = useState<string>('');
  const [status, setStatus] = useState<MidiStatus>('disabled');
  const [error, setError] = useState<string | null>(null);

  const accessRef = useRef<MidiAccessLike | null>(null);

  const getSelectedOutput = useCallback(() => {
    const access = accessRef.current;
    if (!access || !selectedOutputId) return null;
    return access.outputs.get(selectedOutputId) ?? null;
  }, [selectedOutputId]);

  const allNotesOff = useCallback(() => {
    const output = getSelectedOutput();
    if (!output) return;

    // CC 120 (all sound off), CC 123 (all notes off)
    output.send([statusByte(0xb0, MIDI_CHANNEL), 120, 0]);
    output.send([statusByte(0xb0, MIDI_CHANNEL), 123, 0]);
  }, [getSelectedOutput]);

  const refreshOutputs = useCallback((access: MidiAccessLike) => {
    const nextOutputs = Array.from(access.outputs.values()).map((output) => ({
      id: output.id,
      name: output.name ?? 'Unnamed MIDI Output',
      manufacturer: output.manufacturer,
    }));

    setOutputs(nextOutputs);
    setSelectedOutputIdState((prev) => {
      if (nextOutputs.length === 0) return '';
      if (prev && nextOutputs.some((output) => output.id === prev)) return prev;
      return nextOutputs[0].id;
    });
    setStatus(nextOutputs.length === 0 ? 'no-outputs' : 'ready');
  }, []);

  const enable = useCallback(async () => {
    const midiNavigator = navigator as MidiNavigator;
    if (!midiNavigator.requestMIDIAccess) {
      setStatus('unsupported');
      setError('Web MIDI is not supported in this browser.');
      return;
    }

    try {
      const access = await midiNavigator.requestMIDIAccess({ sysex: false });
      accessRef.current = access;
      setError(null);
      refreshOutputs(access);
      access.onstatechange = () => {
        if (!accessRef.current) return;
        refreshOutputs(accessRef.current);
      };
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to enable Web MIDI.');
    }
  }, [refreshOutputs]);

  const sendNoteOn = useCallback(
    (note: number, velocity: number) => {
      const output = getSelectedOutput();
      if (!output) return;
      output.send([statusByte(0x90, MIDI_CHANNEL), clampByte(note), clampByte(velocity)]);
    },
    [getSelectedOutput],
  );

  const sendNoteOff = useCallback(
    (note: number) => {
      const output = getSelectedOutput();
      if (!output) return;
      output.send([statusByte(0x80, MIDI_CHANNEL), clampByte(note), 0]);
    },
    [getSelectedOutput],
  );

  const panic = useCallback(() => {
    allNotesOff();
  }, [allNotesOff]);

  const setSelectedOutputId = useCallback(
    (nextOutputId: string) => {
      allNotesOff();
      setSelectedOutputIdState(nextOutputId);
    },
    [allNotesOff],
  );

  useEffect(() => {
    return () => {
      allNotesOff();
      if (accessRef.current) {
        accessRef.current.onstatechange = null;
      }
      accessRef.current = null;
    };
  }, [allNotesOff]);

  return {
    enable,
    outputs,
    selectedOutputId,
    setSelectedOutputId,
    status,
    error,
    sendNoteOn,
    sendNoteOff,
    allNotesOff,
    panic,
  };
}
