'use strict';
// App học tiếng Trung — vanilla JS, không cần build. Dữ liệu nằm trong data.js
// (UNITS, GRAMMAR, CONVERSATIONS). Tiến độ lưu trong localStorage của trình duyệt.

// ================================================================
// NGÀY THÁNG
// ================================================================
function fmtKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayKey() { return fmtKey(new Date()); }
function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return fmtKey(new Date(y, m - 1, d + n));
}
function fmtVN(key) { const [, m, d] = key.split('-'); return `${d}/${m}`; }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ================================================================
// STORAGE
// ================================================================
const STORE_KEY = 'zhStudy.v2';
const OLD_PROGRESS_KEY = 'dcZhProgressV1';
const OLD_CONTENT_KEY = 'dcZhContentV1';

function readJSON(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function loadStore() {
  // known: { hanzi: ngày thuộc }   srs: { hanzi: { lv, due } }   completed: { mã bài: ngày hoàn thành }
  // wordAt / unitAt: thời điểm (ms) thay đổi gần nhất của từng từ / từng bài — dùng để gộp khi đồng bộ nhiều máy.
  const base = { known: {}, srs: {}, completed: {}, wrong: {}, quizzes: [], convoBest: {}, wordAt: {}, unitAt: {}, backup: {}, prefs: {} };
  const saved = readJSON(STORE_KEY);
  if (saved) return { ...base, ...saved, prefs: { ...base.prefs, ...(saved.prefs || {}) } };
  // Chuyển tiến độ từ bản app cũ (nếu mở trên cùng trình duyệt)
  const old = readJSON(OLD_PROGRESS_KEY);
  if (old) {
    base.known = { ...(old.learnedWords || {}) };
    base.quizzes = (old.quizHistory || []).map(q => ({ date: q.dateKey, topic: q.topicLabel || q.topic, total: q.length, correct: q.score }));
  }
  return base;
}
const store = loadStore();
// Cấu hình đồng bộ đám mây (mã truy cập GitHub…) lưu riêng: không nằm trong file sao lưu / bản lưu tự động.
const SYNC_KEY = 'zhStudy.sync';
const SYNC_DELAY = 15000; // gửi lên đám mây sau 15 giây kể từ thay đổi cuối
let syncCfg = readJSON(SYNC_KEY) || {};
let syncTimer = null, syncing = false;
// Khai báo kiểu function (được "hoist") vì save() bên dưới gọi tới ngay từ lúc khởi động.
function syncOn() { return !!syncCfg.token; }
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* private mode */ }
  scheduleSync();
}

// ================================================================
// LỊCH ÔN TẬP (spaced repetition): từ đã thuộc được nhắc lại sau 1 → 3 → 7 → 14 → 28 → 60 ngày.
// lv = mốc đang chờ (0 = mốc 1 ngày … 5 = mốc 60 ngày, 6 = đã thành thạo, không nhắc nữa).
// "Vẫn nhớ" → lên mốc kế tiếp. "Quên rồi" → quay về mốc 1 ngày (từ vẫn tính là đã thuộc).
// ================================================================
const INTERVALS = [1, 3, 7, 14, 28, 60];
const MASTERED = INTERVALS.length;
// Từ đã thuộc từ trước khi có lịch ôn → bắt đầu ở mốc 1 ngày tính từ ngày thuộc.
Object.entries(store.known).forEach(([h, d]) => {
  if (!store.srs[h]) store.srs[h] = { lv: 0, due: addDays(DATE_RE.test(d) ? d : todayKey(), INTERVALS[0]) };
});
const isKnown = h => !!store.known[h];
function isDue(h) {
  const r = store.srs[h];
  return isKnown(h) && !!r && !!r.due && r.due <= todayKey();
}
function review(h, remembered) {
  const r = store.srs[h] || { lv: 0 };
  if (remembered) {
    const lv = r.lv + 1;
    store.srs[h] = lv >= MASTERED ? { lv: MASTERED, due: null } : { lv, due: addDays(todayKey(), INTERVALS[lv]) };
  } else {
    store.srs[h] = { lv: 0, due: addDays(todayKey(), INTERVALS[0]) };
  }
  store.wordAt[h] = Date.now();
  save();
  return store.srs[h];
}
function srsText(h) {
  if (!isKnown(h)) return '';
  const r = store.srs[h];
  if (!r) return '';
  if (r.lv >= MASTERED) return 'Đã thành thạo, qua đủ 6 mốc ôn';
  return `Mốc ${INTERVALS[r.lv]} ngày · ${r.due <= todayKey() ? 'cần ôn hôm nay' : 'ôn lại ngày ' + fmtVN(r.due)}`;
}

// Nội dung tự thêm ở tab Import của bản cũ → gộp vào dữ liệu để không bị mất.
(function mergeOldCustomContent() {
  const c = readJSON(OLD_CONTENT_KEY);
  if (!c) return;
  (c.units || []).forEach(u => {
    let target = UNITS.find(x => x.title === u.title);
    if (!target) { target = { title: u.title, vocab: [] }; UNITS.push(target); }
    const have = new Set(target.vocab.map(w => w.hanzi));
    (u.vocab || []).forEach(w => { if (w && w.hanzi && !have.has(w.hanzi)) { target.vocab.push({ synonyms: [], antonyms: [], ...w }); have.add(w.hanzi); } });
  });
  const gHave = new Set(GRAMMAR.map(g => g.structure));
  (c.grammar || []).forEach(g => { if (g && g.structure && !gHave.has(g.structure)) GRAMMAR.push(g); });
  (c.conversations || []).forEach(cv => {
    const target = CONVERSATIONS.find(x => x.title === cv.title);
    if (!target) CONVERSATIONS.push({ title: cv.title, lines: cv.lines || [], questions: [] });
    else if ((cv.lines || []).length > target.lines.length) target.lines = cv.lines;
  });
})();

// ================================================================
// DERIVED DATA
// ================================================================
UNITS.forEach((u, i) => u.vocab.forEach(w => { if (w.unit === undefined) w.unit = i; }));
const ALL_WORDS = UNITS.flatMap(u => u.vocab);
const WORD_BY_HANZI = new Map();
ALL_WORDS.forEach(w => { if (!WORD_BY_HANZI.has(w.hanzi)) WORD_BY_HANZI.set(w.hanzi, w); });
const UNIQUE_WORDS = [...WORD_BY_HANZI.values()];
const UNIT_HANZI = UNITS.map(u => [...new Set(u.vocab.map(w => w.hanzi))]);
// Chỉ gạch chân từ ≥ 2 chữ trong hội thoại để tránh nhiễu (副, 則, 某...)
const TOKEN_INDEX = UNIQUE_WORDS.filter(w => w.hanzi.length >= 2).sort((a, b) => b.hanzi.length - a.hanzi.length);
const TOKEN_BY_FIRST = new Map(); // chữ đầu → các từ (dài trước), để không phải dò cả kho ở mỗi vị trí
TOKEN_INDEX.forEach(w => { const k = w.hanzi[0]; if (!TOKEN_BY_FIRST.has(k)) TOKEN_BY_FIRST.set(k, []); TOKEN_BY_FIRST.get(k).push(w); });

function unitShort(i) {
  const t = UNITS[i].title;
  return t.length > 26 ? t.slice(0, 25) + '…' : t;
}
const unitId = u => u.key || u.title;
const dueWords = () => UNIQUE_WORDS.filter(w => isDue(w.hanzi));

// ================================================================
// TIẾN ĐỘ BÀI HỌC: bài thuộc hết từ → "Hoàn thành". Giữ nguyên trạng thái này
// cho tới khi người học bấm "Học lại" (reset), kể cả khi sau đó bỏ đánh dấu vài từ.
// ================================================================
function checkCompletion() {
  const done = [];
  UNITS.forEach((u, i) => {
    const id = unitId(u);
    if (store.completed[id] || !UNIT_HANZI[i].length) return;
    if (UNIT_HANZI[i].every(isKnown)) { store.completed[id] = todayKey(); store.unitAt[id] = Date.now(); done.push(u.title); }
  });
  if (done.length) save();
  return done;
}
function unitProgress(i) {
  const hs = UNIT_HANZI[i];
  return { known: hs.filter(isKnown).length, total: hs.length, done: !!store.completed[unitId(UNITS[i])] };
}
// Trả về tên bài vừa hoàn thành (nếu có) để hiện thông báo.
function setKnown(h, val) {
  if (val) {
    store.known[h] = store.known[h] || todayKey();
    if (!store.srs[h]) store.srs[h] = { lv: 0, due: addDays(todayKey(), INTERVALS[0]) };
  } else {
    delete store.known[h];
    delete store.srs[h];
  }
  store.wordAt[h] = Date.now();
  save();
  return val ? checkCompletion()[0] : null;
}
function markKnown(h) {
  const done = setKnown(h, true);
  toast(done ? '🎉 Hoàn thành ' + done : 'Đã lưu: ' + h);
}
function resetUnit(i) {
  const u = UNITS[i], hs = UNIT_HANZI[i];
  if (!confirm(`Học lại "${u.title}"?\n\n${hs.length} từ của bài sẽ về trạng thái chưa thuộc, lịch ôn của các từ này cũng bị xoá.\n(App tự giữ một bản lưu trước khi đặt lại.)`)) return;
  takeSnapshot('Trước khi học lại ' + u.title);
  const now = Date.now();
  hs.forEach(h => { delete store.known[h]; delete store.srs[h]; delete store.wrong[h]; store.wordAt[h] = now; });
  delete store.completed[unitId(u)];
  store.unitAt[unitId(u)] = now;
  save();
  if (state.unit === i || state.unit === 'all') buildDeck(false);
  render();
  toast('Đã đặt lại ' + u.title);
}
checkCompletion();
save();

