// 용어 풀이: 생소한 낱말에 점선 밑줄을 긋고, 마우스를 올리거나(폰은 누르면) 짧은 설명을 띄운다.
// (디스코드 디자인 의견: 처음 보는 용어를 몰라 헤맸다 → 밑줄 + 마우스 올리면 설명)
import { TRAITS } from '../data/materials';

const T = (k: keyof typeof TRAITS) => TRAITS[k].desc(1).replace(/1번/g, '정해진 횟수만큼').replace('처음 정해진 횟수만큼의', '처음 몇 번의');

/** 낱말 → 한두 줄 설명. 긴 낱말이 먼저 맞도록 길이순으로 찾는다 */
export const GLOSSARY: Record<string, string> = {
  멱: 'L자로 칠 때, 치려는 쪽 바로 옆 곧은 칸이 막혀 있으면 그쪽으로는 못 쳐요. 장기의 마와 같아요.',
  날카로움: T('sharp'),
  경량: T('light'),
  회피: '공격을 한 번 통째로 피해요 (경량 특성).',
  견고: T('sturdy'),
  점착: T('sticky'),
  반격: T('counter'),
  속박: T('bind'),
  불굴: T('undying'),
  '기보 이탈': T('kibo'),
  방진: '폰 병사 바로 곁에 있으면 받는 피해가 1 줄어요.',
  '반격 태세': '세 턴 동안 맞지 않은 적. 이 적을 쳤는데 살아남으면 같은 방식으로 되받아칠 수 있어요.',
  '숨 고르기': '몇 번 공격한 적은 한 턴 쉬어요. 그때가 칠 기회예요.',
  등딱지: '늪 거북은 상하좌우 곧은 방향에서 맞으면 피해가 절반이에요. 대각선이나 L자로 치세요.',
  분노: '설원 곰은 맞고 살아남을 때마다 공격이 1씩 올라요 (최대 +2).',
  묘수: '묘수 기호 「!!」는 몇 턴마다 다른 몹 하나를 주인공 곁으로 옮겨요. 금빛 점선이 옮겨 올 자리예요.',
  '장기의 포': '줄 위의 말 하나를 사이에 두고 그 너머를 쳐요. 사이에 말이 없으면 못 쳐요.',
  재빠른: '이름에 「재빠른」이 붙은 몹은 가끔 한 번 더 움직여요.',
  따라붙는: '이름에 「따라붙는」이 붙은 몹(과 보스)은 공격이 빗나가면 한 칸 따라와요.',
  단단한: '이름에 「단단한」이 붙은 몹은 체력이 더 많아요.',
  갈라지는: '이름에 「갈라지는」이 붙은 몹은 쓰러지면 작은 몸 하나가 떨어져 나와요.',
  초읽기: '전투가 너무 길어지면 적이 점점 사나워져요.',
  고지: '고지 위에서 치면 피해가 1 늘어요. 적도 같아요.',
  수풀: '수풀 위에 서 있으면 멀리서 오는 공격을 막아요. 적도 같아요.',
  빙판: '밟으면 한 칸 더 미끄러져요.',
  '용사의 의지': '쓰러질 피해를 한 번 버텨요. 쉬면 다시 차올라요.',
  '빛나는 개체': '조금 더 강하지만 전리품을 더 많이 떨어뜨려요.',
  '먼 공격': '떨어져서 친 공격은 피해 1배, 바로 옆에서 붙어서 치면 2배예요.',
  품질: '장비의 품질(%)이 높을수록 개조 칸이 많고 덤 효과가 붙어요. 평범한 → 좋은 → 훌륭한 → 뛰어난 → 걸작. 강화할 때 망치질로 99%까지 올릴 수 있어요.',
  세트: '같은 세트 장비 세 개를 끼면 효과가 하나 더 붙어요.',
  개조: '장비의 개조 칸에 재료 하나를 넣어 방향 하나나 특성 +1을 더해요. 대장간에서 해요.',
  천장: '운이 나빠도 막히지 않게: 내 계열 무기가 8번 연속 안 나오면, 훌륭한 장비가 25개 연속 안 나오면 다음엔 꼭 나와요.',
  덤: '품질이 훌륭한 이상인 장비에 무작위로 붙는 작은 효과예요.',
};
const KEYS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const RE = new RegExp(KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');

/** 글 속 용어(낱말마다 처음 한 번)를 밑줄 친 조각으로 바꾼다 */
export function termify(text: string): (string | HTMLElement)[] {
  const out: (string | HTMLElement)[] = [];
  const seen = new Set<string>();
  let last = 0;
  for (const m of text.matchAll(RE)) {
    const w = m[0];
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(text.slice(last, m.index));
    const el = document.createElement('span');
    el.className = 'term';
    el.textContent = w;
    el.dataset.tip = GLOSSARY[w];
    out.push(el);
    last = (m.index ?? 0) + w.length;
  }
  out.push(text.slice(last));
  return out.filter((x) => x !== '');
}

// 한 번만: 밑줄 친 용어에 마우스를 올리면(폰은 누르면) 설명 말풍선
let tipEl: HTMLElement | null = null;
function show(t: HTMLElement) {
  hide();
  const r = t.getBoundingClientRect();
  tipEl = document.createElement('div');
  tipEl.className = 'term-tip';
  const b = document.createElement('b');
  b.textContent = t.textContent ?? '';
  const p = document.createElement('span');
  p.textContent = t.dataset.tip ?? '';
  tipEl.append(b, p);
  document.body.append(tipEl);
  const w = tipEl.offsetWidth;
  tipEl.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  tipEl.style.top = `${r.top - tipEl.offsetHeight - 8 < 8 ? r.bottom + 8 : r.top - tipEl.offsetHeight - 8}px`;
}
function hide() { tipEl?.remove(); tipEl = null; }
if (typeof document !== 'undefined') {
  document.addEventListener('mouseover', (e) => { const t = (e.target as HTMLElement)?.closest?.('.term') as HTMLElement | null; if (t) show(t); });
  document.addEventListener('mouseout', (e) => { if ((e.target as HTMLElement)?.closest?.('.term')) hide(); });
  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement)?.closest?.('.term') as HTMLElement | null;
    if (t) { e.stopPropagation(); show(t); setTimeout(hide, 2600); } else hide();
  }, true);
}
