# Khảo sát: hai bộ FRIWO còn lại + chữ "Non-plated holes" bị khoét thủng

Ngày 24/09/2026 · Khảo sát xong được đồng ý sửa — **đã sửa ở `a6a79fc`** (kết quả ở cuối).

- **Thư mục:** `D:\JobDatMach\FRIWO\2026\23-09\FRIWO\`
  - `FRIWO 0.8mm 5pcs 55807.930-90FE.zip`
  - `FRIWO 40pcs ma vang P84241-S02.zip`
- Kiểm sau khi sửa lớp nặng ngày 23/09 (`bf511b8`, `2316510`), kèm ảnh anh gửi: chữ
  **"Non-plated holes"** của bộ `P84390-S02` hiện thành cục ở chế độ 2D.

## Kết quả nhanh

| | 55807.930-90FE | P84241-S02 |
|---|---|---|
| Mở file | 10.1 s | 14.8 s |
| Kích thước | 164.50 × 168.00 mm | 170.00 × 199.00 mm |
| Số lớp | 2 | **1** ✔ (đúng bo một mặt) |
| Khoan | 841 lỗ · nhỏ nhất Ø0.40 | 108 lỗ · nhỏ nhất Ø0.80 |
| Ghép | Có — 15 bo (5×3) — sau khi sửa đọc ra **30 bo (5×6)** | không ✔ |
| Lớp nhiều hình nhất | 6.699 hình (đồng dưới) | 19.424 hình (lụa dưới) |
| Có dùng đường vẽ nhanh không | **không** | **không** |
| CAM | đúng | đúng |
| 2 Mặt / 2D / 3D | **sai — xem lỗi 1** | đúng |

Cả hai bộ đều **dưới ngưỡng 50.000 hình**, nên bản sửa lớp nặng hôm 23/09 không đụng tới
chúng. Chữ in lụa của cả hai vẽ đúng ở mọi chế độ (đã dựng riêng từng lớp ra ảnh 1200 px để
soi: `SAMPLE`, `P84241-S02`, `ALARM LINE`, `+VBAT`, `C11`… rõ nét, ruột chữ rỗng đúng).

## Lỗi 1 — Vòng nhỏ nằm trong thân bo bị khoét thủng (ảnh anh gửi cùng một lỗi)

**Hiện tượng.** Ở **2 Mặt / 2D / 3D** (CAM thì đúng):

- `55807.930-90FE`: cả 15 bo trên tấm bị phủ trắng — nhìn như tấm chỉ còn khung, 15 ô trống.
- `P84390-S02`: chữ chú thích trong lớp viền (`Non-plated holes`, `V-Cut`) hiện thành cục
  trắng bết — đúng ảnh anh gửi. Nét chỉ dẫn (vạch xiên) thì vẫn là nét vàng, vẽ đúng.

**Đo được.** Cụm khoan của `55807.930-90FE` trong cảnh có **73 vật thể**: 1 là file khoan thật
(841 lỗ), **72 cái còn lại là "lỗ phay" lấy từ lớp viền**. Ẩn 72 cái đó đi thì tấm hiện ra
đúng ngay (bo có đồng, có mask, có chữ).

**Nguyên nhân.** `src/lib/gerber-reader/outlineLoops.ts:181` — trong `splitOutlineLoops`:

```ts
if (host === -1) return small && !railLike(i)
if (small) return true          // ← nằm trong vòng khác + nhỏ hơn 5% = LỖ, không xét gì thêm
...
for (const p of copper) {       // ← phép thử "có đồng bên trong thì là thân bo" nằm SAU
  if (pointInPolygon(p, poly) && ++inside >= COPPER_POINTS_FOR_BODY) return false
}
```

Vòng nằm trong một vòng lớn hơn và nhỏ hơn **5%** vòng lớn nhất thì bị coi là lỗ phay **ngay
lập tức**, phép thử "bên trong có đồng thì đó là thân bo chứ không phải lỗ" chỉ chạy cho vòng
lớn. Mà:

- tấm `55807.930`: mỗi bo bị vạch V-cut chia đôi, mỗi nửa ≈ 880 mm² so với tấm 27.600 mm² →
  **3,2 %**, lọt ngưỡng 5 % → thành lỗ;
- `P84390-S02`: mỗi chữ cái của `Non-plated holes` là một vòng kín tí xíu nằm trong thân bo →
  cũng thành lỗ.

Ở CAM lỗ phay được gắn vào chính lớp viền nên chỉ thấy nét; ở Real/3D nó đi vào cụm khoan và
được vẽ như chỗ thủng vật liệu — nên bịt trắng cả bo.

**Đề xuất.** Cho vòng nhỏ đi qua đúng phép thử đang có: **có từ N điểm đồng bên trong thì là
thân bo, không phải lỗ**. Lỗ phay thật thì bên trong không có đồng, còn nửa bo và chữ chú
thích thì hoặc có đồng, hoặc quá mảnh để chứa lỗ.

- Việc sửa nhỏ (một nhánh điều kiện), nhưng **đụng vào luật tách vòng viền dùng chung cho cả
  kích thước bo**, nên phải chạy hồi quy corpus `D:\JobDatMach` (1200 bộ) trước khi đẩy lên.
- Cần thêm test cho: tấm V-cut chia đôi bo (55807.930) và chữ trong lớp viền (P84390).

## Việc 2 — Bo một mặt P84241 mở mất 14,8 s

19.424 hình in lụa mặt dưới vẫn đi đường `renderThree` (ngưỡng nhẹ là 50.000), mà thư viện
dựng **~1.200 đỉnh cho mỗi hình** → riêng lớp đó ~23 triệu đỉnh, cả bo 33 triệu đỉnh, 3,3 GB
bộ nhớ trang.

**Đề xuất:** hạ ngưỡng `HEAVY_SHAPES` từ 50.000 xuống khoảng **15.000**. Đường vẽ nhanh đã
đúng hình sau `2316510`, ở mức này bo P84241 sẽ mở nhanh hơn nhiều. Cần đo lại vài bộ đại diện
để chốt con số, và nhớ rằng lớp vẽ nhanh là hình phẳng (không bề dày) ở 3D.

## Chưa làm
- Chưa đối chiếu ảnh thông số của khách (`PCB_Specifications.png`, `P84241-S02_PCB
  Specification.png`): app vẫn để mặc định 1.6 mm · HASL chì, trong khi 55807.930 khách ghi
  **0.8 mm · HASL không chì** và P84241 ghi **ENIG**. Đây là việc người lập tự đối chiếu bằng
  nút "Xem ảnh thông số của khách" (đã có từ `7b90b45`).

## Đã sửa (`a6a79fc`)

| | Trước | Sau |
|---|---|---|
| Tấm 55807.930 ở 2 Mặt / 2D / 3D | 15 bo bị phủ trắng (viền bo bị coi là lỗ phay) | vẽ đúng — đã kiểm cả 2D và 3D |
| Số bo của tấm 55807.930 | 15 (đoán theo bước lặp) | **30 (5 × 6)** — đo lại hai nửa một ô khớp nhau 100%, là hai bo giống nhau |
| Chữ "Non-plated holes" trong lớp viền P84390 | 117 vòng bị khoét thủng bo | **9** — còn đúng lỗ phay thật, chữ chỉ vẽ nét |

- Luật mới: vòng nằm trong thân bo mà **bên trong có mạch** thì là miếng vật liệu, không phải
  lỗ — không cần xét to nhỏ nữa.
- Chữ chú thích nhận ra bằng **bề rộng nét gần 0 + nhỏ + hình lõm**; lỗ bắt ốc cũng vẽ nét 0
  nhưng lồi nên vẫn thủng.
- Hồi quy 1200 zip (616 bo): 590 không đổi, 26 đổi — xem báo cáo
  `2026-09-24-khao-sat-vang-app-va-bo-dem.md`.

