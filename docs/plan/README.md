# KẾ HOẠCH THEO PHA (PHASES) — GERBER DFM VIEWER

Mỗi file trong thư mục này mô tả **một pha (phase) = một nhóm tính năng** của phần mềm.
Các pha được sắp xếp theo thứ tự triển khai đề xuất (pha sau kế thừa pha trước).

## Danh sách các pha

| # | Pha | File | Trạng thái |
|---|-----|------|------------|
| 1 | Đọc & hiển thị 2D Gerber (đúng kích thước, đúng lớp viền bo GKO/GM1) | [phase-01-gerber-2d-viewer.md](phase-01-gerber-2d-viewer.md) | 📋 Kế hoạch |
| 2 | Hiển thị 3D bo mạch (top/bottom, stack-up) | [phase-02-3d-view.md](phase-02-3d-view.md) | 📋 Kế hoạch |
| 3 | Công cụ đo kích thước (measure) | [phase-03-measure-tools.md](phase-03-measure-tools.md) | 📋 Kế hoạch |
| 4 | DFM Rule Check tự động | [phase-04-dfm-rulecheck.md](phase-04-dfm-rulecheck.md) | 📋 Kế hoạch |
| 5 | Ghép Panel (Panelization) | [phase-05-panelization.md](phase-05-panelization.md) | 📋 Kế hoạch |
| 6 | Xuất file (Gerber panel mới, PDF, PNG, báo cáo DFM) | [phase-06-export.md](phase-06-export.md) | 📋 Kế hoạch |
| 7 | Xuất báo giá Excel theo mẫu Thiên Lam PCB | [phase-07-bao-gia-excel.md](phase-07-bao-gia-excel.md) | ✅ Xong |

## Nguyên tắc chung

- Mỗi pha có thể **release độc lập** (MVP tăng dần).
- Ưu tiên **dùng thư viện mã nguồn mở** trên GitHub trước khi tự viết.
- Stack chính (đề xuất): **Electron + TypeScript + three.js** (xem [Ke-hoach-phan-mem-Gerber-DFM-Viewer.md](../Ke-hoach-phan-mem-Gerber-DFM-Viewer.md)).
