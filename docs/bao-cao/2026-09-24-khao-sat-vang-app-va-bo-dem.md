# Khảo sát: điện thoại văng khi mở file nặng + bộ "Bo Dem" không báo file ghép

Ngày 24/09/2026 · Khảo sát xong được đồng ý sửa cả bốn việc — **đã sửa ở `a6a79fc`** (kết quả ở cuối).

- **Bộ file:** `E:\DQPCB\test\Bo Dem Linhgragon ESP32-S3 - CADCAM.ZIP` (144 KB)
- Hai câu hỏi của anh: (1) điện thoại up file nặng hay bị văng, có cách nào không;
  (2) bộ này có nhiều đường viền tách rời mà app không báo gì — và đúng ra phải báo "2 thiết kế", không phải "file ghép".

## 1. Vì sao điện thoại văng

**Đo bộ "Bo Dem" trên máy tính** (mở xong, chưa đổi chế độ):

| | Số hình | Số đỉnh dựng ra |
|---|---|---|
| Lụa mặt trên | 8.309 | **9.871.092** (1.188 đỉnh/hình) |
| Đồng dưới | 2.111 | 2.110.976 |
| Đồng trên | 2.025 | 2.026.976 |
| Các lớp còn lại | — | 318.364 |
| **Cả bo** | | **14.327.408 đỉnh · bộ nhớ trang tăng 54 → 529 MB** |

**File chỉ 144 KB mà ngốn nửa GB.** Thủ phạm là `renderThree` của web-gerber: nó dựng MỖI
hình thành một khối 3D riêng, trung bình **~1.200 đỉnh cho một hình** — một chữ cái in lụa
cũng tốn bằng cả trăm pad. Dung lượng file không nói lên gì, **số hình mới nói**.

Điện thoại mỗi tab chỉ được khoảng 0,5–1 GB trước khi hệ điều hành giết tab — nên một bo cỡ
này đã sát trần, và app còn nhân lên ba đường:

1. **Giữ 5 bo trong bộ nhớ** (`MAX_CACHED_BOARDS = 5`, `Viewer2D.WebGL.tsx:125`) — mở 3 file
   là ~1,5 GB.
2. **Dựng sẵn ở nền tới 4 bo khác** (`schedulePrebuild`, `Viewer2D.WebGL.tsx:297`): vừa mở
   file thứ hai là app lặng lẽ dựng luôn cả file thứ nhất ở nền. Không có ngoại lệ cho điện
   thoại.
3. **Mỗi chế độ xem một bản cache riêng** (khoá cache có `cam`/`real`) — bấm qua 2D rồi CAM
   là gấp đôi.

### Đã có sẵn đường nhanh, chỉ chưa dùng tới

`fastLayer.ts` (làm ngày 23/09) ráp cả lớp thành MỘT lưới tam giác. Hiện chỉ bật cho lớp
**trên 50.000 hình** nên bộ này không chạm tới. Thử hạ ngưỡng xuống 2.000 rồi đo lại đúng bộ
đó:

| | Hiện tại (ngưỡng 50.000) | Hạ ngưỡng xuống 2.000 |
|---|---|---|
| Số đỉnh cả bo | 14.327.408 | **556.564** (ít hơn 26 lần) |
| Riêng lụa mặt trên | 9.871.092 | **99.972** |
| Bộ nhớ trang sau khi mở | 529 MB | **107 MB** |
| Thời gian dựng | 1.705 ms | **1.179 ms** |

*(Đo xong đã trả ngưỡng về 50.000, không để lại thay đổi nào.)*

### Chỗ phải cẩn thận: polarity 'clear'

`fastLayer` **bỏ qua hình đảo cực** (`polarity: 'clear'` — vùng khoét trong mảng đồng). Lớp
đồng của chính bộ này có 4 và 39 hình đảo cực, vẽ bằng đường nhanh sẽ mất các khoảng hở đó.

Đếm trên 32 bộ lấy ngẫu nhiên trong `D:\JobDatMach` (lớp trên 2.000 hình):

| Loại lớp | Số lớp | Có dùng 'clear' |
|---|---|---|
| Lụa | 19 | **0** |
| Đồng | 12 | 3 |
| Tài liệu | 5 | 0 |

→ **Lụa không bao giờ dùng 'clear'** (và lụa chính là lớp nặng nhất trong hầu hết bộ file).
Đồng thì phải xét từng lớp.

### Đề xuất (theo thứ tự hiệu quả / rủi ro)

1. **Hạ ngưỡng vẽ nhanh xuống ~2.000 hình, kèm điều kiện "lớp không có hình đảo cực"** —
   lớp nào có 'clear' thì vẫn đi đường cũ như hiện nay. Rẻ, được nhiều nhất (529 → 107 MB
   với bộ này). Đổi lại: lớp vẽ nhanh là hình phẳng, ở 3D không thấy bề dày.
