# PHA 3 — CÔNG CỤ ĐO KÍCH THƯỚC

## Mục tiêu
Cung cấp bộ công cụ **đo lường trực quan** trên bo mạch, cả 2D lẫn 3D, phục vụ kiểm tra thiết kế và DFM.

## Phạm vi
- **Đo khoảng cách 2 điểm** (point-to-point) — mm/inch/mil.
- **Đo đường kính lỗ khoan** — click vào lỗ, hiển thị Ø.
- **Đo độ rộng đường mạch (trace width)** — click 1 điểm trên trace.
- **Đo khoảng cách nhỏ nhất (clearance)** giữa 2 đối tượng (pad-pad, pad-trace, trace-trace, trace-edge).
- **Đo kích thước bo** — tự động hiển thị W × H từ lớp outline.
- **Đo góc** giữa 3 điểm.
- **Snap** vào tâm pad, mép trace, giao điểm, endpoint.
- Danh sách các phép đo đã tạo (sidebar), xoá / đổi tên / export.

## Thư viện đề xuất
| Nhu cầu | Thư viện |
|---|---|
| Geometry 2D (khoảng cách, giao điểm, offset) | **Clipper2** (JS port: `js-clipper2`) hoặc **`polygon-clipping`** |
| Nearest point / spatial index | **`rbush`**, **`flatbush`** |
| Snap engine | tự viết trên nền spatial index |

## Việc cần làm
- [ ] Thiết kế `MeasureEngine` — nhận input hình học từ Pha 1, trả về kết quả đo.
- [ ] Spatial index (R-tree) cho toàn bộ segment/pad để snap nhanh.
- [ ] UI: toolbar với các nút Measure (Distance / Diameter / Trace Width / Clearance / Angle).
- [ ] Overlay canvas riêng để vẽ đường đo, ghim label, không ảnh hưởng render Gerber.
- [ ] Chuyển đơn vị mm ↔ mil ↔ inch, độ chính xác 3-4 chữ số thập phân.
- [ ] Persist các phép đo vào file project (.json).

## Tiêu chí hoàn thành (DoD)
- Sai số đo ≤ 1 µm so với dữ liệu Gerber gốc.
- Snap chính xác vào tâm pad tròn/chữ nhật/oval.
- Đo clearance giữa 2 trace phức tạp trong < 500 ms.
