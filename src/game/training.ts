// 동료 훈련: 여관에서 금화 + 동료가 좋아하는 재료로 세 단계.
//   1단계 체력 +2 · 2단계 새 행마 하나 · 3단계 특성 강화
// 단계는 G.flags[`ctr_<동료>`] (0~3). 개인 퀘스트 보상(cup_)과는 따로 쌓인다.
import { DIAG, ORTH } from '../core/geom';
import { MoveRule } from '../core/rules';
import { G, emit, matHave, save, spendMats } from '../core/state';
import { sfx } from '../core/sfx';
import { MATS, MatId } from '../data/materials';
import { COMPANIONS, CompanionId } from '../data/pieces';
import { pieceSrc } from '../render/sprites';
import { h, toast } from '../ui/dom';

interface Step { name: string; desc: string; gold: number; mats: Partial<Record<MatId, number>> }
const TRAIN: Record<CompanionId, { likes: string; steps: [Step, Step, Step]; rule: MoveRule }> = {
  soldier: {
    likes: '쥐 이빨과 균열 이끼로 창끝과 방패를 손본다',
    rule: { kind: 'step', dirs: DIAG, range: 1, mode: 'move' },
    steps: [
      { name: '단련', desc: '체력 +2', gold: 40, mats: { tooth: 3 } },
      { name: '옆걸음', desc: '대각선 1칸 이동이 추가된다', gold: 80, mats: { tooth: 5, moss: 3 } },
      { name: '굳은 방진', desc: '방진일 때(주인공 곁) 병사의 공격 +1', gold: 150, mats: { crack: 2 } },
    ],
  },
  ghostknight: {
    likes: '해골 조각과 거울 파편으로 흐려진 모습을 다시 새긴다',
    rule: { kind: 'step', dirs: DIAG, range: 1, mode: 'both' },
    steps: [
      { name: '단련', desc: '체력 +2', gold: 40, mats: { bone: 3 } },
      { name: '그림자 걸음', desc: '대각선 1칸 이동·공격이 추가된다', gold: 80, mats: { bone: 4, ecto: 2 } },
      { name: '깊은 망령', desc: '망령에 걸린 적은 두 번의 행동을 못 한다', gold: 150, mats: { mirror: 2 } },
    ],
  },
  priest: {
    likes: '안개 거미줄과 진주빛 젤로 법복과 성유를 채운다',
    rule: { kind: 'step', dirs: ORTH, range: 1, mode: 'move' },
    steps: [
      { name: '단련', desc: '체력 +2', gold: 40, mats: { silk: 3 } },
      { name: '순례 걸음', desc: '상하좌우 1칸 이동이 추가된다', gold: 80, mats: { silk: 4, gel: 4 } },
      { name: '깊은 축복', desc: '축복으로 회복하는 양 +1', gold: 150, mats: { pearl: 2 } },
    ],
  },
};

export const trainLv = (c: CompanionId) => Math.min(3, Number(G?.flags[`ctr_${c}`] ?? 0));
/** 훈련을 반영한 동료 행마 */
export const companionRules = (c: CompanionId): MoveRule[] => (trainLv(c) >= 2 ? [...COMPANIONS[c].rules, TRAIN[c].rule] : COMPANIONS[c].rules);
/** 훈련으로 늘어난 체력 (HP 배율 전) */
export const trainHp = (c: CompanionId) => (trainLv(c) >= 1 ? 2 : 0);
/** 3단계 특성 강화를 받았는가 */
export const trainedPassive = (c: CompanionId) => trainLv(c) >= 3;
export const trainStars = (c: CompanionId) => '★'.repeat(trainLv(c));

const costText = (s: Step) => [`${s.gold}G`, ...Object.entries(s.mats).map(([m, n]) => `${MATS[m as MatId].name} ${matHave(m as MatId)}/${n}`)].join(' · ');
const canPay = (s: Step) => G.gold >= s.gold && Object.entries(s.mats).every(([m, n]) => matHave(m as MatId) >= (n ?? 0));

/** 여관 화면의 '동료 훈련' 칸 */
export function trainingView(rerender: () => void): HTMLElement {
  const box = h('div', { class: 'train' });
  if (!G.party.length) {
    box.append(h('p', { class: 'muted small' }, '함께 다니는 동료가 생기면 여기서 훈련시킬 수 있다.'));
    return box;
  }
  for (const c of G.party) {
    const t = TRAIN[c];
    const lv = trainLv(c);
    const next = t.steps[lv];
    const row = h('div', { class: 'train-row' },
      h('img', { src: pieceSrc(COMPANIONS[c].img), alt: '' }),
      h('div', { class: 'train-body' },
        h('b', {}, COMPANIONS[c].name, h('span', { class: 'gold' }, ` ${'★'.repeat(lv)}${'☆'.repeat(3 - lv)}`)),
        h('small', { class: 'muted' }, t.likes),
        ...t.steps.map((s, i) => h('small', { class: i < lv ? 'muted' : i === lv ? 'gold' : '' }, `${i < lv ? '✔' : i === lv ? '▶' : '·'} ${i + 1}단계 ${s.name} — ${s.desc}`)),
      ));
    if (next) {
      const ok = canPay(next);
      const b = h('button', { class: `btn small ${ok ? 'primary' : ''}`, disabled: !ok }, `${next.name} — ${costText(next)}`);
      b.addEventListener('click', () => {
        if (!canPay(next) || !spendMats(next.mats)) return;
        G.gold -= next.gold;
        G.flags[`ctr_${c}`] = lv + 1;
        sfx('perfect');
        toast(`${COMPANIONS[c].name} 훈련 ${lv + 1}단계 — ${next.name}: ${next.desc}`, lv + 1 === 3 ? 'rare' : 'good');
        emit('train', { c, lv: lv + 1 });
        save();
        rerender();
      });
      row.append(b);
    } else row.append(h('span', { class: 'chip' }, '훈련 끝'));
    box.append(row);
  }
  return box;
}
