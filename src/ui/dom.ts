import { key } from '../core/geom';
import { MoveRule, previewPattern } from '../core/rules';
import { fx } from '../render/fx';
import { portraitUrl } from '../render/sprites';

type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'object' ? c : String(c));
  }
  return el;
}

const layer = () => document.getElementById('overlay')!;

export interface ModalHandle { close(): void; el: HTMLElement; body: HTMLElement }

let modalDepth = 0;
/** 대화가 이어지는 중(줄 사이의 짧은 틈 포함)·컷인 중에는 판을 누를 수 없다 (베타 제보: 대화 사이에 한 수를 둘 수 있었다) */
let storyLock = 0;
export const lockStory = (d: 1 | -1) => { storyLock = Math.max(0, storyLock + d); };
export const modalOpen = () => modalDepth > 0 || storyLock > 0;

export function modal(title: string, body: HTMLElement, opts: { wide?: boolean; onClose?: () => void; closable?: boolean; cls?: string } = {}): ModalHandle {
  modalDepth++;
  const closeBtn = opts.closable === false ? null : h('button', { class: 'm-close', 'aria-label': '닫기' }, '✕');
  const box = h('div', { class: `modal ${opts.wide ? 'wide' : ''} ${opts.cls ?? ''}` }, h('div', { class: 'm-head' }, h('h2', {}, title), closeBtn ? h('span', { class: 'esc-hint', title: 'Esc 키로도 닫을 수 있어요' }, 'Esc') : null, closeBtn), h('div', { class: 'm-body' }, body));
  const back = h('div', { class: 'm-back' }, box);
  layer().append(back);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    modalDepth--;
    back.classList.add('out');
    setTimeout(() => back.remove(), 160);
    opts.onClose?.();
  };
  closeBtn?.addEventListener('click', close);
  if (opts.closable !== false) back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  return { close, el: box, body };
}

export interface Choice { label: string; note?: string; disabled?: boolean; tag?: string; onPick: () => void }

/** 대화창에 서는 주인공 (게임이 시작되면 app이 정해 준다) */
let heroPortrait: (() => { src: string; name: string }) | null = null;
export const setDialogHero = (fn: () => { src: string; name: string }) => { heroPortrait = fn; };

const portraitCache = new Map<string, string>();
function npcPortrait(sprite: string, npc?: string) {
  const k = `${sprite}|${npc ?? ''}`;
  if (!portraitCache.has(k)) portraitCache.set(k, portraitUrl(sprite, npc));
  return portraitCache.get(k)!;
}

/**
 * 대화창: 양쪽에 인물이 서고, 아래에 가로로 꽉 찬 대화 상자.
 * 말하는 쪽은 밝고 조금 커지며 이름표가 뜨고, 듣는 쪽은 그림자 지고 조금 작아진다.
 * 선택지에 손을 올리면 주인공(왼쪽)이 말하는 차례가 된다. 인물이 없으면 상자만 (내레이션).
 */
