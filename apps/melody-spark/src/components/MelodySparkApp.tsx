import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Layers3, Music2, Play, RefreshCw, Repeat, Sparkles, Square } from 'lucide-react';
import { CHORD_VARIANTS, DURATION_OPTIONS, KEYS, LENGTHS, SCALES, type ChordVariantName, type DurationName, type MelodyItem, type ScaleName } from '../types/music';
import {
  buildChordFromDegree,
  durationToSliderIndex,
  formatOctaveShift,
  generateMelody,
  getProgressionLabel,
  getProgressionOptionsForIndex,
  getRomanNumeral,
  makeMidiFile,
  midiToNoteName,
  mutateMelody,
  noteNameToMidi,
  pitchStatsForView,
  sliderIndexToDuration,
  syncItemNoteToDegree,
} from '../core/melodyEngine';
import { MelodyPlayer } from '../core/melodyPlayer';
import { StaffChordView } from './StaffChordView';

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function MelodySparkApp() {
  const [keyRoot, setKeyRoot] = useState<string>('C');
  const [scale, setScale] = useState<ScaleName>('minor');
  const [length, setLength] = useState<number>(16);
  const [tempo, setTempo] = useState<number>(100);
  const [surprise, setSurprise] = useState<number>(28);
  const [loopEnabled, setLoopEnabled] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [chordMode, setChordMode] = useState<boolean>(false);
  const [globalChordVariant, setGlobalChordVariant] = useState<ChordVariantName>('triad');
  const [melody, setMelody] = useState<MelodyItem[]>(() => generateMelody({ key: 'C', scale: 'minor', length: 16, surprise: 28 }));

  const playerRef = useRef<MelodyPlayer | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  useEffect(() => {
    playerRef.current = new MelodyPlayer();
    return () => {
      playerRef.current?.dispose();
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setMelody((current) => current.map((item) => syncItemNoteToDegree(item, keyRoot, scale)));
  }, [keyRoot, scale]);

  const pitchStats = useMemo(() => pitchStatsForView(melody, chordMode, keyRoot, scale), [melody, chordMode, keyRoot, scale]);
  const progressionLabel = useMemo(() => getProgressionLabel(melody, scale), [melody, scale]);

  const stopPlayback = () => {
    playerRef.current?.stop();
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    setIsPlaying(false);
  };

  const regenerate = () => setMelody(generateMelody({ key: keyRoot, scale, length, surprise }).map((item) => ({ ...item, chordVariant: globalChordVariant })));
  const vary = () => setMelody((current) => mutateMelody(current));

  const cycleInversion = (index: number) => setMelody((current) => current.map((item, i) => {
    if (i !== index) return item;
    const inversionCount = buildChordFromDegree(keyRoot, scale, item.degree, 0, item.octaveShift || 0, item.chordVariant).notes.length;
    return { ...item, inversion: ((item.inversion || 0) + 1) % Math.max(1, inversionCount) };
  }));

  const shiftOctaveUp = (index: number) => setMelody((current) => current.map((item, i) => i === index ? { ...item, octaveShift: (item.octaveShift || 0) + 1 } : item));
  const shiftOctaveDown = (index: number) => setMelody((current) => current.map((item, i) => i === index ? { ...item, octaveShift: (item.octaveShift || 0) - 1 } : item));
  const updateDuration = (index: number, nextDuration: DurationName) => setMelody((current) => current.map((item, i) => i === index ? { ...item, duration: nextDuration } : item));
  const updateDegree = (index: number, nextDegree: number) => setMelody((current) => current.map((item, i) => i === index ? syncItemNoteToDegree(item, keyRoot, scale, nextDegree) : item));
  const updateChordVariant = (index: number, nextVariant: ChordVariantName) => setMelody((current) => current.map((item, i) => {
    if (i !== index) return item;
    const newCount = buildChordFromDegree(keyRoot, scale, item.degree, 0, item.octaveShift || 0, nextVariant).notes.length;
    const keptInversion = (item.inversion || 0) % Math.max(1, newCount);
    return { ...item, chordVariant: nextVariant, inversion: keptInversion };
  }));
  const updateAllChordVariants = (nextVariant: ChordVariantName) => {
    setGlobalChordVariant(nextVariant);
    setMelody((current) => current.map((item) => {
      const newCount = buildChordFromDegree(keyRoot, scale, item.degree, 0, item.octaveShift || 0, nextVariant).notes.length;
      const keptInversion = (item.inversion || 0) % Math.max(1, newCount);
      return { ...item, chordVariant: nextVariant, inversion: keptInversion };
    }));
  };

  const previewItem = async (index: number) => {
    const item = melody[index];
    if (!item || !playerRef.current) return;
    if (chordMode) {
      const chord = buildChordFromDegree(keyRoot, scale, item.degree, item.inversion || 0, item.octaveShift || 0, item.chordVariant);
      await playerRef.current.preview(chord.notes.map(midiToNoteName), item.duration);
      return;
    }
    const midi = noteNameToMidi(item.note) + (item.octaveShift || 0) * 12;
    await playerRef.current.preview(midiToNoteName(midi), item.duration);
  };

  const play = async () => {
    if (!playerRef.current) return;
    stopPlayback();
    const totalBeats = await playerRef.current.play(melody, chordMode, keyRoot, scale, tempo, loopEnabled);
    setIsPlaying(true);
    if (!loopEnabled) {
      const ms = (60 / tempo) * totalBeats * 1000 + 250;
      stopTimerRef.current = window.setTimeout(() => {
        setIsPlaying(false);
        stopTimerRef.current = null;
      }, ms);
    }
  };

  const exportMidi = () => {
    const blob = makeMidiFile(melody, chordMode, keyRoot, scale, tempo);
    const mode = chordMode ? 'chords' : 'melody';
    downloadFile(blob, `melody-spark-${keyRoot}-${scale}-${mode}.mid`);
  };

  return (
    <div className="app-shell">
      <div className="panel-grid">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <section className="card">
            <div className="card-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <h1 className="card-title">Melody Spark</h1>
                  <p className="muted">Generate melodic ideas, flip into chord mode, audition inversions, and export the good ones as MIDI.</p>
                </div>
                <div className="badges">
                  <span className="badge">{keyRoot} {SCALES[scale].label}</span>
                  <span className="badge">{tempo} BPM</span>
                  <span className="badge">{chordMode ? 'Chord Mode' : 'Single Notes'}</span>
                </div>
              </div>
            </div>
            <div className="card-content">
              <div className="topbar">
                <div className="field"><label>Key</label><select className="select" value={keyRoot} onChange={(e) => setKeyRoot(e.target.value)}>{KEYS.map((k) => <option key={k}>{k}</option>)}</select></div>
                <div className="field"><label>Scale</label><select className="select" value={scale} onChange={(e) => setScale(e.target.value as ScaleName)}>{Object.entries(SCALES).map(([value, cfg]) => <option key={value} value={value}>{cfg.label}</option>)}</select></div>
                <div className="field"><label>Phrase Length</label><select className="select" value={String(length)} onChange={(e) => setLength(Number(e.target.value))}>{LENGTHS.map((v) => <option key={v} value={v}>{v} notes</option>)}</select></div>
                <div className="field"><label>Chord Family</label><select className="select" value={globalChordVariant} onChange={(e) => updateAllChordVariants(e.target.value as ChordVariantName)}>{Object.entries(CHORD_VARIANTS).map(([value, cfg]) => <option key={value} value={value}>{cfg.label}</option>)}</select></div>
                <div className="field"><label>Tempo: {tempo}</label><input type="range" min={50} max={180} step={1} value={tempo} onChange={(e) => setTempo(Number(e.target.value))} /></div>
              </div>

              <div className="toolbar">
                <div className="field"><label>Surprise: {surprise}%</label><input type="range" min={0} max={100} step={1} value={surprise} onChange={(e) => setSurprise(Number(e.target.value))} /></div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
                  <button className="button primary" onClick={regenerate}><Sparkles size={16} /> Generate</button>
                  <button className="button secondary" onClick={vary}><RefreshCw size={16} /> Variation</button>
                  <button className={`button ${loopEnabled ? 'active' : 'secondary'}`} onClick={() => setLoopEnabled((v) => !v)}><Repeat size={16} /> {loopEnabled ? 'Looping' : 'Loop Off'}</button>
                  <button className={`button ${chordMode ? 'active' : 'secondary'}`} onClick={() => setChordMode((v) => !v)}><Layers3 size={16} /> {chordMode ? 'Chord Mode On' : 'Chord Mode'}</button>
                </div>
              </div>

              <div className="actionbar">
                <button className="button primary" onClick={play}><Play size={18} /> Play</button>
                <button className="button danger" onClick={stopPlayback}><Square size={18} /> Stop</button>
                <button className="button secondary" onClick={exportMidi}><Download size={18} /> Export MIDI</button>
                <div className="badge">{isPlaying ? 'Now playing' : 'Ready'}</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{chordMode ? 'Chord Staff' : 'Phrase'}</div>
                  <div className="tiny">Progression: {progressionLabel}</div>
                </div>
                <div className="muted">Range: {midiToNoteName(pitchStats.min)} → {midiToNoteName(pitchStats.max)}</div>
              </div>

              <div className="tile-grid">
                {melody.map((item, index) => {
                  const chord = buildChordFromDegree(keyRoot, scale, item.degree, item.inversion || 0, item.octaveShift || 0, item.chordVariant);
                  const noteMidis = chordMode ? chord.notes : [noteNameToMidi(item.note) + (item.octaveShift || 0) * 12];
                  const label = chordMode ? `${getRomanNumeral(scale, item.degree)} · ${chord.label}` : `${getRomanNumeral(scale, item.degree)} · ${midiToNoteName(noteMidis[0])}`;
                  const progressionOptions = getProgressionOptionsForIndex(melody, index, keyRoot, scale, item.chordVariant);
                  const inversionCount = buildChordFromDegree(keyRoot, scale, item.degree, 0, item.octaveShift || 0, item.chordVariant).notes.length;

                  return (
                    <motion.div key={`${item.note}-${index}-${item.inversion}-${item.octaveShift}-${item.duration}-${item.chordVariant}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.02 }} className="tile">
                      {chordMode ? (
                        <StaffChordView notes={noteMidis} onClick={() => cycleInversion(index)} />
                      ) : (
                        <button type="button" onClick={() => cycleInversion(index)} className="note-bar" title="Click to cycle inversion used by chord mode">
                          <div className="note-bar-fill" style={{ height: `${((noteMidis[0] - pitchStats.min) / Math.max(1, pitchStats.max - pitchStats.min)) * 80 + 20}%` }} />
                        </button>
                      )}
                      <div className="tile-title">{label}</div>
                      <div className="tile-controls">
                        <div className="field">
                          <label className="tiny">Progression</label>
                          <select className="select" value={String(item.degree)} onChange={(e) => updateDegree(index, Number(e.target.value))}>
                            {progressionOptions.map((option) => <option key={`${index}-${option.degree}`} value={option.degree}>{option.label}</option>)}
                          </select>
                        </div>
                        <div className="field">
                          <label className="tiny">Chord</label>
                          <select className="select" value={item.chordVariant} onChange={(e) => updateChordVariant(index, e.target.value as ChordVariantName)}>
                            {Object.entries(CHORD_VARIANTS).map(([value, cfg]) => <option key={`${index}-variant-${value}`} value={value}>{cfg.label}</option>)}
                          </select>
                        </div>
                        <div className="field">
                          <label className="tiny">Duration: {item.duration}</label>
                          <input type="range" min={0} max={DURATION_OPTIONS.length - 1} step={1} value={durationToSliderIndex(item.duration)} onChange={(e) => updateDuration(index, sliderIndexToDuration(Number(e.target.value)))} />
                          <div className="tiny" style={{ display: 'flex', justifyContent: 'space-between' }}><span>1n</span><span>2n</span><span>4n</span><span>8n</span></div>
                        </div>
                      </div>
                      <div className="tile-actions">
                        <button className="small-button" onClick={() => previewItem(index)}>Test</button>
                        <button className="small-button" onClick={() => shiftOctaveDown(index)}>-8va</button>
                        <button className="small-button" onClick={() => shiftOctaveUp(index)}>+8va</button>
                      </div>
                      <div className="tiny">Inversion {item.inversion + 1}/{inversionCount} • Octave {formatOctaveShift(item.octaveShift || 0)}</div>
                    </motion.div>
                  );
                })}
              </div>

              <p className="tiny" style={{ marginTop: 16 }}>Progression overlap shows percentages based on the number of notes in the currently selected chord variant, including loop wraparound.</p>
            </div>
          </section>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <section className="card">
            <div className="card-header"><h2 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><Music2 size={20} /> Brainstorm Tips</h2></div>
            <div className="card-content sidebar-list">
              <div className="sidebar-item">Use single-note mode to hear hook contour first, then switch to chord mode to see whether the harmony suggests a verse or chorus.</div>
              <div className="sidebar-item">Try higher-overlap choices for smoother voice leading, then change the chord variant per tile to hear how sevenths, ninths, and altered fifths change the overlap ranking.</div>
              <div className="sidebar-item">Longer durations can turn a busy phrase into something hooky. Shorter durations can make the same harmony feel like a riff instead of a pad.</div>
              <div className="sidebar-item">Use the top-level Chord Family control when you want music-theory-based harmony across the whole phrase, then override individual tiles when one chord wants to break the pattern.</div>
              <div className="sidebar-item">Export MIDI when something clicks, then drag it into your DAW and layer bass, drums, or a pad under it.</div>
            </div>
          </section>
        </motion.div>
      </div>
    </div>
  );
}
