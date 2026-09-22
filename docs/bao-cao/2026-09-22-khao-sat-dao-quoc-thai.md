# Khảo sát: bo Dao Quoc Thai 5pcs trên app

Ngày 22/09/2026 · Khảo sát xong được đồng ý sửa tất cả — **đã sửa ở `5a8b10f`** (kết quả ở cuối).

- **Bộ file:** `D:\JobDatMach\Dao Quoc Thai\2025\01-11\Dao Quoc Thai 5pcs.zip` — 9 file: Top/Bot
  Layer, Top/Bot Solder, Top Silk, Top Paste, `Outline.gbr`, `Drl.txt`, `SqDrl.txt` (inch).
- Lỗi mất lõi bo ở 2D/3D đã hết từ `dbbea67` (bộ này là một trong 3 bộ dính lỗi đó).

## Hiện app đang hiện

| | |
|---|---|
| Kích thước | **70.01 × 33.14 mm** |
| Khoan | `Drl.txt` · 54 lỗ (`SqDrl.txt` **không vẽ**) |
| Mũi nhỏ nhất | Ø0.711 mm (42 lỗ) · rãnh 0.80 mm |
| Ghép | không |

## Vấn đề 1 — mất 3 rãnh phay của `SqDrl.txt` (lỗi)

- `SqDrl.txt` (tên như "square drill") thực ra chứa **3 rãnh phay** Excellon `G00 → M15 → G01 → M16`,
  dao Ø0.80 mm:
  - rãnh ngang X 7.15 → 9.35 mm, Y 11.15 mm;
  - hai rãnh dọc X 4.95 mm và X 11.05 mm, Y 14.65 → 16.85 mm.
  Đúng chỗ các pad oval bên trái bo (chân jack / công tắc) — ở 2D các pad này chỉ có đồng, không
  có lỗ.
- **Nguyên nhân:** `isPartialDrillFile` (`identify.ts:356`) nhận file tách theo hình lỗ bằng tên
  `round/slot/rect/square(holes)`. "SqDrl" không khớp → `SqDrl.txt` bị coi là file khoan **gộp**
  như `Drl.txt`; viewer chỉ vẽ file gộp nhiều lỗ nhất (`Drl.txt`, 54 lỗ) → bỏ `SqDrl.txt`.
- Dòng "rãnh 0.80 mm" trên badge vẫn hiện vì phần đo mũi khoan đọc mọi file khoan — badge nói có
  rãnh nhưng hình không có.
- **Đề xuất:** coi file khoan **chỉ có lệnh phay** (có `M15`, không có lỗ khoan đơn) là file một phần
  → luôn vẽ kèm, bất kể tên. Bổ sung tên `sqdrl` / `sq` vào luật tên chỉ là vá riêng một kiểu đặt tên.
  Cần hồi quy corpus (số file khoan được vẽ, số lỗ) trước khi chốt.

## Vấn đề 2 — vùng tô trong `Outline.gbr` làm bo rộng thêm 3.7 mm (cần anh xác nhận)

- `Outline.gbr`: khung chữ nhật **66.28 × 33.14 mm**, cộng một **vùng tô G36** 6.30 × 18.00 mm
  (X 63.61 → 69.91 mm, Y 7.2 → 25.2 mm) nằm **vắt ngang mép phải** — nửa trong bo, nửa ngoài bo.
- App coi vùng này là một **thân bo thứ hai** (lưỡi nhô ra bên phải) → kích thước 70.01 mm, và
  2D/3D vẽ lưỡi đó.
- Hai cách hiểu:
  1. **Lưỡi bo thật** (vd đầu cắm / tai bo) → 70.01 mm là đúng.
  2. **Vùng phay bỏ** (khấc mép để lắp cổng) → bo thật 66.3 × 33.1 mm, khấc 6.3 × 18 mm ở mép phải
     phải là lỗ khoét, không phải thân bo.
- Không đủ thông tin để app tự chọn — cần anh xem với khách / file gốc. Giá bảng tra hiện theo
  70.01 mm (vẫn dưới 10 × 10 cm nên giá không đổi).

## Chuyện nhỏ

- Nét viền dùng aperture `D37` **không khai báo** trong file → CAM vẽ viền bằng nét mặc định rất
  dày (khung vàng dày). Chỉ ảnh hưởng hình CAM, không ảnh hưởng kích thước.
- `Drl.txt` khai mũi T1 Ø0.20 mm nhưng không dùng lỗ nào — mũi nhỏ nhất thật là Ø0.711 mm, badge đúng.

## Đã sửa (`5a8b10f`)

Anh chọn "sửa tất cả" — vùng ở mép phải được xử lý là **khấc phay bỏ** (khớp cách Altium xuất vùng
cắt bo; bo Anh Nhat cũng có vùng như vậy nằm trong bo và vẫn là lỗ khoét).

- **Rãnh:** file khoan chỉ có rãnh luôn vẽ kèm file gộp (`isSlotOnlyDrill`) → "Drl.txt, SqDrl.txt · 57 lỗ".
- **Khấc:** vòng nhỏ (≤ 10%) vắt ngang mép vòng lớn hơn là lỗ khoét, không tính vào kích thước →
  **66.28 × 33.14 mm**. Sau hồi quy dò thấy vùng chồng lộn xộn của panel lớn (PHAONUOC V3.9) và một
  vòng 17% (Driver_Lift) bị bắt nhầm → thêm giới hạn 10%, hai bộ đó trở lại như cũ.
- **Nét viền:** aperture chưa khai trong lớp viền → nét 0.1 mm.
- Hồi quy 523 bộ: 505 không đổi, 18 đổi — xem lỗi 20 trong `2026-09-22-bao-cao-loi.md`.