export function dialog(title: string, text: string | HTMLElement, choices: Choice[], opts: { speaker?: string; img?: string; sprite?: string; npc?: string; self?: boolean; noClose?: boolean; onDismiss?: () => void } = {}) {
  modalDepth++;
  const hero = heroPortrait?.() ?? null;
  const npcSrc = opts.sprite ? npcPortrait(opts.sprite, opts.npc) : opts.self ? null : opts.img;
  const name = opts.speaker ?? title;
  const char = (side: 'left' | 'right', src: string, nm: string) => h('div', { class: `vn-char ${side}` }, h('img', { src, alt: '' }), h('div', { class: 'vn-name' }, nm));
  const left = hero && (npcSrc || opts.self) ? char('left', hero.src, hero.name) : null;
  const right = npcSrc ? char('right', npcSrc, name) : null;
  const txt = typeof text === 'string' ? h('p', { class: 'vn-text' }) : text;
  const list = h('div', { class: 'vn-choices' });
  const speakerEl = h('b', { class: 'vn-speaker' }, name);
  // noClose: 반드시 골라야 하는 대화(매복 등)는 ✕가 없다. onDismiss: ✕/Esc로 닫았을 때 할 일 (이어지는 대화를 건너뛰기 등)
  const closeBtn = opts.noClose ? null : h('button', { class: 'm-close vn-close', 'aria-label': '닫기' }, '✕');
  const box = h('div', { class: 'vn-box' }, h('div', { class: 'vn-head' }, speakerEl, closeBtn ? h('span', { class: 'esc-hint', title: 'Esc 키로도 닫을 수 있어요' }, 'Esc') : null, closeBtn), txt, list);
  const root = h('div', { class: `vn ${left || right ? '' : 'narr'}` }, left, right, box);
  // 화면 전체 기준으로 띄운다 (부모 레이아웃의 영향을 받지 않게)
  document.body.append(root);
  // 지금 말하는 쪽
  const speak = (who: 'npc' | 'hero') => {
    const heroTalks = who === 'hero' || !right;
    left?.classList.toggle('active', heroTalks && !!left);
    left?.classList.toggle('idle', !heroTalks);
    right?.classList.toggle('active', !heroTalks);
    right?.classList.toggle('idle', heroTalks);
    speakerEl.textContent = heroTalks && left && hero ? hero.name : name;
    box.classList.toggle('hero-turn', heroTalks && !!left);
  };
  speak(opts.self ? 'hero' : 'npc');
  let closed = false;
  let saying = false;
  const close = () => {
    if (closed) return;
    closed = true;
    modalDepth--;
    root.classList.add('out');
    setTimeout(() => root.remove(), 200);
  };
  closeBtn?.addEventListener('click', () => { close(); opts.onDismiss?.(); });
  // 한 상자에 말을 몰아넣지 않는다: 문장 단위로 끊어 하나씩 보여 주고, 읽을 시간이 지나면 저절로 다음 줄로.
  // (베타 의견: 한 대사에 말이 너무 많고 빼곡하다 → 짧은 대화창 여러 개가 순서대로)
  const parts = typeof text === 'string' ? splitLines(text) : [];
  let part = 0;
  let autoT = 0;
  const pager = h('span', { class: 'vn-pager' });
  if (parts.length > 1) box.append(pager);
  const showPart = () => {
    const last = part >= parts.length - 1;
    list.style.display = last ? '' : 'none';
    pager.textContent = last ? '' : `${part + 1}/${parts.length} ▸`;
    typewrite(txt as HTMLElement, parts[part]);
    clearTimeout(autoT);
    if (!last) autoT = window.setTimeout(nextPart, readTime(parts[part]));
  };
  const nextPart = () => {
    if (closed || part >= parts.length - 1) return;
    part++;
    showPart();
  };
  if (parts.length) showPart();
  // 아직 줄이 남았으면 상자를 누르면 바로 다음 줄
  box.addEventListener('click', () => { if (!saying && part < parts.length - 1) nextPart(); });
  for (const c of choices) {
    const b = h('button', { class: 'd-choice vn-choice', disabled: c.disabled }, c.tag ? h('span', { class: `tag tag-${c.tag}` }, tagName(c.tag)) : null, c.label, c.note ? h('small', {}, c.note) : null);
    // 선택지에 손을 올려도 화자는 바뀌지 않는다. 누르면 주인공이 그 말을 하고 대화에서 빠져나온다
    b.addEventListener('click', (ev) => {
      ev.stopPropagation(); // 이 클릭이 아래의 "아무 곳이나 눌러 넘기기"로 번지지 않게
      if (saying) return;
      if (!left) { close(); c.onPick(); return; }
      saying = true;
      speak('hero');
      left.classList.add('saying');
      list.remove();
      // 통째로 괄호면 행동 묘사 "(고개를 끄덕인다)", 아니면 말. 끝에 붙은 비용 표시 "(들풀 섬유 3)"는 말하지 않는다
      // (예전엔 앞뒤 괄호 글자만 지워서 "(들풀 섬유 3"처럼 괄호가 안 닫혀 보였다 — 베타 제보)
      const action = /^[(（].*[)）]$/.test(c.label);
      const line = action ? c.label : c.label.replace(/\s*[(（][^()（）]*[)）]\s*$/, '');
      if (txt instanceof HTMLParagraphElement) {
        txt.classList.add('hero-line');
        typewrite(txt, action ? line : `"${line}"`);
      }
      // 말하는 시간: 글자 수에 비례 (짧으면 0.7초, 길어도 1.4초). 아무 곳이나 누르면 바로 넘긴다
      const wait = Math.min(1400, Math.max(700, line.length * 45));
      let done = false;
      const finish = () => { if (done) return; done = true; close(); c.onPick(); };
      setTimeout(finish, wait);
      setTimeout(() => box.addEventListener('click', finish, { once: true }), 0);
    });
    list.append(b);
  }
  return { close, el: root, body: box };
}

const tagName = (t: string) => ({ light: '빛', dark: '어둠', neutral: '중립', any: '공통', fight: '전투', job: '직업' } as Record<string, string>)[t] ?? t;