// ================================================================
// SAO LƯU — tiến độ chỉ nằm trên máy (localStorage), nên có 3 lớp bảo vệ:
//  1. Sao lưu ra file JSON (iPhone: bảng Chia sẻ → Lưu vào Tệp / iCloud Drive) + khôi phục từ file.
//  2. Bản lưu tự động trên máy: mỗi ngày 1 bản + trước khi Học lại / Khôi phục (giữ 10 bản gần nhất).
//  3. Nhắc sao lưu khi đã ≥ 7 ngày chưa sao lưu mà tiến độ có thay đổi.
// ================================================================
const SNAP_KEY = 'zhStudy.snapshots';
const MAX_SNAPS = 10;
const BACKUP_REMIND_DAYS = 7;
const DAILY = 'Tự động hằng ngày';
const progressData = () => ({ known: store.known, srs: store.srs, completed: store.completed, wrong: store.wrong, quizzes: store.quizzes, convoBest: store.convoBest });
function progressSig() {
  const s = JSON.stringify([store.known, store.srs, store.completed]);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
const validData = d => !!d && typeof d === 'object' && !!d.known && typeof d.known === 'object' && !Array.isArray(d.known);
function applyData(d) {
  // Đánh dấu mọi từ/bài bị ảnh hưởng là "vừa thay đổi" → khi đồng bộ, bản vừa khôi phục sẽ thắng bản cũ trên mạng.
  const now = Date.now();
  new Set([...Object.keys(store.known), ...Object.keys(d.known)]).forEach(h => { store.wordAt[h] = now; });
  new Set([...Object.keys(store.completed), ...Object.keys(d.completed || {})]).forEach(id => { store.unitAt[id] = now; });
  store.known = { ...d.known };
  store.srs = { ...(d.srs || {}) };
  store.completed = { ...(d.completed || {}) };
  store.wrong = { ...(d.wrong || {}) };
  store.quizzes = Array.isArray(d.quizzes) ? d.quizzes.slice(-200) : [];
  store.convoBest = { ...(d.convoBest || {}) };
  Object.entries(store.known).forEach(([h, dt]) => {
    if (!store.srs[h]) store.srs[h] = { lv: 0, due: addDays(DATE_RE.test(dt) ? dt : todayKey(), INTERVALS[0]) };
  });
  checkCompletion();
  save();
}
function loadSnaps() { const s = readJSON(SNAP_KEY); return Array.isArray(s) ? s : []; }
function saveSnaps(list) {
  // bộ nhớ đầy → bỏ dần bản cũ nhất
  while (list.length) {
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(list)); return; } catch (e) { list.pop(); }
  }
}
function takeSnapshot(reason) {
  const n = Object.keys(store.known).length;
  if (!n && !store.quizzes.length) return; // chưa có gì để lưu
  const list = loadSnaps();
  list.unshift({ at: new Date().toISOString(), day: todayKey(), reason, known: n, data: JSON.parse(JSON.stringify(progressData())) });
  saveSnaps(list.slice(0, MAX_SNAPS));
}
function dailySnapshot() {
  if (!loadSnaps().some(s => s.day === todayKey() && s.reason === DAILY)) takeSnapshot(DAILY);
}
function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 864e5); }
function backupStatus() {
  const b = store.backup || {};
  const n = Object.keys(store.known).length;
  const changed = b.sig !== progressSig();
  const days = b.lastAt ? daysBetween(b.lastAt, todayKey()) : null;
  const snoozed = !!b.snoozeUntil && b.snoozeUntil > todayKey();
  // Đang đồng bộ đám mây bình thường → không cần nhắc sao lưu file.
  const cloudOk = syncOn() && !syncCfg.error && !!syncCfg.lastAt && Date.now() - syncCfg.lastAt < BACKUP_REMIND_DAYS * 864e5;
  return { lastAt: b.lastAt, days, changed, remind: !cloudOk && !snoozed && n >= 5 && changed && (days === null || days >= BACKUP_REMIND_DAYS) };
}
function markBackedUp() {
  store.backup = { lastAt: todayKey(), sig: progressSig(), snoozeUntil: null };
  save();
}
async function exportBackup() {
  const payload = { app: 'zhStudy', version: 1, exportedAt: new Date().toISOString(), knownCount: Object.keys(store.known).length, data: progressData() };
  const json = JSON.stringify(payload);
  const name = `hoc-tieng-trung-${todayKey()}.json`;
  // Điện thoại: mở bảng Chia sẻ (iPhone → "Lưu vào Tệp"). Máy tính: tải file về.
  if (matchMedia('(pointer: coarse)').matches && typeof File === 'function' && navigator.canShare) {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Sao lưu học tiếng Trung' });
        markBackedUp(); render(); toast('Đã sao lưu ' + name);
      } catch (e) {
        if (e.name !== 'AbortError') downloadFile(json, name); // huỷ chia sẻ → không tính là đã sao lưu
      }
      return;
    }
  }
  downloadFile(json, name);
}
function downloadFile(json, name) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  markBackedUp(); render(); toast('Đã tải file sao lưu ' + name);
}
function restoreFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let p;
    try { p = JSON.parse(reader.result); } catch (e) { toast('File không đọc được'); return; }
    const d = p && p.app === 'zhStudy' ? p.data : null;
    if (!validData(d)) { toast('Đây không phải file sao lưu của app'); return; }
    const when = p.exportedAt ? fmtDateTime(p.exportedAt) : 'không rõ ngày';
    if (!confirm(`Khôi phục bản sao lưu ${when} (${Object.keys(d.known).length} từ đã thuộc)?\n\nTiến độ hiện tại (${Object.keys(store.known).length} từ) sẽ được thay thế. App tự giữ một bản của tiến độ hiện tại trong "Bản lưu tự động" để có thể quay lại.`)) return;
    takeSnapshot('Trước khi khôi phục từ file');
    applyData(d);
    markBackedUp();
    afterRestore();
  };
  reader.readAsText(file);
}
function restoreSnapshot(i) {
  const s = loadSnaps()[i];
  if (!s || !validData(s.data)) return;
  if (!confirm(`Quay lại bản lưu ${fmtDateTime(s.at)} (${s.known} từ đã thuộc)?\n\nTiến độ hiện tại (${Object.keys(store.known).length} từ) sẽ được thay thế. App tự giữ một bản của tiến độ hiện tại trước khi quay lại.`)) return;
  takeSnapshot('Trước khi khôi phục bản tự động');
  applyData(s.data);
  afterRestore();
}
function afterRestore() {
  buildDeck(false);
  render();
  toast(`Đã khôi phục: ${Object.keys(store.known).length} từ đã thuộc`);
}
function fmtDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ================================================================
// ĐỒNG BỘ ĐÁM MÂY qua GitHub Gist (gist bí mật, 1 file JSON).
// Mỗi lần đồng bộ: tải bản trên mạng → gộp với bản trên máy → gửi lại nếu khác.
// Gộp theo từng từ / từng bài: bên nào thay đổi sau (wordAt / unitAt lớn hơn) thì thắng,
// nên bỏ đánh dấu hay "Học lại" trên một máy cũng được truyền sang máy kia.
// ================================================================
const GIST_FILE = 'hoc-tieng-trung-tien-do.json';
const GH_API = 'https://api.github.com';
const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Hoc%20tieng%20Trung';
function saveSync() { try { localStorage.setItem(SYNC_KEY, JSON.stringify(syncCfg)); } catch (e) { /* ignore */ } }
function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
const syncData = () => ({ ...progressData(), wordAt: store.wordAt, unitAt: store.unitAt });
function sigOf(d) {
  const s = stableStringify(d);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h + ':' + s.length;
}
const isDirty = () => syncOn() && sigOf(syncData()) !== syncCfg.lastSig;
function scheduleSync() {
  if (!syncOn()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { if (isDirty()) syncNow(); }, SYNC_DELAY);
}

function mergeProgress(L, R) {
  const out = { known: {}, srs: {}, completed: {}, wordAt: {}, unitAt: {}, wrong: {}, convoBest: {} };
  const LW = L.wordAt || {}, RW = R.wordAt || {};
  const words = new Set([...Object.keys(L.known || {}), ...Object.keys(R.known || {}), ...Object.keys(LW), ...Object.keys(RW)]);
  for (const h of words) {
    const lt = LW[h] || 0, rt = RW[h] || 0;
    if (lt || rt) out.wordAt[h] = Math.max(lt, rt);
    if (lt !== rt) {
      const src = rt > lt ? R : L;
      if (src.known && src.known[h]) { out.known[h] = src.known[h]; if (src.srs && src.srs[h]) out.srs[h] = src.srs[h]; }
    } else {
      // cùng mốc (dữ liệu cũ chưa có mốc thời gian): giữ nếu bên nào cũng thuộc; lịch ôn lấy bên tiến xa hơn
      const lk = L.known && L.known[h], rk = R.known && R.known[h];
      if (lk || rk) {
        out.known[h] = lk && rk ? (lk < rk ? lk : rk) : (lk || rk);
        const ls = L.srs && L.srs[h], rs = R.srs && R.srs[h];
        const pick = !ls ? rs : !rs ? ls : ((rs.lv || 0) > (ls.lv || 0) || ((rs.lv || 0) === (ls.lv || 0) && (rs.due || '') > (ls.due || ''))) ? rs : ls;
        if (pick) out.srs[h] = pick;
      }
    }
  }
  const LU = L.unitAt || {}, RU = R.unitAt || {};
  const units = new Set([...Object.keys(L.completed || {}), ...Object.keys(R.completed || {}), ...Object.keys(LU), ...Object.keys(RU)]);
  for (const id of units) {
    const lt = LU[id] || 0, rt = RU[id] || 0;
    if (lt || rt) out.unitAt[id] = Math.max(lt, rt);
    const lc = L.completed && L.completed[id], rc = R.completed && R.completed[id];
    const c = lt === rt ? (lc || rc) : (rt > lt ? rc : lc);
    if (c) out.completed[id] = c;
  }
  for (const src of [L.wrong || {}, R.wrong || {}]) for (const [h, n] of Object.entries(src)) out.wrong[h] = Math.max(out.wrong[h] || 0, n);
  for (const src of [L.convoBest || {}, R.convoBest || {}]) for (const [t, p] of Object.entries(src)) out.convoBest[t] = Math.max(out.convoBest[t] || 0, p);
  const qmap = new Map();
  for (const q of [...(L.quizzes || []), ...(R.quizzes || [])]) qmap.set(q.at ? 'a' + q.at : JSON.stringify([q.date, q.topic, q.total, q.correct]), q);
  out.quizzes = [...qmap.values()].sort((a, b) => (a.at || Date.parse(a.date) || 0) - (b.at || Date.parse(b.date) || 0)).slice(-200);
  return out;
}