2. **Trên điện thoại giữ ít bo lại**: `MAX_CACHED_BOARDS` 5 → 1–2 và **tắt hẳn dựng sẵn ở
   nền**. Đã có sẵn `useIsMobile`, chỉ là hai chỗ chưa dùng tới nó.
3. **Chốt trần bộ nhớ**: ước số đỉnh trước khi dựng, vượt trần thì ép toàn bộ lớp sang đường
   nhanh (thay vì để trình duyệt giết tab).
4. Dọn bản cache của chế độ xem không còn dùng khi máy yếu.

**Tạm thời làm gì trên điện thoại:** mở một file một lúc, đóng bo cũ trước khi mở bo mới —
đóng bo là app dọn bộ nhớ của bo đó ngay (`pruneCaches`).

## 2. Bộ "Bo Dem" có 3 bo rời mà không báo file ghép

**Đọc ra đúng 3 vòng viền rời** (`splitOutlineLoops`: body 3, cutout 0):

| Vòng | Ô bao (mm) | Kích thước | So với bo lớn | Điểm đồng bên trong |
|---|---|---|---|---|
| Bo lớn | −99,7 / 15,2 → 20,3 / 117,5 | 120,0 × 102,3 | 100 % | 428 |
| Bo nhỏ trái | −99,6 / 118,1 → −45,7 / 139,7 | 53,9 × 21,6 | **9,5 %** | 44 |
| Bo nhỏ phải | −45,0 / 118,1 → 8,9 / 139,7 | 53,9 × 21,6 | **9,5 %** | 44 |

Nhưng `countBoards` trả về **1 bo**, nên `detectPanel` ghi "không thấy viền rời hay bo lặp
lại".

**Nguyên nhân** — `src/lib/gerber-reader/outlineLoops.ts` trong `countBoards`:

```ts
let boards = boxes.filter((b) => Math.min(b[2] - b[0], b[3] - b[1]) >= 8 && area(b) >= biggest * 0.1)
```

Vòng nhỏ hơn **10 %** vòng lớn nhất bị loại (luật để bỏ tai bo / rail / vòng rác). Hai bo nhỏ
ở đây được **9,5 %** — trượt đúng nửa bước. Còn lại một bo → không báo ghép. Đường dò thứ hai
("bo lặp lại") cũng không cứu được vì hai bo nhỏ không phải bản sao của bo lớn.

**Đề xuất:** thay luật "nhỏ hơn 10 % thì bỏ" bằng **"bên trong có đồng thì là bo"** — phép thử
này `countBoards` đã có sẵn dữ liệu (`copperSamplePoints`, đang truyền vào `splitOutlineLoops`)
và chính là thứ phân biệt bo thật với tai bo: tai bo / rail không có mạch bên trong, còn hai bo
nhỏ này mỗi cái có 44 điểm đồng. Giữ nguyên mốc cạnh ≥ 8 mm.

- Rủi ro: luật này dùng chung cho **cảnh báo file ghép + đơn vị báo giá (set/pcs)**, nên phải
  chạy hồi quy 1200 bộ corpus trước khi đẩy lên, và thêm test cho chính bộ "Bo Dem".
- Liên quan: lỗi ở báo cáo `2026-09-24-khao-sat-friwo-2-bo-con-lai.md` (vòng nhỏ trong thân bo
  bị khoét thủng) cũng nằm trong `outlineLoops.ts` và cũng là "vòng nhỏ bị xử lý sai" — nên sửa
  một lượt rồi hồi quy một lần.

## 3. Đúng ra phải báo "2 thiết kế", không phải "file ghép"

Anh chỉ ra: bộ này KHÔNG phải bo ghép — nó là **nhiều thiết kế khác nhau nằm chung một hệ
toạ độ**. Hai bo nhỏ giống hệt nhau tính là một thiết kế, bo lớn là một thiết kế nữa →
**3 bo · 2 thiết kế**.

Cách dò hiện nay không diễn tả được chuyện đó: `findRepeats` lấy TOÀN BỘ điểm của cả tấm rồi
tìm một vector lặp chung, nên chỉ trả lời được "cả tấm có lặp không", không trả lời được
"tấm này gồm mấy thiết kế".

**Cách đề xuất — so từng vòng viền với nhau, không so cả tấm:**

1. Lấy danh sách vòng thân bo (`splitOutlineLoops().body` — bộ này ra 3 vòng).
2. Với mỗi vòng: cắt lấy điểm đồng / lụa NẰM TRONG vòng đó rồi **dời về gốc của chính vòng**
   (trừ đi góc dưới-trái ô bao).
