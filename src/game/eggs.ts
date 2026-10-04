// 여백의 낙서 (새 이스터 에그): 판 곳곳에 누군가 몰래 적어 둔 낙서. 찾으면 G.flags.egg_<id> 가 남고 'egg' 이벤트(찾은 개수)가 난다.
// 예전 이스터 에그(e4·촌장 열 번·타이틀 나이트·기록의 벽 문구)와는 따로 센다 — 그쪽은 건드리지 않는다.
// 숨은 엔딩 조건으로 쓸 수 있게 개수만 세어 둔다 (eggCount).
import { G, emit, save } from '../core/state';
import { sfx } from '../core/sfx';
import { toast } from '../ui/dom';
import type { AreaId } from '../data/areas';
import type { Vec } from '../core/geom';

export type EggId =
  | 'gg' | 'resign' | 'castle' | 'engine' | 'corners' | 'backward'
  | 'slime' | 'gold64' | 'wall8' | 'shop7' | 'night' | 'chessday';

export const EGGS: Record<EggId, { name: string; text: string }> = {
  gg: { name: '좋은 대국', text: '판 모서리에 작은 글씨: "gg — 좋은 대국이었어."' },
  resign: { name: '기권', text: '말을 눕히려 했지만, 기보 밖의 말은 눕는 법을 모른다. 누군가 "아직 아니야"라고 적어 두었다.' },
  castle: { name: '캐슬링', text: '촌장 킹과 룩이 자리를 바꾸려다 서로 발을 밟았다. 담장에 "O-O는 이 마을에선 금지"라는 낙서.' },
  engine: { name: '엔진', text: '"그런 건 이 판에 없어. 여기선 네가 생각해야 해." — 누군가의 손글씨.' },
  corners: { name: '네 귀퉁이', text: '마을 네 귀퉁이를 모두 밟자, 담장에 a1·h1·a8·h8이 희미하게 떠오른다. 판의 크기를 재 본 누군가가 있었다.' },
  backward: { name: '뒤로 가는 폰', text: '"폰은 뒤로 못 가는 거 알지?" 발밑에 적힌 낙서. 그래도 너는 여기까지 물러섰다.' },
  slime: { name: '말랑한 패배', text: '슬라임에게 졌다. 쓰러진 자리 옆에 "나도 그랬어"라는 낙서가 있다.' },
  gold64: { name: '예순네 닢', text: '주머니의 금화가 딱 64닢. 판의 칸 수와 같다. 금화 하나에 "a1"이라고 새겨져 있다.' },
  wall8: { name: '벽 뒤의 줄', text: '기록의 벽을 여덟 번째 들여다보자, 맨 아래 지워진 줄이 비친다: "1. ?? — 아무도 두지 않은 수."' },
  shop7: { name: '구경꾼', text: '상인이 한숨을 쉰다. "일곱 번째 구경이야. 예전에도 너 같은 손님이 하나 있었지. 아무것도 안 사고 낙서만 하고 갔어."' },
  night: { name: '모두 잠든 판', text: '새벽 세 시. 말들이 모두 잠든 판 위에서, 여백 쪽으로 누군가의 발자국이 이어져 있다.' },
  chessday: { name: '체스의 날', text: '오늘은 7월 20일, 체스의 날. 마을 광장에 "축하해, 아직 두어지지 않은 수"라는 낙서가 걸렸다.' },
};

export const eggFound = (id: EggId) => !!G?.flags[`egg_${id}`];
export const eggCount = () => (Object.keys(EGGS) as EggId[]).filter(eggFound).length;
export const EGG_TOTAL = Object.keys(EGGS).length;

export function findEgg(id: EggId) {
  if (!G || eggFound(id)) return;
  G.flags[`egg_${id}`] = true;
  toast(`✎ 여백의 낙서 (${eggCount()}/${EGG_TOTAL}) — ${EGGS[id].text}`, 'rare');
  sfx('ach');
  emit('egg', eggCount());
  save();
}

// ---------- 키보드 (게임 중, 창이 열려 있지 않을 때만 불린다) ----------
let buf = '';
export function eggKey(key: string, mode: string) {
  if (key.length !== 1) return;
  buf = (buf + key.toLowerCase()).slice(-12);
  if (buf.endsWith('gg')) findEgg('gg');
  if (buf.endsWith('resign') && mode === 'battle') findEgg('resign');
  if ((buf.endsWith('o-o') || buf.endsWith('0-0')) && G.area === 'town') findEgg('castle');
  if (buf.endsWith('stockfish')) findEgg('engine');
}

// ---------- 탐험 걸음 ----------
let southRun = 0;
const corners = new Set<string>();
export function eggStep(area: AreaId, from: Vec, to: Vec) {
  // 마을 네 귀퉁이 (판은 8x8)
  if (area === 'town' && (to[0] === 0 || to[0] === 7) && (to[1] === 0 || to[1] === 7)) {
    corners.add(`${to[0]},${to[1]}`);
    if (corners.size >= 4) findEgg('corners');
  }
  // 폰인데 한 줄을 따라 아래(뒤)로만 판 끝에서 끝까지 (8칸 판 = 일곱 걸음)
  southRun = to[1] === from[1] + 1 && to[0] === from[0] ? southRun + 1 : 0;
  if (southRun >= 7) findEgg('backward');
}

// ---------- 그 밖의 순간들 ----------
/** 화면을 새로 그릴 때마다: 금화가 딱 64닢이면 */
export function eggGold() {
  if (G && G.gold === 64) findEgg('gold64');
}

/** 전투에서 졌을 때: 상대가 슬라임뿐이었다면 */
export function eggLose(mobs: string[]) {
  if (mobs.length && mobs.every((m) => m === 'slime' || m === 'slimelet')) findEgg('slime');
}

/** 기록의 벽을 들여다볼 때마다 (여덟 번째에) */
export function eggWall() {
  G.flags.egg_wall_n = Number(G.flags.egg_wall_n ?? 0) + 1;
  if (Number(G.flags.egg_wall_n) >= 8) findEgg('wall8');
}

/** 상점을 열 때마다: 아무것도 안 사고 일곱 번째 */
let shopLooks = 0;
export function eggShopOpen() {
  shopLooks++;
  if (shopLooks >= 7) findEgg('shop7');
}
export function eggShopBought() {
  shopLooks = 0;
}

/** 게임을 시작(이어하기)할 때: 시각과 날짜 */
export function eggTime(now = new Date()) {
  if (now.getHours() === 3) findEgg('night');
  if (now.getMonth() === 6 && now.getDate() === 20) findEgg('chessday');
}
