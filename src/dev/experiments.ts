// 개발 전용: 클로즈드 베타 때 슬롯별로 고르던 실험 규칙 (공격력 성장 / 한 방향 집중).
// 오픈 베타부터 설정 창에서 뺐다 (테스터 의견: 둘 다 딜만 바꿔서 난이도에 효과가 없었다).
// 전투·대장간 쪽 훅(core/balance.ts의 BAL)은 기본값이 모두 꺼져 있어 게임에 영향이 없다.
// 사용(개발 서버 콘솔): exp.set('growth') / exp.set('focus') / exp.set('base') — 지금 슬롯에만, 다시 불러오면 꺼짐
import { BAL, BAL_DEFAULT } from '../core/balance';

export type ExpMode = 'base' | 'growth' | 'focus';

export function set(m: ExpMode) {
  Object.assign(BAL, BAL_DEFAULT);
  if (m === 'growth') Object.assign(BAL, { enhance: true, mastery: true, baseDmg: 2, hpMul: -1 });
  if (m === 'focus') Object.assign(BAL, { compress: true, baseDmg: 2, hpMul: 2 });
  return { ...BAL };
}
