// Storan fail hab (lencana, banner, gambar laporan, surat, latar sijil) menggunakan Netlify Blobs.
//   GET    /_blob/<id>   - awam (ID rawak 128-bit)
//   POST   /_fail        - muat naik fail baharu (guru yang diluluskan)
//   PUT    /_fail/<id>   - tulis fail dengan ID sedia ada (pentadbir; untuk pemulihan sandaran)
//   DELETE /_fail/<id>   - padam fail
//   GET    /_fail/semak  - semakan diagnostik (status log masuk + storan)
// Nota: muat naik TIDAK boleh menggunakan /_blob/ kerana folder statik site/_blob wujud dan
// mengambil keutamaan (preferStatic), jadi permintaan tidak akan sampai ke fungsi ini.
import { getStore } from '@netlify/blobs';
import { checkUser } from '../lib/auth.mjs';

const MAX = 4.4 * 1024 * 1024; // had badan permintaan Netlify Functions (~4.5 MB binari)
const ID = /^[0-9a-f]{32}$/;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const newId = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

export default async (req) => {
  const path = new URL(req.url).pathname;
  const id = path.replace(/^\/_(blob|fail)\/?/, '').split('/')[0];

  let store;
  try { store = getStore({ name: 'fail-hab', consistency: 'strong' }); }
  catch (e) { return json({ code: 'store_unavailable', mesej: String(e && e.message || e) }, 500); }

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (id === 'semak') {
      const u = await checkUser(req);
      let storan = 'ok', mesej = '';
      try { await store.getWithMetadata('__semak__'); } catch (e) { storan = 'gagal'; mesej = String(e && e.message || e); }
      return json({ login: u.ok, pentadbir: !!u.admin, bolehTulis: !!u.canWrite, emel: u.email || '', sebab: u.reason || '', storan, mesej });
    }
    if (!ID.test(id)) return new Response('Not found', { status: 404 });
    let r;
    try { r = await store.getWithMetadata(id, { type: 'arrayBuffer' }); }
    catch (e) { return new Response('Store error', { status: 500 }); }
    if (!r) return new Response('Not found', { status: 404 });
    const cc = 'public, max-age=31536000, immutable';
    return new Response(req.method === 'HEAD' ? null : r.data, {
      headers: { 'content-type': (r.metadata && r.metadata.type) || 'application/octet-stream', 'cache-control': cc, 'netlify-cdn-cache-control': cc }
    });
  }

  const u = await checkUser(req);
  if (!u.ok) return json({ code: 'not_granted', sebab: u.reason || 'tidak log masuk' }, 401);
  if (!u.canWrite) return json({ code: 'not_granted', sebab: 'peranan lihat sahaja' }, 403);

  if (req.method === 'POST' || req.method === 'PUT') {
    if (req.method === 'PUT' && (!u.admin || !ID.test(id))) return json({ code: 'not_granted', sebab: 'perlu pentadbir' }, 403);
    let buf;
    try { buf = await req.arrayBuffer(); } catch (e) { return json({ code: 'too_large' }, 413); }
    if (!buf.byteLength) return json({ code: 'empty' }, 400);
    if (buf.byteLength > MAX) return json({ code: 'too_large' }, 413);
    const type = (req.headers.get('content-type') || 'application/octet-stream').split(';')[0];
    const key = req.method === 'PUT' ? id : newId();
    try { await store.set(key, buf, { metadata: { type, oleh: u.email, masa: new Date().toISOString() } }); }
    catch (e) { return json({ code: 'store_write_failed', mesej: String(e && e.message || e) }, 500); }
    return json({ id: key, contentType: type, sizeBytes: buf.byteLength });
  }

  if (req.method === 'DELETE') {
    if (ID.test(id)) { try { await store.delete(id); } catch (e) {} }
    return json({ ok: true });
  }
  return new Response('Method not allowed', { status: 405 });
};

export const config = { path: ['/_blob/*', '/_fail', '/_fail/*'], preferStatic: true };
