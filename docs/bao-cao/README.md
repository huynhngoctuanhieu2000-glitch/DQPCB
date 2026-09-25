# Báo cáo — DQPCB

Thư mục ghi lại lỗi đã gặp, cách xử lý và vấn đề còn tồn, theo từng đợt làm việc.
Mỗi báo cáo gắn với bộ file thật trong `D:\JobDatMach` để kiểm lại được.

| File | Nội dung |
|---|---|
| **[Bao-cao-DQPCB-2026-09-22.docx](Bao-cao-DQPCB-2026-09-22.docx)** | **Bản Word đầy đủ**: báo cáo lỗi, tính năng hiện có, định dạng file, outline/drill/slot, vấn đề còn tồn. Dựng bằng `build-docx.js` |
| [2026-09-22-bao-cao-loi.md](2026-09-22-bao-cao-loi.md) | Lỗi đợt 21–22/09/2026: lỗi · nguyên nhân · cách giải quyết · vấn đề còn tồn |
| [2026-09-22-khao-sat-cong-thuc-gia-L2.md](2026-09-22-khao-sat-cong-thuc-gia-L2.md) | Khảo sát (không sửa code): công thức giá bo 2 lớp mới so với code, ví dụ Anh Toan / Do Huynh, bảng chênh lệch |
| [2026-09-22-khao-sat-chuyen-bo-cham.md](2026-09-22-khao-sat-chuyen-bo-cham.md) | Khảo sát + đã sửa: chuyển qua lại giữa các bo đang mở chậm 0.5–3.3 s → ~0.05 s (cache theo bo, màn chờ, dựng sẵn ở nền) |
| [2026-09-22-danh-gia-ux-nut-bam.md](2026-09-22-danh-gia-ux-nut-bam.md) | Đánh giá (không sửa code): nút bấm và thao tác — vùng chạm, nút phá huỷ, tương phản, điện thoại; kèm thứ tự nên sửa |
| [2026-09-22-khao-sat-anh-nhat.md](2026-09-22-khao-sat-anh-nhat.md) | Khảo sát + đã sửa (`dbbea67`): bo Anh Nhat mất lõi bo ở 2D/3D — vùng tô trong lớp viền làm khung bo bị gán sai kiểu; 2 bộ khác cũng dính |
| [2026-09-22-khao-sat-dao-quoc-thai.md](2026-09-22-khao-sat-dao-quoc-thai.md) | Khảo sát + đã sửa (`5a8b10f`): bo Dao Quoc Thai 5pcs — mất 3 rãnh phay của SqDrl.txt; khấc ở mép phải tính thành thân bo (70.01 → 66.28 mm); nét viền dày |
| [2026-09-23-khao-sat-friwo-3-bo.md](2026-09-23-khao-sat-friwo-3-bo.md) | Khảo sát + đã sửa (`7b90b45`, `e52458f`): 3 bộ FRIWO 23/09 — lớp in lụa 150k hình treo app; bo một mặt ghi 2 lớp; khung bao bo tính là bo; chữ trong lớp viền cộng vào kích thước |
| [2026-09-24-khao-sat-friwo-2-bo-con-lai.md](2026-09-24-khao-sat-friwo-2-bo-con-lai.md) | Khảo sát + đã sửa (`a6a79fc`): 2 bộ FRIWO còn lại — vòng nhỏ trong thân bo (nửa bo V-cut, chữ chú thích trong lớp viền) bị coi là lỗ phay nên khoét thủng ở 2 Mặt/2D/3D |
| [2026-09-24-khao-sat-vang-app-va-bo-dem.md](2026-09-24-khao-sat-vang-app-va-bo-dem.md) | Khảo sát + đã sửa (`a6a79fc`): điện thoại văng khi mở file nặng (144 KB → 14,3 triệu đỉnh, 529 MB) và bộ "Bo Dem" có 3 bo rời nhưng không báo file ghép (luật bỏ vòng nhỏ hơn 10%) |
| [2026-09-24-bao-gia-excel-in-khac-pdf.md](2026-09-24-bao-gia-excel-in-khac-pdf.md) | Đã sửa (`a6fbb71`): file Excel tải về in ra khác PDF xuất thẳng — cột rộng gấp 1.8 lần, cỡ chữ ghi bằng point nên in co còn nửa trang; mã QR chồng nhau |
| [2026-09-25-chu-in-lua-rong-ruot.md](2026-09-25-chu-in-lua-rong-ruot.md) | Khảo sát + đã sửa: chữ in lụa chỉ còn viền rỗng (bo nhỏ nhìn như mất chữ) — lớp in lụa chuyển sang vẽ bằng lưới nhanh; và lưới nhanh bị cull mất mặt sau |
| [dinh-dang-file.md](dinh-dang-file.md) | App đang đọc được những định dạng nào, nhận diện lớp theo thứ tự nào |
| [outline-drill-slot.md](outline-drill-slot.md) | Quan trọng: cách đọc viền bo (outline), lỗ khoan (drill) và lỗ slot/rãnh |

Quy ước khi thêm báo cáo mới:

- Tên file `YYYY-MM-DD-<chủ đề>.md`.
- Mỗi lỗi ghi: bộ file gặp lỗi (đường dẫn), hiện tượng, nguyên nhân, cách sửa, commit, cách
  kiểm (test / hồi quy corpus), và cái gì CHƯA xử lý.
- Hai file `dinh-dang-file.md` và `outline-drill-slot.md` là tài liệu sống — sửa luật đọc
  file ở `src/lib/gerber-reader` thì cập nhật luôn ở đây.
