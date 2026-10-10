#!/usr/bin/env node
// Nhập từ vựng + ngữ pháp từ file Excel (.xlsx) vào data.js.
//
//   node tools/import-excel.js <file.xlsx> <mã bài> "<tên bài>" [--dry]
//   vd: node tools/import-excel.js bai8.xlsx L8 "L8 · 春節"
//
// - Mã bài chưa có  → tạo bài mới.
// - Mã bài đã có    → thêm từ / ngữ pháp vào bài đó (bỏ qua từ trùng).
// - --dry           → chỉ xem trước, không ghi file.
//
// Excel: mỗi sheet có dòng tiêu đề ở hàng 1, nhận diện theo tên cột (không phân biệt hoa thường):
//   Sheet từ vựng:  Hán tự | Pinyin | Hán Việt | Nghĩa | Nhóm | Ví dụ | Dịch   (bắt buộc: Hán tự, Pinyin, Nghĩa)
//   Sheet ngữ pháp: Cấu trúc | Ý nghĩa | Ví dụ | Dịch                      (bắt buộc: Cấu trúc, Ý nghĩa)
// Nếu không có cột "Nhóm", tên sheet được dùng làm nhóm. Không cần thư viện ngoài, chỉ cần Node.js.
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data.js');
const SW = path.join(ROOT, 'sw.js');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const [file, key, title] = args.filter(a => a !== '--dry');
if (!file || !key || !/^[A-Za-z0-9_]+$/.test(key)) {
  console.log('Cách dùng: node tools/import-excel.js <file.xlsx> <mã bài, vd L8> "<tên bài>" [--dry]');
  process.exit(1);
}

// ---------------- đọc .xlsx (file zip) ----------------
function unzip(buf) {
  const files = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Không phải file .xlsx hợp lệ');
  let p = buf.readUInt32LE(eocd + 16);
  const n = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.slice(start, start + size);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
const decode1 = s => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, c) => String.fromCodePoint(+c))
  .replace(/&#x([0-9a-f]+);/gi, (m, c) => String.fromCodePoint(parseInt(c, 16)))
  .replace(/&amp;/g, '&');
const decode = s => { let prev; do { prev = s; s = decode1(s); } while (s !== prev); return s; };
const texts = xml => decode([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''));

function readWorkbook(fp) {
  const z = unzip(fs.readFileSync(fp));
  const str = k => (z[k] ? z[k].toString('utf8') : '');
  const shared = [...str('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]));
  const rels = {};
  for (const m of str('xl/_rels/workbook.xml.rels').matchAll(/<Relationship [^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0]), target = /Target="([^"]+)"/.exec(m[0]);
    if (id && target) rels[id[1]] = target[1].replace(/^\/?(xl\/)?/, 'xl/');
  }
  const sheets = [];
  for (const m of str('xl/workbook.xml').matchAll(/<sheet [^>]*>/g)) {
    const name = decode(/name="([^"]*)"/.exec(m[0])[1]);
    const rid = /r:id="([^"]+)"/.exec(m[0]);
    const xml = str(rels[rid && rid[1]] || '');
    const rows = [];
    for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const col = [...c[1]].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const inner = c[3] || '', v = /<v>([\s\S]*?)<\/v>/.exec(inner);
        let val = '';
        if (/t="s"/.test(c[2]) && v) val = shared[+v[1]];
        else if (/t="inlineStr"/.test(c[2])) val = texts(inner);
        else if (v) val = decode(v[1]);
        row[col] = String(val).trim();
      }
      rows.push(row);
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

// ---------------- nhận diện cột ----------------
const norm = s => String(s || '').toLowerCase().normalize('NFC').trim();
const HEAD = {
  hanzi: ['hán tự', 'chữ hán', 'hanzi', 'từ', '漢字', '生詞'],
  pinyin: ['pinyin', 'phiên âm', '拼音'],
  hanViet: ['hán việt', 'âm hán việt'],
  meaning: ['nghĩa', 'nghĩa tiếng việt', 'meaning'],
  group: ['nhóm', 'chủ đề', 'group'],
  example: ['ví dụ', 'câu ví dụ', 'example', '例句'],
  structure: ['cấu trúc', 'mẫu câu', 'ngữ pháp', 'structure'],
  usage: ['ý nghĩa', 'cách dùng', 'giải thích', 'usage'],
  translation: ['dịch', 'dịch ví dụ', 'nghĩa ví dụ', 'bản dịch'],
};
function columns(header) {
  const idx = {};
  header.forEach((h, i) => {
    for (const [k, names] of Object.entries(HEAD)) if (idx[k] === undefined && names.includes(norm(h))) idx[k] = i;
  });
  return idx;
}

// ---------------- load data.js hiện tại ----------------
let src = fs.readFileSync(DATA, 'utf8');
const mod = new module.constructor();
mod._compile(src + '\n;module.exports = { UNITS, GRAMMAR };', DATA);
const { UNITS, GRAMMAR } = mod.exports;
const unit = UNITS.find(u => u.key === key);
if (!unit && !title) { console.log(`Bài ${key} chưa có — cần thêm tên bài, vd: "L8 · 春節"`); process.exit(1); }

