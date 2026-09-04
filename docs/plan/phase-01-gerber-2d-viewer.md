# PHA 1 — ĐỌC & HIỂN THỊ 2D GERBER

## Mục tiêu
Đọc được file Gerber xuất từ **các phần mềm EDA thịnh hành** (Altium, KiCad, Eagle, EasyEDA, OrCAD, Cadence Allegro, PADS, Proteus, DipTrace…) và **hiển thị 2D đúng tỉ lệ, đúng kích thước thực tế** của bo mạch, đặc biệt là **lớp viền bo (board outline)**.

## Phạm vi
- Import 1 hoặc nhiều file Gerber (RS-274X) + file Excellon (drill).
- Tự động **nhận diện loại lớp** theo phần mở rộng / tên file:
  - `.GKO`, `.GM1`, `.gko`, `.gm1`, `-Edge_Cuts.gbr`, `.OLN`, `.gbo`… → **Board Outline**
  - `.GTL`, `.GBL`, `.gtl`, `.gbl`, `-F_Cu.gbr`, `-B_Cu.gbr` → Copper Top/Bottom
  - `.GTS`, `.GBS`, `-F_Mask.gbr`, `-B_Mask.gbr` → Soldermask
  - `.GTO`, `.GBO`, `-F_Silks.gbr`, `-B_Silks.gbr` → Silkscreen
  - `.TXT`, `.DRL`, `.XLN` → Drill (Excellon)
- Hiển thị 2D với **zoom, pan, đo tọa độ chuột theo mm/inch**.
- Bật/tắt từng lớp, đổi màu lớp.
- Hiển thị đúng **kích thước bo** theo lớp GKO/GM1 (mm & inch).

## Thư viện đề xuất (GitHub, MIT/Apache)
| Nhu cầu | Thư viện | Repo |
|---|---|---|
| Parse Gerber RS-274X | **`@tracespace/parser`** | github.com/tracespace/tracespace |
| Parse Excellon drill | **`@tracespace/parser`** (hỗ trợ luôn) | ↑ |
| Render Gerber → SVG | **`@tracespace/plotter` + `@tracespace/renderer`** | ↑ |
| Stack-up nhiều lớp | **`pcb-stackup`** | github.com/tracespace/tracespace |
| Render 2D hiệu năng cao (thay SVG) | **PixiJS** hoặc **Konva** | github.com/pixijs/pixijs |
| Nhận diện loại lớp tự động | **`whats-that-gerber`** | github.com/tracespace/tracespace |

> `tracespace` là bộ thư viện phổ biến nhất, được dùng trong OSHPark, PCBWay preview, v.v.

## Việc cần làm
- [ ] Setup dự án Electron + TypeScript.
- [ ] UI: khu vực drop file, sidebar danh sách lớp, canvas 2D.
- [ ] Tích hợp `whats-that-gerber` để nhận loại lớp.
- [ ] Tích hợp `@tracespace/parser` + `plotter` để render.
- [ ] Hiển thị **bounding box** của lớp outline (GKO/GM1) → tính W × H bo mạch.
- [ ] Thanh trạng thái: kích thước bo, tọa độ chuột, đơn vị (mm/inch — chuyển đổi).
- [ ] Fit-to-screen, zoom bằng chuột giữa, pan bằng chuột phải.
- [ ] Test với Gerber mẫu trong [sample-gerbers/](../../sample-gerbers/) — kiểm tra kích thước khớp với datasheet của bo.

## Tiêu chí hoàn thành (DoD)
- Mở được ≥ 5 bộ Gerber từ 5 EDA khác nhau (Altium, KiCad, Eagle, EasyEDA, OrCAD) → hiển thị đúng.
- Sai số kích thước bo so với file gốc ≤ 0.01 mm.
- Zoom/pan mượt ở bo mạch có ≥ 10.000 vertices.
