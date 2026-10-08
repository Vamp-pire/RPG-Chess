// 게임 안 피드백: 버그·밸런스·제안·이야기·기타 무엇이든. 서버(api/feedback)가 디스코드로 보낸다.
import { VERSION, versionLabel } from '../core/release';
import { h, modal, toast } from './dom';

type Cat = 'bug' | 'balance' | 'idea' | 'story' | 'other';
const CATS: [Cat, string, string][] = [
  ['bug', '🐞 버그', '무엇을 하다가 어떻게 됐는지 적어 주세요. 화면 사진을 같이 보내면 찾기 쉬워요.'],
  ['balance', '⚖️ 밸런스', '너무 쉽거나 어려운 곳, 너무 세거나 약한 장비·몹을 알려 주세요.'],
  ['idea', '💡 제안', '있으면 좋겠다 싶은 것, 불편한 점, 바꾸면 좋을 점을 자유롭게.'],
  ['story', '📖 이야기·대사', '어색한 대사, 이해가 안 된 이야기, 좋았던 장면도 좋아요.'],
  ['other', '💬 기타', '무엇이든 적어 주세요.'],
];

const DRAFT = 'cf_fb_draft';

/** 판 화면을 작은 JPEG로 (실패하면 null) */
function boardShot(): string | null {
  try {
    const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!cv || cv.width < 50) return null;
    const k = Math.min(1, 900 / cv.width);
    const c = document.createElement('canvas');
    c.width = Math.round(cv.width * k);
    c.height = Math.round(cv.height * k);
    c.getContext('2d')!.drawImage(cv, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}

/** state: 게임 상태 요약 (게임 밖에서 열면 비어 있다) */
export function openFeedback(state: () => string = () => '') {
  let cat: Cat = 'bug';
  const chips = h('div', { class: 'fb-cats' });
  const hint = h('p', { class: 'muted small' });
  let draft = '';
  try { draft = localStorage.getItem(DRAFT) ?? ''; } catch { /* */ }
  const ta = h('textarea', { class: 'fb-text', rows: 6, maxlength: 1800, placeholder: '여기에 적어 주세요' }) as HTMLTextAreaElement;
  ta.value = draft;
  const count = h('span', { class: 'muted small' });
  const withState = h('input', { type: 'checkbox', checked: true }) as HTMLInputElement;
  const withShot = h('input', { type: 'checkbox', checked: true }) as HTMLInputElement;
  const send = h('button', { class: 'btn primary' }, '보내기') as HTMLButtonElement;
  const upd = () => {
    count.textContent = `${ta.value.length}/1800`;
    send.disabled = ta.value.trim().length < 2;
    try { localStorage.setItem(DRAFT, ta.value); } catch { /* */ }
  };
  ta.addEventListener('input', upd);
  // 입력하는 동안 게임 단축키가 먹지 않게
  ta.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  const drawCats = () => {
    chips.innerHTML = '';
    for (const [k, label, tip] of CATS) {
      const b = h('button', { class: `chip-btn ${cat === k ? 'on' : ''}` }, label);
      b.addEventListener('click', () => { cat = k; withShot.checked = k === 'bug' || k === 'balance'; drawCats(); });
      chips.append(b);
      if (cat === k) hint.textContent = tip;
    }
  };
  drawCats();
  upd();
  const st = state();
  const body = h('div', { class: 'feedback' },
    h('p', {}, '버그, 밸런스, 아이디어, 대사… 무엇이든 좋아요. 보낸 내용은 제작자의 디스코드로 바로 가요. (이름·계정은 보내지 않아요)'),
    chips, hint, ta, h('div', { class: 'row between' }, count),
    h('label', { class: 'fb-opt' }, withState, ' 게임 상태 함께 보내기', h('small', { class: 'muted' }, st ? ` (${st.split('\n')[0]} …)` : ' (버전·브라우저)')),
    h('label', { class: 'fb-opt' }, withShot, ' 지금 판 화면 사진 함께 보내기'),
    h('div', { class: 'row gap' }, send));
  const m = modal('피드백 보내기', body);
  setTimeout(() => ta.focus(), 50);

  send.addEventListener('click', async () => {
    if (send.disabled) return;
    send.disabled = true;
    send.textContent = '보내는 중…';
    const info = withState.checked
      ? [st, `버전 ${versionLabel()} (${VERSION}) · ${innerWidth}×${innerHeight} · ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 140)}`].filter(Boolean).join('\n')
      : `버전 ${versionLabel()}`;
    const shot = withShot.checked ? boardShot() : null;
    try {
      const r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cat, text: ta.value.trim(), info, shot }) });
      if (r.status === 429) throw new Error('잠시 뒤에 다시 보내 주세요 (20초에 한 번).');
      if (!r.ok) throw new Error('보내지 못했어요.');
      try { localStorage.removeItem(DRAFT); } catch { /* */ }
      m.close();
      toast('보냈어요. 고마워요! 하나하나 읽어 볼게요.', 'good', 3500);
    } catch (e) {
      send.disabled = false;
      send.textContent = '다시 보내기';
      // 실패해도 적은 글은 남아 있다 (임시 저장). 직접 붙여 넣을 수 있게 복사도 해 둔다
      try { await navigator.clipboard.writeText(`[${cat}] ${ta.value.trim()}\n${info}`); } catch { /* */ }
      toast(`${e instanceof Error ? e.message : '보내지 못했어요.'} 적은 글은 지워지지 않았고, 클립보드에도 복사해 두었어요.`, 'bad', 5000);
    }
  });
}
