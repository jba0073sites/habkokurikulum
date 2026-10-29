// Storan fail hab (lencana, banner, gambar laporan, surat, latar sijil) menggunakan Netlify Blobs.
// GET /_blob/<id> awam (ID rawak 128-bit), muat naik/padam perlu log masuk guru yang diluluskan.
import { getStore } from '@netlify/blobs';
import { checkUser } from '../lib/auth.mjs';

const MAX = 4.4 * 1024 * 1024; // had badan permintaan Netlify Functions (~4.5 MB binari)
const ID = /^[0-9a-f]{32}$/;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const newId = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

export default async (req) => {
  const store = getStore({ name: 'fail-hab', consistency: 'strong' });
  const id = new URL(req.url).pathname.replace(/^\/_blob\/?/, '').split('/')[0];
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (!ID.test(id)) return new Response('Not found', { status: 404 });
    const r = await store.getWithMetadata(id, { type: 'arrayBuffer' });
    if (!r) return new Response('Not found', { status: 404 });
    const cc = 'public, max-age=31536000, immutable';
    return new Response(req.method === 'HEAD' ? null : r.data, {
      headers: { 'content-type': (r.metadata && r.metadata.type) || 'application/octet-stream', 'cache-control': cc, 'netlify-cdn-cache-control': cc }
    });
  }
  const u = await checkUser(req);
  if (!u.ok) return json({ code: 'not_granted' }, 401);
  if (!u.canWrite) return json({ code: 'not_granted' }, 403);
  if (req.method === 'POST' || req.method === 'PUT') {
    if (req.method === 'PUT' && (!u.admin || !ID.test(id))) return json({ code: 'not_granted' }, 403);
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return json({ code: 'empty' }, 400);
    if (buf.byteLength > MAX) return json({ code: 'too_large' }, 413);
    const type = (req.headers.get('content-type') || 'application/octet-stream').split(';')[0];
    const key = req.method === 'PUT' ? id : newId();
    await store.set(key, buf, { metadata: { type, oleh: u.email, masa: new Date().toISOString() } });
    return json({ id: key, contentType: type, sizeBytes: buf.byteLength });
  }
  if (req.method === 'DELETE') {
    if (ID.test(id)) await store.delete(id);
    return json({ ok: true });
  }
  return new Response('Method not allowed', { status: 405 });
};

export const config = { path: '/_blob/*', preferStatic: true };
