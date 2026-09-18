# gerber-reader

Thư viện đọc và nhận diện bộ file Gerber/Excellon của DQPCB. Mọi thứ liên quan tới
**đọc file** nằm ở đây: giải nén, nhận diện lớp, chuẩn hoá nội dung, dựng và sửa viền bo.

> Bổ sung nhận diện mới thì bổ sung **trong thư mục này**, không rải ra UI hay viewer.
> Code bên ngoài chỉ import từ `src/lib/gerber-reader` (tức `index.ts`).

## Dùng

```ts
import { GerberParser } from '../lib/gerber-reader'

const boards = await GerberParser.parseInputFiles(files) // mỗi ZIP/RAR ra một bo
for (const b of boards) {
  b.layers      // ParsedGerberLayer[] — loại lớp, mặt, ImageTree đã plot
  b.bounds      // kích thước bo (mm), lấy từ viền
  b.drillCount  // số file khoan có lỗ
}
```

API công khai (`index.ts`):

| Tên | Việc |
|---|---|
| `GerberParser.parseInputFiles(files)` | Điểm vào: File[] → danh sách bo |
| `matchLayer(name, allNames?, content?)` | Một file là lớp gì, mặt nào |
| `isAuxiliaryFile(name, allNames?)` | File phụ trợ/rác, bỏ qua |
| `drillPlatingOf(name, content?)` | File khoan là PTH, NPTH hay gộp |
| `shortenNames(names)` | Bỏ tiền tố chung để tên hiển thị ngắn |
| `extractProfileGerber(content)` | Lấy nét viền (AperFunction Profile) lẫn trong lớp khác |
| `ESTIMATED_OUTLINE_FILE` | Tên file giả của viền ước lượng |
| `splitOutlineLoops`, `copperSamplePoints`, … | Tách thân bo với lỗ khoét trong lớp viền |

## Ai viết cái gì

Trong code, mỗi bộ nhận diện có thẻ:

- **`[DQPCB]`** — luật tự viết của tool này.
- **`[thư viện ngoài: …]`** — giao cho thư viện bên ngoài.

### Của DQPCB

| File | Nội dung |
|---|---|
| `identify.ts` | Toàn bộ luật nhận diện lớp, trừ bước cuối của `matchLayer` (xem dưới) |
| ↳ mã lớp CAM350 | Đọc `G04 Layer 6: drd.gbx` trong header |
| ↳ Gerber X2 | Đọc `%TF.FileFunction` mà file tự khai |
| ↳ đuôi file | Bảng đuôi của Altium, KiCad, Eagle, OrCAD, Proteus, EasyEDA, Sprint-Layout… |
| ↳ từ khoá tên file | So theo ranh giới từ ("depth" không bị hiểu là "pth"); mã ba chữ OrCAD/CAM350 `SMT/SMB/SST/SSB` |
| ↳ file phụ trợ | Report, aperture list, BOM, ảnh, file dự án KiCad… |
| ↳ PTH/NPTH | X2 → `;TYPE=PLATED/NON_PLATED` (EasyEDA, Altium) → tên file |
| `normalize.ts` | Đơn vị, aperture list của OrCAD, toạ độ G91 → tuyệt đối |
| `geometry.ts` | Bẻ cung thành đoạn; nới vùng tô 0.035 mm (lấp khe dải phủ đồng CAM350); nối viền bo thành vòng kín |
| `outline.ts` | Viền dự phòng: lấy nét Profile lẫn lớp khác, hoặc ước lượng từ khung lớp đồng |
| `outlineLoops.ts` | Vòng nào trong lớp viền là thân bo, vòng nào là lỗ khoét |
| `reader.ts` | Luồng đọc: giải nén → gom theo bo → nhận diện → chuẩn hoá → plot |
| `types.ts` | Kiểu dữ liệu công khai |

### Thư viện ngoài

| Thư viện | Dùng ở | Để làm gì |
|---|---|---|
| `whats-that-gerber` | `identify.ts` — bước 3 của `matchLayer` | Đoán lớp theo tên, **chỉ khi mọi luật [DQPCB] không khớp** |
| `web-gerber` | `reader.ts`, `outline.ts` | Parse + plot Gerber/Excellon ra ImageTree |
| `jszip` | `reader.ts` | Giải nén ZIP |
| `node-unrar-js` | `reader.ts` | Giải nén RAR (WASM, nạp khi cần) |

## Thứ tự nhận diện trong `matchLayer`

Dừng ở bước đầu tiên khớp:

0. **[DQPCB]** File tự khai: mã lớp CAM350, rồi thuộc tính Gerber X2.
1. **[DQPCB]** Đuôi file chuẩn của từng EDA.
2. **[DQPCB]** Từ khoá trong tên file (đã chuẩn hoá, so theo ranh giới từ).
3. **[whats-that-gerber]** Phương án cuối.

Không khớp gì → `unknown` (vẫn hiện, để người dùng tự bật/tắt).

## Bổ sung nhận diện mới

1. Thêm luật vào đúng file theo bảng trên, gắn thẻ `[DQPCB]` và chú thích **vì sao**
   (bo nào, EDA nào gây ra — ví dụ "bo `3W NHUA XANH`, CAM350").
2. Thêm test vào `test/` (xem `gerber-outline-drill.test.ts`, `gerber-x2.test.ts`,
   `outline-loops.test.ts`).
3. Chạy hồi quy trên corpus thật `D:\JobDatMach` (≈18k bộ file đã báo giá): so kết quả
   parse trước và sau khi sửa — không bo nào được đổi kích thước, số lỗ khoan hay loại
   lớp mà không có lý do.
