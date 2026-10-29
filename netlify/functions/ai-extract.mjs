// Pembaca AI (pilihan) untuk muat naik pintar: membaca PDF imbasan, gambar dan dokumen bebas.
// Pemboleh ubah persekitaran Netlify: ANTHROPIC_API_KEY (wajib), AI_MODEL (pilihan).
// Hanya guru yang telah log masuk dan diluluskan boleh menggunakannya.
import { checkUser } from '../lib/auth.mjs';

const MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';
const MAX_IMAGES = 5;

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!process.env.ANTHROPIC_API_KEY) return new Response('AI not configured', { status: 503 });
  const u = await checkUser(req);
  if (!u.ok) return new Response('Unauthorized', { status: 401 });
  let body;
  try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
  const prompt = String(body.prompt || '').slice(0, 200000);
  if (!prompt) return new Response('Missing prompt', { status: 400 });
  const images = (Array.isArray(body.images) ? body.images : []).slice(0, MAX_IMAGES)
    .filter(i => /^image\/(jpeg|png|webp|gif)$/.test(i.type) && typeof i.data === 'string');
  const content = [
    ...images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.type, data: i.data } })),
    { type: 'text', text: prompt + '\n\nBalas dengan JSON sahaja, tanpa teks lain.' }
  ];
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: 'user', content }] })
  });
  if (r.status === 429) return new Response('Rate limited', { status: 429 });
  if (!r.ok) return new Response('Upstream error', { status: 502 });
  const j = await r.json();
  const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = m ? m[1] : text.slice(Math.min(...['[', '{'].map(c => { const k = text.indexOf(c); return k < 0 ? Infinity : k; })));
  let result; try { result = JSON.parse(raw.trim()); } catch { return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 502 }); }
  return new Response(JSON.stringify({ result }), { headers: { 'content-type': 'application/json' } });
};