async function gh(path, { token, ...opts } = {}) {
  const res = await fetch(GH_API + path, {
    ...opts,
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + (token || syncCfg.token), 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!res.ok) {
    const err = new Error('HTTP ' + res.status);
    err.status = res.status;
    err.rate = res.headers.get('x-ratelimit-remaining') === '0';
    throw err;
  }
  return res;
}
const gistPayload = () => JSON.stringify({ app: 'zhStudy-sync', version: 1, updatedAt: new Date().toISOString(), data: syncData() });
async function findGist() {
  for (let page = 1; page <= 5; page++) {
    const list = await (await gh(`/gists?per_page=100&page=${page}`)).json();
    const g = list.find(x => x.files && x.files[GIST_FILE]);
    if (g) return g.id;
    if (list.length < 100) break;
  }
  return null;
}
async function createGist() {
  const g = await (await gh('/gists', { method: 'POST', body: JSON.stringify({
    description: 'Học tiếng Trung: tiến độ học (app tự đồng bộ, đừng sửa tay)', public: false,
    files: { [GIST_FILE]: { content: gistPayload() } },
  }) })).json();
  return g.id;
}
async function readGist() {
  const g = await (await gh('/gists/' + syncCfg.gistId)).json();
  const f = g.files && g.files[GIST_FILE];
  if (!f) return null;
  let text = f.content;
  if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
  try { const p = JSON.parse(text); return p && p.app === 'zhStudy-sync' && validData(p.data) ? p : null; } catch (e) { return null; }
}
async function writeGist() {
  await gh('/gists/' + syncCfg.gistId, { method: 'PATCH', body: JSON.stringify({ files: { [GIST_FILE]: { content: gistPayload() } } }) });
}
function applyMerged(m) {
  if (Object.keys(store.known).some(h => !m.known[h])) takeSnapshot('Trước khi đồng bộ'); // sắp mất từ → giữ một bản để quay lại
  Object.assign(store, { known: m.known, srs: m.srs, completed: m.completed, wrong: m.wrong, quizzes: m.quizzes, convoBest: m.convoBest, wordAt: m.wordAt, unitAt: m.unitAt });
  save();
}
// Trả về số từ đã thuộc tăng/giảm do nhận thay đổi từ máy khác (null nếu không đổi gì trên máy này).
// Gọi trong lúc đang đồng bộ → chờ chung lần đồng bộ đó (không chạy song song).
let syncPromise = null;
function syncNow() {
  if (!syncOn()) return Promise.resolve(null);
  if (!syncing) syncPromise = runSync();
  return syncPromise;
}
async function runSync() {
  if (!navigator.onLine) { syncCfg.error = 'offline'; saveSync(); refreshSyncUI(); return null; }
  syncing = true;
  refreshSyncUI();
  let pulled = null;
  try {
    if (!syncCfg.gistId) syncCfg.gistId = await findGist();
    let remote = null;
    if (syncCfg.gistId) {
      try { remote = await readGist(); } catch (e) {
        if (e.status !== 404) throw e;
        // gist cũ bị xoá → tìm gist mà máy khác đã tạo lại; không có thì tự tạo mới bên dưới
        syncCfg.gistId = await findGist();
        if (syncCfg.gistId) remote = await readGist();
      }
    }
    if (!syncCfg.gistId) {
      syncCfg.gistId = await createGist();
    } else {
      if (remote) {
        const local = syncData();
        const merged = mergeProgress(local, remote.data);
        if (sigOf(merged) !== sigOf(local)) {
          const before = Object.keys(store.known).length;
          applyMerged(merged);
          pulled = Object.keys(store.known).length - before;
        }
      }
      if (!remote || sigOf(remote.data) !== sigOf(syncData())) await writeGist();
    }
    syncCfg.lastSig = sigOf(syncData());
    syncCfg.lastAt = Date.now();
    syncCfg.error = null;
  } catch (e) {
    syncCfg.error = e.status === 401 ? 'auth' : (e.status === 403 || e.status === 429) && e.rate ? 'rate' : e.status ? 'http ' + e.status : 'offline';
  } finally {
    syncing = false;
    saveSync();
    if (pulled !== null) { checkCompletion(); render(); } else refreshSyncUI();
    if (!syncCfg.error && isDirty()) scheduleSync(); // có thay đổi trong lúc đang đồng bộ
  }
  return pulled;
}
function refreshSyncUI() { if (state.tab === 'home' && !document.activeElement?.matches('#sync-token')) render(); }
function syncStatus() {
  if (syncing) return { cls: 'busy', text: 'Đang đồng bộ…' };
  const e = syncCfg.error;
  if (e === 'auth') return { cls: 'err', text: 'Mã truy cập không còn hợp lệ (hết hạn hoặc đã bị thu hồi). Bấm Ngắt kết nối rồi kết nối lại bằng mã mới.' };
  if (e === 'offline') return { cls: 'warn', text: 'Chưa đồng bộ được vì không có mạng. App sẽ tự thử lại khi có mạng.' };
  if (e === 'rate') return { cls: 'warn', text: 'GitHub đang tạm giới hạn số lần gửi. App sẽ thử lại sau.' };
  if (e) return { cls: 'warn', text: `Lỗi đồng bộ (${e}). App sẽ thử lại sau.` };
  if (!syncCfg.lastAt) return { cls: 'warn', text: 'Chưa đồng bộ lần nào.' };
  return { cls: 'ok', text: `Đã đồng bộ lúc ${fmtDateTime(syncCfg.lastAt)}${isDirty() ? ' · có thay đổi đang chờ gửi' : ''}` };
}
function syncErrorToast() {
  const e = syncCfg.error;
  return e === 'auth' ? 'Mã truy cập không hợp lệ' : e === 'offline' ? 'Không có mạng, sẽ thử lại sau' : e ? 'Lỗi đồng bộ, sẽ thử lại sau' : '';
}
async function connectSync() {
  const inp = $('#sync-token');
  const token = (inp && inp.value || '').trim();
  if (!token) { toast('Dán mã truy cập vào ô trước'); return; }
  const btn = $('[data-act="sync-connect"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Đang kết nối…'; }
  try {
    const res = await gh('/user', { token });
    const scopes = res.headers.get('x-oauth-scopes'); // mã kiểu "classic" mới có header này
    if (scopes !== null && !scopes.split(',').map(s => s.trim()).includes('gist')) throw Object.assign(new Error('scope'), { scope: true });
    const user = await res.json();
    syncCfg = { token, login: user.login };
    saveSync();
    if (inp) inp.blur();
    const pulled = await syncNow();
    if (syncCfg.error) toast(syncErrorToast());
    else toast(`Đã kết nối @${user.login}` + (pulled > 0 ? ` · nhận thêm ${pulled} từ từ máy khác` : ''));
  } catch (e) {
    toast(e.scope ? 'Mã thiếu quyền "gist". Tạo lại mã và tick ô gist.' : e.status === 401 ? 'Mã không đúng hoặc đã hết hạn' : 'Không kết nối được, kiểm tra mạng rồi thử lại');
    if (btn) { btn.disabled = false; btn.textContent = 'Kết nối'; }
  }
}
function viewSync() {
  if (!syncOn()) return `<div class="card stack">
    <div><b class="row" style="gap:6px">${icon('cloud', 18)} Đồng bộ đám mây</b><div class="small muted">Tự lưu tiến độ lên GitHub sau mỗi lần học. Dùng cùng một mã trên nhiều máy để học tiếp ở máy nào cũng được.</div></div>
    <input class="input" id="sync-token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Dán mã truy cập GitHub (ghp_…)">
    <button class="btn btn-primary" data-act="sync-connect">Kết nối</button>
    <details class="snaps"><summary>Cách lấy mã truy cập</summary>
      <ol class="small steps">
        <li>Mở <a href="${TOKEN_URL}" target="_blank" rel="noopener">trang tạo mã của GitHub</a> (đăng nhập nếu được hỏi). Ô <b>gist</b> đã được tick sẵn, không cần tick thêm ô nào.</li>
        <li>Mục <b>Expiration</b>: chọn <b>No expiration</b> (hoặc 1 năm).</li>
        <li>Kéo xuống cuối, bấm <b>Generate token</b>, rồi copy mã (bắt đầu bằng <code>ghp_</code>). GitHub chỉ hiện mã này 1 lần.</li>
        <li>Quay lại đây, dán mã vào ô trên và bấm <b>Kết nối</b>. Trên máy khác: dán cùng mã đó.</li>
      </ol>
      <p class="small muted" style="margin:0">Mã chỉ có quyền tạo/sửa gist, được lưu trên máy này và không nằm trong file sao lưu. Có thể thu hồi bất cứ lúc nào trong GitHub → Settings → Developer settings.</p>
    </details>
  </div>`;
  const st = syncStatus();
  return `<div class="card stack">
    <div class="row between"><div><b class="row" style="gap:6px">${icon('cloud', 18)} Đồng bộ đám mây</b><div class="small muted">GitHub @${esc(syncCfg.login || '')} · tự đồng bộ sau mỗi lần học</div></div><span class="sync-dot ${st.cls}" title="${esc(st.text)}"></span></div>
    <div class="small ${st.cls === 'err' ? 'err-text' : 'muted'}">${esc(st.text)}</div>
    <div class="row"><button class="btn grow" data-act="sync-now" ${syncing ? 'disabled' : ''}>${icon('reset', 16)} Đồng bộ ngay</button><button class="btn btn-ghost" data-act="sync-off">Ngắt kết nối</button></div>
  </div>`;
}

// ================================================================
// UTILS
// ================================================================
const $ = sel => document.querySelector(sel);
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

const ICON = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  cards: '<rect x="3" y="6" width="14" height="15" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12Z"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  speak: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  shuffle: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="m4 4 5 5"/>',
  swap: '<path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  save: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
  cloud: '<path d="M17.5 19H7a5 5 0 1 1 .9-9.92A6 6 0 0 1 19 11a4 4 0 0 1-1.5 8Z"/>',
};
const icon = (name, size) => `<svg viewBox="0 0 24 24" ${size ? `width="${size}" height="${size}"` : ''} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

// ---- phát âm (Web Speech API, iOS Safari hỗ trợ sẵn) ----
const TTS = 'speechSynthesis' in window;
let zhVoice = null;
function pickVoice() {
  if (!TTS) return;
  const vs = speechSynthesis.getVoices();
  zhVoice = vs.find(v => /zh[-_]TW/i.test(v.lang)) || vs.find(v => /zh[-_](HK|CN)/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null;
}
if (TTS) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  if (!TTS || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = zhVoice ? zhVoice.lang : 'zh-TW';
  if (zhVoice) u.voice = zhVoice;
  u.rate = 0.85;
  speechSynthesis.speak(u);
}
const speakBtn = (text, cls = 'icon-btn') => `<button class="${cls}" data-act="speak" data-text="${esc(text)}" aria-label="Phát âm">${icon('speak')}</button>`;

let toastTimer = null;
function toast(msg) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 1800);
}

// ================================================================
// STATE
// ================================================================
const TABS = [
  { key: 'home', label: 'Tổng quan', icon: 'home' },
  { key: 'cards', label: 'Thẻ từ', icon: 'cards' },
  { key: 'chat', label: 'Hội thoại', icon: 'chat' },
  { key: 'grammar', label: 'Ngữ pháp', icon: 'book' },
  { key: 'quiz', label: 'Ôn tập', icon: 'quiz' },
];
const P = store.prefs;
const state = {
  tab: P.tab || 'home',
  // flashcards
  unit: P.unit ?? 0,            // index hoặc 'all'
  filter: P.filter || 'todo',   // todo | due | known | all
  view: P.view || 'card',       // card | list
  showPinyin: P.showPinyin ?? false,
  reverse: P.reverse ?? false,  // true: mặt trước là nghĩa tiếng Việt
  deck: [], deckIdx: 0, flipped: false, search: '',
  // conversation
  convo: P.convo || 0,
  cq: null,                     // { questions, idx, picked, score }
  // grammar
  gFilter: 'all', gSearch: '', gOpen: new Set(),
  // quiz
  quizTopic: P.quizTopic || 'all', quizLen: P.quizLen || 10,
  quizMode: P.quizMode || 'mix', // mix | listen | write
  quiz: null,                   // { questions, idx, picked, answers: [] }
  quizArea: P.quizArea || 'vocab', // vocab | wb (bài tập sách)
  wbLesson: P.wbLesson || 0,
  wb: null,                     // phần bài tập đang làm: { lesson, sec, items, idx, answers }
};
function savePrefs() {
  Object.assign(store.prefs, {
    tab: state.tab, unit: state.unit, filter: state.filter, view: state.view, showPinyin: state.showPinyin, reverse: state.reverse,
    convo: state.convo, quizTopic: state.quizTopic, quizLen: state.quizLen, quizMode: state.quizMode,
    quizArea: state.quizArea, wbLesson: state.wbLesson,
  });
  save();
}

// ================================================================
// RENDER ROOT
// ================================================================
function render() {
  const tab = TABS.find(t => t.key === state.tab) || TABS[0];
  const due = dueWords().length;
  $('#title').textContent = tab.label;
  $('#tabbar').innerHTML = `<div class="tabbar-inner">${TABS.map(t =>
    `<button class="tab ${t.key === state.tab ? 'active' : ''}" data-act="tab" data-tab="${t.key}">
      <span class="tab-icon">${icon(t.icon)}${t.key === 'cards' && due ? `<b class="tab-badge">${due > 99 ? '99+' : due}</b>` : ''}</span>
      <span>${t.label}</span></button>`).join('')}</div>`;
  const views = { home: viewHome, cards: viewCards, chat: viewChat, grammar: viewGrammar, quiz: viewQuiz };
  $('#main').innerHTML = views[tab.key]();
}
function go(tab) {
  state.tab = tab;
  savePrefs();
  render();
  window.scrollTo(0, 0);
}

// ================================================================
// DASHBOARD
// ================================================================
function viewHome() {
  const today = todayKey();
  const total = UNIQUE_WORDS.length;
  const known = UNIQUE_WORDS.filter(w => isKnown(w.hanzi)).length;
  const p = pct(known, total);
  const r = 42, circ = 2 * Math.PI * r;
  const qs = store.quizzes;
  const qAvg = qs.length ? Math.round(qs.reduce((s, q) => s + pct(q.correct, q.total), 0) / qs.length) : 0;
  const weekStart = addDays(today, -6);
  const learnedWeek = Object.values(store.known).filter(d => d >= weekStart).length;
  const learnedToday = Object.values(store.known).filter(d => d === today).length;
  const due = dueWords().length;
  const last = qs.slice(-12);

  // phân bố từ đã thuộc theo mốc ôn
  const levels = Array(MASTERED + 1).fill(0);
  UNIQUE_WORDS.forEach(w => { if (isKnown(w.hanzi)) levels[Math.min((store.srs[w.hanzi] || { lv: 0 }).lv, MASTERED)]++; });
  const upcoming = Object.entries(store.srs).filter(([h, s]) => isKnown(h) && s.due && s.due > today).map(([, s]) => s.due).sort();
  const nextDue = upcoming[0];

  const bs = backupStatus();
  const snaps = loadSnaps();

  const hard = Object.entries(store.wrong)
    .filter(([h]) => WORD_BY_HANZI.has(h))
    .sort((a, b) => b[1] - a[1]).slice(0, 8);

  return `
  ${due ? `<div class="card review-card">
    <span class="review-icon">${icon('bell', 22)}</span>
    <div class="grow"><b>${due} từ đến hạn ôn hôm nay</b><div class="small muted">Ôn đúng hạn để nhớ lâu hơn</div></div>
    <button class="btn btn-primary" data-act="review-now">Ôn ngay</button>
  </div>` : ''}
  ${bs.remind ? `<div class="card backup-card">
    <span class="review-icon">${icon('save', 22)}</span>
    <div class="grow"><b>${bs.lastAt ? `${bs.days} ngày chưa sao lưu` : 'Chưa sao lưu tiến độ lần nào'}</b><div class="small muted">Lưu ra file để không mất tiến độ khi xoá app hay đổi máy</div></div>
    <div class="backup-actions"><button class="btn btn-primary" data-act="backup">Sao lưu</button><button class="link-btn" data-act="backup-later">Để sau</button></div>
  </div>` : ''}

  <div class="card hero">
    <div class="ring">
      <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="10"/>
      <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round"
        stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - p / 100)}"/></svg>
      <div class="ring-label"><b>${p}%</b><span class="small muted">đã thuộc</span></div>
    </div>
    <div class="grow">
      <div style="font-size:26px;font-weight:700;line-height:1.1">${known}<span class="muted" style="font-size:16px;font-weight:500"> / ${total} từ</span></div>
      <div class="muted small" style="margin:4px 0 10px">${learnedToday ? `+${learnedToday} từ mới hôm nay` : 'Chưa đánh dấu từ nào hôm nay'}</div>
      <button class="btn btn-primary" data-act="tab" data-tab="cards">Học thẻ từ</button>
    </div>
  </div>

  <div class="stats" style="margin-top:12px">
    <button class="card stat" data-act="review-now" ${due ? '' : 'disabled'}><b class="${due ? 'accent' : ''}">${due}</b><span>cần ôn hôm nay</span></button>
    <div class="card stat"><b>${learnedWeek}</b><span>từ mới trong 7 ngày</span></div>
    <div class="card stat"><b>${qs.length ? qAvg + '%' : '–'}</b><span>${qs.length ? `điểm TB · ${qs.length} lượt` : 'điểm ôn tập TB'}</span></div>
  </div>

  <div class="section-title">Ghi nhớ dài hạn</div>
  <div class="card">
    <div class="levels">
      ${INTERVALS.map((d, i) => `<div class="level"><b>${levels[i]}</b><span>${d} ngày</span></div>`).join('')}
      <div class="level mastered"><b>${levels[MASTERED]}</b><span>Thành thạo</span></div>
    </div>
    <p class="small muted" style="margin:10px 0 0">Từ đã thuộc được nhắc ôn lại sau 1 → 3 → 7 → 14 → 28 → 60 ngày. Quên thì quay về mốc 1 ngày.
      ${!due && nextDue ? `Lần ôn tiếp theo: <b>${fmtVN(nextDue)}</b>.` : ''}</p>
  </div>

  <div class="section-title">Tiến độ theo bài</div>
  <div class="card">
    ${UNITS.map((u, i) => {
      const pr = unitProgress(i);
      return `<div class="lesson-row">
        <button class="lesson-open" data-act="open-unit" data-unit="${i}">
          <div class="row between"><span class="title han">${esc(u.title)}</span><span class="small muted">${pr.known}/${pr.total}</span></div>
          <div class="bar ${pr.done ? 'ok' : ''}"><span style="width:${pr.done ? 100 : pct(pr.known, pr.total)}%"></span></div>
        </button>
        ${pr.done ? `<div class="lesson-done"><span class="tag ok">${icon('check', 12)} Hoàn thành ${fmtVN(store.completed[unitId(u)])}</span>
          <button class="link-btn" data-act="reset-unit" data-unit="${i}">${icon('reset', 14)} Học lại</button></div>` : ''}
      </div>`;
    }).join('')}
  </div>

  ${last.length ? `
  <div class="section-title">Điểm ${last.length} lượt ôn gần nhất</div>
  <div class="card">
    <div class="spark">${last.map(q => `<span style="height:${Math.max(4, pct(q.correct, q.total))}%" title="${pct(q.correct, q.total)}%"></span>`).join('')}</div>
    <div class="row between small muted" style="margin-top:6px"><span>Cao nhất ${Math.max(...qs.map(q => pct(q.correct, q.total)))}%</span><span>Gần nhất ${pct(last[last.length - 1].correct, last[last.length - 1].total)}%</span></div>
  </div>` : ''}

  ${hard.length ? `
  <div class="section-title">Từ hay trả lời sai</div>
  <div class="hard-list">${hard.map(([h, n]) =>
    `<button class="chip-word" data-act="word" data-h="${esc(h)}"><div class="han">${esc(h)}</div><div class="small muted">sai ${n} lần</div></button>`).join('')}</div>` : ''}

  <div class="section-title">Đồng bộ & sao lưu</div>
  ${viewSync()}
  <div class="card stack" style="margin-top:12px">
    <div><b>Lần sao lưu gần nhất</b><div class="small muted">${bs.lastAt ? `${fmtVN(bs.lastAt)} · ${bs.changed ? 'có thay đổi chưa sao lưu' : 'đã gồm tiến độ mới nhất'}` : 'Chưa sao lưu lần nào'}</div></div>
    <div class="row"><button class="btn btn-primary grow" data-act="backup">${icon('save', 18)} Sao lưu ra file</button><button class="btn grow" data-act="restore-file">${icon('upload', 18)} Khôi phục</button></div>
    <p class="small muted" style="margin:0">${syncOn() ? 'Sao lưu file là lớp dự phòng thêm cho đồng bộ đám mây.' : 'Tiến độ chỉ lưu trên máy này.'} Trên iPhone, chọn <b>Lưu vào Tệp</b> (iCloud Drive) để giữ bản sao an toàn; khi đổi máy hoặc cài lại app, bấm Khôi phục và chọn file đó.</p>
    ${snaps.length ? `<details class="snaps"><summary>Bản lưu tự động trên máy (${snaps.length})</summary>
      ${snaps.map((sn, i) => `<div class="snap-row"><div class="grow"><div>${fmtDateTime(sn.at)}</div><div class="small muted">${esc(sn.reason)} · ${sn.known} từ đã thuộc</div></div><button class="link-btn" data-act="restore-snap" data-i="${i}">${icon('reset', 14)} Quay lại</button></div>`).join('')}
      <p class="small muted" style="margin:8px 0 0">Bản tự động nằm trên máy này nên sẽ mất nếu xoá app. Dùng để quay lại khi lỡ tay.</p></details>` : ''}
  </div>
  `;
}

// ================================================================
// FLASHCARDS
// ================================================================
function unitWords() {
  if (state.unit === 'all') return UNIQUE_WORDS;
  const u = UNITS[state.unit] || UNITS[0];
  const seen = new Set();
  return u.vocab.filter(w => !seen.has(w.hanzi) && seen.add(w.hanzi));
}
function filterWords(words, filter) {
  if (filter === 'todo') return words.filter(w => !isKnown(w.hanzi));
  if (filter === 'due') return words.filter(w => isDue(w.hanzi));
  if (filter === 'known') return words.filter(w => isKnown(w.hanzi));
  return words;
}
const filteredWords = () => filterWords(unitWords(), state.filter);
function buildDeck(doShuffle) {
  const words = filteredWords();
  // "Tất cả các bài" luôn xáo trộn để không phải lúc nào cũng bắt đầu từ bài đầu tiên
  state.deck = doShuffle || state.unit === 'all' ? shuffle(words) : words;
  state.deckIdx = 0;
  state.flipped = false;
  saveDeck();
}
// Lưu bộ thẻ + vị trí đang học: iPhone hay đóng app chạy nền, mở lại vẫn học tiếp đúng chỗ.
function saveDeck() {
  store.prefs.deck = { unit: state.unit, filter: state.filter, ids: state.deck.map(w => w.hanzi), idx: state.deckIdx };
  save();
}
function restoreDeck() {
  const d = store.prefs.deck;
  if (d && d.unit === state.unit && d.filter === state.filter && Array.isArray(d.ids)) {
    const pool = new Map(unitWords().map(w => [w.hanzi, w]));
    state.deck = d.ids.map(h => pool.get(h)).filter(Boolean);
    state.deckIdx = Math.min(d.idx || 0, state.deck.length);
    if (state.deck.length) return;
  }
  buildDeck(false);
}
function moveTo(idx) {
  state.deckIdx = Math.max(0, idx);
  state.flipped = false;
  saveDeck();
  render();
}

function viewCards() {
  const words = unitWords();
  const knownN = words.filter(w => isKnown(w.hanzi)).length;
  const dueN = words.filter(w => isDue(w.hanzi)).length;
  const done = state.unit !== 'all' && unitProgress(state.unit).done;
  return `
  <div class="stack">
    <select class="input han" data-act="unit">
      <option value="all" ${state.unit === 'all' ? 'selected' : ''}>Tất cả các bài (${UNIQUE_WORDS.length} từ)</option>
      ${UNITS.map((u, i) => `<option value="${i}" ${state.unit === i ? 'selected' : ''}>${unitProgress(i).done ? '✓ ' : ''}${esc(u.title)} (${UNIT_HANZI[i].length})</option>`).join('')}
    </select>
    ${done ? `<div class="done-banner">${icon('check', 16)}<span class="grow">Bạn đã hoàn thành bài này</span>
      <button class="link-btn" data-act="reset-unit" data-unit="${state.unit}">${icon('reset', 14)} Học lại từ đầu</button></div>` : ''}
    <div class="seg filters">
      ${[['todo', 'Chưa thuộc', words.length - knownN], ['due', 'Cần ôn', dueN], ['known', 'Đã thuộc', knownN], ['all', 'Tất cả', words.length]]
        .map(([k, l, n]) => `<button class="${state.filter === k ? 'active' : ''} ${k === 'due' && n ? 'has-due' : ''}" data-act="filter" data-f="${k}"><span>${l}</span><small>${n}</small></button>`).join('')}
    </div>
  </div>
  <div class="deck-meta">
    <div class="seg">
      <button class="${state.view === 'card' ? 'active' : ''}" data-act="view" data-v="card">Thẻ</button>
      <button class="${state.view === 'list' ? 'active' : ''}" data-act="view" data-v="list">Danh sách</button>
    </div>
    ${state.view === 'card' ? `<div class="row">
      <button class="icon-btn ${state.reverse ? 'on' : ''}" data-act="toggle-reverse" aria-label="Đảo chiều thẻ" title="Đảo chiều: nhìn nghĩa, nhớ chữ Hán">${icon('swap')}</button>
      ${state.reverse ? '' : `<button class="icon-btn ${state.showPinyin ? 'on' : ''}" data-act="toggle-pinyin" aria-label="Hiện pinyin">${icon('eye')}</button>`}
      <button class="icon-btn" data-act="shuffle" aria-label="Xáo trộn">${icon('shuffle')}</button>
    </div>` : ''}
  </div>
  ${state.view === 'card' ? viewDeck() : viewWordList()}`;
}

function viewDeck() {
  if (!state.deck.length) {
    let msg, emoji = '📭', extra = '';
    if (state.filter === 'todo') {
      emoji = '🎉'; msg = 'Bạn đã thuộc hết từ trong bài này.';
    } else if (state.filter === 'due') {
      emoji = '👍'; msg = 'Không có từ nào cần ôn hôm nay.';
      const ups = filterWords(unitWords(), 'known').map(w => store.srs[w.hanzi]).filter(s => s && s.due).map(s => s.due).sort();
      if (ups[0]) extra = `<p class="small muted">Lần ôn tiếp theo: ${fmtVN(ups[0])} (${ups.filter(d => d === ups[0]).length} từ)</p>`;
    } else if (state.filter === 'known') msg = 'Chưa có từ nào được đánh dấu đã thuộc.';
    else msg = 'Bài này chưa có từ vựng.';
    return `<div class="card empty"><div style="font-size:40px">${emoji}</div><p>${msg}</p>${extra}
      ${state.filter !== 'all' ? '<button class="btn" data-act="filter" data-f="all">Xem tất cả từ</button>' : ''}</div>`;
  }
  if (state.deckIdx >= state.deck.length) {
    const reviewing = state.filter === 'due';
    if (state.filter === 'todo' && state.unit !== 'all' && unitProgress(state.unit).done && !filterWords(unitWords(), 'todo').length) {
      return `<div class="card empty"><div style="font-size:40px">🎉</div><p><b>Bạn đã thuộc hết bài này!</b></p>
        <p class="small muted">Các từ sẽ được nhắc ôn lại sau 1 → 3 → 7 → 14 → 28 → 60 ngày.</p>
        <button class="btn btn-primary" data-act="tab" data-tab="quiz">Làm bài ôn tập</button></div>`;
    }
    return `<div class="card empty"><div style="font-size:40px">✅</div><p>${reviewing ? `Đã ôn xong ${state.deck.length} từ!` : `Hết lượt! Đã xem ${state.deck.length} thẻ.`}</p>
      <div class="row" style="justify-content:center;flex-wrap:wrap"><button class="btn" data-act="restart-deck">${reviewing ? 'Còn từ cần ôn?' : 'Xem lại từ đầu'}</button>
      <button class="btn btn-primary" data-act="tab" data-tab="quiz">Làm bài ôn tập</button></div></div>`;
  }
  const w = state.deck[state.deckIdx];
  const known = isKnown(w.hanzi);
  const reviewing = state.filter === 'due';
  const front = state.reverse
    ? `<div class="big-meaning">${esc(w.meaning)}</div>${w.group ? `<div class="small muted">${esc(w.group)}</div>` : ''}`
    : `<div class="big-han han ${w.hanzi.length > 4 ? 'long' : ''}">${esc(w.hanzi)}</div>${state.showPinyin ? `<div class="pinyin">${esc(w.pinyin)}</div>` : ''}`;
  return `
  <div class="flash ${state.flipped ? 'flipped' : ''}" id="flash" data-act="flip">
    <div class="flash-inner">
      <div class="face front">
        <div class="face-top">
          <span class="tag han">${esc(unitShort(w.unit))}</span>
          <div class="row">${reviewing ? '<span class="tag accent">Ôn lại</span>' : known ? '<span class="tag ok">Đã thuộc</span>' : ''}${state.reverse ? '' : speakBtn(w.hanzi)}</div>
        </div>
        <div class="face-center">${front}</div>
        <div class="hint">${state.reverse ? 'Nhớ chữ Hán rồi chạm để kiểm tra' : 'Chạm để lật thẻ'} · vuốt trái/phải để chuyển</div>
      </div>
      <div class="face back">${wordDetail(w)}</div>
    </div>
  </div>
  <div class="flash-actions">
    ${reviewing
      ? `<button class="btn" data-act="review" data-k="0">Quên rồi</button>
         <button class="btn btn-ok" data-act="review" data-k="1">${icon('check', 18)} Vẫn nhớ</button>`
      : `<button class="btn" data-act="mark" data-k="0">Chưa thuộc</button>
         <button class="btn btn-ok" data-act="mark" data-k="1">${icon('check', 18)} Đã thuộc</button>`}
  </div>
  <div class="flash-nav">
    <button class="icon-btn" data-act="prev" aria-label="Thẻ trước" ${state.deckIdx === 0 ? 'disabled' : ''}>${icon('left')}</button>
    <span class="muted small">${state.deckIdx + 1} / ${state.deck.length}</span>
    <button class="icon-btn" data-act="next" aria-label="Thẻ sau">${icon('right')}</button>
  </div>`;
}

// Nội dung chi tiết một từ — dùng cho mặt sau thẻ và bottom sheet.
function wordDetail(w) {
  const rel = (label, list) => list && list.length ? `<div class="rel"><span class="muted">${label}:</span> ${list.map(s =>
    `<span class="han">${esc(s.hanzi)}</span> <span class="muted">${esc(s.pinyin)}</span> – ${esc(s.meaning)}`).join('; ')}</div>` : '';
  const srs = srsText(w.hanzi);
  return `
    <div class="face-top">
      <div class="back-head"><span class="han">${esc(w.hanzi)}</span><span class="pinyin">${esc(w.pinyin)}</span></div>
      ${speakBtn(w.hanzi)}
    </div>
    <div class="meaning">${esc(w.meaning)}</div>
    ${w.hanViet ? `<div class="kv">Hán Việt: <b>${esc(w.hanViet)}</b></div>` : ''}
    ${w.group ? `<div class="kv">Nhóm: <b>${esc(w.group)}</b></div>` : ''}
    ${w.exampleZh ? `<div class="example"><div class="grow han">${esc(w.exampleZh)}${w.exampleEn ? `<div class="small muted" style="font-family:var(--font)">${esc(w.exampleEn)}</div>` : ''}</div>${speakBtn(w.exampleZh)}</div>` : ''}
    ${rel('Đồng nghĩa', w.synonyms)}
    ${rel('Trái nghĩa', w.antonyms)}
    ${srs ? `<div class="srs-line">${icon('bell', 13)} ${srs}</div>` : ''}`;
}

function viewWordList() {
  const q = state.search.trim().toLowerCase();
  const words = filteredWords().filter(w => !q || w.hanzi.includes(q) || (w.pinyin || '').toLowerCase().includes(q) || (w.meaning || '').toLowerCase().includes(q) || (w.hanViet || '').toLowerCase().includes(q));
  return `
  <input class="input" type="search" placeholder="Tìm chữ Hán, pinyin, nghĩa…" value="${esc(state.search)}" data-act="search" style="margin-bottom:10px">
  <div class="card" style="padding:4px 12px">
    ${words.length ? `<div class="word-list">${words.map(w => `
      <div class="word-item">
        <button class="main" data-act="word" data-h="${esc(w.hanzi)}">
          <div><span class="han">${esc(w.hanzi)}</span> <span class="pinyin small">${esc(w.pinyin)}</span>${isDue(w.hanzi) ? ' <span class="tag accent">Cần ôn</span>' : ''}</div>
          <div class="sub">${esc(w.meaning)}</div>
        </button>
        <button class="check ${isKnown(w.hanzi) ? 'on' : ''}" data-act="toggle-known" data-h="${esc(w.hanzi)}" aria-label="Đã thuộc">${icon('check')}</button>
      </div>`).join('')}</div>` : '<div class="empty">Không có từ nào.</div>'}
  </div>`;
}

// Lật thẻ và đọc luôn chữ Hán (lần lật là thao tác chạm nên iPhone cho phép phát âm).
function flipCard() {
  const f = $('#flash'), w = state.deck[state.deckIdx];
  if (!f || !w) return;
  state.flipped = !state.flipped;
  f.classList.toggle('flipped', state.flipped);
  speak(w.hanzi);
}

function markCurrent(known) {
  const w = state.deck[state.deckIdx];
  if (!w) return;
  if (known) markKnown(w.hanzi); else setKnown(w.hanzi, false);
  moveTo(state.deckIdx + 1);
}
function reviewCurrent(remembered) {
  const w = state.deck[state.deckIdx];
  if (!w) return;
  const r = review(w.hanzi, remembered);
  toast(remembered ? (r.lv >= MASTERED ? '🎉 Đã thành thạo ' + w.hanzi : `Lần ôn tới: ${fmtVN(r.due)} (sau ${INTERVALS[r.lv]} ngày)`) : 'Sẽ nhắc lại vào ngày mai');
  moveTo(state.deckIdx + 1);
}

// ================================================================
// CONVERSATION
// ================================================================
function tokenize(text) {
  const out = [];
  let i = 0, plain = '';
  while (i < text.length) {
    const cands = TOKEN_BY_FIRST.get(text[i]);
    const m = cands && cands.find(w => text.startsWith(w.hanzi, i));
    if (m) {
      if (plain) { out.push(esc(plain)); plain = ''; }
      out.push(`<span class="tok ${isKnown(m.hanzi) ? 'known' : ''}" data-act="word" data-h="${esc(m.hanzi)}">${esc(m.hanzi)}</span>`);
      i += m.hanzi.length;
    } else { plain += text[i]; i++; }
  }
  if (plain) out.push(esc(plain));
  return out.join('');
}

function viewChat() {
  const c = CONVERSATIONS[state.convo] || CONVERSATIONS[0];
  const first = (c.lines.find(l => l.speaker) || {}).speaker;
  return `
  <select class="input han" data-act="convo">
    ${CONVERSATIONS.map((x, i) => `<option value="${i}" ${i === state.convo ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}
  </select>
  <p class="small muted" style="margin:8px 2px 14px">Chạm vào từ được gạch chân để xem nghĩa. Nút loa để nghe cả câu.</p>
  <div class="chat">
    ${c.lines.map(l => !l.speaker ? `
      <div class="narr han">${l.zh.length > 30 ? speakBtn(l.zh, 'icon-btn speak-inline') : ''}${tokenize(l.zh)}
        ${l.en ? `<div class="small muted" style="font-family:var(--font)">${esc(l.en)}</div>` : ''}</div>` : `
      <div class="bubble-wrap ${l.align === 'right' || (l.align !== 'left' && l.speaker !== first) ? 'right' : ''}">
        <div class="speaker han">${esc(l.speaker)}</div>
        <div class="bubble han">${speakBtn(l.zh, 'icon-btn speak-inline')}${tokenize(l.zh)}
          ${l.en ? `<div class="small muted" style="font-family:var(--font)">${esc(l.en)}</div>` : ''}</div>
      </div>`).join('')}
  </div>
  <div class="section-title">Câu hỏi đọc hiểu</div>
  ${viewConvoQuiz(c)}`;
}

function viewConvoQuiz(c) {
  const bank = c.questions || [];
  if (!bank.length) return '<div class="card empty">Hội thoại này chưa có câu hỏi.</div>';
  const cq = state.cq;
  if (!cq) {
    const best = store.convoBest[c.title];
    return `<div class="card row between">
      <div><div style="font-weight:600">${Math.min(5, bank.length)} câu hỏi ngẫu nhiên</div>
      <div class="small muted">${best != null ? `Tốt nhất: ${best}%` : 'Chưa làm lần nào'}</div></div>
      <button class="btn btn-primary" data-act="cq-start">Bắt đầu</button></div>`;
  }
  if (cq.idx >= cq.questions.length) {
    const p = pct(cq.score, cq.questions.length);
    return `<div class="card" style="text-align:center">
      <div class="score-big">${cq.score}/${cq.questions.length}</div>
      <p class="muted">${p >= 80 ? 'Rất tốt! Bạn hiểu bài hội thoại.' : 'Đọc lại hội thoại rồi thử lần nữa nhé.'}</p>
      <button class="btn btn-primary" data-act="cq-start">Làm lại</button></div>`;
  }
  const q = cq.questions[cq.idx];
  return `<div class="card">
    <div class="q-progress"><span>Câu ${cq.idx + 1}/${cq.questions.length}</span><div class="bar"><span style="width:${pct(cq.idx, cq.questions.length)}%"></span></div></div>
    <div class="q-prompt han">${esc(q.prompt)}</div>
    ${optionsHtml(q, cq.picked, 'cq-pick', 'text')}
    ${cq.picked != null ? `<button class="btn btn-primary btn-block" style="margin-top:14px" data-act="cq-next">${cq.idx + 1 < cq.questions.length ? 'Câu tiếp' : 'Xem kết quả'}</button>` : ''}
  </div>`;
}

function optionsHtml(q, picked, act, hanOpts) {
  return `<div class="options">${q.options.map((o, i) => {
    let cls = 'opt' + (hanOpts === 'text' ? ' han' : hanOpts ? ' han-opt' : '');
    if (picked != null) { if (i === q.correct) cls += ' correct'; else if (i === picked) cls += ' wrong'; }
    return `<button class="${cls}" data-act="${act}" data-i="${i}" ${picked != null ? 'disabled' : ''}>${esc(o)}</button>`;
  }).join('')}</div>`;
}

// ================================================================
// GRAMMAR
// ================================================================
function viewGrammar() {
  const q = state.gSearch.trim().toLowerCase();
  const list = GRAMMAR.map((g, i) => ({ g, i })).filter(({ g }) =>
    (state.gFilter === 'all' || g.lesson === state.gFilter) &&
    (!q || g.structure.toLowerCase().includes(q) || g.usage.toLowerCase().includes(q) || (g.examples || []).some(e => e.zh.includes(q))));
  const count = key => GRAMMAR.filter(g => g.lesson === key).length;
  return `
  <div class="stack" style="margin-bottom:12px">
    <select class="input han" data-act="g-filter">
      <option value="all">Tất cả các bài (${GRAMMAR.length} mẫu)</option>
      ${UNITS.filter(u => count(u.key)).map(u => `<option value="${esc(u.key)}" ${state.gFilter === u.key ? 'selected' : ''}>${esc(u.title)} (${count(u.key)})</option>`).join('')}
    </select>
    <input class="input" type="search" placeholder="Tìm mẫu câu…" value="${esc(state.gSearch)}" data-act="g-search">
  </div>
  <div class="stack">
    ${list.length ? list.map(({ g, i }) => `
      <div class="card g-item ${state.gOpen.has(i) ? 'open' : ''}">
        <button class="g-head" data-act="g-toggle" data-i="${i}">
          <div>${g.lesson ? `<span class="tag" style="margin-bottom:4px">${esc(g.lesson)}</span>` : ''}<div class="han">${esc(g.structure)}</div>
          ${state.gOpen.has(i) ? '' : `<div class="small muted">${esc(g.usage.length > 70 ? g.usage.slice(0, 68) + '…' : g.usage)}</div>`}</div>
          <span class="chev">${icon('chev', 20)}</span>
        </button>
        <div class="g-body">
          <p style="margin:0 0 6px">${esc(g.usage)}</p>
          ${(g.examples || []).map(e => `
            <div class="g-ex"><div class="grow"><div class="zh han">${tokenize(e.zh)}</div>${e.en ? `<div class="vi">${esc(e.en)}</div>` : ''}</div>${speakBtn(e.zh)}</div>`).join('')}
        </div>
      </div>`).join('') : '<div class="card empty">Không tìm thấy mẫu câu.</div>'}
  </div>`;
}

// ================================================================
// QUIZ
// ================================================================
const QUIZ_TOPICS = () => [
  { key: 'all', label: 'Tổng hợp tất cả (từ vựng, ngữ pháp, bài tập sách)' },
  { key: 'todo', label: 'Chỉ từ chưa thuộc' },
  { key: 'known', label: 'Chỉ từ đã thuộc' },
  { key: 'hard', label: 'Từ hay trả lời sai' },
  ...UNITS.map((u, i) => ({ key: 'u' + i, label: u.title })),
  { key: 'grammar', label: 'Ngữ pháp' },
];
const QUIZ_MODES = [
  { key: 'mix', label: 'Hỗn hợp', desc: 'Chọn nghĩa, chọn chữ Hán, chọn pinyin, điền từ vào câu và nghe.' },
  { key: 'listen', label: 'Nghe', desc: 'Nghe phát âm rồi chọn đúng từ hoặc đúng nghĩa.' },
  { key: 'write', label: 'Nhớ chữ Hán', desc: 'Nhìn nghĩa hoặc câu ví dụ, chọn đúng chữ Hán.' },
];

function pickDistinct(pool, key, exclude, n) {
  const seen = new Set(exclude.map(x => x[key]));
  const out = [];
  for (const w of shuffle(pool)) {
    const v = w[key];
    if (!v || seen.has(v)) continue;
    seen.add(v); out.push(w);
    if (out.length === n) break;
  }
  return out;
}
function mcq(correctText, distractorTexts) {
  const options = shuffle([correctText, ...distractorTexts]);
  return { options, correct: options.indexOf(correctText) };
}
const soundKey = p => (p || '').toLowerCase().replace(/[\s'’]/g, '').normalize('NFC');
const listenBtn = text => `<button class="listen-btn" data-act="speak" data-text="${esc(text)}" aria-label="Nghe lại">${icon('speak', 34)}<span>Nghe lại</span></button>`;

function makeVocabQ(w) {
  // Ưu tiên nhiễu cùng bài để câu hỏi khó hơn, thiếu thì lấy toàn bộ kho.
  const sameUnit = UNIQUE_WORDS.filter(x => x.unit === w.unit && x.hanzi !== w.hanzi);
  const pool = sameUnit.length >= 6 ? sameUnit : UNIQUE_WORDS.filter(x => x.hanzi !== w.hanzi);
  const canFill = w.exampleZh && w.exampleZh.includes(w.hanzi);
  let types;
  if (state.quizMode === 'listen' && TTS) types = ['listen-hanzi', 'listen-meaning'];
  else if (state.quizMode === 'write') types = canFill ? ['hanzi', 'fill', 'fill'] : ['hanzi'];
  else types = ['meaning', 'hanzi', 'pinyin', ...(canFill ? ['fill', 'fill'] : []), ...(TTS ? ['listen-hanzi'] : [])];
  const type = types[Math.floor(Math.random() * types.length)];
  const base = { word: w };

  if (type === 'meaning') {
    const d = pickDistinct(pool, 'meaning', [w], 3);
    return { ...base, kind: 'Chọn nghĩa đúng', promptHtml: `<span class="han">${esc(w.hanzi)}</span>`, ...mcq(w.meaning, d.map(x => x.meaning)), hanOpts: false };
  }
  if (type === 'hanzi') {
    // loại các từ trùng nghĩa (vd 出汗/流汗) để không có 2 đáp án đúng
    const d = pickDistinct(pool.filter(x => x.meaning !== w.meaning), 'hanzi', [w], 3);
    return { ...base, kind: 'Chọn chữ Hán', promptHtml: esc(w.meaning), ...mcq(w.hanzi, d.map(x => x.hanzi)), hanOpts: true };
  }
  if (type === 'pinyin') {
    const d = pickDistinct(pool, 'pinyin', [w], 3);
    return { ...base, kind: 'Chọn pinyin đúng', promptHtml: `<span class="han">${esc(w.hanzi)}</span>`, ...mcq(w.pinyin, d.map(x => x.pinyin)), hanOpts: false };
  }
  if (type === 'listen-hanzi' || type === 'listen-meaning') {
    // loại các từ đọc giống hệt (vd 化妝/化裝) — nghe không thể phân biệt
    const sk = soundKey(w.pinyin);
    const p2 = pool.filter(x => soundKey(x.pinyin) !== sk && x.meaning !== w.meaning);
    const reviewHtml = `<span class="han">${esc(w.hanzi)}</span> <span class="pinyin" style="font-size:14px">${esc(w.pinyin)}</span>`;
    if (type === 'listen-hanzi') {
      const d = pickDistinct(p2, 'hanzi', [w], 3);
      return { ...base, kind: 'Nghe và chọn từ', listen: true, promptHtml: listenBtn(w.hanzi), reviewHtml, ...mcq(w.hanzi, d.map(x => x.hanzi)), hanOpts: true };
    }
    const d = pickDistinct(p2, 'meaning', [w], 3);
    return { ...base, kind: 'Nghe và chọn nghĩa', listen: true, promptHtml: listenBtn(w.hanzi), reviewHtml, ...mcq(w.meaning, d.map(x => x.meaning)), hanOpts: false };
  }
  const blank = esc(w.exampleZh.split(w.hanzi).join('＿＿'));
  const d = pickDistinct(pool.filter(x => !w.exampleZh.includes(x.hanzi)), 'hanzi', [w], 3);
  return { ...base, kind: 'Điền từ vào chỗ trống', promptHtml: `<span class="han" style="font-size:20px">${blank}</span>`, ...mcq(w.hanzi, d.map(x => x.hanzi)), hanOpts: true };
}
function makeGrammarQ(g) {
  const others = GRAMMAR.filter(x => x !== g);
  if (Math.random() < 0.5) {
    const d = pickDistinct(others, 'usage', [g], 3);
    return { kind: 'Mẫu câu dùng để làm gì?', promptHtml: `<span class="han" style="font-size:22px">${esc(g.structure)}</span>`, ...mcq(g.usage, d.map(x => x.usage)), grammar: g, hanOpts: false };
  }
  const d = pickDistinct(others, 'structure', [g], 3);
  return { kind: 'Chọn mẫu câu phù hợp', promptHtml: esc(g.usage), ...mcq(g.structure, d.map(x => x.structure)), grammar: g, hanOpts: 'text' };
}

// Câu bài tập sách tự chấm được (bỏ phần tự luận) — dùng cho chủ đề "Tổng hợp tất cả".
const WB_AUTO = () => (typeof WB === 'undefined' ? [] : WB).flatMap(l => l.sections.filter(s => s.type !== 'open').flatMap(sec => sec.items.map(item => ({ lesson: l, sec, item }))));
function makeWbQ(src) {
  const item = wbFresh(src.item, src.sec.type);
  const base = { kind: 'Bài tập sách', wbSrc: src, kindNote: `${src.lesson.title} · ${src.sec.title}` };
  if (src.sec.type === 'mcq') {
    return { ...base, promptHtml: `<span class="han" style="font-size:20px;font-weight:500">${esc(item.prompt)}</span>`, options: item.options, correct: item.correct, hanOpts: 'text', wbMcq: item };
  }
  const review = src.sec.type === 'typo' ? item.text : item.tiles.join(' / ');
  return { ...base, wb: { item, type: src.sec.type }, reviewHtml: `<span class="han">${esc(review)}</span>`, answerText: src.sec.type === 'typo' ? item.fixed : item.tiles.join('') };
}
// Trộn đều: khoảng 50% từ vựng, 15% ngữ pháp, 35% bài tập sách; không lặp câu trong một lượt.
function mixedQuestions(n) {
  const pools = [
    { w: 50, items: shuffle(UNIQUE_WORDS), make: makeVocabQ },
    { w: 15, items: shuffle(GRAMMAR), make: makeGrammarQ },
    { w: 35, items: shuffle(WB_AUTO()), make: makeWbQ },
  ].filter(p => p.items.length);
  const out = [];
  while (out.length < n && pools.some(p => p.items.length)) {
    const live = pools.filter(p => p.items.length);
    let r = Math.random() * live.reduce((t, p) => t + p.w, 0);
    const p = live.find(x => (r -= x.w) < 0) || live[0];
    out.push(p.make(p.items.pop()));
  }
  return out;
}

function quizPool(topic) {
  if (topic === 'todo') return UNIQUE_WORDS.filter(w => !isKnown(w.hanzi));
  if (topic === 'known') return UNIQUE_WORDS.filter(w => isKnown(w.hanzi));
  if (topic === 'hard') return UNIQUE_WORDS.filter(w => store.wrong[w.hanzi]);
  if (topic.startsWith('u')) { const i = +topic.slice(1); return UNIT_HANZI[i] ? UNIT_HANZI[i].map(h => WORD_BY_HANZI.get(h)) : []; }
  return UNIQUE_WORDS;
}
// Câu hỏi nghe: tự phát âm khi hiện câu (luôn chạy trong thao tác bấm → iOS cho phép phát).
function autoSpeak() {
  const qz = state.quiz;
  const q = qz && qz.questions[qz.idx];
  if (q && q.listen) speak(q.word.hanzi);
}
function startQuiz(fromWords) {
  let questions;
  if (fromWords) {
    questions = shuffle(fromWords).map(item => item.wbSrc ? makeWbQ(item.wbSrc) : item.grammar ? makeGrammarQ(item.grammar) : makeVocabQ(item.word));
  } else if (state.quizTopic === 'all' && state.quizMode === 'mix') {
    questions = mixedQuestions(state.quizLen);
  } else if (state.quizTopic === 'grammar') {
    questions = shuffle(GRAMMAR).slice(0, state.quizLen).map(makeGrammarQ);
  } else {
    const pool = quizPool(state.quizTopic);
    if (!pool.length) { toast('Không có từ nào cho chủ đề này'); return; }
    // Không lặp từ trong một lượt; nếu kho ít hơn số câu thì lấy hết kho.
    questions = shuffle(pool).slice(0, state.quizLen).map(makeVocabQ);
  }
  state.quiz = { questions, idx: 0, picked: null, answers: [] };
  render();
  window.scrollTo(0, 0);
  autoSpeak();
}
function answerQuiz(i) {
  const qz = state.quiz;
  if (!qz || qz.picked != null) return;
  const q = qz.questions[qz.idx];
  qz.picked = i;
  const ok = i === q.correct;
  qz.answers.push({ q, picked: i, ok });
  if (q.word) {
    if (!ok) store.wrong[q.word.hanzi] = (store.wrong[q.word.hanzi] || 0) + 1;
    else if (store.wrong[q.word.hanzi]) { store.wrong[q.word.hanzi]--; if (!store.wrong[q.word.hanzi]) delete store.wrong[q.word.hanzi]; }
    save();
  }
  render();
}
function nextQuiz() {
  const qz = state.quiz;
  qz.idx++;
  qz.picked = null;
  if (qz.idx >= qz.questions.length) {
    const topic = QUIZ_TOPICS().find(t => t.key === state.quizTopic);
    store.quizzes.push({ at: Date.now(), date: todayKey(), topic: qz.retry ? 'Làm lại câu sai' : (topic ? topic.label : state.quizTopic), total: qz.questions.length, correct: qz.answers.filter(a => a.ok).length });
    if (store.quizzes.length > 200) store.quizzes = store.quizzes.slice(-200);
    save();
  }
  render();
  window.scrollTo(0, 0);
  autoSpeak();
}

const quizAreaSeg = () => WB.length ? `<div class="seg" style="margin-bottom:12px">
  <button class="${state.quizArea === 'vocab' ? 'active' : ''}" data-act="quiz-area" data-a="vocab">Từ vựng & ngữ pháp</button>
  <button class="${state.quizArea === 'wb' ? 'active' : ''}" data-act="quiz-area" data-a="wb">Bài tập sách</button></div>` : '';

function viewQuiz() {
  if (state.wb) return viewWbRun();
  const qz = state.quiz;
  if (!qz && state.quizArea === 'wb' && WB.length) return quizAreaSeg() + viewWorkbook();
  if (!qz) {
    const topics = QUIZ_TOPICS();
    const isGrammar = state.quizTopic === 'grammar';
    const mixAll = state.quizTopic === 'all' && state.quizMode === 'mix';
    const size = isGrammar ? GRAMMAR.length : mixAll ? UNIQUE_WORDS.length + GRAMMAR.length + WB_AUTO().length : quizPool(state.quizTopic).length;
    const modes = TTS ? QUIZ_MODES : QUIZ_MODES.filter(m => m.key !== 'listen');
    const mode = modes.find(m => m.key === state.quizMode) || modes[0];
    return `${quizAreaSeg()}
    <div class="card stack">
      <div><div class="field-label">Chủ đề</div>
      <select class="input han" data-act="quiz-topic">${topics.map(t => `<option value="${t.key}" ${t.key === state.quizTopic ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
      <div class="small muted" style="margin-top:4px">${mixAll ? `${size} câu hỏi: ${UNIQUE_WORDS.length} từ vựng, ${GRAMMAR.length} ngữ pháp, ${WB_AUTO().length} bài tập sách — trộn ngẫu nhiên` : `${size} ${isGrammar ? 'mẫu câu' : 'từ'} trong chủ đề này`}${state.quizTopic === 'all' && !mixAll ? ' (kiểu Nghe / Nhớ chữ Hán chỉ dùng từ vựng)' : ''}</div></div>
      ${isGrammar ? '' : `<div><div class="field-label">Kiểu câu hỏi</div>
      <div class="seg">${modes.map(m => `<button class="${m.key === mode.key ? 'active' : ''}" data-act="quiz-mode" data-m="${m.key}">${m.label}</button>`).join('')}</div>
      <div class="small muted" style="margin-top:4px">${mode.desc}</div></div>`}
      <div><div class="field-label">Số câu hỏi</div>
      <div class="choice-grid">${[10, 20, 30].map(n => `<button class="btn ${state.quizLen === n ? 'active' : ''}" data-act="quiz-len" data-n="${n}">${n} câu</button>`).join('')}</div></div>
      <button class="btn btn-primary btn-block" data-act="quiz-start" ${size ? '' : 'disabled'}>Bắt đầu ôn tập</button>
    </div>
    <p class="small muted" style="padding:0 4px">Câu trả lời sai sẽ được ghi lại vào mục “Từ hay trả lời sai”.${TTS ? '' : ' Trình duyệt này không hỗ trợ phát âm nên không có câu hỏi nghe.'}</p>`;
  }

  if (qz.idx >= qz.questions.length) {
    const correct = qz.answers.filter(a => a.ok).length;
    const wrong = qz.answers.filter(a => !a.ok);
    const p = pct(correct, qz.questions.length);
    return `
    <div class="card" style="text-align:center">
      <div class="muted">Kết quả</div>
      <div class="score-big">${p}%</div>
      <div class="muted">${correct}/${qz.questions.length} câu đúng</div>
      <div class="row" style="justify-content:center;margin-top:14px;flex-wrap:wrap">
        ${wrong.length ? '<button class="btn btn-primary" data-act="quiz-retry">Làm lại câu sai</button>' : ''}
        <button class="btn" data-act="quiz-new">Bài mới</button>
      </div>
    </div>
    ${wrong.length ? `<div class="section-title">Câu trả lời sai (${wrong.length})</div>
    <div class="card" style="padding:4px 16px">${wrong.map(a => `
      <div class="review-item">
        <div class="small muted">${esc(a.q.kind)}</div>
        <div style="margin:2px 0">${a.q.reviewHtml || a.q.promptHtml}</div>
        ${a.q.wb ? '' : `<div><span style="color:var(--bad)">✗ <span class="han">${esc(a.q.options[a.picked])}</span></span></div>`}
        <div><span style="color:var(--ok)">✓ <span class="han">${esc(a.q.wb ? a.q.answerText : a.q.wbMcq ? (wbFilled(a.q.wbMcq) || a.q.options[a.q.correct]) : a.q.options[a.q.correct])}</span></span>
          ${a.q.word ? ` <button class="btn btn-ghost small" style="min-height:28px;padding:0 6px" data-act="word" data-h="${esc(a.q.word.hanzi)}">Xem từ</button>` : ''}</div>
      </div>`).join('')}</div>` : ''}`;
  }

  const q = qz.questions[qz.idx];
  let fb = '';
  if (q.wb) {
    const ans = qz.picked != null ? qz.answers[qz.answers.length - 1] : null;
    const { body, after } = wbInteractive(q.wb.item, q.wb.type, ans);
    return `
  <div class="q-progress">
    <button class="icon-btn" data-act="quiz-quit" aria-label="Thoát">${icon('x')}</button>
    <div class="bar"><span style="width:${pct(qz.idx, qz.questions.length)}%"></span></div>
    <span>${qz.idx + 1}/${qz.questions.length}</span>
  </div>
  <div class="card">
    <div class="q-type">${esc(q.kind)}</div>
    <div class="small muted han" style="margin:-2px 0 10px">${esc(q.kindNote)}</div>
    ${body}${after}
    ${ans ? `<button class="btn btn-primary btn-block" style="margin-top:14px" data-act="quiz-next">${qz.idx + 1 < qz.questions.length ? 'Câu tiếp' : 'Xem kết quả'}</button>` : ''}
  </div>`;
  }
  if (qz.picked != null) {
    const ok = qz.picked === q.correct;
    if (q.wbMcq) {
      const full = wbFilled(q.wbMcq);
      fb = `<div class="feedback"><b style="color:${ok ? 'var(--ok)' : 'var(--bad)'}">${ok ? 'Chính xác!' : 'Chưa đúng.'}</b>
        ${full ? `<div class="row" style="margin-top:6px"><span class="han grow">${esc(full)}</span>${speakBtn(full)}</div>` : ''}
        ${q.wbMcq.note ? `<div class="small" style="margin-top:4px">${esc(q.wbMcq.note)}</div>` : ''}</div>`;
    } else if (q.word) {
      const w = q.word;
      fb = `<div class="feedback"><b style="color:${ok ? 'var(--ok)' : 'var(--bad)'}">${ok ? 'Chính xác!' : 'Chưa đúng.'}</b>
        <span class="han" style="font-size:18px">${esc(w.hanzi)}</span> <span class="pinyin" style="font-size:14px">${esc(w.pinyin)}</span> — ${esc(w.meaning)}
        ${w.exampleZh ? `<div class="han" style="margin-top:4px">${esc(w.exampleZh)}</div>` : ''}
        ${!isKnown(w.hanzi) && ok ? `<div style="margin-top:8px"><button class="btn" style="min-height:34px" data-act="quiz-known" data-h="${esc(w.hanzi)}">${icon('check', 16)} Đánh dấu đã thuộc</button></div>` : ''}</div>`;
    } else {
      const g = q.grammar;
      fb = `<div class="feedback"><b style="color:${ok ? 'var(--ok)' : 'var(--bad)'}">${ok ? 'Chính xác!' : 'Chưa đúng.'}</b>
        <span class="han">${esc(g.structure)}</span>: ${esc(g.usage)}
        ${g.examples && g.examples[0] ? `<div class="han" style="margin-top:4px">${esc(g.examples[0].zh)}</div>` : ''}</div>`;
    }
  }
  // Nút loa ở đề bài: chỉ hiện khi không làm lộ đáp án (câu chọn nghĩa) hoặc sau khi đã trả lời.
  const promptSpeak = q.word && !q.listen && (q.kind === 'Chọn nghĩa đúng' || qz.picked != null) ? speakBtn(q.word.hanzi) : '';
  return `
  <div class="q-progress">
    <button class="icon-btn" data-act="quiz-quit" aria-label="Thoát">${icon('x')}</button>
    <div class="bar"><span style="width:${pct(qz.idx, qz.questions.length)}%"></span></div>
    <span>${qz.idx + 1}/${qz.questions.length}</span>
  </div>
  <div class="card">
    <div class="q-type">${esc(q.kind)}</div>
    ${q.kindNote ? `<div class="small muted han" style="margin:-2px 0 10px">${esc(q.kindNote)}</div>` : ''}
    <div class="q-prompt ${q.listen ? 'listen' : ''}">${q.promptHtml} ${promptSpeak}</div>
    ${optionsHtml(q, qz.picked, 'quiz-pick', q.hanOpts)}
    ${fb}
    ${qz.picked != null ? `<button class="btn btn-primary btn-block" style="margin-top:14px" data-act="quiz-next">${qz.idx + 1 < qz.questions.length ? 'Câu tiếp' : 'Xem kết quả'}</button>` : ''}
  </div>`;
}


// ================================================================
// BÀI TẬP SÁCH (Workbook) — dữ liệu ở workbook.js, dựng bằng tools/build-workbook.js
// Điểm cao nhất mỗi phần lưu trong store.convoBest['wb:<mã phần>'] nên được sao lưu + đồng bộ như điểm hội thoại.
// ================================================================
const WB = typeof WORKBOOK !== 'undefined' ? WORKBOOK : [];
const WB_KIND = { mcq: 'Trắc nghiệm', typo: 'Tìm chữ sai', order: 'Sắp xếp câu', open: 'Tự luận' };
const wbBest = sec => store.convoBest['wb:' + sec.id];
const wbLesson = () => WB[state.wbLesson] || WB[0];

function wbFresh(item, type) {
  if (type === 'mcq') {
    const order = shuffle(item.options.map((_, i) => i));
    return { ...item, options: order.map(i => item.options[i]), correct: order.indexOf(item.correct), picked: null };
  }
  if (type === 'typo') return { ...item, sel: [], checked: false };
  if (type === 'order') {
    let pool = item.tiles.map((_, i) => i);
    for (let k = 0; k < 5 && pool.every((v, i) => v === i); k++) pool = shuffle(pool);
    return { ...item, pool, built: [], checked: false };
  }
  return { ...item, text: '', revealed: false };
}
function startWb(secId, onlyItems) {
  for (const lesson of WB) {
    const sec = lesson.sections.find(s => s.id === secId);
    if (!sec) continue;
    const items = (onlyItems || sec.items).map(it => wbFresh(it, sec.type));
    state.wb = { lesson, sec, items, src: onlyItems || sec.items, idx: 0, answers: [], retry: !!onlyItems };
    render(); window.scrollTo(0, 0);
    return;
  }
}
function wbRecord(ok) {
  const wb = state.wb;
  if (!wb.answers[wb.idx]) wb.answers[wb.idx] = { ok, i: wb.idx };
}
function wbNext() {
  const wb = state.wb;
  wb.idx++;
  if (wb.idx >= wb.items.length && !wb.retry) {
    const p = pct(wb.answers.filter(a => a && a.ok).length, wb.items.length);
    const key = 'wb:' + wb.sec.id;
    store.convoBest[key] = Math.max(store.convoBest[key] || 0, p);
    save();
  }
  render(); window.scrollTo(0, 0);
}
// So câu sắp xếp: bỏ qua dấu câu và khoảng trắng
const wbPlain = t => t.replace(/[，。！？、；：,.!?\s]/g, '');
// Câu trắc nghiệm có chỗ trống → câu hoàn chỉnh để đọc
// (đáp án nhiều chỗ trống viết "từ1／từ2" theo thứ tự các ＿＿)
const wbFilled = it => {
  if (!it.prompt.includes('＿＿')) return '';
  const parts = it.options[it.correct].split('／');
  let k = 0;
  return it.prompt.replace(/＿＿/g, () => parts[Math.min(k++, parts.length - 1)]);
};
const wbAnswerText = (it, type) => type === 'mcq' ? (wbFilled(it) || it.options[it.correct]) : type === 'typo' ? it.fixed : type === 'order' ? it.tiles.join('') : it.answer;
const wbQuestionText = (it, type) => type === 'typo' ? it.text : type === 'order' ? it.tiles.join(' / ') : it.prompt;

function viewWorkbook() {
  const lesson = wbLesson();
  const done = lesson.sections.filter(s => wbBest(s) != null).length;
  return `
  <select class="input han" data-act="wb-lesson" style="margin-bottom:6px">
    ${WB.map((l, i) => `<option value="${i}" ${i === state.wbLesson ? 'selected' : ''}>${esc(l.title)}</option>`).join('')}
  </select>
  <p class="small muted" style="margin:0 2px 12px">Bài tập trong sách bài tập (Workbook). Đã làm ${done}/${lesson.sections.length} phần. Đáp án do app biên soạn; phần tự luận chỉ là gợi ý.</p>
  <div class="stack">
    ${lesson.sections.map(sec => {
      const best = wbBest(sec);
      return `<button class="card wb-sec" data-act="wb-start" data-s="${esc(sec.id)}">
        <div class="grow">
          <div class="han wb-sec-title">${esc(sec.title)}</div>
          <div class="small muted">${esc(sec.hint)}</div>
          <div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap"><span class="tag">${WB_KIND[sec.type]}</span><span class="tag">${sec.items.length} câu</span>
          ${best != null ? `<span class="tag ${best >= 80 ? 'ok' : 'accent'}">Tốt nhất ${best}%</span>` : ''}</div>
        </div>
        <span class="chev">${icon('right', 20)}</span>
      </button>`;
    }).join('')}
  </div>`;
}

// Phần tương tác của câu "tìm chữ sai" và "sắp xếp câu" (dùng cho Bài tập sách và ôn tập tổng hợp).
function wbInteractive(it, type, ans) {
  let body = '', after = '';
  const verdict = ok => `<b style="color:${ok ? 'var(--ok)' : 'var(--bad)'}">${ok ? 'Chính xác!' : 'Chưa đúng.'}</b>`;
  const sayRow = t => `<div class="row" style="margin-top:6px"><span class="han grow">${esc(t)}</span>${speakBtn(t)}</div>`;
  if (type === 'typo') {
    const chars = [...it.text];
    body = `<div class="typo-line han">${chars.map((ch, i) => {
      let cls = 'typo-ch';
      if (it.checked) { if (it.wrong.includes(i)) cls += ' is-wrong'; else if (it.sel.includes(i)) cls += ' miss'; }
      else if (it.sel.includes(i)) cls += ' sel';
      return `<button class="${cls}" data-act="wb-ch" data-i="${i}" ${it.checked || /[，。！？、；：「」\s]/.test(ch) ? 'disabled' : ''}>${esc(ch)}</button>`;
    }).join('')}</div>
    ${it.checked ? '' : `<div class="small muted" style="margin-top:8px">Câu này có ${it.wrong.length} chữ viết sai · đã chọn ${it.sel.length}</div>`}`;
    if (!it.checked) after = `<button class="btn btn-primary btn-block" style="margin-top:14px" data-act="wb-check" ${it.sel.length ? '' : 'disabled'}>Kiểm tra</button>`;
    else after = `<div class="feedback">${verdict(ans.ok)} ${it.wrong.map(i => `<span class="han">${esc(chars[i])} → <b style="color:var(--ok)">${esc([...it.fixed][i])}</b></span>`).join('，')}
        ${sayRow(it.fixed)}</div>`;
  } else if (type === 'order') {
    const answer = it.tiles.join('');
    body = `<div class="order-built han ${it.checked ? (ans.ok ? 'ok' : 'bad') : ''}">${it.built.length
        ? it.built.map((ti, k) => `<button class="tile" data-act="wb-untile" data-i="${k}" ${it.checked ? 'disabled' : ''}>${esc(it.tiles[ti])}</button>`).join('')
        : '<span class="small muted" style="font-family:var(--font)">Chạm các mảnh bên dưới theo đúng thứ tự</span>'}</div>
      <div class="order-pool han">${it.pool.map(ti => it.built.includes(ti)
        ? `<span class="tile ghost">${esc(it.tiles[ti])}</span>`
        : `<button class="tile" data-act="wb-tile" data-i="${ti}" ${it.checked ? 'disabled' : ''}>${esc(it.tiles[ti])}</button>`).join('')}</div>`;
    if (!it.checked) after = `<div class="row" style="margin-top:14px">
        <button class="btn" data-act="wb-clear" ${it.built.length ? '' : 'disabled'}>Xếp lại</button>
        <button class="btn btn-primary grow" data-act="wb-check" ${it.built.length === it.tiles.length ? '' : 'disabled'}>Kiểm tra</button></div>`;
    else after = `<div class="feedback">${verdict(ans.ok)}
        ${ans.ok ? '' : '<div class="small muted" style="margin-top:4px">Đáp án:</div>'}${sayRow(answer)}
        ${ans.ok ? '' : '<button class="btn" style="margin-top:8px;min-height:34px" data-act="wb-mine">Câu của tôi cũng đúng</button>'}</div>`;
  }
  return { body, after };
}
// Câu bài tập đang làm: trong phần Bài tập sách, hoặc câu bài tập nằm trong lượt ôn tập tổng hợp.
function wbCur() {
  if (state.wb) {
    const wb = state.wb;
    return { it: wb.items[wb.idx], type: wb.sec.type, record: wbRecord, setOk: () => { wb.answers[wb.idx].ok = true; } };
  }
  const qz = state.quiz, q = qz && qz.questions[qz.idx];
  if (!q || !q.wb) return null;
  return {
    it: q.wb.item, type: q.wb.type,
    record: ok => { if (qz.picked != null) return; qz.picked = ok ? 0 : -1; qz.answers.push({ q, picked: qz.picked, ok }); },
    setOk: () => { const a = qz.answers[qz.answers.length - 1]; if (a) a.ok = true; },
  };
}

function viewWbRun() {
  const wb = state.wb;
  if (wb.idx >= wb.items.length) return viewWbResult();
  const it = wb.items[wb.idx], type = wb.sec.type;
  const ans = wb.answers[wb.idx];
  let body = '', after = '';
  const nextBtn = `<button class="btn btn-primary btn-block" style="margin-top:14px" data-act="wb-next">${wb.idx + 1 < wb.items.length ? 'Câu tiếp' : 'Xem kết quả'}</button>`;
  const verdict = ok => `<b style="color:${ok ? 'var(--ok)' : 'var(--bad)'}">${ok ? 'Chính xác!' : 'Chưa đúng.'}</b>`;
  const sayRow = t => `<div class="row" style="margin-top:6px"><span class="han grow">${esc(t)}</span>${speakBtn(t)}</div>`;

  if (type === 'mcq') {
    const full = wbFilled(it);
    body = `<div class="q-prompt han wb-prompt">${esc(it.prompt)}</div>${optionsHtml(it, it.picked, 'wb-pick', 'text')}`;
    if (ans) after = `<div class="feedback">${verdict(ans.ok)}${full ? sayRow(full) : ''}
      ${it.note ? `<div class="small" style="margin-top:4px">${esc(it.note)}</div>` : ''}</div>${nextBtn}`;
  } else if (type === 'typo' || type === 'order') {
    ({ body, after } = wbInteractive(it, type, ans));
    if (it.checked) after += nextBtn;
  } else {
    const latin = /[a-z]{3}/i.test(it.prompt);
    body = `<div class="q-prompt wb-prompt ${latin ? '' : 'han'}">${esc(it.prompt)}</div>
      <textarea class="input han wb-text" rows="3" placeholder="Viết câu trả lời bằng chữ Hán…" data-act="wb-text">${esc(it.text)}</textarea>`;
    if (!it.revealed) after = `<button class="btn btn-primary btn-block" style="margin-top:12px" data-act="wb-reveal">Xem đáp án gợi ý</button>`;
    else after = `<div class="feedback"><div class="small muted">Đáp án gợi ý:</div>${sayRow(it.answer)}</div>
      ${ans ? nextBtn : `<div class="small muted" style="margin:12px 2px 6px">So với đáp án, bạn tự chấm:</div>
      <div class="row"><button class="btn grow" data-act="wb-self" data-k="0">Chưa đúng</button><button class="btn btn-ok grow" data-act="wb-self" data-k="1">${icon('check', 18)} Tôi làm đúng</button></div>`}`;
  }

  return `
  <div class="q-progress">
    <button class="icon-btn" data-act="wb-quit" aria-label="Thoát">${icon('x')}</button>
    <div class="bar"><span style="width:${pct(wb.idx, wb.items.length)}%"></span></div>
    <span>${wb.idx + 1}/${wb.items.length}</span>
  </div>
  <div class="card">
    <div class="q-type han">${esc(wb.sec.title)}</div>
    <div class="small muted" style="margin:-4px 0 10px">${esc(wb.sec.hint)}</div>
    ${body}${after}
  </div>`;
}

function viewWbResult() {
  const wb = state.wb, n = wb.items.length, type = wb.sec.type;
  const correct = wb.answers.filter(a => a && a.ok).length;
  const wrong = wb.answers.filter(a => a && !a.ok);
  const p = pct(correct, n);
  const next = wb.lesson.sections[wb.lesson.sections.indexOf(wb.sec) + 1];
  return `
  <div class="card" style="text-align:center">
    <div class="muted han">${esc(wb.sec.title)}</div>
    <div class="score-big">${p}%</div>
    <div class="muted">${correct}/${n} câu đúng${wb.retry ? ' · lượt làm lại câu sai' : ''}</div>
    <div class="row" style="justify-content:center;margin-top:14px;flex-wrap:wrap">
      ${wrong.length ? '<button class="btn btn-primary" data-act="wb-retry">Làm lại câu sai</button>' : ''}
      ${next ? '<button class="btn" data-act="wb-nextsec">Phần tiếp theo</button>' : ''}
      <button class="btn" data-act="wb-home">Danh sách bài tập</button>
    </div>
  </div>
  ${wrong.length ? `<div class="section-title">Câu chưa đúng (${wrong.length})</div>
  <div class="card" style="padding:4px 16px">${wrong.map(a => {
    const it = wb.items[a.i];
    return `<div class="review-item">
      <div class="han small muted">${esc(wbQuestionText(it, type))}</div>
      <div><span style="color:var(--ok)">✓ <span class="han">${esc(wbAnswerText(it, type))}</span></span></div>
    </div>`;
  }).join('')}</div>` : ''}`;
}

// ================================================================
// WORD SHEET
// ================================================================
function openWord(h) {
  const w = WORD_BY_HANZI.get(h);
  if (!w) return;
  closeSheet();
  const wrap = document.createElement('div');
  wrap.id = 'sheet';
  wrap.innerHTML = `<div class="sheet-backdrop" data-act="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div>
      <div class="sheet-head"><span class="small muted han">${esc(UNITS[w.unit].title)}</span><button class="icon-btn" data-act="close-sheet" aria-label="Đóng">${icon('x')}</button></div>
      ${wordDetail(w)}
      <button class="btn ${isKnown(h) ? '' : 'btn-ok'} btn-block" style="margin-top:16px" data-act="sheet-known" data-h="${esc(h)}">
        ${isKnown(h) ? 'Bỏ đánh dấu đã thuộc' : icon('check', 18) + ' Đánh dấu đã thuộc'}</button>
    </div>`;
  document.body.appendChild(wrap);
}
function closeSheet() { const s = $('#sheet'); if (s) s.remove(); }

// ================================================================
// EVENTS (event delegation)
// ================================================================
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const d = el.dataset;
  switch (act) {
    case 'tab': go(d.tab); break;
    case 'speak': e.stopPropagation(); speak(d.text); break;
    case 'word': e.stopPropagation(); openWord(d.h); break;
    case 'close-sheet': closeSheet(); break;
    case 'sheet-known':
      closeSheet();
      if (isKnown(d.h)) { setKnown(d.h, false); toast('Đã bỏ đánh dấu'); } else markKnown(d.h);
      render(); break;

    case 'sync-connect': connectSync(); break;
    case 'sync-now': syncNow().then(p => toast(syncCfg.error ? syncErrorToast() : p ? 'Đã nhận thay đổi từ máy khác' : 'Đã đồng bộ')); break;
    case 'sync-off':
      if (confirm('Ngắt đồng bộ đám mây trên máy này?\n\nTiến độ trên máy và bản trên GitHub vẫn được giữ nguyên. Muốn bật lại thì dán lại mã truy cập.')) { clearTimeout(syncTimer); syncCfg = {}; saveSync(); render(); toast('Đã ngắt đồng bộ'); }
      break;
    case 'backup': exportBackup(); break;
    case 'backup-later': store.backup = { ...store.backup, snoozeUntil: addDays(todayKey(), 3) }; save(); render(); toast('Sẽ nhắc lại sau 3 ngày'); break;
    case 'restore-file': { const inp = $('#restore-input'); inp.value = ''; inp.click(); break; }
    case 'restore-snap': restoreSnapshot(+d.i); break;
    case 'review-now': state.unit = 'all'; state.filter = 'due'; state.view = 'card'; buildDeck(false); go('cards'); break;
    case 'open-unit': state.unit = +d.unit; state.filter = 'todo'; buildDeck(false); go('cards'); break;
    case 'reset-unit': resetUnit(+d.unit); break;
    case 'filter': state.filter = d.f; buildDeck(false); savePrefs(); render(); break;
    case 'view': state.view = d.v; if (d.v === 'card') buildDeck(false); savePrefs(); render(); break;
    case 'toggle-pinyin': state.showPinyin = !state.showPinyin; savePrefs(); render(); break;
    case 'toggle-reverse': state.reverse = !state.reverse; state.flipped = false; savePrefs(); render(); toast(state.reverse ? 'Thẻ đảo chiều: nhìn nghĩa → nhớ chữ Hán' : 'Thẻ thường: nhìn chữ Hán → nhớ nghĩa'); break;
    case 'shuffle': buildDeck(true); render(); toast('Đã xáo trộn'); break;
    case 'restart-deck': buildDeck(false); render(); break;
    case 'flip': flipCard(); break;
    case 'mark': markCurrent(d.k === '1'); break;
    case 'review': reviewCurrent(d.k === '1'); break;
    case 'prev': if (state.deckIdx > 0) moveTo(state.deckIdx - 1); break;
    case 'next': moveTo(state.deckIdx + 1); break;
    case 'toggle-known':
      if (isKnown(d.h)) { setKnown(d.h, false); toast('Đã bỏ đánh dấu'); } else markKnown(d.h);
      render(); break;

    case 'cq-start': {
      const c = CONVERSATIONS[state.convo];
      // xáo cả thứ tự đáp án để đáp án đúng không cố định một vị trí
      const mix = q => { const order = shuffle(q.options.map((_, i) => i)); return { ...q, options: order.map(i => q.options[i]), correct: order.indexOf(q.correct) }; };
      state.cq = { questions: shuffle(c.questions).slice(0, 5).map(mix), idx: 0, picked: null, score: 0 };
      render(); break;
    }
    case 'cq-pick': {
      const cq = state.cq; if (cq.picked != null) break;
      cq.picked = +d.i; if (cq.picked === cq.questions[cq.idx].correct) cq.score++;
      render(); break;
    }
    case 'cq-next': {
      const cq = state.cq; cq.idx++; cq.picked = null;
      if (cq.idx >= cq.questions.length) {
        const t = CONVERSATIONS[state.convo].title, p = pct(cq.score, cq.questions.length);
        store.convoBest[t] = Math.max(store.convoBest[t] || 0, p); save();
      }
      render(); break;
    }

    case 'g-toggle': { const i = +d.i; state.gOpen.has(i) ? state.gOpen.delete(i) : state.gOpen.add(i); render(); break; }

    case 'quiz-len': state.quizLen = +d.n; savePrefs(); render(); break;
    case 'quiz-mode': state.quizMode = d.m; savePrefs(); render(); break;
    case 'quiz-start': startQuiz(); break;
    case 'quiz-pick': answerQuiz(+d.i); break;
    case 'quiz-next': nextQuiz(); break;
    case 'quiz-known': { const done = setKnown(d.h, true); el.outerHTML = `<span class="tag ok">${done ? '🎉 Hoàn thành ' + esc(done) : 'Đã lưu vào từ đã thuộc'}</span>`; break; }
    case 'quiz-quit': if (confirm('Thoát bài ôn tập? Kết quả lượt này sẽ không được lưu.')) { state.quiz = null; render(); } break;
    case 'quiz-new': state.quiz = null; render(); break;
    case 'quiz-area': state.quizArea = d.a; savePrefs(); render(); break;
    case 'wb-start': startWb(d.s); break;
    case 'wb-home': state.wb = null; render(); window.scrollTo(0, 0); break;
    case 'wb-quit': if (state.wb.idx >= state.wb.items.length || confirm('Thoát phần bài tập này? Kết quả lượt này sẽ không được lưu.')) { state.wb = null; render(); } break;
    case 'wb-next': wbNext(); break;
    case 'wb-retry': { const wb = state.wb; startWb(wb.sec.id, wb.answers.filter(a => a && !a.ok).map(a => wb.src[a.i])); break; }
    case 'wb-nextsec': { const l = state.wb.lesson; const s = l.sections[l.sections.indexOf(state.wb.sec) + 1]; if (s) startWb(s.id); break; }
    case 'wb-pick': { const it = state.wb.items[state.wb.idx]; if (it.picked != null) break; it.picked = +d.i; wbRecord(it.picked === it.correct); render(); break; }
    case 'wb-ch': { const it = wbCur().it, i = +d.i; it.sel = it.sel.includes(i) ? it.sel.filter(x => x !== i) : [...it.sel, i]; render(); break; }
    case 'wb-tile': { const it = wbCur().it; if (!it.built.includes(+d.i)) it.built.push(+d.i); render(); break; }
    case 'wb-untile': wbCur().it.built.splice(+d.i, 1); render(); break;
    case 'wb-clear': wbCur().it.built = []; render(); break;
    case 'wb-check': {
      const c = wbCur(), it = c.it;
      it.checked = true;
      if (c.type === 'typo') c.record(it.sel.length === it.wrong.length && it.wrong.every(i => it.sel.includes(i)));
      else c.record(wbPlain(it.built.map(i => it.tiles[i]).join('')) === wbPlain(it.tiles.join('')));
      render(); break;
    }
    case 'wb-mine': wbCur().setOk(); render(); break;
    case 'wb-reveal': state.wb.items[state.wb.idx].revealed = true; render(); break;
    case 'wb-self': wbRecord(d.k === '1'); wbNext(); break;
    case 'quiz-retry': {
      const wrong = state.quiz.answers.filter(a => !a.ok).map(a => ({ word: a.q.word, grammar: a.q.grammar, wbSrc: a.q.wbSrc }));
      startQuiz(wrong); state.quiz.retry = true; break;
    }
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'restore-input') { const file = e.target.files && e.target.files[0]; if (file) restoreFromFile(file); return; }
  const act = e.target.dataset.act;
  if (act === 'unit') { state.unit = e.target.value === 'all' ? 'all' : +e.target.value; buildDeck(false); savePrefs(); render(); }
  if (act === 'convo') { state.convo = +e.target.value; state.cq = null; savePrefs(); render(); window.scrollTo(0, 0); }
  if (act === 'g-filter') { state.gFilter = e.target.value; render(); }
  if (act === 'quiz-topic') { state.quizTopic = e.target.value; savePrefs(); render(); }
  if (act === 'wb-lesson') { state.wbLesson = +e.target.value; savePrefs(); render(); }
});

// Ô tìm kiếm: chỉ render lại danh sách, giữ focus + vị trí con trỏ
document.addEventListener('input', e => {
  const act = e.target.dataset.act;
  if (act === 'wb-text') { if (state.wb) state.wb.items[state.wb.idx].text = e.target.value; return; }
  if (act !== 'search' && act !== 'g-search') return;
  const pos = e.target.selectionStart;
  if (act === 'search') state.search = e.target.value; else state.gSearch = e.target.value;
  render();
  const inp = document.querySelector(`[data-act="${act}"]`);
  if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (err) { /* type=search */ } }
});

// Vuốt trái/phải trên thẻ để chuyển thẻ
let touchX = null, touchY = null;
document.addEventListener('touchstart', e => {
  if (!e.target.closest('#flash')) return;
  touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
}, { passive: true });
document.addEventListener('touchend', e => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX, dy = e.changedTouches[0].clientY - touchY;
  touchX = null;
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  e.preventDefault(); // không tính là "chạm để lật"
  if (dx < 0) moveTo(state.deckIdx + 1); else if (state.deckIdx > 0) moveTo(state.deckIdx - 1);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSheet();
  if (state.tab !== 'cards' || state.view !== 'card' || e.target.matches('input, select')) return;
  if (e.key === ' ') { e.preventDefault(); flipCard(); }
  if (e.key === 'ArrowRight') moveTo(state.deckIdx + 1);
  if (e.key === 'ArrowLeft' && state.deckIdx > 0) moveTo(state.deckIdx - 1);
});

// Mở lại app vào ngày hôm sau (app chạy nền trên iPhone) → cập nhật số từ cần ôn.
let lastDay = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && todayKey() !== lastDay) { lastDay = todayKey(); dailySnapshot(); render(); }
  if (!syncOn()) return;
  if (document.visibilityState === 'hidden') { if (isDirty()) syncNow(); }
  else if (!syncCfg.lastAt || Date.now() - syncCfg.lastAt > 30000 || syncCfg.error) syncNow();
});
window.addEventListener('online', () => { if (syncOn()) syncNow(); });

// ================================================================
// BOOT
// ================================================================
if (state.unit !== 'all' && !UNITS[state.unit]) state.unit = 0;
if (!CONVERSATIONS[state.convo]) state.convo = 0;
if (state.quizTopic !== 'grammar' && !QUIZ_TOPICS().some(t => t.key === state.quizTopic)) state.quizTopic = 'all';
if (!QUIZ_MODES.some(m => m.key === state.quizMode) || (state.quizMode === 'listen' && !TTS)) state.quizMode = 'mix';
restoreDeck();
dailySnapshot();
render();
if (syncOn()) syncNow();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
