// 게임 안 피드백 → 디스코드 웹훅. 웹훅 주소는 Vercel 환경 변수 FEEDBACK_WEBHOOK_URL에만 둔다 (공개 저장소라 코드에 넣지 않는다).
// 받는 것: { cat, text, info, shot? } — shot은 판 화면 JPEG dataURL (선택)

const CATS = { bug: '🐞 버그', balance: '⚖️ 밸런스', idea: '💡 제안', story: '📖 이야기·대사', other: '💬 기타' };
const COLORS = { bug: 0xe0584a, balance: 0xe0b040, idea: 0x58b0e0, story: 0xb080e0, other: 0x9a9a9a };

// 같은 사람이 너무 자주 보내지 않게 (함수 인스턴스가 살아 있는 동안만, 최선)
const recent = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const hook = process.env.FEEDBACK_WEBHOOK_URL;
  if (!hook) return res.status(503).json({ ok: false, why: 'not configured' });

  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'x';
  const now = Date.now();
  if (now - (recent.get(ip) ?? 0) < 20_000) return res.status(429).json({ ok: false, why: 'slow down' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const cat = CATS[body?.cat] ? body.cat : 'other';
  const text = String(body?.text ?? '').trim().slice(0, 1800);
  const info = String(body?.info ?? '').slice(0, 1000);
  if (text.length < 2) return res.status(400).json({ ok: false, why: 'empty' });
  recent.set(ip, now);

  const embed = {
    title: CATS[cat],
    description: text,
    color: COLORS[cat],
    fields: info ? [{ name: '게임 상태', value: '```\n' + info + '\n```' }] : [],
    timestamp: new Date().toISOString(),
  };
  const payload = { username: 'Twist', avatar_url: 'https://ch-rpg.vercel.app/icon.png', embeds: [embed], allowed_mentions: { parse: [] } };

  try {
    const shot = typeof body?.shot === 'string' && body.shot.startsWith('data:image/jpeg;base64,') && body.shot.length < 2_000_000 ? body.shot : null;
    let r;
    if (shot) {
      embed.image = { url: 'attachment://screen.jpg' };
      const form = new FormData();
      form.append('payload_json', JSON.stringify(payload));
      form.append('files[0]', new Blob([Buffer.from(shot.split(',')[1], 'base64')], { type: 'image/jpeg' }), 'screen.jpg');
      r = await fetch(hook, { method: 'POST', body: form });
    } else {
      r = await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    if (!r.ok) return res.status(502).json({ ok: false, why: `discord ${r.status}` });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ ok: false, why: 'send failed' });
  }
}
