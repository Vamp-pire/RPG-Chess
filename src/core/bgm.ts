// 배경 음악: 파일 없이 WebAudio로 만드는 잔잔한 반복 곡. 장소(마을·지역·전투·보스)마다 분위기가 다르다.
// 화음(패드) + 분산화음 + 간단한 멜로디 + (전투) 베이스·박자. 장소가 바뀌면 천천히 넘어간다.
import { prefs } from './prefs';

export type Mood = 'title' | 'town' | 'r1' | 'r2' | 'r3' | 'r4' | 'battle' | 'boss';

interface Song {
  bpm: number;
  /** 마디마다 화음 (MIDI 음 번호, 낮은 음부터) */
  chords: number[][];
  /** 8분음표 16칸 멜로디 (화음 안 몇 번째 음 +12·24, -1은 쉼) — 마디마다 반복하며 화음을 따라간다 */
  melody: number[];
  arp: boolean;
  bass: boolean;
  drums: boolean;
  /** 음색: 밝은 종소리(true) / 부드러운 피리(false) */
  bell: boolean;
  vol: number;
}

const C = (root: number, minor = false, seventh = false) => [root, root + (minor ? 3 : 4), root + 7, ...(seventh ? [root + 10] : [])];
const SONGS: Record<Mood, Song> = {
  title: { bpm: 70, chords: [C(57, true), C(53), C(48), C(55)], melody: [2, -1, 1, -1, 0, -1, -1, -1, 1, -1, 2, -1, 1, -1, -1, -1], arp: true, bass: false, drums: false, bell: true, vol: 0.8 },
  town: { bpm: 84, chords: [C(53), C(58), C(48), C(53)], melody: [0, -1, 1, 2, -1, 1, 0, -1, 2, -1, 3, 2, 1, -1, 0, -1], arp: true, bass: true, drums: false, bell: false, vol: 0.9 },
  r1: { bpm: 96, chords: [C(55), C(52, true), C(48), C(50)], melody: [0, 1, 2, -1, 2, 1, 0, -1, 1, -1, 2, 3, 2, -1, 1, -1], arp: true, bass: true, drums: false, bell: false, vol: 0.85 },
  r2: { bpm: 76, chords: [C(50, true), C(46), C(48), C(45, true)], melody: [0, -1, -1, 2, -1, 1, -1, -1, 0, -1, -1, 1, -1, 0, -1, -1], arp: true, bass: true, drums: false, bell: false, vol: 0.8 },
  r3: { bpm: 70, chords: [C(52, true), C(48), C(55), C(50)], melody: [2, -1, -1, -1, 1, -1, 3, -1, 2, -1, -1, -1, 0, -1, -1, -1], arp: true, bass: false, drums: false, bell: true, vol: 0.8 },
  r4: { bpm: 64, chords: [C(57, true), C(50, true), C(52), C(57, true)], melody: [0, -1, -1, -1, -1, -1, 2, -1, 1, -1, -1, -1, -1, -1, -1, -1], arp: true, bass: false, drums: false, bell: true, vol: 0.75 },
  battle: { bpm: 128, chords: [C(57, true), C(53), C(55), C(52)], melody: [0, -1, 2, -1, 1, 2, -1, 0, -1, 2, 3, -1, 2, 1, 0, -1], arp: true, bass: true, drums: true, bell: false, vol: 0.8 },
  boss: { bpm: 140, chords: [C(50, true), C(46), C(43, true), C(45, false, true)], melody: [0, 0, -1, 2, -1, 3, 2, -1, 1, -1, 1, 2, -1, 0, -1, -1], arp: true, bass: true, drums: true, bell: false, vol: 0.85 },
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let mood: Mood | null = null;
let song: Song | null = null;
let step = 0;
let nextT = 0;
let timer = 0;
let waiting = false;

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const level = () => (prefs().music ? prefs().musicVol * 0.22 : 0);

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
    }
    return ctx;
  } catch {
    return null;
  }
}