3. So từng cặp vòng: ô bao lệch nhau dưới ~0,3 mm **và** tỉ lệ điểm khớp cao → cùng một thiết
   kế. Thử thêm xoay 90/180/270° và lật gương để bắt panel có bo xoay.
4. Gom thành nhóm → `count` = số bo, `designs` = số nhóm.

**Đo thử trên chính bộ này** (sai số khớp 0,15 mm):

| Cặp | Đồng | Lụa |
|---|---|---|
| nhỏ trái ↔ nhỏ phải | **100 %** | **100 %** |
| lớn ↔ nhỏ trái | 0 % | 2 % |
| lớn ↔ nhỏ phải | 0 % | 5 % |

Cách nhau rất xa (100 % so với 0–5 %) nên đặt mốc 80 % là chắc. Kết quả ra đúng: **3 bo,
2 thiết kế — 1 × 120,0 × 102,3 mm và 2 × 53,9 × 21,6 mm**.

**Hiện lên đâu.** Thẻ thông tin bo ghi `Ghép: 3 bo · 2 thiết kế (1 × 120,0 × 102,3 · 2 × 53,9
× 21,6 mm)`, và cảnh báo ở thẻ giá phải khác lời hiện nay: bộ nhiều thiết kế thì **không tính
như panel bo giống nhau** — giá từng thiết kế khác nhau, nên nhắc người lập tách báo giá.

**Điều kiện tiên quyết:** phải sửa luật bỏ vòng nhỏ hơn 10 % ở mục 2 trước, nếu không thì chỉ
còn 1 vòng, không có gì để so.

Chi phí: chỉ so các vòng với nhau (bộ này 3 vòng), điểm đã có sẵn từ `copperSamplePoints` —
không phải đọc lại file.

## Chưa làm

- Chưa đo trên điện thoại thật (đo trên máy tính rồi suy ra theo mức bộ nhớ của tab điện
  thoại). Nếu anh gửi được model máy hay bo hay văng nhất thì đo sát hơn được.

## Đã sửa (`a6a79fc`)

| | Trước | Sau |
|---|---|---|
| Bộ "Bo Dem": số đỉnh cả bo | 14.327.408 | **4.556.288** |
| Bộ "Bo Dem": bộ nhớ trang | 529 MB | **305 MB** |
| Bộ "Bo Dem": nhận biết | không báo gì | **Ghép: Có — 3 bo · 2 thiết kế** |
| Giữ bo trong bộ nhớ (máy ít RAM) | 5 bo + dựng sẵn 4 bo ở nền | **1 bo, không dựng sẵn** |

- **Ngưỡng vẽ nhanh** 50.000 → **2.000 hình**, kèm điều kiện lớp không có hình đảo cực; trên
  50.000 hình thì vẫn vẽ nhanh bằng mọi giá. Lớp đồng của "Bo Dem" có 4 và 39 hình đảo cực
  nên vẫn đi đường cũ — vì vậy còn 4,56 triệu đỉnh chứ không phải 556 nghìn như lúc đo thử
  (đo thử không xét đảo cực nên vẽ sai vùng khoét).
- **Máy ít bộ nhớ** (`isLowMemoryDevice`: `navigator.deviceMemory` ≤ 4 GB, hoặc con trỏ thô +
  có cảm ứng) giữ 1 bo và **không dựng sẵn ở nền**.
- **Số thiết kế**: xem mục E1 của `outline-drill-slot.md`. Thẻ giá đổi lời nhắc — bộ nhiều
  thiết kế thì nhắc tách báo giá, không gợi ý "dùng file ghép sẵn N bo/set".
- **Kiểm**: 195 test (thêm 4 test mới) · hồi quy **1200 zip / 616 bo: 590 không đổi, 26 đổi**
  — 8 bộ chỉ thêm số thiết kế, 10 bộ chuyển chữ chú thích ra khỏi lỗ phay, 5 bộ đổi số bo
  theo luật "có mạch bên trong", 3 bộ là tật sẵn có của web-gerber (đọc lẻ từng bộ thì hai
  bản giống hệt nhau — kết quả phụ thuộc thứ tự đọc, không liên quan bản sửa này).
- Checklist giao diện điện thoại 375 / 360: không cuộn ngang, badge và cảnh báo xuống dòng gọn.

### Còn tồn

- Lớp đồng có hình đảo cực vẫn đi đường chậm — muốn nhẹ nữa thì phải cho `fastLayer` biết
  cách khoét (việc lớn hơn, cần đo riêng).
- Tật thứ tự đọc của web-gerber (3 bộ trong hồi quy: `Matmay_vhf`, `Bangtaycam`,
  `Nap_trich_20C`) — kích thước bo đọc lần đầu trong một loạt khác với đọc lẻ. Chưa tìm
  nguyên nhân, nên khảo sát riêng.
