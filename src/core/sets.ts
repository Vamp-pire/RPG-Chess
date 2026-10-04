// 세트 효과: 장착한 장비들의 '주 재료'(가장 많이 넣은 재료)가 같은 계열이면 보너스
import { Item, itemStats } from './items';
import { MatId } from '../data/materials';

export type SetId = 'slime' | 'fang' | 'wing' | 'stone' | 'thorn' | 'web' | 'bone' | 'ghost' | 'frost' | 'ink';

export const SET_NEED = 3;

export const SETS: Record<SetId, { name: string; mats: MatId[]; desc: string }> = {
  slime: { name: '점액 계열', mats: ['gel', 'pearl'], desc: '전투를 시작할 때 체력 +1 (최대 체력까지), 밀려나지 않는다.' },
  fang: { name: '송곳니 계열', mats: ['tooth', 'fang', 'tusk'], desc: '날카로움 +1 (처음 한 번 더 강하게 친다).' },
  wing: { name: '날개 계열', mats: ['wing', 'silver', 'skin', 'fur'], desc: '회피 +1.' },
  stone: { name: '바위 계열', mats: ['moss', 'crack', 'ice'], desc: '견고 +2.' },
  thorn: { name: '가시 계열', mats: ['thorn'], desc: '반격 횟수 +2.' },
  web: { name: '거미줄 계열', mats: ['silk', 'frost'], desc: '속박 +1.' },
  bone: { name: '뼈 계열', mats: ['bone', 'page'], desc: '불굴을 전투마다 2번까지.' },
  ghost: { name: '망령 계열', mats: ['ecto', 'mirror', 'blunder'], desc: '능력 재사용 대기 -1 (최소 2).' },
  frost: { name: '서리 계열', mats: ['frost', 'ice'], desc: '전투 첫 턴에 가장 가까운 적을 한 턴 얼린다.' },
  ink: { name: '잉크 계열', mats: ['ink', 'quill', 'shard'], desc: '매 전투 첫 공격이 적을 1칸 밀어낸다… 는 소문. (날카로움 +1, 기보 이탈 +1)' },
};

/** 장비의 주 재료가 속한 계열 (여러 계열이면 모두) */
export function familiesOf(it: Item): SetId[] {
  const top = itemStats(it).shares[0]?.id;
  if (!top) return [];
  return (Object.keys(SETS) as SetId[]).filter((s) => SETS[s].mats.includes(top));
}

/** 계열별 장착 수 */
export function setCounts(items: Item[]): Partial<Record<SetId, number>> {
  const c: Partial<Record<SetId, number>> = {};
  for (const it of items) for (const s of familiesOf(it)) c[s] = (c[s] ?? 0) + 1;
  return c;
}

export const activeSets = (items: Item[]) => (Object.entries(setCounts(items)) as [SetId, number][]).filter(([, n]) => n >= SET_NEED).map(([s]) => s);
