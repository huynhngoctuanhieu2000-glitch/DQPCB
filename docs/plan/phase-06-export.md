# PHA 6 — XUẤT FILE & BÁO CÁO

## Mục tiêu
Xuất kết quả công việc ra các định dạng chuẩn để **gửi nhà máy**, **lưu tài liệu**, hoặc **chia sẻ với đồng đội**.

## Phạm vi
1. **Xuất Gerber panel** (kế thừa từ [Pha 5](phase-05-panelization.md)) — RS-274X, kèm Excellon drill.
2. **Xuất ảnh** — PNG/JPG snapshot của viewport 2D hoặc 3D, chọn được độ phân giải (1x/2x/4x).
3. **Xuất PDF** — báo cáo bo mạch: ảnh top/bottom, kích thước, số lượng linh kiện SMD/THT, bảng lớp (layer table).
4. **Xuất báo cáo DFM** (kế thừa từ [Pha 4](phase-04-dfm-rulecheck.md)) — HTML/PDF với danh sách violation, ảnh minh hoạ, mức độ.
5. **Xuất BOM & Pick-and-Place** (nếu có file linh kiện nạp kèm) — CSV chuẩn JLCPCB/PCBWay.
6. **Xuất STEP/3MF** — mô hình 3D bo mạch để đưa vào SolidWorks/Fusion360 (Pha optional).
7. **Save project** — file `.dqpcb.json` chứa toàn bộ đường dẫn Gerber + cấu hình view + phép đo + DFM preset.

## Thư viện đề xuất
| Nhu cầu | Thư viện |
|---|---|
| Gerber writer | Tự viết theo spec Ucamco (Pha 5 đã có) |
| PDF | **`pdfmake`** hoặc **`jspdf`** |
| PNG/JPG từ canvas | Canvas API sẵn có trong Electron |
| STEP export từ three.js | **`occt-import-js`** (OpenCascade WASM) hoặc **`three-mesh-bvh`** + custom writer |
| 3MF export | **`three.js` 3MFExporter** (chưa chính thức, tham khảo cộng đồng) |
| ZIP nhiều file | **`jszip`** |

## Việc cần làm
- [ ] Menu **File → Export** với các submenu tương ứng.
- [ ] Dialog cấu hình cho từng loại export (độ phân giải, chọn lớp…).
- [ ] Template báo cáo PDF (logo, tiêu đề, bảng, ảnh).
- [ ] ZIP đóng gói: `board_gerber.zip` (tất cả file Gerber + Excellon + README.txt).
- [ ] Save/Load project `.dqpcb.json` — versioned schema.

## Tiêu chí hoàn thành (DoD)
- File Gerber panel xuất ra mở được bằng ≥ 3 phần mềm CAM khác (Gerbv, KiCad, CAM350).
- PDF báo cáo DFM in ra đúng, ảnh rõ nét ở A4.
- Save & Load project khôi phục lại đầy đủ view + measure + DFM setting.
