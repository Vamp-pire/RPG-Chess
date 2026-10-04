// 업적 보상: 골드·재료·최대 체력·영구 능력(perk). 능력은 G.flags.perk_* 로 저장한다.
import { G, addBag, maxHp } from '../core/state';
import { DIFFS } from '../core/difficulty';
import { MATS, MatId } from '../data/materials';

export type PerkId = 'will' | 'brace' | 'first' | 'ally' | 'hammer' | 'trade' | 'rest' | 'kibo' | 'shot' | 'shiny';

export const PERKS: Record<PerkId, { name: string; desc: string }> = {
  will: { name: '꺾이지 않는 의지', desc: '용사의 의지로 버틸 때 체력 1 대신 2로 버틴다.' },
  brace: { name: '단단한 몸', desc: '전투마다 견고 +1 (피해 1을 한 번 더 막는다).' },
  first: { name: '선수(先手)', desc: '전투마다 첫 공격의 피해 +1.' },
  ally: { name: '함께 선 자리', desc: '동료의 체력 +1.' },
  hammer: { name: '장인의 손목', desc: '망치질의 금빛·초록 칸이 넓어진다.' },
  trade: { name: '장사꾼의 셈', desc: '상점에 재료를 팔 때 +20%.' },
  rest: { name: '단골의 특권', desc: '여관·모닥불에서 쉬면 가방 재료가 저절로 창고에 맡겨진다.' },
  kibo: { name: '기보사의 가르침', desc: '능력 재사용 대기 -1 (최소 2).' },
  shot: { name: '명사수', desc: '사격 피해 +1.' },
  shiny: { name: '빛을 쫓는 눈', desc: '빛나는 개체가 더 자주 나타난다.' },
};

export interface Reward { gold?: number; mats?: [MatId, number][]; hp?: number; perk?: PerkId }

/** 업적으로 얻는 최대 체력의 상한 */
export const ACH_HP_CAP = 3;

export const perk = (p: PerkId) => !!G?.flags[`perk_${p}`];

export function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.gold) parts.push(`${Math.round(r.gold * DIFFS[G.diff].gold)}G`);
  for (const [m, n] of r.mats ?? []) parts.push(`${MATS[m].name} ×${n}`);
  if (r.hp) parts.push(`최대 체력 +${r.hp}`);
  if (r.perk) parts.push(`능력 「${PERKS[r.perk].name}」`);
  return parts.join(', ');
}

/** 보상을 준다. 체력은 상한을 넘으면 골드로 바꿔 준다 */
export function giveReward(r: Reward): string {
  if (r.gold) G.gold += Math.round(r.gold * DIFFS[G.diff].gold);
  for (const [m, n] of r.mats ?? []) addBag(m, n);
  let text = rewardText(r);
  if (r.hp) {
    const have = Number(G.flags.achHp ?? 0);
    const add = Math.max(0, Math.min(r.hp, ACH_HP_CAP - have));
    if (add) {
      G.flags.achHp = have + add;
      G.bonusHp += add;
      G.hp = Math.min(maxHp(), G.hp + add);
    } else {
      G.gold += 40;
      text = text.replace(`최대 체력 +${r.hp}`, '40G (체력 보상은 최대 +3까지)');
    }
  }
  if (r.perk) G.flags[`perk_${r.perk}`] = true;
  return text;
}
