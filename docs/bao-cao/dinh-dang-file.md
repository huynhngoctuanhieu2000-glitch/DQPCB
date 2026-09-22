# App đang đọc file theo định dạng nào

Cập nhật: 22/09/2026 · Mã nguồn: `src/lib/gerber-reader/` (README trong đó liệt kê từng hàm).

## 1. Đầu vào

| Dạng | Cách đọc | Ghi chú |
|---|---|---|
| **ZIP** | `jszip` | Mỗi ZIP là một bo (thả nhiều ZIP → nhiều tab bo) |
| **RAR** | `node-unrar-js` (WASM, nạp khi cần) | Chạy được trên web và Electron |
| **File lẻ** | Chọn/thả nhiều file cùng lúc | Gom thành một bo |
| **Thư mục** | Menu File → Mở thư mục (Electron: hộp chọn Windows; web: `webkitdirectory`) | Lấy các file nằm ngay trong thư mục |

Bị **bỏ qua** trước khi parse (`isAuxiliaryFile`): report, aperture list, BOM, pick&place,
readme, ảnh, PDF, Excel, STEP/DXF, file nén lồng, file dự án KiCad (`fp-info-cache`,
`.kicad_pcb`…). `.txt` chỉ bị bỏ khi tên rõ là tài liệu (vì `.txt` cũng là file khoan Altium).

## 2. Định dạng dữ liệu

| Định dạng | Đọc bằng | DQPCB xử lý thêm |
|---|---|---|
| **Gerber RS-274X** | `web-gerber` (parse + plot) | Chèn header `%FS/%MO` khi thiếu; đổi toạ độ tương đối `G91` → tuyệt đối; aperture list OrCAD |
| **Gerber X2** (thuộc tính `%TF`) | DQPCB đọc `FileFunction` | Nhận lớp, mặt, PTH/NPTH từ chính file |
| **Excellon** (NC drill) | `web-gerber` | Xem mục 4 |
| **Gerber dạng file khoan** (Proteus CADCAM) | `web-gerber` | Chỉ dùng khi bộ file KHÔNG có Excellon (có thì bản Gerber là trùng lặp) |

## 3. Nhận diện lớp — thứ tự `matchLayer`

Dừng ở bước đầu tiên khớp:

0. **File tự khai** — mã lớp CAM350 trong header (`G04 Layer 6: …`), rồi Gerber X2
   `%TF.FileFunction`.
1. **Đuôi file** theo từng EDA:

   | Lớp | Đuôi |
   |---|---|
   | Đồng trên / dưới | `.gtl .cmp .top` / `.gbl .sol .bot` (+ `.l1 .l2`, `toplayer`, `bottomlayer`) |
   | Đồng giữa | `.g1–.g9`, `.in1…`, `.l3–.l9` |
   | Mask | `.gts .stc .smt` / `.gbs .sts .smb` |
   | In lụa | `.gto .plc .sst` / `.gbo .pls .ssb` |
   | Kem hàn | `.gtp .crc .spt` / `.gbp .crs .spb` (DipTrace `.stp/.sbt` khi bộ có đuôi DipTrace) |
   | Viền | `.gko .gml .oln .bor .dim .mil`, `.gm1` |
   | Khoan | `.drl .txt .tap .xln .exc .ncd .nc .drill .drd` |
   | Tài liệu (ẩn) | `.gd1 .gg1 .gpt .gpb .dts .fab`, `.gm2–.gm99` |

2. **Từ khoá trong tên** (so theo ranh giới từ): drill → paste → mask → silk → copper →
   outline → documentation. Có luật riêng cho: mã ba chữ CAM350/OrCAD `SMT/SMB/SST/SSB`,
   "Top SMT Paste" của Proteus, "Overlay"/"Legend", "Drill.GBR" của Proteus là **bản vẽ**
   khoan chứ không phải dữ liệu khoan.
3. **`whats-that-gerber`** — phương án cuối, chỉ khi mọi luật trên không khớp.

Không khớp gì → `unknown` (vẫn hiện, người lập tự bật/tắt).

EDA đã gặp và có luật riêng: **Altium, KiCad (5–10), Eagle, OrCAD, Proteus, EasyEDA / EasyEDA
Pro, CAM350, DipTrace, Sprint-Layout, Pulsonix.**

## 4. File khoan Excellon — đọc số thế nào

| Trường hợp | Xử lý |
|---|---|
| Toạ độ có dấu chấm | Để nguyên |
| Khai `;FILE_FORMAT=a:b` + `METRIC/INCH,LZ/TZ` (Altium) | **DQPCB chèn dấu thập phân** theo a:b (LZ bù đuôi, TZ bù đầu). web-gerber không đọc dòng chú thích này. *(22/09, chưa commit)* |
| METRIC, không khai format, không dấu chấm (Proteus) | Chèn theo chuẩn metric 3.3 |
| INCH không khai | Để web-gerber áp 2.4 |
| Lệnh phay `G00 → M15 → G01 → M16` | Slot / lỗ chữ nhật (xem `outline-drill-slot.md`) |
| `G85` | Slot một dòng |

Mạ / không mạ (`drillPlatingOf`): X2 → từng mục `;TYPE=PLATED/NON_PLATED` (mục nào có mũi)
→ từ trong tên file (`npth`, `pth`, `plated`… theo ranh giới từ).

## 5. Đơn vị

- Mỗi lớp giữ đơn vị gốc (`mm`/`in`); kích thước bo quy về mm.
- Viewer nhân 25.4 cho lớp inch — kể cả lỗ khoét tách khỏi lớp viền (sửa 21/09).
- Bộ file trộn đơn vị (gerber mm + khoan inch) đọc được.

## 6. Khi thiếu viền

1. Lấy nét `AperFunction,Profile` lẫn trong lớp khác (Pulsonix "(Documentation).gbr").
2. Không có thì **ước lượng** viền từ khung lớp đồng (tên lớp `(viền bo ước lượng)`).
