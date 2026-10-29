// Semak token log masuk Firebase guru melalui Firestore (peraturan keselamatan Firestore mengesahkan token).
import cfg from '../../site/koko-config.json';

export async function checkUser(req) {
  const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!tok) return { ok: false };
  let p;
  try { p = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString()); } catch { return { ok: false }; }
  const pid = process.env.FIREBASE_PROJECT_ID || cfg.firebase.projectId;
  if (!p || p.aud !== pid) return { ok: false };
  const uid = p.user_id || p.sub;
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/pengguna/${encodeURIComponent(uid)}`,
    { headers: { authorization: 'Bearer ' + tok } });
  if (!r.ok && r.status !== 404) return { ok: false }; // 404 = token sah tetapi dokumen pengguna belum wujud
  const f = r.ok ? ((await r.json()).fields || {}) : {};
  const v = k => f[k] && ('stringValue' in f[k] ? f[k].stringValue : f[k].booleanValue);
  const email = String(p.email || '').toLowerCase();
  const boot = (cfg.pentadbir || []).map(e => String(e).toLowerCase()).includes(email);
  const lulus = boot || v('status') === 'lulus';
  if (!lulus) return { ok: false };
  const admin = boot || v('admin') === true;
  return { ok: true, admin, canWrite: admin || v('peranan') !== 'lihat', email };
}
