import * as Tone from 'tone';
import { melodyToEvents, totalDuration } from './melodyEngine';
import type { MelodyItem, ScaleName } from '../types/music';

export class MelodyPlayer {
  private synth: Tone.PolySynth;
  private part: Tone.Part | null = null;

  constructor() {
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.9 },
    }).toDestination();
  }

  async preview(notes: string[] | string, duration = '2n') {
    await Tone.start();
    this.synth.triggerAttackRelease(notes, duration, Tone.now(), Array.isArray(notes) ? 0.7 : 0.9);
  }

  async play(melody: MelodyItem[], chordMode: boolean, keyRoot: string, scale: ScaleName, bpm: number, loop = false) {
    await Tone.start();
    this.stop();

    const events = melodyToEvents(melody, chordMode, keyRoot, scale);
    Tone.Transport.bpm.value = bpm;

    this.part = new Tone.Part((time, value: any) => {
      this.synth.triggerAttackRelease(value.notes, value.duration, time, chordMode ? 0.65 : 0.85);
    }, events).start(0);

    this.part.loop = loop;
    this.part.loopEnd = totalDuration(melody);
    Tone.Transport.start();
    return totalDuration(melody);
  }

  stop() {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    this.part?.dispose();
    this.part = null;
    this.synth.releaseAll();
  }

  dispose() {
    this.stop();
    this.synth.dispose();
  }
}
