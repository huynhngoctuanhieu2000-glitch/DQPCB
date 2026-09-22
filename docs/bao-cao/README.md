# Báo cáo — DQPCB

Thư mục ghi lại lỗi đã gặp, cách xử lý và vấn đề còn tồn, theo từng đợt làm việc.
Mỗi báo cáo gắn với bộ file thật trong `D:\JobDatMach` để kiểm lại được.

| File | Nội dung |
|---|---|
| **[Bao-cao-DQPCB-2026-09-22.docx](Bao-cao-DQPCB-2026-09-22.docx)** | **Bản Word đầy đủ**: báo cáo lỗi, tính năng hiện có, định dạng file, outline/drill/slot, vấn đề còn tồn. Dựng bằng `build-docx.js` |
| [2026-09-22-bao-cao-loi.md](2026-09-22-bao-cao-loi.md) | Lỗi đợt 21–22/09/2026: lỗi · nguyên nhân · cách giải quyết · vấn đề còn tồn |
| [2026-09-22-khao-sat-cong-thuc-gia-L2.md](2026-09-22-khao-sat-cong-thuc-gia-L2.md) | Khảo sát (không sửa code): công thức giá bo 2 lớp mới so với code, ví dụ Anh Toan / Do Huynh, bảng chênh lệch |
| [2026-09-22-khao-sat-chuyen-bo-cham.md](2026-09-22-khao-sat-chuyen-bo-cham.md) | Khảo sát + đã sửa: chuyển qua lại giữa các bo đang mở chậm 0.5–3.3 s → ~0.05 s (cache theo bo, màn chờ, dựng sẵn ở nền) |
| [dinh-dang-file.md](dinh-dang-file.md) | App đang đọc được những định dạng nào, nhận diện lớp theo thứ tự nào |
| [outline-drill-slot.md](outline-drill-slot.md) | Quan trọng: cách đọc viền bo (outline), lỗ khoan (drill) và lỗ slot/rãnh |

Quy ước khi thêm báo cáo mới:

- Tên file `YYYY-MM-DD-<chủ đề>.md`.
- Mỗi lỗi ghi: bộ file gặp lỗi (đường dẫn), hiện tượng, nguyên nhân, cách sửa, commit, cách
  kiểm (test / hồi quy corpus), và cái gì CHƯA xử lý.
- Hai file `dinh-dang-file.md` và `outline-drill-slot.md` là tài liệu sống — sửa luật đọc
  file ở `src/lib/gerber-reader` thì cập nhật luôn ở đây.
