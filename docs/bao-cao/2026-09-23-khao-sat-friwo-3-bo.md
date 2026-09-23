# Khảo sát: 3 bộ FRIWO ngày 23/09 hiển thị không đúng

Ngày 23/09/2026 · Khảo sát xong được đồng ý sửa tất cả — **đã sửa ở `7b90b45`, `e52458f`** (kết quả ở cuối).

- **Thư mục:** `D:\JobDatMach\FRIWO\2026\23-09\FRIWO\`
  - `FRIWO 0.8mm 5pcs 55807.930-90FE.zip`
  - `FRIWO 40pcs ma vang P84241-S02.zip`
  - `FRIWO 40pcs ma vang P84390-S02.zip`
- Cả ba là bản xuất Pulsonix của FRIWO: lớp viền tên `(Keep Out)`, file khoan `(Drilling Data).drl`,
  kèm một ảnh `PCB_Spec*.png` ghi yêu cầu của khách (app đang bỏ qua ảnh này).

## Số đo

| | 55807.930-90FE | P84241-S02 | P84390-S02 |
|---|---|---|---|
| Đọc file | 0.9 s | 0.7 s | **9.7 s** |
| Dựng hình (CAM, lần đầu) | 2.4 s | 3.7 s | **198 s** |
| Kích thước app đọc | 164.50 × 168.00 mm | 170.00 × 199.00 mm | 185.23 × 205.66 mm |
| Lớp đồng trong file | 2 (top + bot) | **1 (chỉ bot)** | 2 |
| App ghi số lớp | 2 | **2** | 2 |
| Khoan | 841 lỗ | 108 lỗ | 1139 lỗ |
| Cách đọc file khoan | đoán `div5`, khớp pad 96% | đoán `div3`, khớp pad 96% | đoán `div5`, khớp pad 99% |
| Ghép | Có — 15 bo (5×3), lụa + đồng lặp 100% | Có — 2 bo (viền rời) | Có — 2 bo (viền rời) |
| Hình lớp in lụa | 1.140 / 5.835 | 3.019 / 19.424 | **150.500 / 85.570** |

## Lỗi 1 — P84390-S02 treo app ~3 phút và mất lớp in lụa mặt trên (nặng nhất)

- Console: `[WebGL] lỗi lớp P84390-S02)(Silkscreen Top Side).gbr — RangeError: Array buffer
  allocation failed`, rồi `[WebGL] dựng top/CAM: 198179 ms`.
- Lớp in lụa mặt trên có **150.500 hình** (file 6.4 MB), mặt dưới 85.570 hình. Dựng hết bộ nhớ →
  lớp đó không vẽ được; các lớp còn lại vẫn vẽ nhưng mất hơn 3 phút, suốt thời gian đó app đứng
  hình, không bấm được gì (dựng hình chạy đồng bộ).
- **Làm nặng thêm:** phần dựng sẵn ở nền (`schedulePrebuild`, thêm hôm 22/09) dựng lại đúng lớp
  đó ở nền và cũng lỗi; lớp lỗi KHÔNG được ghi vào cache nên mỗi lần đổi chế độ / đổi bo lại
  dựng lại từ đầu.
- **Đề xuất:**
  1. Lớp quá nặng (vd > 50.000 hình) thì không dựng, hiện rõ trên badge "lớp in lụa quá nặng —
     tạm không vẽ", có nút bật vẽ nếu vẫn muốn chờ.
  2. Dựng lỗi thì ghi nhớ là "đã thử, hỏng" để không dựng lại mỗi lần; dựng sẵn ở nền bỏ qua các
     lớp quá nặng.
  3. Xem lại cách dựng lớp in lụa nhiều hình (gộp hình học theo lô) — việc lớn hơn, cần đo riêng.

## Lỗi 2 — Bo một mặt vẫn ghi 2 lớp

- `P84241-S02` chỉ có **một lớp đồng** (Copper Bottom Side); ảnh thông số của khách ghi
  **"Layers: Single side"**. App vẫn ghi "FR4 · 2 lớp" (mặc định) → giá tính theo bo 2 lớp.
- **Đề xuất:** số lớp mặc định lấy theo **số lớp đồng đọc được** (1 lớp khi chỉ có một mặt đồng),
  người lập vẫn sửa tay được như hiện nay.

## Việc 3 — Ảnh thông số của khách bị bỏ qua

Mỗi bộ có một ảnh PNG ghi yêu cầu, app xếp vào "file phụ trợ đã bỏ qua":

| Bộ | Khách ghi trong ảnh | App đang mặc định |
|---|---|---|
| 55807.930-90FE | 2 lớp · **0.8 mm** · HASL không chì · 5 pcs · panel theo file | 2 lớp · 1.6 mm · HASL chì |
| P84241-S02 | **1 lớp** · 1.6 mm · **ENIG** · 40 pcs | 2 lớp · 1.6 mm · HASL chì |
| P84390-S02 | 2 lớp · 1.6 mm · **mạ vàng** · 40 pcs | 2 lớp · 1.6 mm · HASL chì |

- **Đề xuất:** khi bộ file có ảnh tên `*spec*` / `*specification*`, hiện nút xem ảnh ngay trong
  thẻ thông tin bo để người lập đối chiếu (không tự đọc chữ trong ảnh).

## Cần anh xác nhận

- `P84241-S02` và `P84390-S02` app đọc ra **2 bo** (hai vòng viền rời). Khách đặt 40 pcs và ghi
  "panel as FRIWO's files". Hai bo đó là đúng số bo trên tấm, hay tấm còn nhiều bo mà viền không
  vẽ rời từng bo? (`55807.930` thì app đọc ra 15 bo 5×3, khớp kiểu panel.)
- Nếu đúng 2 bo/tấm thì số lượng nhập theo set: 40 pcs = 20 set.

## Đã sửa (`7b90b45`, `e52458f`)

| | Trước | Sau |
|---|---|---|
| Mở P84390-S02 | dựng 198 s, treo app, lụa trên lỗi hết bộ nhớ | **9.3 s** (dựng 3.7 s) |
| P84241-S02 số lớp | 2 | **1** |
| P84241 / P84390 số bo | 2 | **1** |
| Kích thước P84390 | 185.23 × 205.66 | **170.00 × 199.00 mm** |

- Lớp > 50.000 hình: **tự ráp một lưới tam giác cho cả lớp** (`bf511b8`, `fastLayer.ts`) thay
  cho `renderThree`. Lụa mặt dưới 85.570 hình: 102.5 triệu đỉnh → **758.766 đỉnh**; mở cả bộ
  75.3 s → **9.0 s**; bộ nhớ trang 4.5 GB → **1.2 GB**. Vẽ đủ cả hai lớp lụa, phóng to đọc
  được chữ. Đánh đổi: đầu nét vuông, hình phẳng, bỏ hình đảo cực.
- Lớp dựng lỗi được ghi nhớ (không dựng lại mỗi lần); dựng sẵn ở nền bỏ qua lớp nặng.
- Số lớp theo lớp đồng đọc được; khung bao một bo không tính là bo; kích thước chỉ theo vòng
  thân bo (bỏ chữ / nét chú thích trong lớp viền).
- Nút "Xem ảnh thông số của khách" trong thẻ thông tin bo.
- Hồi quy 521 bộ: 495 không đổi, 26 đổi (12 bộ về 1 lớp, vài bộ kích thước bỏ phần chú thích,
  khung không còn tính là bo, 2 bộ trước đếm bo hỏng nay ra 3). 186 test pass.
- Tấm 55807.930 vẫn đọc 15 bo (5 × 3) — ảnh có 30 hình tròn nhưng mỗi bo gồm 2 hình tròn.