/** 대사를 짧은 줄로 나눈다: 줄바꿈 → 문장(. ? !) 단위. 너무 짧은 조각은 앞뒤와 붙이고, 따옴표는 줄마다 다시 닫아 준다 */
export function splitLines(text: string): string[] {
  const quoted = /^"[^"]*"$/.test(text.trim());
  const body = quoted ? text.trim().slice(1, -1) : text;
  const out: string[] = [];
  for (const para of body.split(/\n+/)) {
    const sents = para.match(/[^.?!]+[.?!]+["”']?\s*|[^.?!]+$/g) ?? [para];
    let buf = '';
    for (const raw of sents) {
      const t = raw.trim();
      if (!t) continue;
      // 한 줄은 대략 45자까지: 짧은 문장은 이어 붙이고, 길면 끊는다
      if (buf && (buf + ' ' + t).length <= 45) buf = `${buf} ${t}`;
      else { if (buf) out.push(buf); buf = t; }
    }
    if (buf) out.push(buf);
  }
  const fixed = out.map((line) => {
    // 따옴표가 줄 사이에 걸치면 그 줄 안에서 닫아 준다
    const n = (line.match(/"/g) ?? []).length;
    if (n % 2 === 1) return line.startsWith('"') ? `${line}"` : `"${line}`;
    return line;
  });
  return quoted ? fixed.map((l) => (l.startsWith('"') ? l : `"${l}"`)) : fixed;
}
/** 한 줄 읽는 시간 (자동 넘김): 글자 수에 비례, 1.4~4초 */
const readTime = (t: string) => Math.min(4000, Math.max(1400, 600 + t.length * 60));

function typewrite(el: HTMLElement, text: string) {
  let i = 0;
  const tick = () => {
    i += 2;
    el.textContent = text.slice(0, i);
    if (i < text.length) requestAnimationFrame(tick);
  };
  el.addEventListener('click', () => { i = text.length; }, { once: true });
  tick();
}

export function toast(msg: string, kind: 'info' | 'good' | 'rare' | 'bad' = 'info', ms = 2400) {
  if (fx.instant) return;
  const el = h('div', { class: `toast ${kind}` }, msg);
  const box = document.getElementById('toasts')!;
  box.append(el);
  // 한꺼번에 3개까지만 보여 준다 (오래된 것부터 치운다)
  while (box.children.length > 3) box.firstElementChild!.remove();
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

/**
 * 처음 한 번만 나오는 짧은 힌트 말풍선 (튜토리얼 대신).
 * 닫기 버튼은 없다: 안내한 행동을 하면 clearCoach(id)로 저절로 사라진다.
 */
let coachId = '';
let coachSel = '';
/** 지금 떠 있는 첫 안내 id (판 위에 손가락 표시를 그릴 때 쓴다) */
export const coachNow = () => coachId;
/** 첫 안내가 짚는 화면 요소에 금빛 테두리 (화면이 다시 그려진 뒤에도 부르면 다시 붙는다) */
/** 첫 안내가 짚을 화면 요소를 바꾼다 (단계가 넘어갈 때) */
export const setCoachFocus = (sel: string) => { if (coachId) coachSel = sel; };
export function applyCoachFocus() {
  document.querySelectorAll('.coach-focus').forEach((e) => e.classList.remove('coach-focus'));
  if (coachId && coachSel) document.querySelector(coachSel)?.classList.add('coach-focus');
}
export function coach(text: string, id: string, opts: { act?: string; el?: string } = {}) {
  if (fx.instant) return;
  document.querySelectorAll('.coach').forEach((e) => e.remove());
  coachId = id;
  coachSel = opts.el ?? '';
  const body = opts.act
    ? h('span', { class: 'coach-body' }, h('span', { class: 'coach-tag' }, '할 일'), h('b', { class: 'coach-act' }, opts.act), h('small', {}, text))
    : h('span', {}, text);
  const el = h('div', { class: `coach ${opts.act ? 'quest' : ''}`, 'data-tip': id, role: 'status', 'aria-live': 'polite' }, h('span', { class: 'coach-ico' }, opts.act ? '👆' : '💡'), body);
  document.body.append(el);
  placeCoach(el);
  setTimeout(applyCoachFocus, 60);
}

/**
 * 첫 안내 말풍선 자리: 옆 패널이 판 오른쪽에 있는 넓은 화면에서는 옆 패널 아래쪽에 붙여
 * 판(아랫줄의 주인공·전투 행동 줄)을 가리지 않게 한다. 위아래로 쌓이는 좁은 화면은 그대로 화면 아래.
 */
function placeCoach(el: HTMLElement) {
  const side = document.getElementById('side')?.getBoundingClientRect();
  const board = document.getElementById('board')?.getBoundingClientRect();
  const besideBoard = !!side && !!board && side.width >= 240 && side.left >= board.right - 4 && !document.body.classList.contains('at-title');
  el.classList.toggle('side', besideBoard);
  el.style.left = besideBoard ? `${side!.left + 8}px` : '';
  el.style.width = besideBoard ? `${side!.width - 16}px` : '';
}
window.addEventListener('resize', () => document.querySelectorAll<HTMLElement>('.coach').forEach(placeCoach));

/**
 * 접을 수 있는 설명 묶음: 처음 몇 번(fresh)은 펼친 채로, 그 뒤로는 'ⓘ 제목'만 보이게 접어 둔다.
 * 패널이 다시 그려져도 사용자가 펼치거나 접은 상태는 기억한다 (id별, 이번 접속 동안).
 */
const foldState: Record<string, boolean> = {};
export function helpFold(id: string, title: string, fresh: boolean, ...items: HTMLElement[]): HTMLElement | null {
  if (!items.length) return null;
  const open = foldState[id] ?? fresh;
  const d = h('details', { class: 'help-fold', open }, h('summary', {}, `ⓘ ${title}`), ...items);
  d.addEventListener('toggle', () => { foldState[id] = (d as HTMLDetailsElement).open; });
  return d;
}

/** 해당 힌트가 떠 있으면 사라지게 한다 (여러 id 가능) */
export function clearCoach(...ids: string[]) {
  if (!coachId || !ids.includes(coachId)) return;
  coachId = '';
  coachSel = '';
  applyCoachFocus();
  document.querySelectorAll('.coach').forEach((el) => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  });
}

/** 강조 등급 연출: 화면 전체 컷인 */
export function cutin(title: string, sub: string, kind: 'boss' | 'promo' | 'phase' | 'win' | 'lose' = 'boss', img?: string): Promise<void> {
  if (fx.instant) return Promise.resolve();
  return new Promise((res) => {
    // 글이 길면 읽을 시간만큼 오래 (한 글자 약 70ms, 최대 7초). 누르면 바로 넘어간다
    const long = sub.length > 30;
    const el = h('div', { class: `cutin ${kind}` }, h('div', { class: 'ci-band' }, img ? h('img', { src: img, alt: '' }) : null, h('div', {}, h('div', { class: 'ci-title' }, title), h('div', { class: 'ci-sub' }, sub), long ? h('div', { class: 'ci-skip' }, '누르면 넘어가요') : null)));
    if (kind === 'promo') for (let i = 0; i < 18; i++) el.append(h('i', { class: 'ray', style: { transform: `rotate(${i * 20}deg)` } }));
    layer().append(el);
    lockStory(1);
    const done = () => {
      el.classList.add('out');
      setTimeout(() => { el.remove(); lockStory(-1); res(); }, 300);
    };
    const base = kind === 'promo' ? 2600 : 1700;
    const t = setTimeout(done, Math.min(7000, Math.max(base, 900 + sub.length * 70)));
    el.addEventListener('click', () => { clearTimeout(t); done(); });
  });
}

/** 행마 미리보기 격자 (DOM) */
export function patternGrid(base: MoveRule[], extra: MoveRule[], img: string, R = 3) {
  const pb = previewPattern(base, R);
  const pe = previewPattern(extra, R);
  const g = h('div', { class: 'pgrid', style: { gridTemplateColumns: `repeat(${R * 2 + 1}, 1fr)` } });
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const k = key(x, y);
      const cell = h('div', { class: `pc ${(x + y) % 2 ? 'd' : 'l'}` });
      if (x === 0 && y === 0) cell.append(h('img', { src: img, alt: '' }));
      const b = pb.get(k);
      const e = pe.get(k);
      if (e) cell.append(h('i', { class: `dot new ${e}` }));
      else if (b) cell.append(h('i', { class: `dot base ${b}` }));
      g.append(cell);
    }
  }
  return g;
}

/** 퀘스트 완료: 화면 위쪽을 지나가는 금빛 띠 (업적처럼 눈에 띄게) */
export function questBanner(name: string, reward: string, main: boolean) {
  if (fx.instant) return;
  const el = h('div', { class: `q-banner ${main ? 'main' : ''}` }, h('small', {}, main ? '◆ 메인 퀘스트 완료' : '퀘스트 완료'), h('b', {}, name), reward ? h('span', {}, reward) : null);
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 2200);
  setTimeout(() => el.remove(), 2700);
}
