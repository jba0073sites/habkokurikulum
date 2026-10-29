// Semak token log masuk Firebase guru melalui Firestore (peraturan keselamatan Firestore mengesahkan token).
// Pemboleh ubah persekitaran pilihan:
//   FIREBASE_PROJECT_ID  - jika berbeza daripada koko-config.json
//   FIRESTORE_DATABASE   - nama pangkalan data jika bukan (default)
import cfg from '../../site/koko-config.json';

export async function checkUser(req) {
  const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!tok) return { ok: false, reason: 'tiada token' };
  let p;
  try { p = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString()); } catch { return { ok: false, reason: 'token rosak' }; }
  const pid = process.env.FIREBASE_PROJECT_ID || cfg.firebase.projectId;
  if (!p) return { ok: false, reason: 'token rosak' };
  if (p.aud !== pid) return { ok: false, reason: `token untuk projek ${p.aud}, bukan ${pid}` };
  if (p.exp && p.exp * 1000 < Date.now()) return { ok: false, reason: 'token tamat tempoh' };

  const email = String(p.email || '').toLowerCase();
  const boot = (cfg.pentadbir || []).map(e => String(e).toLowerCase()).includes(email);
  const db = process.env.FIRESTORE_DATABASE || '(default)';
  const uid = p.user_id || p.sub;

  let r;
  try {
    r = await fetch(`https://firestore.googleapis.com/v1/projects/${pid}/databases/${encodeURIComponent(db)}/documents/pengguna/${encodeURIComponent(uid)}`,
      { headers: { authorization: 'Bearer ' + tok } });
  } catch (e) {
    return boot
      ? { ok: true, admin: true, canWrite: true, email, reason: 'Firestore tidak dapat dihubungi; pentadbir asal dibenarkan' }
      : { ok: false, reason: 'Firestore tidak dapat dihubungi' };
  }
  // 404 = token sah tetapi dokumen pengguna belum wujud (pentadbir asal kali pertama)
  if (!r.ok && r.status !== 404) {
    const txt = await r.text().catch(() => '');
    const sebab = `Firestore menolak bacaan (${r.status})${/database.*does not exist/i.test(txt) ? ': pangkalan data bukan (default)' : ''}`;
    return boot ? { ok: true, admin: true, canWrite: true, email, reason: sebab } : { ok: false, reason: sebab };
  }
  const f = r.ok ? ((await r.json().catch(() => ({}))).fields || {}) : {};
  const v = k => f[k] && ('stringValue' in f[k] ? f[k].stringValue : f[k].booleanValue);
  const lulus = boot || v('status') === 'lulus';
  if (!lulus) return { ok: false, reason: v('status') ? `status akaun: ${v('status')}` : 'akaun belum didaftarkan' };
  const admin = boot || v('admin') === true;
  return { ok: true, admin, canWrite: admin || v('peranan') !== 'lihat', email };
}
