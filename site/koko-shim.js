/* Hab Kokurikulum: lapisan laman sendiri (Netlify + Firebase).
   Menyediakan window.claude.use('db'|'user'|'downloads'|'assets'|'sample') yang sama seperti dalam Claude,
   tetapi disokong oleh Firebase Auth (log masuk Google/DELIMa) + Firestore, dan fail di Netlify Blobs (/_blob/<id>).
   Tetapan projek dalam /koko-config.json. Tiada perubahan diperlukan pada fail ini. */
(function () {
  'use strict';
  window.KOKO_STANDALONE = true;

  /* ---------- Skrin log masuk ---------- */
  const css = `
  #kgate{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:16px;
    background:radial-gradient(1200px 600px at 10% -10%,#9ee7dc66,transparent 60%),radial-gradient(900px 600px at 110% 110%,#c7b8ff66,transparent 60%),#eef0fa;
    font-family:Figtree,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1b1e33}
  @media (prefers-color-scheme:dark){#kgate{background:#12142a;color:#eef0fa}#kgate .kc{background:#1d2040ee;border-color:#ffffff1a}#kgate .ks{color:#b9bdd8}}
  #kgate .kc{width:min(420px,100%);background:#ffffffe6;border:1px solid #1b1e3314;border-radius:22px;padding:28px 24px;box-shadow:0 20px 60px #1b1e3322;text-align:center}
  #kgate .kl{width:76px;height:76px;margin:0 auto 12px;border-radius:18px;background:#fff;display:grid;place-items:center;overflow:hidden;border:1px solid #1b1e3314}
  #kgate .kl img{width:100%;height:100%;object-fit:contain}
  #kgate .kl.khub{border:0;width:64px;height:64px;background:conic-gradient(from 200deg,#14b8a6,#3b82f6,#8b5cf6,#ec4899,#f97316,#eab308,#14b8a6);position:relative}
  #kgate .kl.khub::after{content:'';width:26px;height:26px;border-radius:50%;background:#ffffffe6}
  #kgate h1{font:800 22px/1.2 'Bricolage Grotesque',Figtree,sans-serif;margin:0 0 6px}
  #kgate .ks{font-size:14px;line-height:1.5;color:#545a7a;margin:0 0 18px}
  #kgate button{font:600 15px Figtree,system-ui,sans-serif;border:0;border-radius:999px;padding:12px 20px;cursor:pointer;display:inline-flex;gap:10px;align-items:center;justify-content:center;width:100%}
  #kgate .kb{background:#1b1e33;color:#fff}
  #kgate .kg{background:transparent;color:inherit;text-decoration:underline;margin-top:8px;padding:8px}
  #kgate .ke{font-size:13px;color:#b42318;margin:10px 0 0;min-height:1em}
  #kgate .kspin{width:28px;height:28px;border-radius:50%;border:3px solid #1b1e3322;border-top-color:#1b1e33;animation:ksp 1s linear infinite;margin:6px auto}
  @keyframes ksp{to{transform:rotate(360deg)}}`;
  let gate = null; let LOGO = ''; try { const lid = localStorage.getItem('koko-lencana'); if (/^[0-9a-f]{32}$/.test(lid || '')) LOGO = '/_blob/' + lid; } catch (e) {}
  function show(html) {
    if (!gate) {
      const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
      gate = document.createElement('div'); gate.id = 'kgate'; gate.setAttribute('role', 'dialog'); gate.setAttribute('aria-modal', 'true');
      (document.body || document.documentElement).appendChild(gate);
    }
    gate.innerHTML = `<div class="kc">${LOGO ? `<div class="kl"><img src="${esc(LOGO)}" alt="" onerror="this.parentNode.className='kl khub';this.remove()"></div>` : '<div class="kl khub"></div>'}${html}</div>`;
    return gate;
  }
  function hide() { if (gate) { gate.remove(); gate = null; } }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const whenBody = () => document.body ? Promise.resolve() : new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));

  /* ---------- Bantuan ---------- */
  const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
  const lower = s => String(s || '').trim().toLowerCase();

  const ready = (async () => {
    await whenBody();
    show('<div class="kspin"></div><p class="ks">Memuatkan hab…</p>');
    let C;
    try { C = await (await fetch('/koko-config.json', { cache: 'no-cache' })).json(); }
    catch (e) { show('<h1>Tetapan tiada</h1><p class="ks">Fail <b>koko-config.json</b> tidak dijumpai. Rujuk panduan pemasangan.</p>'); throw e; }
    const title = C.namaHab || 'Hab Kokurikulum'; if (C.logo) LOGO = C.logo;
    if (!window.firebase || !C.firebase || /TAMPAL|NAMA-PROJEK/.test(JSON.stringify(C.firebase))) {
      show(`<h1>${esc(title)}</h1><p class="ks">Tetapan Firebase belum diisi dalam <b>koko-config.json</b>. Rujuk panduan pemasangan, langkah 3.</p>`);
      throw new Error('config');
    }
    const app = firebase.initializeApp(C.firebase);
    const auth = firebase.auth();
    const fs = firebase.firestore();
    let lp = !!C.longPolling; try { lp = lp || localStorage.getItem('koko-lp') === '1'; } catch (e) {}
    try { fs.settings(Object.assign({ ignoreUndefinedProperties: true, merge: true }, lp ? { experimentalForceLongPolling: true } : {})); } catch (e) {}
    try { await fs.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* pelayar tidak menyokong: teruskan tanpa cache */ }
    const boot = (C.pentadbir || []).map(lower);
    const domain = lower(C.domain);

    function loginScreen(err) {
      const g = show(`<h1>${esc(title)}</h1><p class="ks">Log masuk dengan akaun Google sekolah${domain ? ` (<b style="white-space:nowrap">@${esc(domain)}</b>)` : ''} untuk meneruskan.</p>
        <button class="kb" id="kgo"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Log masuk dengan Google</button>
        <p class="ke" id="kerr">${esc(err || '')}</p>`);
      g.querySelector('#kgo').onclick = async () => {
        const p = new firebase.auth.GoogleAuthProvider();
        const prm = { prompt: 'select_account' }; if (domain) prm.hd = domain; p.setCustomParameters(prm);
        try { await auth.signInWithPopup(p); }
        catch (e) {
          if (e && /popup-blocked|operation-not-supported|web-storage/.test(e.code || '')) { try { await auth.signInWithRedirect(p); return; } catch (e2) { e = e2; } }
          if (e && e.code === 'auth/popup-closed-by-user') return;
          g.querySelector('#kerr').textContent = e && e.code === 'auth/unauthorized-domain'
            ? 'Domain laman ini belum dibenarkan dalam Firebase (Authentication → Settings → Authorized domains).'
            : 'Log masuk gagal. Cuba lagi.';
        }
      };
    }
    function outBtn(g) { const b = g.querySelector('#kout'); if (b) b.onclick = () => auth.signOut().then(() => location.reload()); }

    const me = await new Promise(resolve => {
      let first = true;
      auth.onAuthStateChanged(async u => {
        if (!first && !u) { location.reload(); return; }
        if (!u) { loginScreen(); return; }
        if (!first && window.KOKO_ME && window.KOKO_ME.uid !== u.uid) { location.reload(); return; }
        if (window.KOKO_ME) return;
        first = false;
        const email = lower(u.email);
        if (domain && !email.endsWith('@' + domain) && !boot.includes(email)) {
          await auth.signOut(); first = true;
          loginScreen(`Akaun ${u.email} bukan akaun @${domain}. Sila pilih akaun sekolah.`); return;
        }
        show('<div class="kspin"></div><p class="ks">Menyemak akses…</p>');
        const ref = fs.collection('pengguna').doc(u.uid);
        let snap;
        try { snap = await ref.get(); }
        catch (e) {
          console.error('Hab: semakan akses gagal', e);
          const code = String((e && e.code) || '').replace(/^firestore\//, '');
          // Rangkaian sekolah/proksi yang menyekat sambungan Firestore: cuba sekali lagi dengan mod long-polling.
          if ((code === 'unavailable' || /offline/i.test(e && e.message)) && !lp) { try { localStorage.setItem('koko-lp', '1'); } catch (_) {} location.reload(); return; }
          const why = code === 'permission-denied'
            ? 'Peraturan Firestore menolak akaun ini. Pastikan peraturan daripada fail <b>firestore.rules</b> telah ditampal sepenuhnya dan ditekan <b>Publish</b> (panduan langkah 4), dan <b>projectId</b> dalam koko-config.json sama dengan projek Firebase tersebut.'
            : code === 'unavailable' || /offline/i.test(e && e.message)
              ? 'Pelayar tidak dapat berhubung dengan Firestore. Sebab paling biasa: pangkalan data Firestore bukan bernama <b>(default)</b>, atau belum dicipta. Semak di Firebase → Firestore Database. Jika masih gagal, cuba rangkaian lain atau tetingkap Incognito.'
              : code === 'not-found' || /database .* does not exist/i.test(e && e.message)
                ? 'Pangkalan data Firestore belum dicipta dalam projek ini (panduan langkah 2, bahagian 4).'
                : 'Semak sambungan internet dan peraturan Firestore (panduan langkah 4).';
          show(`<h1>Tidak dapat menyemak akses</h1><p class="ks">${why}</p><p class="ks" style="font-size:12px;opacity:.75;margin-top:-8px">Kod: ${esc(code || 'tidak diketahui')}${e && e.message ? ' · ' + esc(String(e.message).slice(0, 160)) : ''}</p>
            <button class="kb" id="kretry">Cuba lagi</button><button class="kg" id="kout">Log keluar</button>`);
          gate.querySelector('#kretry').onclick = () => location.reload();
          outBtn(gate); return; }
        let d = snap.exists ? snap.data() : null;
        const isBoot = boot.includes(email);
        const now = new Date().toISOString();
        if (!d) {
          let invited = false;
          try { invited = (await fs.collection('jemputan').doc(email).get()).exists; } catch (e) {}
          d = { nama: u.displayName || u.email, emel: email, foto: u.photoURL || '', status: (isBoot || invited) ? 'lulus' : 'menunggu',
                admin: isBoot, peranan: 'guru', guru: '', createdAt: now, lastSeen: now };
          try { await ref.set(d); } catch (e) { console.error(e); }
        } else {
          const day = now.slice(0, 10);
          if (String(d.lastSeen || '').slice(0, 10) !== day) ref.update({ lastSeen: now, nama: u.displayName || d.nama || '', foto: u.photoURL || '' }).catch(() => {});
        }
        const ok = isBoot || d.status === 'lulus';
        if (ok) {
          // Semak bahawa peraturan Firestore benar-benar membenarkan akaun ini membaca data.
          let probe = null; try { await fs.doc('config/app').get(); } catch (e) { probe = e; }
          if (probe && /permission/i.test(String(probe.code || probe.message))) {
            const g = show(`<h1>Akses ditolak oleh Firestore</h1><p class="ks">Akaun <b>${esc(u.email)}</b> ${isBoot ? 'disenaraikan sebagai pentadbir dalam <b>koko-config.json</b>, tetapi peraturan Firestore tidak mengenalinya.' : 'diluluskan, tetapi peraturan Firestore menolaknya.'}</p>
              <p class="ks" style="text-align:left">Semak di Firebase → Firestore Database → <b>Rules</b>:<br>1. Peraturan daripada <b>firestore.rules</b> sudah ditampal dan di-<b>Publish</b> dalam projek <b>${esc(C.firebase.projectId)}</b>.<br>2. Baris <b>pentadbirAsal()</b> mengandungi e-mel yang sama tepat: <b>${esc(email)}</b>.</p>
              <button class="kb" id="kretry">Cuba lagi</button><button class="kg" id="kout">Log keluar</button>`);
            g.querySelector('#kretry').onclick = () => location.reload(); outBtn(g); return;
          }
        }
        if (!ok) {
          const ditolak = d.status === 'ditolak';
          const g = show(`<h1>${ditolak ? 'Akses ditolak' : 'Menunggu kelulusan'}</h1>
            <p class="ks">${ditolak ? 'Akaun anda tidak diluluskan untuk hab ini. Hubungi penyelaras kokurikulum sekolah.'
              : `Akaun <b>${esc(u.email)}</b> sudah didaftarkan. Minta pentadbir hab meluluskan anda di <b>Tetapan → Akses &amp; peranan</b>. Halaman ini akan dibuka sendiri sebaik sahaja diluluskan.`}</p>
            <button class="kg" id="kout">Log keluar / tukar akaun</button>`);
          outBtn(g);
          ref.onSnapshot(s => { const x = s.data(); if (x && x.status === 'lulus') location.reload(); }, () => {});
          return;
        }
        resolve({ uid: u.uid, emel: email, nama: d.nama || u.displayName || '', admin: isBoot || d.admin === true,
                  peranan: (isBoot || d.admin) ? 'pentadbir' : (d.peranan || 'guru'), guru: d.guru || '', user: u });
      });
    });

    const canWrite = me.admin || me.peranan !== 'lihat';
    const token = () => auth.currentUser ? auth.currentUser.getIdToken() : Promise.reject(new Error('signed-out'));
    window.KOKO_ME = { uid: me.uid, emel: me.emel, nama: me.nama, admin: me.admin, peranan: me.peranan, guru: me.guru };
    window.KOKO_FS = fs;
    window.KOKO_TOKEN = token;
    window.KOKO_LOGOUT = () => auth.signOut().then(() => location.reload());
    if (C.ai) window.KOKO_AI = { endpoint: C.aiEndpoint || '/.netlify/functions/ai-extract' };

    async function blobReq(method, path, body, type) {
      const h = { authorization: 'Bearer ' + await token() }; if (type) h['content-type'] = type;
      let r; try { r = await fetch(path, { method, headers: h, body }); } catch (e) { throw { code: 'network' }; }
      if (r.status === 413) throw { code: 'too_large' };
      if (r.status === 401 || r.status === 403) throw { code: 'not_granted' };
      if (r.status === 429) throw { code: 'rate_limited' };
      if (!r.ok) throw { code: 'upload_failed', status: r.status };
      return r.json();
    }
    window.KOKO_BLOB_PUT = (id, blob, type) => blobReq('PUT', '/_blob/' + id, blob, type || blob.type || 'application/octet-stream');

    let profCache = null;
    async function allProfiles() {
      if (profCache) return profCache;
      if (!me.admin) return (profCache = {});
      try { const s = await fs.collection('pengguna').get(); profCache = Object.fromEntries(s.docs.map(x => [x.id, x.data()])); }
      catch (e) { profCache = {}; }
      return profCache;
    }

    const ns = {
      db: fs,
      user: {
        id: async () => me.uid,
        can: async p => p === 'data.write' ? canWrite : true,
        canEdit: async () => me.admin,
        profiles: async ids => { const P = await allProfiles(); const o = {}; (ids || []).forEach(id => { const x = P[id]; if (x) o[id] = { id, name: x.nama || x.emel, email: x.emel, avatarUrl: x.foto || '' }; }); return o; },
        search: async q => { const P = await allProfiles(); q = lower(q); return Object.entries(P).filter(([, x]) => !q || lower(x.nama).includes(q) || lower(x.emel).includes(q)).slice(0, 20).map(([id, x]) => ({ id, name: x.nama || x.emel, email: x.emel })); }
      },
      downloads: {
        save: async ({ filename, data, mimeType }) => {
          const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType || (typeof data === 'string' ? 'text/plain;charset=utf-8' : 'application/octet-stream') });
          const url = URL.createObjectURL(blob); const a = document.createElement('a');
          a.href = url; a.download = filename || 'fail'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          return { ok: true };
        }
      },
      assets: canWrite ? {
        upload: async (blob, opt) => blobReq('POST', '/_blob/', blob, (opt && opt.type) || blob.type || 'application/octet-stream'),
        delete: async id => { if (/^[0-9a-f]{32}$/.test(String(id))) await blobReq('DELETE', '/_blob/' + id); }
      } : null,
      sample: null
    };
    hide();
    return ns;
  })();
  ready.catch(e => console.warn('Hab: persediaan gagal', e));

  window.claude = Object.freeze({ use: async name => { const ns = await ready; return ns[name] === undefined ? null : ns[name]; } });
})();
