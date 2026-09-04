# Kế hoạch triển khai Phase 0 & Phase 1 — Gerber 2D Viewer

Bản kế hoạch này định nghĩa các bước thực thi để thiết lập nền tảng dự án và hoàn thiện tính năng đọc/hiển thị 2D Gerber theo yêu cầu của dự án **DQPCB**.

## 1. Mục tiêu
- **Phase 0:** Khởi tạo dự án Electron + React + TypeScript với kiến trúc thư mục chuẩn.
- **Phase 1:** Đọc file Gerber (RS-274X) bằng thư viện `@tracespace/parser`, nhận diện loại file bằng `whats-that-gerber` và vẽ 2D lên màn hình với khả năng zoom/pan cơ bản.

## 2. Kiến trúc & Cấu trúc thư mục
Dựa trên tài liệu thiết kế, dự án sẽ sử dụng **Electron + React + TypeScript**.
Cấu trúc sẽ được tạo ra tại thư mục gốc như sau:
```text
src/
├── core/            # Chứa logic parse Gerber (GerberParser.ts), tách biệt hoàn toàn với UI
├── models/          # Chứa BoardDataModel.ts (quản lý state trung tâm)
├── modules/
│   └── viewer2d/    # Logic hiển thị 2D, zoom, pan
├── ui/              # React components (Layout, Sidebar, Dropzone)
└── config/          # Cấu hình dự án
```

## 3. Các bước triển khai (Workflow cho Subagents)

### Bước 1: Setup Dự án (Thợ triển khai - Builder)
1. Chạy lệnh khởi tạo Electron + React + Vite + TypeScript.
2. Cài đặt các thư viện thiết yếu:
   - `react`, `react-dom`, `typescript`
   - `@tracespace/parser`, `@tracespace/plotter`, `whats-that-gerber`
3. Thiết lập cấu trúc thư mục như Mục 2.
4. Cấu hình cơ bản để chạy được app Electron (hiển thị "Hello World").

### Bước 2: Xây dựng Core Parser & UI Layout (Thợ triển khai - Builder)
1. **Core:** Viết module `src/core/GerberParser.ts` để đọc file text và dùng `@tracespace/parser` parse ra AST.
2. **UI:** Tạo Layout chính gồm 1 Sidebar bên trái (danh sách layer) và 1 Vùng hiển thị chính (Canvas).
3. Hỗ trợ thao tác Drag & Drop file vào app.

### Bước 3: Render 2D & Tương tác (Thợ triển khai - Builder)
1. Tích hợp render Gerber AST thành hình ảnh hiển thị lên vùng chính (sử dụng SVG qua `@tracespace/plotter` hoặc render lên `<canvas>`).
2. Thêm tính năng Zoom (cuộn chuột) và Pan (kéo thả chuột).
3. Hiển thị danh sách các layer ở Sidebar với nút bật/tắt.

### Bước 4: Kiểm thử tự động & Báo cáo (AI Test)
1. Viết script test/mô phỏng ngầm để đảm bảo tiến trình parse Gerber không bị crash với các file mẫu trong `sample-gerbers/`.
2. Kiểm tra log render UI.
