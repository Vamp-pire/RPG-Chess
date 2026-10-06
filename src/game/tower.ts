// 끝없는 탑: 엔딩을 하나 이상 본 뒤 마을 [기록의 벽]에서 오르는 층 오르기.
// 층마다 무작위 판·몹, 5층마다 수문장(엘리트). 층을 넘을 때마다 보상 하나를 고르고, 체력은 이어진다.
// 쓰러지면 탑에서 끝나지만 재료는 잃지 않는다. 최고 기록은 환생해도 남는다(core/meta).
import { G, addBag, emit, log, maxHp, save } from '../core/state';
import { meta, seenEnding, setMeta } from '../core/meta';
import { pick } from '../core/geom';
import { AreaId, EncDef, randomEnc } from '../data/areas';
import { MOBS, MobId } from '../data/mobs';
import { MATS, MatId } from '../data/materials';
import { dialog, h, modal, modalOpen, toast } from '../ui/dom';
import type { App } from './app';

/** 다섯 층씩 한 묶음: 어느 지역의 몹·판이 나오는가 (16층부터는 마지막 묶음이 계속) */
const TIERS: { name: string; biomes: AreaId[]; mobs: MobId[]; elite: MobId }[] = [
  { name: '들판의 층', biomes: ['meadow', 'forest', 'hills'], mobs: ['slime', 'rat', 'bat', 'golem', 'thorn'], elite: 'hound' },
  { name: '늪의 층', biomes: ['marsh', 'ruins'], mobs: ['toad', 'spider', 'skeleton', 'wraith', 'rat'], elite: 'bonelord' },
  { name: '설원의 층', biomes: ['tundra', 'glacier', 'bastion'], mobs: ['wolf', 'icesprite', 'snowpawn', 'frostbishop', 'tower'], elite: 'giant' },
  { name: '잉크의 층', biomes: ['margin', 'fold', 'inkwell'], mobs: ['inkblot', 'erased', 'bookworm', 'annot', 'inkdrop'], elite: 'double' },
];
const tierOf = (floor: number) => TIERS[Math.min(TIERS.length - 1, Math.floor((floor - 1) / 5))];

let run: { floor: number } | null = null;
export const inTower = () => !!run;
export const towerUnlocked = () => seenEnding();
export const towerBest = () => meta().towerBest ?? 0;

/** 이 층의 전투 */
function floorEnc(floor: number): EncDef {
  const t = tierOf(floor);
  const guard = floor % 5 === 0;
  const count = Math.min(5, 2 + Math.floor((floor - 1) / 4));
  const types: MobId[] = guard ? [t.elite, ...Array.from({ length: Math.min(3, count - 1) }, () => pick(t.mobs))] : Array.from({ length: count }, () => pick(t.mobs));
  const enc = randomEnc(types, pick(t.biomes));
  return {
    ...enc,
    name: `끝없는 탑 ${floor}층${guard ? ' — 수문장' : ''}`,
    noFlee: true,
    // 20층을 넘으면 층이 오를수록 몹이 단단해진다
    hpBonus: floor > 20 ? Math.floor((floor - 21) / 3) + 1 : 0,
  };
}

/** 기록의 벽에서: 탑에 오른다 */
export function startTower(app: App) {
  run = { floor: 1 };
  G.hp = maxHp();
  log('🗼 끝없는 탑에 올랐다.');
  toast(`끝없는 탑 — 최고 기록 ${towerBest()}층. 쓰러져도 재료는 잃지 않아요.`, 'info', 4000);
  climb(app);
}

function climb(app: App) {
  if (!run) return;
  const n = run.floor;
  if (n % 5 === 1) toast(`🗼 ${tierOf(n).name} (${n}~${n + 4}층)`, 'info', 3000);
  app.startEncounter(floorEnc(n), { onWin: () => cleared(app) });
}

/** 기록을 남긴다 (오른 층 수) */
function record(floors: number) {
  const m = meta();
  if (floors > (m.towerBest ?? 0)) {
    m.towerBest = floors;
    setMeta(m);
    return true;
  }
  return false;
}

/** 창(전리품 등)이 모두 닫힌 뒤에 */
function whenFree(fn: () => void) {
  const t = setInterval(() => {
    if (modalOpen()) return;
    clearInterval(t);
    fn();
  }, 200);
}

/** 한 층을 이겼다: 기록 → (5층마다 희귀 재료) → 다음 층 보상 고르기 */
function cleared(app: App) {
  if (!run) return;
  const n = run.floor;
  const best = record(n);
  emit('tower', n);
  save();
  if (n % 5 === 0) {
    const rares: MatId[] = ['pearl', 'silver', 'crack', 'fang', 'mirror', 'tusk', 'quill', 'shard'];
    const r = pick(rares);
    addBag(r, 1);
    toast(`🗼 ${n}층 수문장을 넘었다! 희귀 재료 ${MATS[r].name}을(를) 얻었다.`, 'rare', 4000);
  }
  whenFree(() => choose(app, n, best));
}

function choose(app: App, n: number, best: boolean) {
  if (!run) return;
  const heal = Math.ceil(maxHp() * 0.4);
  const gold = 10 + n * 5;
  const drops = tierOf(n).mobs.flatMap((m) => MOBS[m].drops.map(([id]) => id)).filter((id) => !MATS[id].key);
  const mat = pick(drops.length ? drops : (['moss'] as MatId[]));
  const next = () => { if (!run) return; run.floor++; save(); climb(app); };
  dialog('끝없는 탑', `${n}층을 넘었다.${best ? ' (최고 기록!)' : ''} 체력 ${G.hp}/${maxHp()}. 다음 층으로 오르기 전에 하나를 고르자.`, [
    { label: '숨을 고른다', note: `체력 +${heal}`, disabled: G.hp >= maxHp(), onPick: () => { G.hp = Math.min(maxHp(), G.hp + heal); next(); } },
    { label: '재료를 챙긴다', note: `${MATS[mat].name} ×2`, onPick: () => { addBag(mat, 2); next(); } },
    { label: '금화를 줍는다', note: `+${gold}G`, onPick: () => { G.gold += gold; next(); } },
    { label: '탑에서 내려온다', note: `${n}층 기록을 남기고 마을로`, onPick: () => finish(app, n, false) },
  ], { noClose: true });
}

/** 탑에서 쓰러졌다 (app.endBattle의 패배에서 부른다): 재료는 잃지 않는다 */
export function towerFell(app: App) {
  if (!run) return;
  finish(app, run.floor - 1, true);
}

function finish(app: App, floors: number, fell: boolean) {
  run = null;
  record(floors);
  G.hp = maxHp();
  save();
  app.refreshAll();
  const best = towerBest();
  const body = h('div', { class: 'patch-notes' },
    h('p', {}, fell ? `${floors + 1}층에서 쓰러졌다. 정신을 차려 보니 기록의 벽 앞이다.` : '탑에서 천천히 내려왔다.'),
    h('p', {}, h('b', {}, `오른 층: ${floors}층`), ` · 최고 기록 ${best}층`),
    h('p', { class: 'hint' }, '탑에서는 쓰러져도 재료를 잃지 않아요. 장비를 다듬고 다시 올라 보세요.'));
  whenFree(() => modal('끝없는 탑', body));
}
