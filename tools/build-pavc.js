#!/usr/bin/env node
// Dựng data-pavc.js từ các file nguồn trong content/pavc (sách 實用視聽華語 4 & 5).
//   node tools/build-pavc.js
//
// Mỗi bài có một hoặc nhiều file <MÃ BÀI>*.txt (ví dụ P4-03.txt, P4-03.v.txt), các mục:
//   #UNIT P4-03|PAVC4 · L3 你看不看電視
//   #CONVO <tiêu đề>            → mỗi dòng: người nói|câu tiếng Trung|dịch   (người nói để trống = dòng dẫn cảnh / đoạn văn)
//   #Q                          → câu hỏi|đáp án 1|đáp án 2|đáp án 3|đáp án 4|vị trí đáp án đúng (đếm từ 0)
//   #VOCAB                      → chữ Hán|pinyin|Hán Việt|từ loại|nghĩa|câu ví dụ|dịch câu ví dụ
//   #GRAMMAR                    → mẫu câu|giải thích|ví dụ 1|dịch 1|ví dụ 2|dịch 2…
// Dòng trống và dòng bắt đầu bằng // được bỏ qua.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'content', 'pavc');
const OUT = path.join(ROOT, 'data-pavc.js');

const POS = {
  N: 'danh từ', V: 'động từ', SV: 'tính từ', VO: 'động từ li hợp', A: 'phó từ', IE: 'cụm cố định',
  CONJ: 'liên từ', M: 'lượng từ', AT: 'định ngữ', PREP: 'giới từ', IDIOM: 'thành ngữ', PH: 'cụm từ',
  NU: 'số từ', DEM: 'chỉ thị từ', PRO: 'đại từ', P: 'trợ từ', RE: 'bổ ngữ kết quả', BF: 'hình vị',
};
const posLabel = p => (p || '').split('/').map(s => POS[s.trim()] || s.trim()).filter(Boolean).join(' / ');

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.txt')).sort();
const units = new Map(); // key → { key, title, vocab, grammar, convos }
const problems = [];

for (const f of files) {
  const key = f.split('.')[0];
  if (!units.has(key)) units.set(key, { key, title: key, vocab: [], grammar: [], convos: [] });
  const u = units.get(key);
  let sec = null;
  fs.readFileSync(path.join(SRC, f), 'utf8').split(/\r?\n/).forEach((raw, n) => {
    const line = raw.trim();
    const where = `${f}:${n + 1}`;
    if (!line || line.startsWith('//')) return;
    if (line.startsWith('#')) {
      const [tag, ...rest] = line.slice(1).split(' ');
      const arg = rest.join(' ').trim();
      sec = tag;
      if (tag === 'UNIT') { const [k, t] = arg.split('|'); if (k !== key) problems.push(`${where}: mã bài ${k} khác tên file`); u.title = t; }
      else if (tag === 'CONVO') u.convos.push({ title: arg, lines: [], questions: [] });
      else if (!['Q', 'VOCAB', 'GRAMMAR'].includes(tag)) problems.push(`${where}: mục lạ #${tag}`);
      return;
    }
    const c = line.split('|').map(s => s.trim());
    if (sec === 'CONVO') {
      if (c.length < 2) return problems.push(`${where}: dòng hội thoại thiếu cột`);
      u.convos[u.convos.length - 1].lines.push({ speaker: c[0], zh: c[1], pinyin: '', en: c[2] || '' });
    } else if (sec === 'Q') {
      const conv = u.convos[u.convos.length - 1];
      const correct = +c[c.length - 1];
      const options = c.slice(1, -1);
      if (!conv || options.length < 2 || !(correct >= 0 && correct < options.length)) return problems.push(`${where}: câu hỏi sai định dạng`);
      conv.questions.push({ prompt: c[0], options, correct });
    } else if (sec === 'VOCAB') {
      if (c.length < 5 || !c[0] || !c[1] || !c[4]) return problems.push(`${where}: từ vựng thiếu cột`);
      if (c[5] && c[0].length && !c[5].includes(c[0]) && !/[…]/.test(c[0])) problems.push(`${where}: ví dụ không chứa "${c[0]}" (bỏ qua được)`);
      if (u.vocab.some(w => w.hanzi === c[0])) return;
      u.vocab.push([c[0], c[1], c[2] || '', c[4], posLabel(c[3]), c[5] || '', c[6] || '']);
    } else if (sec === 'GRAMMAR') {
      if (c.length < 2) return problems.push(`${where}: ngữ pháp thiếu cột`);
      const examples = [];
      for (let i = 2; i < c.length; i += 2) if (c[i]) examples.push([c[i], c[i + 1] || '']);
      u.grammar.push({ structure: c[0], usage: c[1], examples });
    } else problems.push(`${where}: dòng nằm ngoài mục nào`);
  });
}

const J = v => JSON.stringify(v);
const out = [];
out.push('// TỰ SINH bởi tools/build-pavc.js từ content/pavc — đừng sửa tay, sửa file nguồn rồi chạy lại.');
out.push('// Sách 實用視聽華語 (Practical Audio-Visual Chinese) 4 & 5.');
out.push('(function () {');
for (const u of units.values()) {
  out.push(`  // ---- ${u.title}`);
  out.push(`  UNITS.push({ key: ${J(u.key)}, title: ${J(u.title)}, vocab: [`);
  u.vocab.forEach(w => out.push(`    x(${w.map(J).join(', ')}),`));
  out.push('  ] });');
  u.grammar.forEach(g => out.push(`  GRAMMAR.push({ structure: ${J(g.structure)}, usage: ${J(g.usage)}, lesson: ${J(u.key)}, examples: [${g.examples.map(e => `ex(${J(e[0])}, '', ${J(e[1])})`).join(', ')}] });`));
  u.convos.forEach(cv => out.push(`  CONVERSATIONS.push(${J(cv)});`));
}
out.push('})();');
out.push('');
fs.writeFileSync(OUT, out.join('\n'));

const sum = [...units.values()].map(u => `${u.key}: ${u.vocab.length} từ, ${u.grammar.length} ngữ pháp, ${u.convos.reduce((s, c) => s + c.lines.length, 0)} câu hội thoại, ${u.convos.reduce((s, c) => s + c.questions.length, 0)} câu hỏi`);
console.log(sum.join('\n'));
console.log(`→ ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
if (problems.length) { console.log(`\n${problems.length} lưu ý:`); problems.forEach(p => console.log('  ' + p)); }
