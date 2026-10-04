// 판 규칙 카드: 환생할 때마다 하나가 붙어, 같은 길을 다시 걸어도 판이 조금씩 다르게 느껴지게 한다
// (베타 의견: 엔딩이 늘어도 결국 같은 판을 다시 하는 노가다). 첫 판에는 없다.
import { G } from '../core/state';

export type RunRule = 'ice' | 'bush' | 'pack' | 'shiny' | 'swift' | 'fog';

export const RUN_RULES: Record<RunRule, { name: string; desc: string }> = {
  ice: { name: '빙판의 판', desc: '전투 판 곳곳이 빙판이에요. 밟으면 한 칸 더 미끄러져요.' },
  bush: { name: '수풀의 판', desc: '전투 판 곳곳에 수풀이 자라 있어요. 수풀 위에선 멀리서 오는 공격을 막아요.' },
  pack: { name: '무리의 판', desc: '떠도는 몹 무리가 한 마리씩 더 많아요. 대신 전리품도 그만큼 늘어요.' },
  shiny: { name: '빛의 판', desc: '빛나는 개체가 훨씬 자주 나타나요.' },
  swift: { name: '질주의 판', desc: '몹들이 더 자주 한 번 더 움직여요.' },
  fog: { name: '안개의 판', desc: '어느 지역에서든 적의 공격 예고가 흐려질 때가 있어요.' },
};

/** 지금 판의 규칙 (없으면 null) */
export const runRule = (): RunRule | null => ((G?.flags.runRule as RunRule) || null);

/** 환생할 때 새 규칙을 고른다 (바로 앞 판과 같은 규칙은 피한다) */
export function pickRunRule(prev: RunRule | null): RunRule {
  const ids = (Object.keys(RUN_RULES) as RunRule[]).filter((r) => r !== prev);
  return ids[Math.floor(Math.random() * ids.length)];
}
