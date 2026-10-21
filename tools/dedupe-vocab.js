// Bỏ các từ trong file mới đã có ở bộ từ khác (data.js + các file content/pavc khác).
//   node tools/dedupe-vocab.js P4-02 P4-13 …   (mã bài, theo thứ tự ưu tiên giữ lại)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'content', 'pavc');
const targets = process.argv.slice(2);
const D = new Function('window', fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8') + ';return {UNITS};')({});
const have = new Map();
D.UNITS.forEach(u => u.vocab.forEach(w => have.set(w.hanzi, u.key)));
const vocabOf = f => { let sec; const out = []; for (const l of fs.readFileSync(path.join(DIR, f), 'utf8').split(/\r?\n/)) {
  if (l.startsWith('#')) sec = l.split(' ')[0]; else if (sec === '#VOCAB' && l.trim() && !l.startsWith('//')) out.push(l.split('|')[0].trim()); } return out; };
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.v.txt') && !targets.includes(f.split('.')[0])))
  vocabOf(f).forEach(h => { if (!have.has(h)) have.set(h, f.split('.')[0]); });
for (const key of targets) {
  const f = key + '.v.txt', p = path.join(DIR, f);
  let sec; const out = [], rm = [];
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (l.startsWith('#')) sec = l.split(' ')[0];
    else if (sec === '#VOCAB' && l.trim() && !l.startsWith('//')) {
      const h = l.split('|')[0].trim();
      if (have.has(h)) { rm.push(`${h}(${have.get(h)})`); continue; }
      have.set(h, key);
    }
    out.push(l);
  }
  fs.writeFileSync(p, out.join('\n'));
  console.log(`${key}: bỏ ${rm.length} từ trùng${rm.length ? ': ' + rm.join(' ') : ''}`);
}
