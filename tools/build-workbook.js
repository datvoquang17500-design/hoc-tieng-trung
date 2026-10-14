#!/usr/bin/env node
// Dựng workbook.js từ các file nguồn trong content/workbook (sách bài tập 實用視聽華語).
//   node tools/build-workbook.js
//
// Mỗi bài một file W<sách>-<bài>.txt, ví dụ W4-03.txt:
//   #LESSON W4-03|PAVC4 · L3 你看不看電視
//   #SEC <kiểu>|<tiêu đề trong sách>|<hướng dẫn tiếng Việt>
// Các kiểu và cách viết mỗi dòng:
//   mcq    câu hỏi|đáp án 1|đáp án 2|…|vị trí đáp án đúng (đếm từ 0)[|ghi chú]
//          (dùng ＿＿ cho chỗ trống)
//   typo   câu có chữ sai đánh dấu [sai>đúng], vd: 這種工作又刺激又有[跳>挑]戰性。
//   order  các mảnh theo đúng thứ tự, cách nhau bằng /  (app sẽ xáo lên)
//   open   đề bài|đáp án gợi ý          (tự viết, tự chấm)
//   match  vế trái|vế phải đúng          (nối câu; app lấy vế phải của câu khác làm đáp án nhiễu)
//   Trắc nghiệm nhiều chỗ trống: đáp án viết "từ1／từ2" theo thứ tự các ＿＿.
// Dòng trống và dòng bắt đầu bằng // được bỏ qua.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'content', 'workbook');
const OUT = path.join(ROOT, 'workbook.js');
const TYPES = ['mcq', 'typo', 'order', 'open', 'match'];

const lessons = [];
const problems = [];
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.txt')).sort()) {
  let lesson = null, sec = null;
  fs.readFileSync(path.join(SRC, f), 'utf8').split(/\r?\n/).forEach((raw, n) => {
    const line = raw.trim();
    const where = `${f}:${n + 1}`;
    if (!line || line.startsWith('//')) return;
    if (line.startsWith('#LESSON ')) {
      const [id, title] = line.slice(8).split('|').map(s => s.trim());
      lesson = { id, title, sections: [] };
      lessons.push(lesson);
      return;
    }
    if (line.startsWith('#SEC ')) {
      const [type, title, hint] = line.slice(5).split('|').map(s => s.trim());
      if (!TYPES.includes(type)) problems.push(`${where}: kiểu lạ "${type}"`);
      sec = { id: `${lesson.id}-${lesson.sections.length + 1}`, type, title, hint: hint || '', items: [] };
      lesson.sections.push(sec);
      return;
    }
    if (!sec) return problems.push(`${where}: dòng nằm ngoài mục #SEC`);
    const c = line.split('|').map(s => s.trim());
    if (sec.type === 'mcq') {
      const hasNote = isNaN(+c[c.length - 1]);
      const note = hasNote ? c.pop() : '';
      const correct = +c.pop();
      const [prompt, ...options] = c;
      if (options.length < 2 || !(correct >= 0 && correct < options.length)) return problems.push(`${where}: trắc nghiệm sai định dạng`);
      sec.items.push({ prompt, options, correct, note });
    } else if (sec.type === 'typo') {
      // [sai>đúng] → câu hiển thị (chữ sai), vị trí chữ sai, câu đúng
      let shown = '', fixed = '';
      const wrong = [];
      const re = /\[([^>\]]+)>([^\]]+)\]|([^[]+)/g;
      let m;
      while ((m = re.exec(line))) {
        if (m[3]) { shown += m[3]; fixed += m[3]; continue; }
        if ([...m[1]].length !== [...m[2]].length) problems.push(`${where}: [${m[1]}>${m[2]}] khác số chữ`);
        [...m[1]].forEach((ch, i) => wrong.push([...shown].length + i));
        shown += m[1]; fixed += m[2];
      }
      if (!wrong.length) return problems.push(`${where}: chưa đánh dấu chữ sai [sai>đúng]`);
      sec.items.push({ text: shown, wrong, fixed });
    } else if (sec.type === 'order') {
      const tiles = line.split('/').map(s => s.trim()).filter(Boolean);
      if (tiles.length < 3) return problems.push(`${where}: câu sắp xếp quá ít mảnh`);
      sec.items.push({ tiles });
    } else if (sec.type === 'match') {
      if (c.length < 2) return problems.push(`${where}: nối câu thiếu vế phải`);
      sec.items.push({ prompt: c[0], answer: c[1] });
    } else if (sec.type === 'open') {
      if (c.length < 2) return problems.push(`${where}: thiếu đáp án gợi ý`);
      sec.items.push({ prompt: c[0], answer: c[1] });
    }
  });
}

// Nối câu → trắc nghiệm 4 lựa chọn: vế phải đúng + 3 vế phải của câu khác trong cùng phần
for (const l of lessons) for (const sec of l.sections) if (sec.type === 'match') {
  sec.type = 'mcq';
  sec.items = sec.items.map((it, k) => {
    const others = sec.items.filter((_, j) => j !== k).map(x => x.answer);
    const pick = others.slice(k % others.length).concat(others.slice(0, k % others.length)).slice(0, 3);
    const options = [it.answer, ...pick];
    return { prompt: it.prompt + '……', options, correct: 0, note: '' };
  });
}

const out = [
  '// TỰ SINH bởi tools/build-workbook.js từ content/workbook — đừng sửa tay, sửa file nguồn rồi chạy lại.',
  '// Bài tập từ sách bài tập 實用視聽華語 (Practical Audio-Visual Chinese Workbook). Đáp án do người soạn app biên soạn.',
  `const WORKBOOK = ${JSON.stringify(lessons, null, 1)};`,
  '',
];
fs.writeFileSync(OUT, out.join('\n'));
for (const l of lessons) console.log(`${l.id}: ${l.sections.map(s => `${s.type}×${s.items.length}`).join(', ')}`);
console.log(`→ ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
if (problems.length) { console.log(`\n${problems.length} lỗi:`); problems.forEach(p => console.log('  ' + p)); process.exitCode = 1; }
