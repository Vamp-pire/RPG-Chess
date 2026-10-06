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
  재빠름: '재빠른 몹은 가끔 한 번 더 움직여요.',
  따라붙음: '공격이 빗나간 적은 한 칸 따라와요.',
  초읽기: '전투가 너무 길어지면 적이 점점 사나워져요.',
  고지: '고지 위에서 치면 피해가 1 늘어요. 적도 같아요.',
  수풀: '수풀 위에 서 있으면 멀리서 오는 공격을 막아요. 적도 같아요.',
  빙판: '밟으면 한 칸 더 미끄러져요.',
  '용사의 의지': '쓰러질 피해를 한 번 버텨요. 쉬면 다시 차올라요.',
  '빛나는 개체': '조금 더 강하지만 전리품을 더 많이 떨어뜨려요.',
  '먼 공격': '떨어져서 친 공격은 피해 1배, 바로 옆에서 붙어서 치면 2배예요.',
  품질: '들풀 섬유를 2개 넣거나 망치질을 잘하면 올라가요. 행마가 조금 길어져요.',
  세트: '주 재료가 같은 계열인 장비 세 개를 끼면 효과가 하나 더 붙어요.',
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
