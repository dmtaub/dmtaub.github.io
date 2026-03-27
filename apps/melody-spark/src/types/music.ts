export const KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
export const LENGTHS = [4, 8, 16, 32] as const;
export const DURATION_OPTIONS = ["1n", "2n", "4n", "8n"] as const;
export const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"] as const;

export const SCALES = {
  major: { label: "Major", intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: "Natural Minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { label: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
  pentatonic: { label: "Pentatonic", intervals: [0, 2, 4, 7, 9] },
} as const;

export const CHORD_VARIANTS = {
  triad: { label: "Triad", suffix: "", mode: "literal" },
  seventh: { label: "7th", suffix: "7", mode: "theory" },
  maj7: { label: "M7", suffix: "maj7", mode: "literal" },
  min7: { label: "m7", suffix: "m7", mode: "literal" },
  dom7: { label: "7", suffix: "7", mode: "literal" },
  dim7: { label: "dim7", suffix: "dim7", mode: "literal" },
  aug5: { label: "aug5", suffix: "aug5", mode: "literal" },
  add9: { label: "add9", suffix: "add9", mode: "literal" },
  plusm7plus9: { label: "+m7+9", suffix: "+m7+9", mode: "literal" },
} as const;

export type ScaleName = keyof typeof SCALES;
export type DurationName = typeof DURATION_OPTIONS[number];
export type ChordVariantName = keyof typeof CHORD_VARIANTS;

export type MelodyItem = {
  degree: number;
  note: string;
  duration: DurationName;
  inversion: number;
  octaveShift: number;
  chordVariant: ChordVariantName;
};

export type EventItem = {
  time: number;
  duration: DurationName;
  degree: number;
  inversion: number;
  octaveShift: number;
  notes: string[];
  chordLabel: string;
};

export type ProgressionOption = {
  degree: number;
  label: string;
  prevShared: number;
  nextShared: number;
  totalShared: number;
  prevPercent: number;
  nextPercent: number;
};

export type MelodySettings = {
  key: string;
  scale: ScaleName;
  length: number;
  surprise: number;
};
