# Kế hoạch Cải tổ Phase 1 (Phase 1.1) — Giao diện 3 Cột HQDFM & Hỗ trợ file ZIP

## 1. Mục tiêu
- **Giao diện 3 cột phong cách HQDFM:**
  - **Cột Trái (Layers):** Bảng danh sách các lớp mạch (Top Silk, Top Solder, Top Copper, Bot Copper, Bot Solder, Bot Silk, Drill, Outline...) kèm mã màu riêng biệt, checkbox ẩn/hiện từng lớp.
  - **Cột Giữa (Canvas 2D):** Không gian render mạch 2D với zoom, pan, fit to view, background đen chuẩn CAD/CAM.
  - **Cột Phải (PCB Analysis):** Bảng thông số kỹ thuật (Layer Count, Dimensions WxH, Min Trace, Min Drill...).
- **Đọc file nén ZIP:**
  - Tự động nhận diện và giải nén file `.zip` chứa bộ Gerber trong RAM bằng `jszip`.
  - Tự động phân loại từng file trong ZIP bằng `whats-that-gerber`.
  - Parse AST bằng `@tracespace/parser` và tính toán kích thước bao (bounding box/dimensions).

## 2. Kế hoạch triển khai
1. Cài đặt `jszip`.
2. Cập nhật `src/core/GerberParser.ts`: Hỗ trợ đọc cả file đơn lẻ và file `.zip`, trích xuất file name, text content, parse AST và phân loại layer.
3. Cập nhật `src/models/BoardDataModel.ts`: Quản lý thông tin kích thước bo mạch, số lớp, trạng thái ẩn/hiện, bảng màu layer.
4. Cải tiến `src/modules/viewer2d/Viewer2D.tsx`: Render SVG các layer chồng lên nhau với đúng màu sắc HQDFM, hỗ trợ zoom/pan mượt mà.
5. Thiết kế lại `src/ui/Layout.tsx`:
   - Top Header bar chuẩn CAM software.
   - 3 cột (Left Layers, Center Canvas, Right Properties).
6. Build & kiểm thử TypeScript.
