// Tạo file đọc (mp3):
//  - audio/c/: mọi câu hội thoại, mỗi nhân vật một giọng thật (nam/nữ)
//  - audio/w/: mọi từ vựng, câu ví dụ, ví dụ ngữ pháp (1 giọng). Tên file = sayKey(câu), app tự tính ra.
//   node tools/build-audio.js        → tạo file còn thiếu + viết lại audio-map.js
// Cần Python + gói edge-tts bản mới (pip install -U edge-tts; bản cũ bị máy chủ từ chối, lỗi 403) và có mạng. File đã có thì bỏ qua,
// nên sửa / thêm hội thoại chỉ tạo thêm những câu mới.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'audio', 'c');
const OUT_W = path.join(ROOT, 'audio', 'w');
const SAY_VOICE = 'zh-TW-HsiaoChenNeural';
// Giống hệt sayKey() trong app.js: 2 lần FNV-1a 32 bit + độ dài.
function sayKey(t) {
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul(b ^ c, 0x5bd1e995) >>> 0; }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0') + t.length.toString(36);
}

// Giới tính nhân vật. Nhân vật không có ở đây thì đoán theo chức danh, không đoán được thì xen kẽ nam–nữ.
const SPEAKER_SEX = {
  '偉立': 'm', '建國': 'm', '陸康': 'm', '李平': 'm', '錢先生': 'm', '教授': 'm', '叔叔': 'm', '爸爸': 'm',
  '周開文': 'm', '林中平': 'm', '費南多': 'm', '周學盛': 'm', '陳士豐': 'm', '維克': 'm', '陳永慶': 'm', '何平': 'm',
  '美英': 'f', '正浩': 'm', '王太太': 'f', '大明': 'm', '林醫師': 'm',
  '美真': 'f', '台麗': 'f', '錢太太': 'f', '師母': 'f', '姐姐': 'f', '媽媽': 'f',
  '珊珊': 'f', '小雅': 'f', '明萱': 'f', '高繪玲': 'f', '敏華': 'f', '秀秀': 'f', '怡君': 'f', '黃淑華': 'f', '范美文': 'f',
};
function guessSex(name) {
  if (SPEAKER_SEX[name]) return SPEAKER_SEX[name];
  if (/(先生|爸|爺|叔|伯|哥|弟|兒子|男|舅)/.test(name)) return 'm';
  if (/(太太|小姐|媽|奶|姨|姐|妹|女|嫂|婆|母)/.test(name)) return 'f';
  return null;
}
// Giọng Đài Loan trước, thiếu thì mượn giọng phổ thông đại lục.
const VOICES = {
  m: ['zh-TW-YunJheNeural', 'zh-CN-YunxiNeural', 'zh-CN-YunyangNeural', 'zh-CN-YunjianNeural'],
  f: ['zh-TW-HsiaoChenNeural', 'zh-CN-XiaoxiaoNeural', 'zh-CN-XiaoyiNeural', 'zh-TW-HsiaoYuNeural'],
};
const NARRATOR = 'zh-TW-HsiaoYuNeural';
const RATE = '-10%';

const src = ['data.js', 'data-pavc.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const { CONVERSATIONS, UNITS, GRAMMAR } = new Function('window', src + ';return { CONVERSATIONS, UNITS, GRAMMAR };')({});

const jobs = [], map = {};
for (const c of CONVERSATIONS) {
  const names = [...new Set(c.lines.map(l => l.speaker).filter(Boolean))];
  const used = { m: 0, f: 0 }, cast = {}, sex = {};
  let alt = 0;
  names.forEach(n => {
    const s = guessSex(n) || (alt++ % 2 ? 'f' : 'm');
    sex[n] = s;
    cast[n] = VOICES[s][used[s]++ % VOICES[s].length];
  });
  const files = c.lines.map(l => {
    const text = l.zh.trim();
    if (!text) return null;
    const voice = l.speaker ? cast[l.speaker] : NARRATOR;
    const file = crypto.createHash('sha1').update(`${voice}|${RATE}|${text}`).digest('hex').slice(0, 14) + '.mp3';
    jobs.push({ file: path.join(OUT, file), voice, rate: RATE, text });
    return file;
  });
  map[c.title] = { sex, cast, files };
}

const says = new Set();
UNITS.forEach(u => u.vocab.forEach(w => { says.add(w.hanzi.trim()); if (w.exampleZh) says.add(w.exampleZh.trim()); }));
GRAMMAR.forEach(g => (g.examples || []).forEach(e => { if (e.zh) says.add(e.zh.trim()); }));
says.delete('');
const sayKeys = [];
for (const text of says) {
  const k = sayKey(text);
  sayKeys.push(k);
  jobs.push({ file: path.join(OUT_W, k + '.mp3'), voice: SAY_VOICE, rate: RATE, text });
}
fs.mkdirSync(OUT_W, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const ok = f => fs.existsSync(f) && fs.statSync(f).size > 1000;
const todo = jobs.filter((j, i) => !ok(j.file) && jobs.findIndex(k => k.file === j.file) === i);
console.log(`${jobs.length} câu, cần tạo ${todo.length} file`);
if (todo.length) {
  const tmp = path.join(require('os').tmpdir(), 'zh-tts-jobs.json');
  fs.writeFileSync(tmp, JSON.stringify(todo));
  execFileSync('python', [path.join(__dirname, 'tts.py'), tmp], { stdio: 'inherit' });
  fs.unlinkSync(tmp);
}
const missing = jobs.filter(j => !ok(j.file));
if (missing.length) { console.error(`Còn ${missing.length} file chưa tạo được, chạy lại lệnh.`); process.exit(1); }

// Xoá file không còn dùng (câu đã sửa / xoá)
const keep = new Set(jobs.map(j => path.basename(j.file)));
for (const dir of [OUT, OUT_W]) fs.readdirSync(dir).filter(f => f.endsWith('.mp3') && !keep.has(f)).forEach(f => fs.unlinkSync(path.join(dir, f)));

fs.writeFileSync(path.join(ROOT, 'audio-map.js'),
  '// Tự sinh bởi tools/build-audio.js, đừng sửa tay.\n// Mỗi hội thoại: giới tính + giọng của nhân vật, và file mp3 cho từng câu (theo thứ tự câu).\nconst CONVO_AUDIO = ' + JSON.stringify(map) + ';\n' +
  '// Từ vựng / ví dụ đã có file trong audio/w/ (tên = sayKey(câu)).\nconst SAY_AUDIO = ' + JSON.stringify(sayKeys.sort().join(' ')) + ';\n');
console.log('Đã viết audio-map.js');
