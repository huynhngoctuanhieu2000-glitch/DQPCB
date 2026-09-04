# KẾ HOẠCH PHÁT TRIỂN PHẦN MỀM GERBER VIEWER / DFM (Desktop Windows)
### Tương tự HQDFM International — Bước 1: Viewer 3D + Đo kích thước + Ghép Panel

---

## 1. MỤC TIÊU BƯỚC 1 (MVP)

Xây dựng ứng dụng Windows Desktop cho phép:

1. **Import file Gerber (RS-274X) + Excellon (khoan)** của một board PCB.
2. **Xem 3D Top/Bottom** — dựng hình PCB từ các lớp Gerber (copper top/bottom, soldermask, silkscreen, outline, drill).
3. **Đo/kiểm tra kích thước**: khoảng cách giữa 2 điểm, đường kính lỗ khoan, độ rộng đường mạch (trace width), khoảng cách giữa 2 pad/track (clearance), kích thước board.
4. **Ghép Panel (Panelization)**: đặt nhiều board vào 1 panel lớn, có thể chỉnh số hàng/cột, khoảng cách (gap), thêm rail, thêm mouse-bite hoặc v-cut, xuất lại thành Gerber panel mới.
5. (Giai đoạn sau) DFM rule-check tự động: minimum trace/space, minimum drill size, annular ring, board edge clearance...

Đây là nền tảng để sau này mở rộng dần lên "full tính năng như HQDFM".

---

## 2. KIẾN TRÚC TỔNG QUAN

```
┌─────────────────────────────────────────────┐
│                UI Layer (WPF)                │
│  - MainWindow, 2D/3D Viewport, Toolbars,      │
│    Measure tool, Panelize dialog              │
├─────────────────────────────────────────────┤
│           Application/ViewModel Layer         │
│  - MVVM (Commands, State, Undo/Redo)          │
├─────────────────────────────────────────────┤
│              Core Engine (C# .NET)            │
│  - GerberParser  (RS-274X)                    │
│  - ExcellonParser (drill file)                │
│  - GeometryEngine (Clipper2 - boolean ops)    │
│  - LayerStack model (Board = list of Layers)  │
│  - PanelizeEngine                             │
│  - MeasureEngine                              │
│  - DfmRuleEngine (phase 2)                    │
├─────────────────────────────────────────────┤
│           Rendering Layer                     │
│  - 2D: SkiaSharp (vẽ nhanh, zoom/pan mượt)    │
│  - 3D: HelixToolkit.Wpf (SharpDX/DirectX)     │
├─────────────────────────────────────────────┤
│         Export Layer                          │
│  - GerberWriter (xuất panel Gerber mới)       │
│  - PDF/PNG snapshot export                    │
└─────────────────────────────────────────────┘
```

**Vì sao chọn kiến trúc này:** Tách rời phần **đọc/xử lý dữ liệu (Core Engine)** khỏi phần **hiển thị (Rendering)** để sau này có thể tái sử dụng Core Engine cho DFM rule-check, cho panelize, cho export — mà không phải viết lại logic hình học.

---

## 3. TECH STACK ĐỀ XUẤT

