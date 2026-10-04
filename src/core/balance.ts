// 공격력 성장 방안 (조합을 바꿔 가며 봇으로 비교하려고 켜고 끌 수 있게 둔다)
//   enhance: 무기 강화 단계 보상 — +2에서 날카로움 +1, +3에서 모든 공격 피해 +1
//   mastery: 무기 숙련 — 같은 무기로 몹 MASTERY_KILLS마리를 쓰러뜨리면 그 무기 피해 +1
//   power:   위력 — 무거운 재료(HEAVY)를 40% 이상 넣은 무기는 체력 3 이상인 적에게 +1
//   sharpPerm: 날카로움 Lv3이면 '처음 N번'이 아니라 항상 +1
//   *Charge: 같은 방안을 '전투마다 처음 몇 번만 +1'(날카로움처럼 충전식)으로
export const BAL = { enhance: false, mastery: false, power: false, sharpPerm: false, enhanceCharge: false, masteryCharge: false, powerCharge: false, masteryN: 2, chargeCap: 99, hpMul: 1, baseDmg: 1, compress: false };
/** compress: 무기 행마 방향 고르기·압축 (꺼 두면 대장간에 안 보이고 장비 모양도 무시) */
/** baseDmg: 아군 쪽 기본 피해 배율 (주인공 기본 공격·동료 공격·사격에 곱한다) */
/** hpMul: 모든 지역 적 체력 배율 (보스가 부르는 부하는 제외) */
/** 처음 값 (제목 화면·정식 버전에서 되돌릴 때) */
export const BAL_DEFAULT = { ...BAL };
export const MASTERY_KILLS = 15;
export const HEAVY = ['moss', 'tusk', 'bone'];
