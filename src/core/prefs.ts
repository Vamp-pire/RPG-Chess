// 게임 설정 (저장 파일과 별개로 브라우저에 보관): 새 게임을 해도 유지된다
export interface Prefs {
  /** 퀘스트 안내: 금빛 별·화살표·안내 줄 */
  guide: boolean;
  /** 처음 한 번 뜨는 힌트 말풍선 */
  tips: boolean;
  /** 효과음 */
  sound: boolean;
  volume: number;
  /** 전투·이동 연출 속도 */
  speed: 'normal' | 'fast';
  /** 연출 생략 (문명5의 빠른 행동처럼) */
  skipAnim: boolean;
  /** 지역 분위기 효과 (안개·눈·먼지 입자) */
  ambient: boolean;
  /** 배경 음악 */
  music: boolean;
  musicVol: number;
  /** 글자(화면 요소) 크기 배율: 게임 판은 그대로 */
  textScale: number;
  /** 대화 자동 넘김 속도 (manual = 누를 때만) */
  talk: 'fast' | 'normal' | 'slow' | 'manual';
}

const KEY = 'cf_prefs';
const DEFAULTS: Prefs = { guide: true, tips: true, sound: true, volume: 0.5, speed: 'normal', skipAnim: false, ambient: true, textScale: 1, music: true, musicVol: 0.5, talk: 'normal' };
let cache: Prefs | null = null;

export function prefs(): Prefs {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache!;
}

export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
  cache = { ...prefs(), [k]: v };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* 저장 불가 환경 */ }
  if (k === 'textScale') applyTextScale();
}

/** 글자 크기 배율을 화면에 적용 (CSS 변수 --ui-zoom) */
export function applyTextScale() {
  document.documentElement.style.setProperty('--ui-zoom', String(prefs().textScale || 1));
}
