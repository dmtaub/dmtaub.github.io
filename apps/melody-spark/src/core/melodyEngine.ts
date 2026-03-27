import {
  CHORD_VARIANTS,
  DURATION_OPTIONS,
  type ChordVariantName,
  type DurationName,
  type EventItem,
  type MelodyItem,
  type MelodySettings,
  type ProgressionOption,
  type ScaleName,
  ROMAN_NUMERALS,
  SCALES,
} from '../types/music';

export const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};
export const SEMITONE_TO_NAME = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export const DURATION_TO_BEATS: Record<string, number> = { '8n': 0.5, '4n': 1, '2n': 2, '1n': 4 };
export const CHORD_QUALITIES: Record<string, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
};

export function weightedChoice<T>(items: Array<{ value: T; weight: number }>): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function midiToNoteName(midi: number): string {
  const safeMidi = clamp(Math.round(midi), 0, 127);
  const octave = Math.floor(safeMidi / 12) - 1;
  return `${SEMITONE_TO_NAME[safeMidi % 12]}${octave}`;
}

export function noteNameToMidi(noteName: string): number {
  const match = noteName.match(/^([A-G](?:#|b)?)(-?\d+)$/);
  if (!match) return 60;
  const pitch = match[1];
  const octave = parseInt(match[2], 10);
  return (octave + 1) * 12 + (NOTE_TO_SEMITONE[pitch] ?? 0);
}

export function parseNoteName(noteName: string) {
  const match = noteName.match(/^([A-G])([#b]?)(-?\d+)$/);
  if (!match) return { letter: 'C', accidental: '', octave: 4 };
  return { letter: match[1], accidental: match[2], octave: parseInt(match[3], 10) };
}

export function noteNameToStaffStep(noteName: string): number {
  const parsed = parseNoteName(noteName);
  const letterToStep: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  return parsed.octave * 7 + letterToStep[parsed.letter];
}

export function getAccidentalForNote(noteName: string): string {
  return parseNoteName(noteName).accidental;
}

export function formatOctaveShift(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

export function durationToSliderIndex(duration: DurationName): number {
  return DURATION_OPTIONS.indexOf(duration);
}

export function sliderIndexToDuration(index: number): DurationName {
  return DURATION_OPTIONS[clamp(index, 0, DURATION_OPTIONS.length - 1)] ?? '4n';
}

export function scaleDegreeToMidi(root: string, scaleName: ScaleName, degree: number, octaveBase = 4): number {
  const scale = SCALES[scaleName].intervals;
  const scaleLen = scale.length;
  const normalizedDegree = Math.max(0, degree);
  const octaveOffset = Math.floor(normalizedDegree / scaleLen);
  const degreeInScale = normalizedDegree % scaleLen;
  const rootSemitone = NOTE_TO_SEMITONE[root] ?? 0;
  return 12 * (octaveBase + 1 + octaveOffset) + rootSemitone + scale[degreeInScale];
}

export function getChordQualityFromDegree(scaleName: ScaleName, degree: number): keyof typeof CHORD_QUALITIES {
  const intervals = SCALES[scaleName].intervals;
  const scaleLen = intervals.length;
  const idx = ((degree % scaleLen) + scaleLen) % scaleLen;
  const root = intervals[idx];
  const third = intervals[(idx + 2) % scaleLen];
  const fifth = intervals[(idx + 4) % scaleLen];
  const thirdDistance = (third - root + 12) % 12;
  const fifthDistance = (fifth - root + 12) % 12;
  if (thirdDistance === 4 && fifthDistance === 7) return 'major';
  if (thirdDistance === 3 && fifthDistance === 7) return 'minor';
  return 'diminished';
}

export function getChordIntervalsForVariant(quality: keyof typeof CHORD_QUALITIES, chordVariant: ChordVariantName): number[] {
  if (chordVariant === 'triad') return CHORD_QUALITIES[quality] ?? CHORD_QUALITIES.major;
  if (chordVariant === 'seventh') return quality === 'major' ? [0, 4, 7, 11] : quality === 'minor' ? [0, 3, 7, 10] : [0, 3, 6, 10];
  if (chordVariant === 'maj7') return quality === 'minor' ? [0, 3, 7, 10] : quality === 'diminished' ? [0, 3, 6, 10] : [0, 4, 7, 11];
  if (chordVariant === 'min7') return quality === 'major' ? [0, 4, 7, 10] : quality === 'diminished' ? [0, 3, 6, 10] : [0, 3, 7, 10];
  if (chordVariant === 'dom7') return quality === 'minor' ? [0, 3, 7, 10] : quality === 'diminished' ? [0, 3, 6, 9] : [0, 4, 7, 10];
  if (chordVariant === 'dim7') return quality === 'major' ? [0, 4, 7, 10] : [0, 3, 6, 9];
  if (chordVariant === 'aug5') return quality === 'minor' ? [0, 3, 8] : [0, 4, 8];
  if (chordVariant === 'add9') return quality === 'minor' ? [0, 3, 7, 14] : quality === 'diminished' ? [0, 3, 6, 14] : [0, 4, 7, 14];
  return quality === 'minor' ? [0, 3, 8, 10, 14] : quality === 'diminished' ? [0, 3, 6, 9, 14] : [0, 4, 8, 10, 14];
}

export function getChordVariantSuffix(quality: keyof typeof CHORD_QUALITIES, chordVariant: ChordVariantName): string {
  if (chordVariant === 'triad') return quality === 'major' ? '' : quality === 'minor' ? 'm' : 'dim';
  if (chordVariant === 'seventh') return quality === 'major' ? 'maj7' : quality === 'minor' ? 'm7' : 'm7b5';
  return CHORD_VARIANTS[chordVariant].suffix;
}

export function buildChordFromDegree(rootKey: string, scaleName: ScaleName, degree: number, inversion = 0, octaveShift = 0, chordVariant: ChordVariantName = 'triad') {
  const rootMidi = scaleDegreeToMidi(rootKey, scaleName, degree, 4) + octaveShift * 12;
  const quality = getChordQualityFromDegree(scaleName, degree);
  const semitones = getChordIntervalsForVariant(quality, chordVariant);
  const voiced = semitones.map((interval) => rootMidi + interval);
  for (let i = 0; i < inversion; i += 1) voiced[i % voiced.length] += 12;
  voiced.sort((a, b) => a - b);
  const rootName = midiToNoteName(rootMidi).replace(/\d+$/, '');
  const suffix = getChordVariantSuffix(quality, chordVariant);
  return {
    quality,
    notes: voiced,
    label: (rootName + (suffix ? ` ${suffix}` : '')).trim(),
  };
}

export function getRomanNumeral(scaleName: ScaleName, degree: number): string {
  const intervals = SCALES[scaleName].intervals;
  const scaleLen = intervals.length;
  const idx = ((degree % scaleLen) + scaleLen) % scaleLen;
  const quality = getChordQualityFromDegree(scaleName, degree);
  let numeral = ROMAN_NUMERALS[idx] ?? 'I';
  if (quality === 'minor') numeral = numeral.toLowerCase() as typeof numeral;
  if (quality === 'diminished') numeral = `${numeral.toLowerCase()}°` as typeof numeral;
  return numeral;
}

export function getProgressionLabel(melody: MelodyItem[], scaleName: ScaleName): string {
  return melody.map((item) => getRomanNumeral(scaleName, item.degree)).join(' – ');
}

export function generateContour(length: number): 'rising' | 'falling' | 'arch' | 'valley' | 'wander' {
  const shapes = ['rising', 'falling', 'arch', 'valley', 'wander'] as const;
  return shapes[Math.floor(Math.random() * shapes.length)];
}

export function contourBias(shape: ReturnType<typeof generateContour>, i: number, length: number): number {
  const t = i / Math.max(1, length - 1);
  switch (shape) {
    case 'rising': return t * 2 - 1;
    case 'falling': return 1 - t * 2;
    case 'arch': return 1 - Math.abs(t - 0.5) * 4;
    case 'valley': return Math.abs(t - 0.5) * 4 - 1;
    default: return 0;
  }
}

export function syncItemNoteToDegree(item: MelodyItem, keyRoot: string, scale: ScaleName, nextDegree = item.degree): MelodyItem {
  return { ...item, degree: nextDegree, note: midiToNoteName(scaleDegreeToMidi(keyRoot, scale, nextDegree, 4)) };
}

export function generateMelody(args: MelodySettings): MelodyItem[] {
  const contour = generateContour(args.length);
  const motifLength = Math.min(4, Math.max(3, Math.floor(args.length / 4)));
  const motif: number[] = [];
  let degree = weightedChoice([{ value: 0, weight: 6 }, { value: 2, weight: 4 }, { value: 4, weight: 4 }]);

  for (let i = 0; i < motifLength; i += 1) {
    const leapWeight = args.surprise / 100;
    const move = weightedChoice([
      { value: 0, weight: 2 }, { value: 1, weight: 6 }, { value: -1, weight: 6 },
      { value: 2, weight: 2 + leapWeight * 5 }, { value: -2, weight: 2 + leapWeight * 5 },
      { value: 3, weight: 1 + leapWeight * 3 }, { value: -3, weight: 1 + leapWeight * 3 },
    ]);
    const bias = contourBias(contour, i, motifLength);
    if (bias > 0.35) degree += Math.random() < 0.65 ? 1 : 0;
    if (bias < -0.35) degree -= Math.random() < 0.65 ? 1 : 0;
    degree = clamp(degree + move, 0, 11);
    motif.push(degree);
  }

  const durationWeights: Array<{ value: DurationName; weight: number }> = [
    { value: '8n', weight: 4 }, { value: '4n', weight: 7 }, { value: '2n', weight: 3 }, { value: '1n', weight: 1 },
  ];
  const phrase: MelodyItem[] = [];
  for (let i = 0; i < args.length; i += 1) {
    let d = motif[i % motifLength];
    if (i >= motifLength && Math.random() < 0.35) d += weightedChoice([{ value: 0, weight: 5 }, { value: 1, weight: 2 }, { value: -1, weight: 2 }]);
    d = clamp(d, 0, 11);
    const midi = scaleDegreeToMidi(args.key, args.scale, d, 4);
    phrase.push({ degree: d, note: midiToNoteName(midi), duration: weightedChoice(durationWeights), inversion: 0, octaveShift: 0, chordVariant: 'triad' });
  }
  const cadenceDegree = weightedChoice([{ value: 0, weight: 7 }, { value: 2, weight: 3 }, { value: 4, weight: 4 }]);
  phrase[phrase.length - 1] = { degree: cadenceDegree, note: midiToNoteName(scaleDegreeToMidi(args.key, args.scale, cadenceDegree, 4)), duration: '2n', inversion: 0, octaveShift: 0, chordVariant: 'triad' };
  return phrase;
}

export function mutateMelody(melody: MelodyItem[]): MelodyItem[] {
  return melody.map((note, i, arr) => {
    if (i === arr.length - 1) return note;
    if (Math.random() < 0.28) {
      const midi = clamp(noteNameToMidi(note.note) + (Math.random() < 0.5 ? -1 : 1), 48, 84);
      return { ...note, note: midiToNoteName(midi) };
    }
    return note;
  });
}

export function totalDuration(melody: MelodyItem[]): number {
  return melody.reduce((sum, item) => sum + (DURATION_TO_BEATS[item.duration] ?? 1), 0);
}

export function melodyToEvents(melody: MelodyItem[], chordMode: boolean, keyRoot: string, scale: ScaleName): EventItem[] {
  let cursor = 0;
  return melody.map((item) => {
    const eventBase = { time: cursor, duration: item.duration, degree: item.degree, inversion: item.inversion || 0, octaveShift: item.octaveShift || 0 };
    cursor += DURATION_TO_BEATS[item.duration] ?? 1;
    if (chordMode) {
      const chord = buildChordFromDegree(keyRoot, scale, item.degree, item.inversion || 0, item.octaveShift || 0, item.chordVariant);
      return { ...eventBase, notes: chord.notes.map(midiToNoteName), chordLabel: chord.label };
    }
    const midi = noteNameToMidi(item.note) + (item.octaveShift || 0) * 12;
    return { ...eventBase, notes: [midiToNoteName(midi)], chordLabel: midiToNoteName(midi) };
  });
}

export function pitchStatsForView(melody: MelodyItem[], chordMode: boolean, keyRoot: string, scale: ScaleName) {
  const values = melody.flatMap((item) => chordMode
    ? buildChordFromDegree(keyRoot, scale, item.degree, item.inversion || 0, item.octaveShift || 0, item.chordVariant).notes
    : [noteNameToMidi(item.note) + (item.octaveShift || 0) * 12]);
  return { min: Math.min(...values), max: Math.max(...values) };
}

export function getPitchClassSetForDegree(keyRoot: string, scale: ScaleName, degree: number, chordVariant: ChordVariantName): Set<number> {
  return new Set(buildChordFromDegree(keyRoot, scale, degree, 0, 0, chordVariant).notes.map((note) => ((note % 12) + 12) % 12));
}

export function countSharedPitchClasses(a?: Set<number>, b?: Set<number>): number {
  if (!a || !b) return 0;
  let count = 0;
  a.forEach((value) => {
    if (b.has(value)) count += 1;
  });
  return count;
}

export function percentShared(shared: number, totalCandidateNotes: number): number {
  if (!totalCandidateNotes) return 0;
  return Math.round((shared / totalCandidateNotes) * 100);
}

export function getProgressionOptionsForIndex(melody: MelodyItem[], index: number, keyRoot: string, scale: ScaleName, chordVariant: ChordVariantName): ProgressionOption[] {
  const scaleLen = SCALES[scale].intervals.length;
  const melodyLen = melody.length;
  const prevIndex = (index - 1 + melodyLen) % melodyLen;
  const nextIndex = (index + 1) % melodyLen;
  const prevItem = melody[prevIndex];
  const nextItem = melody[nextIndex];
  const prev = prevItem ? getPitchClassSetForDegree(keyRoot, scale, prevItem.degree, prevItem.chordVariant) : undefined;
  const next = nextItem ? getPitchClassSetForDegree(keyRoot, scale, nextItem.degree, nextItem.chordVariant) : undefined;

  const options = Array.from({ length: scaleLen }, (_, degree) => {
    const candidate = getPitchClassSetForDegree(keyRoot, scale, degree, chordVariant);
    const candidateSize = candidate.size;
    const prevShared = countSharedPitchClasses(candidate, prev);
    const nextShared = countSharedPitchClasses(candidate, next);
    const numeral = getRomanNumeral(scale, degree);
    const prevPercent = percentShared(prevShared, candidateSize);
    const nextPercent = percentShared(nextShared, candidateSize);
    return {
      degree,
      label: `${numeral}  ←${prevPercent}% ${nextPercent}%→`,
      prevShared,
      nextShared,
      totalShared: prevShared + nextShared,
      prevPercent,
      nextPercent,
    };
  });

  return options.sort((a, b) => b.totalShared - a.totalShared || b.prevPercent - a.prevPercent || b.nextPercent - a.nextPercent || a.degree - b.degree);
}

export function encodeVariableLength(value: number): number[] {
  let buffer = value & 0x7f;
  const bytes: number[] = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}

export function makeMidiFile(melody: MelodyItem[], chordMode: boolean, keyRoot: string, scale: ScaleName, tempo: number): Blob {
  const ticksPerQuarter = 480;
  const events: Array<{ tick: number; bytes: number[] }> = [];
  const eventData = melodyToEvents(melody, chordMode, keyRoot, scale);
  const tempoMicro = Math.round(60000000 / tempo);
  events.push({ tick: 0, bytes: [0xff, 0x51, 0x03, (tempoMicro >> 16) & 0xff, (tempoMicro >> 8) & 0xff, tempoMicro & 0xff] });
  eventData.forEach((event) => {
    const startTick = Math.round(event.time * ticksPerQuarter);
    const durTick = Math.round((DURATION_TO_BEATS[event.duration] ?? 1) * ticksPerQuarter);
    event.notes.map(noteNameToMidi).forEach((midi) => {
      events.push({ tick: startTick, bytes: [0x90, midi, 100] });
      events.push({ tick: startTick + durTick, bytes: [0x80, midi, 0] });
    });
  });
  events.sort((a, b) => a.tick - b.tick || a.bytes[0] - b.bytes[0]);
  let lastTick = 0;
  const trackBytes: number[] = [];
  for (const event of events) {
    const delta = event.tick - lastTick;
    trackBytes.push(...encodeVariableLength(delta), ...event.bytes);
    lastTick = event.tick;
  }
  trackBytes.push(0x00, 0xff, 0x2f, 0x00);
  const header = [0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, (ticksPerQuarter >> 8) & 0xff, ticksPerQuarter & 0xff];
  const trackHeader = [0x4d, 0x54, 0x72, 0x6b, (trackBytes.length >> 24) & 0xff, (trackBytes.length >> 16) & 0xff, (trackBytes.length >> 8) & 0xff, trackBytes.length & 0xff];
  return new Blob([new Uint8Array([...header, ...trackHeader, ...trackBytes])], { type: 'audio/midi' });
}

export function serializeMelodyDocument(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}