function note(t: number, f: number, dur: number, vol: number, type: OscillatorType, attack = 0.01) {
  const a = ctx!;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function hat(t: number, vol: number, len = 0.04) {
  const a = ctx!;
  const b = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource();
  s.buffer = b;
  const f = a.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 6000;
  const g = a.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(master!);
  s.start(t);
}

function kick(t: number, vol: number) {
  const a = ctx!;
  const o = a.createOscillator();
  const g = a.createGain();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + 0.22);
}

/** 8분음표 한 칸 */
function playStep(s: Song, i: number, t: number) {
  const e = 60 / s.bpm / 2;
  const bar = Math.floor(i / 8) % s.chords.length;
  const k = i % 8;
  const ch = s.chords[bar];
  const v = s.vol;
  if (k === 0) for (const n of ch) note(t, hz(n), e * 8 * 1.05, 0.05 * v, 'triangle', 0.25); // 패드
  if (s.bass && k % 4 === 0) note(t, hz(ch[0] - 12), e * 3.5, 0.16 * v, 'sine', 0.01);
  if (s.arp && (s.drums || k % 2 === 0)) note(t, hz(ch[(k >> (s.drums ? 0 : 1)) % ch.length] + 12), e * 1.6, 0.045 * v, s.bell ? 'sine' : 'triangle');
  const m = s.melody[(i % 16)];
  if (m >= 0) {
    const n = ch[m % ch.length] + 12 * (1 + Math.floor(m / ch.length));
    note(t, hz(n + 12), e * (s.bell ? 3 : 1.8), (s.bell ? 0.07 : 0.06) * v, s.bell ? 'sine' : 'square', 0.015);
  }
  if (s.drums) {
    if (k % 4 === 0) kick(t, 0.32 * v);
    if (k % 2 === 1) hat(t, 0.05 * v);
    if (k === 4) hat(t, 0.08 * v, 0.1);
  }
}

function tick() {
  if (!ctx || !song) return;
  const e = 60 / song.bpm / 2;
  while (nextT < ctx.currentTime + 0.35) {
    playStep(song, step++, nextT);
    nextT += e;
  }
  timer = window.setTimeout(tick, 120);
}

/** 브라우저는 사용자가 한 번 눌러야 소리를 낼 수 있다 → 첫 입력 때 시작 */
function whenAllowed(fn: () => void) {
  const a = audio();
  if (!a) return;
  if (a.state === 'running') return fn();
  if (waiting) return;
  waiting = true;
  const go = () => {
    window.removeEventListener('pointerdown', go);
    window.removeEventListener('keydown', go);
    waiting = false;
    void a.resume().then(fn);
  };
  window.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
  void a.resume().then(() => { if (a.state === 'running' && waiting) go(); });
}

/** 장소에 맞는 곡으로 (같으면 그대로). 이전 곡은 천천히 줄이고 새 곡을 키운다 */
export function setMood(m: Mood) {
  if (m === mood) return;
  mood = m;
  if (!prefs().music) return;
  whenAllowed(() => {
    const a = ctx!;
    const g = master!.gain;
    const now = a.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.0001, now + 0.6);
    window.clearTimeout(timer);
    window.setTimeout(() => {
      song = SONGS[mood!];
      step = 0;
      nextT = a.currentTime + 0.05;
      g.cancelScheduledValues(a.currentTime);
      g.setValueAtTime(0.0001, a.currentTime);
      g.linearRampToValueAtTime(level(), a.currentTime + 1.2);
      tick();
    }, 650);
  });
}

/** 설정이 바뀌었을 때: 끄면 멈추고, 켜면 지금 장소의 곡으로, 음량은 바로 반영 */
export function musicPrefsChanged() {
  if (!prefs().music) {
    window.clearTimeout(timer);
    song = null;
    if (master && ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    return;
  }
  if (!song && mood) {
    const m = mood;
    mood = null;
    setMood(m);
    return;
  }
  if (master && ctx) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.1);
}