| Thành phần | Lựa chọn | Lý do |
|---|---|---|
| Ngôn ngữ | **C# / .NET 8** | Dễ đóng gói .exe Windows, hiệu năng tốt, nhiều thư viện CAD/EDA có sẵn |
| UI Framework | **WPF** (hoặc Avalonia nếu muốn sau này cross-platform) | Ổn định, tài liệu nhiều, dễ để AI code theo (vibe coding) |
| Render 2D | **SkiaSharp** | Vẽ vector nhanh, zoom/pan mượt, dùng được trong WPF qua SKElement |
| Render 3D | **HelixToolkit.Wpf.SharpDX** | Thư viện 3D mã nguồn mở phổ biến nhất cho WPF, hỗ trợ mesh, camera, ánh sáng — dùng để dựng PCB 3D top/bottom |
| Boolean geometry (cắt/hợp hình dạng pad, trace, polygon) | **Clipper2** (bản C# port) | Chuẩn công nghiệp cho geometry 2D trong PCB/CAM software |
| Parse Gerber | **Tự viết parser RS-274X** (dựa theo chuẩn Ucamco Gerber Format Spec) | Không có thư viện C# nào đủ tốt/miễn phí → cần tự viết, nhưng chuẩn Gerber đã公开, AI code được nếu có spec rõ |
| Parse Excellon (khoan) | Tự viết (định dạng đơn giản hơn Gerber) | |
| Lưu trạng thái project | JSON (Newtonsoft.Json hoặc System.Text.Json) | |
| Đóng gói cài đặt | **Inno Setup** hoặc **MSIX** | Tạo file .exe/.msi cài lên Windows |

> Ghi chú: Nếu muốn tốc độ ra sản phẩm nhanh hơn và chấp nhận app "web-wrapped" (Electron-like), có thể thay bằng **Electron + Node.js + three.js + gerber-parser (npm)** — vì hệ sinh thái JS có sẵn thư viện đọc Gerber tốt (`gerber-parser`, `pcb-stackup`, `gerber-to-svg` của tractivestudio). Cách này **nhanh hơn nhiều** cho MVP vì đỡ phải tự viết Gerber parser từ đầu. Trade-off: file .exe nặng hơn (Electron), nhưng với vibe-coding (nhờ AI code hộ) đây là lựa chọn thực tế hơn để ra sản phẩm nhanh.

**→ Khuyến nghị thực tế cho vibe-coding: chọn phương án Electron + JS**, vì:
- Có sẵn thư viện parse Gerber mã nguồn mở, đỡ phải tự viết từ số 0.
- Có sẵn three.js để dựng 3D, cộng đồng lớn, AI (Claude/GPT) code JS/three.js rất tốt.
- Đóng gói Windows .exe bằng `electron-builder` rất đơn giản.

---

## 4. PHƯƠNG ÁN KỸ THUẬT CHI TIẾT (nếu chọn Electron + JS)

### 4.1. Stack cụ thể
- **Electron** (khung desktop app, chạy Chromium + Node.js)
- **React** hoặc **Vue** cho UI (tuỳ nhóm quen cái nào hơn)
- **three.js** cho render 3D (top/bottom view, xoay/zoom board)
- **PixiJS** hoặc **Canvas 2D/SVG** cho view 2D (đo kích thước dễ hơn ở 2D)
- Thư viện parse Gerber: `gerber-parser`, `gerber-to-svg`, `pcb-stackup` (bộ 3 thư viện của tracespace.io — chuyên dụng cho việc này, có thể lấy layer polygon ra để đưa vào three.js dựng 3D)
- Thư viện đo lường: tự viết dựa trên toạ độ polygon lấy được từ gerber-parser
- Panelize: tự viết module ghép nhiều bo mạch (transform toạ độ + tạo rail/mousebite) rồi dùng gerber writer để xuất lại

### 4.2. Luồng xử lý dữ liệu chính

```
File Gerber (.gtl, .gbl, .gto, .gbo, .gko, .txt/.drl...)
        │
        ▼
  gerber-parser → parse thành các lệnh vẽ (paths, pads, arcs)
        │
        ▼
  pcb-stackup → gộp các layer thành 1 "board definition" (SVG layers theo top/bottom)
        │
        ├──► Render 2D (SVG/Canvas) — dùng cho việc ĐO kích thước
        │
        └──► Convert sang mesh 3D (extrude theo độ dày từng lớp: copper, soldermask, silkscreen)
                    │
                    ▼
              three.js render Top view / Bottom view (xoay camera 180°)
```

### 4.3. Module Đo kích thước (Measure Tool)
- Bắt sự kiện click trên canvas 2D → snap vào điểm gần nhất (endpoint, center của pad/lỗ khoan, giao điểm 2 track).
- Tính khoảng cách Euclid giữa 2 điểm đã chọn (đơn vị mm/mil, có toggle đổi đơn vị).
- Đo đường kính lỗ khoan: đọc trực tiếp từ Excellon tool table (mỗi tool có size sẵn).
- Đo bề rộng trace: lấy width của aperture (D-code) tại điểm click.
- Đo clearance (khoảng cách giữa 2 track/pad gần nhau nhất): dùng Clipper2 (hoặc turf.js nếu ở JS) để tính minimum distance giữa 2 polygon.

### 4.4. Module Ghép Panel (Panelization)
Tính năng cần có:
- Nhập số hàng (rows) x số cột (columns).
- Khoảng cách giữa các board (gap X, gap Y) — có thể nhập số hoặc kéo thả.
- Chọn kiểu liên kết giữa các board: **V-cut** hoặc **Mouse-bite (tab routing)**.
- Thêm rail (viền panel) ở các cạnh, với khoảng rộng tuỳ chỉnh (thường 5-10mm), có thể thêm fiducial mark, tooling hole.
- Xuất ra bộ Gerber mới (toàn bộ layer của panel) — thực chất là: transform (dịch chuyển toạ độ) toàn bộ dữ liệu Gerber gốc theo từng vị trí board trong lưới, rồi merge lại + vẽ thêm đường V-cut/mousebite + rail.

**Thuật toán panelize (tóm tắt):**
```
1. Đọc toàn bộ layer của 1 board gốc (đã parse ra danh sách path/pad theo toạ độ)
2. Với mỗi vị trí (row, col) trong lưới:
      offset = (col * (boardWidth + gapX), row * (boardHeight + gapY))
      copy toàn bộ path/pad của board, cộng thêm offset vào toạ độ
3. Gộp tất cả bản copy lại thành 1 layer lớn (per layer type)
4. Vẽ thêm rail (hình chữ nhật bao ngoài + khoảng trống rail)
5. Vẽ đường v-cut (đường thẳng full theo trục X/Y giữa các hàng/cột) 
   hoặc mouse-bite (chuỗi lỗ khoan nhỏ dọc theo đường phân cách)
6. Ghi ra file Gerber mới bằng gerber-writer (module tự viết dựa theo spec RS-274X)
```

---

## 5. LỘ TRÌNH THEO GIAI ĐOẠN (ROADMAP)

| Giai đoạn | Nội dung | Thời gian ước tính* |
|---|---|---|
| **Phase 0** | Setup project Electron + React, load được 1 file Gerber, hiện log ra console | 3–5 ngày |
| **Phase 1** | Render 2D layer (top copper) lên canvas, zoom/pan | 1 tuần |
| **Phase 2** | Render đủ các layer (top/bottom copper, soldermask, silkscreen, outline) ở dạng 2D, có toggle ẩn/hiện từng layer | 1 tuần |
| **Phase 3** | Dựng 3D từ layer 2D (extrude), camera xoay Top/Bottom | 1.5–2 tuần |
| **Phase 4** | Công cụ đo kích thước (điểm-điểm, đường kính lỗ, độ rộng trace, clearance) | 1 tuần |
| **Phase 5** | Panelize: UI nhập rows/cols/gap, sinh preview, xuất Gerber panel mới | 2 tuần |
| **Phase 6** | Đóng gói .exe cài Windows (electron-builder), test trên máy sạch | 3–5 ngày |
| **Phase 7 (mở rộng sau)** | DFM rule engine: min trace/space, min drill, annular ring, board edge clearance, xuất report lỗi | 2–3 tuần |

*Thời gian ước tính giả định có 1 dev code full-time với hỗ trợ AI (vibe-coding); có thể co giãn tuỳ độ quen thuộc với stack.

---

## 6. GỢI Ý CÁCH LÀM VIỆC VỚI AI ĐỂ VIBE-CODE

Vì bạn sẽ nhờ AI (khác) code theo kế hoạch này, nên giao việc theo từng **Phase nhỏ, có tiêu chí nghiệm thu rõ ràng**, ví dụ khi giao Phase 1 cho AI, nên viết prompt dạng:

> "Tạo project Electron + React. Dùng thư viện `gerber-parser` để đọc file .gtl (top copper), sau đó vẽ toàn bộ path lên `<canvas>` bằng 2D context, có zoom bằng scroll chuột và pan bằng kéo chuột giữ chuột trái. Input: cho phép người dùng chọn file qua dialog. Output: canvas hiển thị đúng hình dạng layer, tỉ lệ đúng theo mm."

Nguyên tắc:
- Giao **từng module độc lập** một (parser → renderer 2D → renderer 3D → measure → panelize) để dễ test và dễ sửa khi AI code sai.
- Sau mỗi phase, tự kiểm tra bằng cách so sánh với file Gerber mở trong phần mềm có sẵn (VD: [Gerbv](https://gerbv.github.io/) miễn phí, hoặc trang online gerber viewer) để đối chiếu hình dạng có đúng không.
- Giữ lại các file Gerber mẫu (2-3 board thật) để test xuyên suốt các phase.

---

## 7. RỦI RO CẦN LƯU Ý

- **Parse Gerber không chuẩn 100%**: định dạng Gerber RS-274X có nhiều biến thể tuỳ phần mềm xuất ra (Altium, KiCad, Eagle...) — nên test với Gerber từ nhiều nguồn khác nhau.
- **Hiệu năng 3D** với board có mật độ mạch cao (nhiều path nhỏ) — cần dùng kỹ thuật merge geometry/instancing trong three.js, tránh tạo hàng chục nghìn mesh riêng lẻ.
- **Panelize xuất Gerber đúng chuẩn** để nhà máy PCB đọc được — nên dùng thư viện `gerber-writer` (npm, cùng hệ sinh thái tracespace) thay vì tự viết writer từ đầu, để đảm bảo đúng format.
- Đây là phần mềm có tính chuyên môn cao (ngành PCB) — nên có ít nhất 1 người trong nhóm hiểu về Gerber/PCB manufacturing để review kết quả AI code ra, vì AI có thể code "chạy được" nhưng sai lệch kỹ thuật (VD: sai đơn vị mm/inch, sai chiều lớp bottom bị lật ngược...).

---

## 8. THƯ VIỆN THAM KHẢO CHÍNH (để đưa cho AI code theo)

- `gerber-parser` — https://github.com/tracespace/tracespace (parse RS-274X)
- `pcb-stackup` — cùng bộ tracespace, gộp layer thành board render được
- `gerber-to-svg` — convert Gerber sang SVG (hữu ích cho debug/preview nhanh)
- `three.js` — 3D rendering
- `clipper-lib` / `polygon-clipping` (npm) — boolean operations cho geometry 2D (dùng cho đo clearance, cắt panel)
- Tài liệu chuẩn Gerber chính thức: Ucamco "The Gerber Format Specification" (PDF, cần đọc kỹ khi debug parser)
- Electron Builder — https://www.electron.build/ (đóng gói .exe Windows)

---

## 9. THIẾT KẾ THEO HƯỚNG MỞ (để sau này gắn thêm module BÁO GIÁ)

Vì bạn dự định tích hợp thêm tính năng **báo giá (quotation)** sau này, kiến trúc cần tách rời rõ ràng ngay từ đầu theo nguyên tắc: **Core Engine (đọc/phân tích Gerber) không được biết gì về UI hay về giá cả** — mọi thứ giao tiếp qua một lớp dữ liệu trung gian (Board Data Model) và hệ thống plugin/module độc lập.

### 9.1. Nguyên tắc thiết kế mở

```
┌───────────────────────────────────────────────────────┐
│                     UI Shell (Electron)                │
│   Sidebar module: [Viewer] [Đo] [Panelize] [Báo giá]... │
├───────────────────────────────────────────────────────┤
│              BOARD DATA MODEL (trung tâm)               │
│  {                                                       │
│    layers: [...],        // dữ liệu Gerber đã parse      │
│    boardSizeMM: {w, h},                                 │
│    layerCount: 2,                                       │
│    drillHoles: [...],                                   │
│    minTrace, minSpace, minDrill,   // rút ra từ DFM      │
│    panelInfo: { rows, cols, gap, rail },                │
│    material, thickness, surfaceFinish, ... (metadata)   │
│  }                                                       │
├───────────────────────────────────────────────────────┤
│   Module: Viewer  │  Module: Measure │ Module: Panelize │
│   (đọc data model, │  (đọc + ghi lên  │ (đọc + ghi vào    │
│    không sửa)      │   data model)    │  data model)      │
├───────────────────────────────────────────────────────┤
│         Module: DFM Check (Phase 2)                      │
│   → đọc Board Data Model, sinh ra "báo cáo lỗi/thông số" │
├───────────────────────────────────────────────────────┤
│   Module: BÁO GIÁ (tương lai)                            │
│   → CHỈ cần đọc Board Data Model (đã có sẵn: kích thước, │
│     số lớp, số lỗ khoan, diện tích panel, số lượng...)   │
│   → kết hợp với bảng giá/công thức riêng (nhập tay hoặc  │
│     đọc từ file cấu hình/CSV/API) → ra báo giá            │
└───────────────────────────────────────────────────────┘
```

**Điểm mấu chốt:** Module Báo giá **không cần đụng vào** Gerber parser hay renderer 3D — nó chỉ cần đọc các thông số đã có sẵn trong Board Data Model (kích thước board, số lớp, độ dày, số lỗ khoan, diện tích panel, min trace/space nếu ảnh hưởng giá...) rồi áp công thức tính giá. Vì vậy nếu thiết kế đúng theo mô hình "data model trung tâm" này ngay từ Phase 0, việc thêm Báo giá sau này chỉ là **thêm 1 module mới**, không phải sửa code cũ.

### 9.2. Cấu trúc thư mục gợi ý (để dễ mở rộng)

```
/src
  /core            → Gerber parser, Excellon parser, geometry engine (KHÔNG import UI)
  /models          → BoardDataModel.js (định nghĩa cấu trúc dữ liệu chung)
  /modules
    /viewer2d
    /viewer3d
    /measure
    /panelize
    /dfm-check      (phase 2)
    /quotation      (thêm sau — chỉ cần đọc /models, không đụng /core)
  /ui               → React components, mỗi module có 1 "panel" riêng gắn vào sidebar
  /config
    pricing-rules.json   (bảng giá, công thức — để sau này chỉnh giá không cần sửa code)
```

### 9.3. Những thông số nên "để sẵn chỗ" trong Data Model ngay từ đầu (dù chưa dùng)

Để tránh phải sửa lại cấu trúc dữ liệu khi làm module báo giá, nên thêm sẵn các trường sau vào Board Data Model từ Phase 0-1 (kể cả khi chưa có UI nhập):

- `layerCount` (số lớp: 1, 2, 4, 6...)
- `boardThicknessMM`, `copperWeightOz` (độ dày đồng — ảnh hưởng giá)
- `surfaceFinish` (HASL, ENIG, OSP...)
- `soldermaskColor`, `silkscreenColor`
- `panelQty` / `boardQtyPerPanel` (số lượng board — từ module Panelize)
- `orderQuantity` (số lượng panel/board cần đặt — nhập tay ở module báo giá)
- `viaCount`, `drillHoleCount` (đếm được tự động từ Excellon — ảnh hưởng giá khoan)

Những trường này ban đầu có thể để trống/mặc định, module Viewer/Panelize sẽ tự điền dần khi xử lý file — đến khi làm module Báo giá thì dữ liệu đã có sẵn, chỉ cần đọc ra và tính.

### 9.4. Gợi ý công thức báo giá (khung tham khảo, chỉnh theo giá thực tế của bạn)

```
Giá = (Giá vật liệu theo diện tích panel × diện tích)
    + (Phụ phí theo số lớp)
    + (Phụ phí xử lý bề mặt)
    + (Phụ phí khoan: số lỗ × đơn giá/lỗ, hoặc bậc thang theo số lỗ)
    + (Phụ phí kỹ thuật nếu min trace/space nhỏ hơn ngưỡng chuẩn — từ DFM check)
    + Phí setup (cố định, giảm dần theo số lượng đặt)
  → nhân với số lượng, áp dụng chiết khấu theo bậc số lượng (tier pricing)
```

Nên để công thức này ở file cấu hình riêng (`pricing-rules.json` hoặc tương tự), **không hard-code trong logic** — để sau này tự chỉnh giá mà không cần nhờ AI sửa code lại.

---

**Tóm lại:** Bắt đầu bằng Electron + JS/three.js + bộ thư viện tracespace (gerber-parser, pcb-stackup) sẽ giúp bạn ra được bản MVP (view 3D top/bottom + đo kích thước + ghép panel) nhanh nhất với vibe-coding, vì phần khó nhất (parse chuẩn Gerber) đã có sẵn thư viện mã nguồn mở đáng tin cậy, thay vì phải tự viết từ đầu bằng C#.
