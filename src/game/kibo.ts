// 떠돌이 기보사: 여러 지역을 옮겨 다니며 유명한 메이트·오프닝 문제를 낸다
import { G, addBag, emit, hasJob, save } from '../core/state';
import { DIFFS } from '../core/difficulty';
import { AreaId } from '../data/areas';
import { KIBO } from '../data/kibo';
import { MATS, MatId } from '../data/materials';
import { pick } from '../core/geom';
import { pieceSrc } from '../render/sprites';
import { dialog, toast } from '../ui/dom';
import { openPuzzle, puzzleMovesLabel } from '../ui/town';
import type { App } from './app';

const R1: AreaId[] = ['meadow', 'forest', 'hills'];
const R2: AreaId[] = ['camp', 'marsh', 'ruins'];

export const kiboSolved = () => Number(G.flags.kibo_n ?? 0);
export const kiboLeft = () => kiboSolved() < KIBO.length;

/** 기보사가 이 오브젝트(kibo_지역)에 있는가 */
export const kiboHere = (objId: string) => !!G.job && kiboLeft() && G.flags.kibo_at === objId.slice(5);

/** 아직 자리가 없으면(또는 떠나야 하면) 지금 있는 곳이 아닌 다른 지역으로 옮긴다 */
export function kiboPlace(notHere: AreaId, force = false) {
  if (!G.job || !kiboLeft()) return;
  if (G.flags.kibo_at && !force) return;
  const pool = [...R1, ...(G.promoted ? R2 : [])].filter((a) => a !== notHere && a !== G.flags.kibo_at);
  G.flags.kibo_at = pick(pool);
}

export function kiboTalk(app: App) {
  const n = kiboSolved();
  const pz = KIBO[n];
  const first = !G.flags.kibo_met;
  G.flags.kibo_met = true;
  const intro = first
    ? '"오, 기보에 없는 말이군! 나는 판을 들고 떠도는 기보사일세. 옛사람들이 남긴 명국을 모으고 있지. 하나 풀어 보겠나? 맞히면 사례하지."'
    : `"또 만났군. 이번 문제는 '${pz.title}'일세."`;
  const kind = pz.kind === 'mate' ? `(${puzzleMovesLabel(pz)} 메이트)` : '(오프닝의 다음 수)';
  dialog('떠돌이 기보사', `${intro} ${kind}`, [
    { label: '문제를 푼다', onPick: () => openPuzzle(pz, () => solved(app)) },
    { label: '다음에', onPick: () => {} },
  ], { sprite: 'p:wb', npc: 'kibo_meadow', speaker: '떠돌이 기보사' });
}

function solved(app: App) {
  const n = kiboSolved() + 1;
  G.flags.kibo_n = n;
  const last = n >= KIBO.length;
  const gold = Math.round((10 + n * 5) * DIFFS[G.diff].gold);
  G.gold += gold;
  const mats: [MatId, number][] = last
    ? [['shard', 1], ['mirror', 1]]
    : [[pick<MatId>(G.promoted ? ['skin', 'silk', 'bone', 'ecto'] : ['gel', 'tooth', 'wing', 'moss']), 2 + (hasJob('scholar') ? 1 : 0)]];
  for (const [m, k] of mats) addBag(m, k);
  emit('kibo', n);
  const got = `${mats.map(([m, k]) => `${MATS[m].name} ×${k}`).join(', ')}, ${gold}G`;
  if (last) {
    toast(`기보사: "모든 명국을 풀었군! 이건 내 보물일세." — ${got}`, 'rare');
    delete G.flags.kibo_at;
  } else {
    toast(`기보사: "훌륭해! 다음 판은 다른 곳에 펼쳐 두겠네." — ${got}`, 'good');
    kiboPlace(G.area, true);
  }
  app.explore.removeObj(`kibo_${G.area}`);
  save();
  app.refreshAll();
}