const existingWords = new Set(unit ? unit.vocab.map(w => w.hanzi) : []);
const existingGrammar = new Set(GRAMMAR.map(g => g.structure));
const q = s => "'" + String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ') + "'";

const words = [], grammar = [], seen = new Set(existingWords);
let skipped = 0;
for (const sh of readWorkbook(path.resolve(file))) {
  if (!sh.rows.length) continue;
  const c = columns(sh.rows[0]);
  if (c.structure !== undefined && c.usage !== undefined) {
    for (const r of sh.rows.slice(1)) {
      const st = r[c.structure];
      if (!st) continue;
      if (existingGrammar.has(st)) { skipped++; continue; }
      existingGrammar.add(st);
      grammar.push({ structure: st, usage: r[c.usage] || '', ex: c.example !== undefined ? r[c.example] : '', tr: c.translation !== undefined ? r[c.translation] : '' });
    }
  } else if (c.hanzi !== undefined && c.pinyin !== undefined && c.meaning !== undefined) {
    for (const r of sh.rows.slice(1)) {
      const h = r[c.hanzi];
      if (!h) continue;
      if (seen.has(h)) { skipped++; continue; }
      seen.add(h);
      words.push({
        hanzi: h, pinyin: r[c.pinyin] || '', hanViet: c.hanViet !== undefined ? r[c.hanViet] : '',
        meaning: r[c.meaning] || '', group: (c.group !== undefined && r[c.group]) || sh.name,
        ex: c.example !== undefined ? r[c.example] : '',
        tr: c.translation !== undefined ? r[c.translation] : '',
      });
    }
  } else {
    console.log(`(bỏ qua sheet "${sh.name}" — không nhận ra tiêu đề cột)`);
  }
}

console.log(`${unit ? 'Thêm vào bài có sẵn' : 'Tạo bài mới'}: ${unit ? unit.title : title}`);
console.log(`  + ${words.length} từ vựng, + ${grammar.length} mẫu ngữ pháp, bỏ qua ${skipped} mục trùng`);
if (dry) { words.slice(0, 10).forEach(w => console.log('   ', w.hanzi, w.pinyin, '—', w.meaning)); console.log('(--dry: chưa ghi file)'); process.exit(0); }
if (!words.length && !grammar.length) { console.log('Không có gì mới để thêm.'); process.exit(0); }

// ---------------- ghi data.js ----------------
const wordLines = words.map(w => `  x(${[w.hanzi, w.pinyin, w.hanViet, w.meaning, w.group].map(q).join(', ')}${w.ex || w.tr ? ', ' + q(w.ex) : ''}${w.tr ? ', ' + q(w.tr) : ''}),`).join('\n');
const insertBefore = (marker, text) => {
  const i = src.indexOf(marker);
  if (i < 0) throw new Error('Không tìm thấy dấu mốc ' + marker + ' trong data.js');
  const lineStart = src.lastIndexOf('\n', i) + 1;
  src = src.slice(0, lineStart) + text + src.slice(lineStart);
};
const arrName = `VOCAB_${key}`;
if (words.length) {
  const decl = `const ${arrName} = [`;
  if (src.includes(decl)) {
    const close = src.indexOf('\n];', src.indexOf(decl));
    src = src.slice(0, close) + '\n' + wordLines + src.slice(close);
  } else {
    const block = `// ================================================================\n// ${title || key}\n// ================================================================\n${decl}\n${wordLines}\n];\n\n`;
    const at = src.indexOf('const UNITS = [');
    src = src.slice(0, at) + block + src.slice(at);
  }
}
if (!unit) {
  if (!src.includes(`const ${arrName} = [`)) src = src.replace('const UNITS = [', `const ${arrName} = [\n];\n\nconst UNITS = [`);
  insertBefore('// @@UNITS_END', `  { key: ${q(key)}, title: ${q(title)}, vocab: ${arrName} },\n`);
}
if (grammar.length) {
  insertBefore('// @@GRAMMAR_END', `  // ---- ${title || unit.title} ----\n` + grammar.map(g =>
    `  { structure: ${q(g.structure)}, usage: ${q(g.usage)}, lesson: ${q(key)},\n    examples: [${g.ex ? `ex(${q(g.ex)}, '', ${q(g.tr)})` : ''}] },`).join('\n') + '\n');
}

// kiểm tra data.js mới vẫn chạy được trước khi ghi
const check = new module.constructor();
check._compile(src + '\n;module.exports = { UNITS };', DATA);
fs.writeFileSync(DATA, src);

// tăng phiên bản cache để iPhone tải dữ liệu mới
if (fs.existsSync(SW)) {
  const sw = fs.readFileSync(SW, 'utf8');
  fs.writeFileSync(SW, sw.replace(/const VERSION = 'v(\d+)'/, (m, n) => `const VERSION = 'v${+n + 1}'`));
}
console.log('Đã cập nhật data.js ✔');
