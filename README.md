# Học tiếng Trung — hướng dẫn mở rộng

Mở `index.html` để dùng. Toàn bộ nội dung học nằm trong **`data.js`**; mỗi bài là **một mục** (L1, L2, …).

## Cách app ghi nhớ tiến độ

- **Đã thuộc:** bấm "Đã thuộc" trên thẻ (hoặc tick trong Danh sách). Từ đó bắt đầu lịch ôn.
- **Thẻ từ:** chọn "Tất cả các bài" thì thẻ luôn được xáo ngẫu nhiên; chọn một bài thì theo thứ tự trong bài. Lật thẻ là app tự đọc từ.
- **Lịch ôn:** từ đã thuộc được nhắc lại sau **1 → 3 → 7 → 14 → 28 → 60 ngày**. Khi đến hạn, Tổng quan hiện "N từ đến hạn ôn", tab Thẻ từ có số đỏ. Ôn ở bộ lọc **Cần ôn**: "Vẫn nhớ" thì lên mốc kế tiếp, "Quên rồi" thì quay về mốc 1 ngày. Qua mốc 60 ngày là **Thành thạo**, không nhắc nữa.
- **Hoàn thành bài:** thuộc hết từ trong bài thì bài được đánh dấu Hoàn thành và giữ nguyên trạng thái đó. Muốn học lại từ đầu thì bấm **Học lại** (ở Tổng quan hoặc tab Thẻ từ). Việc này xoá trạng thái đã thuộc và lịch ôn của các từ trong bài.
- Nhắc ôn chỉ hiện **trong app**. Web app trên iPhone không tự gửi thông báo khi đang đóng.

## Đồng bộ đám mây (GitHub Gist)

Mục **Đồng bộ & sao lưu** ở cuối tab Tổng quan:

1. Bấm "Cách lấy mã truy cập", rồi mở trang tạo mã của GitHub (ô **gist** đã được tick sẵn). Chọn Expiration **No expiration**, bấm **Generate token** và copy mã `ghp_…`.
2. Dán mã vào ô, bấm **Kết nối**. App tự tạo 1 gist bí mật tên `hoc-tieng-trung-tien-do.json`.
3. Máy khác: dán **cùng mã** đó, app tự tìm gist và gộp tiến độ.

- Tự gửi lên sau khoảng 15 giây kể từ thay đổi cuối, và ngay khi thoát app. Mở app thì tự tải bản mới về.
- Gộp **theo từng từ / từng bài**: thay đổi nào mới hơn thì được giữ. Đánh dấu, bỏ đánh dấu, ôn tập, Học lại, khôi phục bản cũ đều được truyền sang máy kia. Trước khi một lần đồng bộ làm mất từ trên máy, app tự giữ 1 bản lưu "Trước khi đồng bộ".
- Mất mạng vẫn học bình thường, có mạng lại thì app tự gửi.
- Mã chỉ có quyền gist, lưu trên máy (không nằm trong file sao lưu). **Ngắt kết nối** để xoá mã khỏi máy. Thu hồi mã: GitHub → Settings → Developer settings → Personal access tokens.

## Sao lưu tiến độ

Tiến độ lưu trên máy đang dùng. Ngoài đồng bộ đám mây, phần **Đồng bộ & sao lưu** còn có:

- **Sao lưu ra file:** trên iPhone mở bảng Chia sẻ, chọn **Lưu vào Tệp** (nên chọn iCloud Drive). Trên máy tính thì tải file `hoc-tieng-trung-NGÀY.json` về.
- **Khôi phục:** chọn file sao lưu, app hỏi xác nhận rồi thay tiến độ hiện tại. Dùng khi đổi máy hoặc lỡ xoá app.
- **Bản lưu tự động trên máy:** mỗi ngày 1 bản, kèm 1 bản trước khi bấm Học lại hoặc Khôi phục. Giữ 10 bản gần nhất, bấm **Quay lại** để trở về. Các bản này nằm trên máy nên sẽ mất nếu xoá app.
- **Nhắc sao lưu:** đã ≥ 7 ngày chưa sao lưu mà tiến độ có thay đổi thì Tổng quan hiện thẻ nhắc ("Để sau" sẽ hoãn 3 ngày).

## Sách 實用視聽華語 (PAVC) 4 & 5

Nội dung lấy từ sách nằm trong thư mục **`content/pavc/`**, mỗi bài là một hoặc hai file văn bản (`P4-03.txt`: bài khoá + câu hỏi; `P4-03.v.txt`: từ vựng + ngữ pháp). Định dạng ghi ở đầu `tools/build-pavc.js`. Sửa hoặc thêm file rồi chạy:

```
node tools/build-pavc.js     # dựng lại data-pavc.js
```

Sau đó tăng `VERSION` trong `sw.js` và đẩy lên như mục 3. Bài 1–2 của PAVC4 trùng với L7–L9 đã có nên không nhập lại.

### Bài tập sách (Workbook)

Tab Ôn tập → **Bài tập sách**. Nguồn nằm ở `content/workbook/` (mỗi bài một file `W4-xx.txt`), gồm các kiểu: trắc nghiệm, tìm chữ sai, sắp xếp câu, nối câu, tự luận. Định dạng ghi ở đầu `tools/build-workbook.js`. Sửa xong chạy:

```
node tools/build-workbook.js     # dựng lại workbook.js
```

Điểm cao nhất mỗi phần được lưu và đồng bộ cùng tiến độ.

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

## 3. Đưa lên mạng (GitHub Pages)

App chạy tại **https://datvoquang17500-design.github.io/hoc-tieng-trung/**, lấy code từ repo
https://github.com/datvoquang17500-design/hoc-tieng-trung (nhánh `main`).

Sau khi thêm bài hoặc sửa app, đẩy code lên là site tự cập nhật sau khoảng 1 phút:

```
git add -A
git commit -m "Thêm bài L10"
git push
```

- Các file Excel, `_old/` và `deploy/` không được đưa lên (xem `.gitignore`). Repo là công khai.
- Trên iPhone: mở link bằng Safari → Chia sẻ → **Thêm vào MH chính**. Sau mỗi lần cập nhật, mở app bằng icon 學 **hai lần** để thấy bản mới.
- Tiến độ học lưu riêng trên từng máy và không mất khi cập nhật.
