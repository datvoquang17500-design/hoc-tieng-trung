# Học tiếng Trung — hướng dẫn mở rộng

Mở `index.html` để dùng. Toàn bộ nội dung học nằm trong **`data.js`**; mỗi bài là **một mục** (L1, L2, …).

## Cách app ghi nhớ tiến độ

- **Đã thuộc:** bấm "Đã thuộc" trên thẻ (hoặc tick trong Danh sách). Từ đó bắt đầu lịch ôn.
- **Lịch ôn:** từ đã thuộc được nhắc lại sau **1 → 3 → 7 → 14 → 28 → 60 ngày**. Khi đến hạn, Tổng quan hiện "N từ đến hạn ôn", tab Thẻ từ có số đỏ. Ôn ở bộ lọc **Cần ôn**: "Vẫn nhớ" thì lên mốc kế tiếp, "Quên rồi" thì quay về mốc 1 ngày. Qua mốc 60 ngày là **Thành thạo**, không nhắc nữa.
- **Hoàn thành bài:** thuộc hết từ trong bài thì bài được đánh dấu Hoàn thành và giữ nguyên trạng thái đó. Muốn học lại từ đầu thì bấm **Học lại** (ở Tổng quan hoặc tab Thẻ từ). Việc này xoá trạng thái đã thuộc và lịch ôn của các từ trong bài.
- Nhắc ôn chỉ hiện **trong app**. Web app trên iPhone không tự gửi thông báo khi đang đóng.

## Sao lưu tiến độ

Tiến độ chỉ lưu trên máy đang dùng (không có máy chủ). Phần **Sao lưu dữ liệu** ở cuối tab Tổng quan có:

- **Sao lưu ra file:** trên iPhone mở bảng Chia sẻ, chọn **Lưu vào Tệp** (nên chọn iCloud Drive). Trên máy tính thì tải file `hoc-tieng-trung-NGÀY.json` về.
- **Khôi phục:** chọn file sao lưu, app hỏi xác nhận rồi thay tiến độ hiện tại. Dùng khi đổi máy hoặc lỡ xoá app.
- **Bản lưu tự động trên máy:** mỗi ngày 1 bản, kèm 1 bản trước khi bấm Học lại hoặc Khôi phục. Giữ 10 bản gần nhất, bấm **Quay lại** để trở về. Các bản này nằm trên máy nên sẽ mất nếu xoá app.
- **Nhắc sao lưu:** đã ≥ 7 ngày chưa sao lưu mà tiến độ có thay đổi thì Tổng quan hiện thẻ nhắc ("Để sau" sẽ hoãn 3 ngày).

## 1. Thêm bài mới từ Excel (cách nhanh nhất)

Chuẩn bị file Excel, hàng 1 là tiêu đề cột:

| Sheet từ vựng | Hán tự | Pinyin | Hán Việt | Nghĩa | Nhóm | Ví dụ | Dịch |
|---|---|---|---|---|---|---|---|
| bắt buộc | ✔ | ✔ | | ✔ | | | |

| Sheet ngữ pháp | Cấu trúc | Ý nghĩa | Ví dụ | Dịch |
|---|---|---|---|---|
| bắt buộc | ✔ | ✔ | | |

- Được để nhiều sheet trong một file. Nếu không có cột *Nhóm*, app lấy tên sheet làm nhóm. Từ trùng sẽ tự bỏ qua.
- *Ví dụ* nên chứa đúng từ cần học: app dùng câu này cho dạng câu hỏi "điền từ vào chỗ trống". *Dịch* là nghĩa tiếng Việt của câu ví dụ.

Mở terminal trong thư mục app rồi chạy:

```
node tools/import-excel.js bai10.xlsx L10 "L10 · 春節" --dry    # xem trước
node tools/import-excel.js bai10.xlsx L10 "L10 · 春節"          # ghi vào data.js
```

- Nếu mã bài **chưa có** thì tạo bài mới. Nếu **đã có** (ví dụ `L7`) thì thêm vào đúng bài đó (không cần tên bài).
- Công cụ tự tăng `VERSION` trong `sw.js` để iPhone tải dữ liệu mới.

## 2. Sửa tay trong `data.js`

- **Từ vựng:** thêm một dòng vào mảng `VOCAB_Lx`:
  - `v('漢字', 'pīnyīn', 'nghĩa', 'câu ví dụ', [['đồng nghĩa','pinyin','nghĩa']], [['trái nghĩa','pinyin','nghĩa']])`
  - hoặc `x('漢字', 'pīnyīn', 'Hán Việt', 'nghĩa', 'nhóm', 'câu ví dụ', 'dịch câu ví dụ')`
- **Bài mới:** tạo `const VOCAB_L10 = [ ... ];`, rồi thêm `{ key: 'L10', title: 'L10 · …', vocab: VOCAB_L10 },` vào phía trên dòng `// @@UNITS_END`.
- **Ngữ pháp:** thêm vào phía trên dòng `// @@GRAMMAR_END`:
  `{ structure: '…', usage: '…', lesson: 'L10', examples: [ex('câu ví dụ', '', 'bản dịch')] },`
- **Hội thoại:** thêm vào phía trên dòng `// @@CONVERSATIONS_END`:
  ```js
  { title: 'L10 · …', lines: [
      { speaker: 'A', zh: '…', pinyin: '', en: 'bản dịch (không bắt buộc)' },
    ], questions: [
      { prompt: 'câu hỏi?', options: ['đáp án 1', 'đáp án 2', 'đáp án 3', 'đáp án 4'], correct: 0 },  // correct = vị trí đáp án đúng, đếm từ 0
    ] },
  ```
- Sửa tay xong thì tăng `VERSION` trong `sw.js` (ví dụ v6 → v7).

Tab Thẻ từ, Ôn tập, Tổng quan và bộ lọc Ngữ pháp tự nhận bài mới, không cần sửa code.

## 3. Đưa lên iPhone

Tạo lại thư mục `deploy/` rồi kéo thả lên Netlify (site → *Deploys*):

```
rm -rf deploy && mkdir deploy && cp index.html app.js data.js styles.css sw.js manifest.webmanifest icon.svg icon-180.png icon-512.png deploy/
```

Trên iPhone mở app bằng icon 學 **hai lần** để thấy bản mới. Tiến độ học lưu riêng trên từng máy và không mất khi cập nhật.
