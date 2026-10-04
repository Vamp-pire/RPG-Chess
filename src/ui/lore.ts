// 재료 설명: 대장간에서 그 재료를 쓸수록 한 글자씩 드러난다
import { Mats } from '../core/items';
import { G, emit } from '../core/state';
import { MATS, MAT_ORDER, MatId } from '../data/materials';
import { h } from './dom';

/** 설명을 다 드러내는 데 필요한 사용 횟수 */
export function loreNeed(id: MatId) {
  if (id === 'blunder' || id === 'trigger') return 1; // 한 번밖에 못 얻는다
  return MATS[id].rare ? 3 : 8;
}

/** 지금 드러난 글자 수 */
export function loreShown(id: MatId) {
  const d = MATS[id].desc;
  if (MATS[id].key) return d.length;
  const u = G.matUse[id] ?? 0;
  return Math.min(d.length, Math.ceil((d.length * u) / loreNeed(id)));
}

export const loreDone = (id: MatId) => loreShown(id) >= MATS[id].desc.length;

/** 가려진 글자는 ·로 (띄어쓰기는 남겨서 길이를 짐작할 수 있게) */
export function loreText(id: MatId) {
  const d = MATS[id].desc;
  const n = loreShown(id);
  return d.slice(0, n) + d.slice(n).replace(/\S/g, '·');
}

/** 도감용: 마지막으로 본 뒤 새로 드러난 글자는 한 글자씩 타자 치듯 나타난다 */
export function loreView(id: MatId) {
  const d = MATS[id].desc;
  const n = loreShown(id);
  const seenKey = `lore_seen_${id}`;
  const seen = Math.min(n, Number(G.flags[seenKey] ?? 0));
  G.flags[seenKey] = n;
  const el = h('p', { class: 'small lore' });
  el.append(d.slice(0, seen));
  for (let i = seen; i < n; i++) el.append(h('span', { class: 'lore-new', style: { animationDelay: `${(i - seen) * 45}ms` } }, d[i]));
  if (n < d.length) el.append(h('span', { class: 'lore-mask' }, d.slice(n).replace(/\S/g, '·')));
  if (!MATS[id].key && n < d.length) el.append(h('small', { class: 'lore-hint' }, `  (대장간에서 쓸수록 드러나요 ${Math.round((n / d.length) * 100)}%)`));
  return el;
}

/** 대장간에서 재료를 썼다: 새로 드러난 재료 이름들을 돌려준다 */
export function useMats(m: Mats): string[] {
  const grew: string[] = [];
  for (const [k, n] of Object.entries(m)) {
    const id = k as MatId;
    if (!n || MATS[id].key) continue;
    const before = loreShown(id);
    G.matUse[id] = (G.matUse[id] ?? 0) + n;
    if (loreShown(id) > before) {
      grew.push(MATS[id].name);
      if (loreDone(id)) emit('lore', id);
    }
  }
  return grew;
}

/** 조합에 쓸 수 있는 재료 설명을 전부 채웠는가 */
export const loreAll = () => MAT_ORDER.filter((id) => !MATS[id].key).every(loreDone);
