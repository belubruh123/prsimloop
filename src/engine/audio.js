// Everything is synthesised through Web Audio - no samples, no data tables.
// The music is a look-ahead scheduler whose tempo and filter open up as your
// combo climbs, so the soundtrack tracks how well you are doing.
import { min, max, floor, rnd } from './math.js';

let AC, master, filt, noiseBuf;
export let muted = 0;

const NOTE = (s) => 220 * 2 ** (s / 12);

export const initAudio = () => {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  AC = new (self.AudioContext || self.webkitAudioContext)();
  master = AC.createGain();
  filt = AC.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 2400;
  filt.Q.value = 0.6;
  filt.connect(master);
  master.connect(AC.destination);
  master.gain.value = muted ? 0 : 0.42;

  // one short noise buffer, reused for every percussive sound
  noiseBuf = AC.createBuffer(1, 8192, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < 8192; i++) d[i] = rnd() * 2 - 1;

  try { muted = +localStorage.pl26m || 0; } catch (e) { }
  master.gain.value = muted ? 0 : 0.42;
  setInterval(tick, 90);
};

/** Debug: AudioContext state, so the headless harness can assert audio came up. */
export const audioState = () => (AC ? AC.state + '/' + (muted ? 'muted' : 'on') : 'none');

export const toggleMute = () => {
  muted = muted ? 0 : 1;
  if (master) master.gain.value = muted ? 0 : 0.42;
  try { localStorage.pl26m = muted; } catch (e) { }
  return muted;
};

/** One enveloped oscillator note. */
const tone = (f, dur, type, vol, at = 0, slide = 0, dest) => {
  if (!AC || muted) return;
  const t = AC.currentTime + at;
  const o = AC.createOscillator();
  const g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(max(20, f * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest || filt);
  o.start(t);
  o.stop(t + dur + 0.02);
};

/** Filtered noise burst - hats, whooshes, impacts. */
const noise = (dur, vol, cut, at = 0, q = 1) => {
  if (!AC || muted) return;
  const t = AC.currentTime + at;
  const s = AC.createBufferSource();
  const g = AC.createGain();
  const bp = AC.createBiquadFilter();
  s.buffer = noiseBuf;
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(cut, t);
  bp.frequency.exponentialRampToValueAtTime(max(80, cut * 0.25), t + dur);
  bp.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bp); bp.connect(g); g.connect(master);
  s.start(t);
  s.stop(t + dur);
};

// --- sound effects ------------------------------------------------------------
const PENT = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

/** Rising arpeggio, one note per gloom caught, transposed up by combo. */
export const sfxLoop = (n, combo) => {
  const base = 12 + (combo - 1) * 2;
  for (let i = 0; i < min(n, 9); i++) {
    tone(NOTE(base + PENT[min(i, 10)]), 0.5, 'triangle', 0.2, i * 0.055, 1);
    tone(NOTE(base + 12 + PENT[min(i, 10)]), 0.35, 'sine', 0.12, i * 0.055, 1);
  }
  noise(0.5, 0.16, 5000, 0, 0.7);
};

export const sfxWhiff = () => tone(NOTE(-2), 0.22, 'triangle', 0.07, 0, 0.7);
export const sfxSever = () => {
  tone(NOTE(-9), 0.4, 'sawtooth', 0.1, 0, 0.4);
  noise(0.34, 0.2, 900, 0, 0.8);
};
export const sfxUI = () => tone(NOTE(19), 0.13, 'triangle', 0.13, 0, 1.5);
export const sfxStart = () => {
  for (let i = 0; i < 4; i++) tone(NOTE(12 + PENT[i * 2]), 0.55, 'triangle', 0.16, i * 0.08, 1);
};
export const sfxOver = () => {
  for (let i = 0; i < 4; i++) tone(NOTE(16 - i * 3), 0.7, 'triangle', 0.16, i * 0.14, 1);
};

// --- music --------------------------------------------------------------------
// Four-bar loop in a major pentatonic; roots walk I - vi - IV - V.
const ROOTS = [0, -3, -7, -5];
let step = 0, nextT = 0;
let intensity = 0;
export const setIntensity = (v) => (intensity = v);

const tick = () => {
  if (!AC || muted || AC.state !== 'running') return;
  const bpm = 92 + intensity * 22;
  const sp = 30 / bpm;                       // one eighth note
  if (!nextT) nextT = AC.currentTime + 0.1;

  filt.frequency.setTargetAtTime(1500 + intensity * 2600, AC.currentTime, 0.4);

  while (nextT < AC.currentTime + 0.35) {
    const at = nextT - AC.currentTime;
    const bar = floor(step / 8) % 4;
    const root = ROOTS[bar];
    const b = step % 8;

    if (!b) tone(NOTE(root - 12), sp * 7, 'sine', 0.16, at, 1);                 // bass
    if (b === 0 || b === 3 || b === 6)                                          // pad
      for (const o of [0, 4, 7]) tone(NOTE(root + 12 + o), sp * 3.4, 'triangle', 0.045, at, 1);
    if (intensity > 0.15 && b % 2 === 1)                                        // arp
      tone(NOTE(root + 24 + PENT[(step * 3) % 6]), 0.24, 'sine', 0.055 + intensity * 0.05, at, 1);
    if (b % 4 === 2) noise(0.05, 0.035 + intensity * 0.03, 8000, at, 2);        // hat

    nextT += sp;
    step++;
  }
};
