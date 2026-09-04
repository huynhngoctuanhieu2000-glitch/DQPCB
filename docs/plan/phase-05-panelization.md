# PHA 5 — GHÉP PANEL (PANELIZATION)

## Mục tiêu
Cho phép **ghép nhiều bản copy của một board (hoặc nhiều board khác nhau) lên 1 panel lớn** để tối ưu chi phí sản xuất và phù hợp máy SMT.

## Phạm vi
- Cấu hình:
  - Số **hàng × cột** (array N×M).
  - **Gap** giữa các board.
  - **Rail** (dải viền trên/dưới hoặc trái/phải) — chiều rộng chỉnh được.
  - **Fiducial marks** trên rail (3 marks tam giác chuẩn SMT).
- Phương pháp tách:
  - **V-cut** (đường rạch chữ V).
  - **Mouse-bite** (lỗ khoan nhỏ đục lỗ tab break-away) — cấu hình đường kính lỗ, số lỗ, khoảng cách.
  - **Tab route** (phay tab, có mouse-bite hoặc không).
- Xoay board 0/90/180/270°, mirror.
- Ghép nhiều board khác nhau vào cùng panel (multi-design panel).
- Preview 2D + 3D.
- **Xuất Gerber panel** mới (tất cả các lớp) sẵn sàng gửi nhà máy.

## Thư viện đề xuất
| Nhu cầu | Thư viện |
|---|---|
| Boolean 2D (ghép polygon, cut tab) | **Clipper2** |
| Gerber writer (xuất Gerber) | **`@tracespace/plotter`** ngược lại, hoặc tự viết theo spec Ucamco |
| Tham khảo | **KiKit** (panelizer KiCad, Python — MIT) — github.com/yaqwsx/KiKit |

## Việc cần làm
- [ ] Data model `Panel { boards[], layout, rails, gaps, tabMethod }`.
- [ ] UI dialog Panelize: nhập N×M, gap, rail, chọn tab method.
- [ ] Engine sinh **layer outline mới của panel** (GKO gộp).
- [ ] Sinh **mouse-bite / v-cut** trên các gap.
- [ ] Sinh **fiducial** trên rail (copper + mask).
- [ ] Gerber writer: xuất từng lớp panel ra RS-274X hợp lệ.
- [ ] Kiểm tra: mở lại panel Gerber vừa xuất trong app → phải trùng preview.

## Tiêu chí hoàn thành (DoD)
- Ghép 3×3 board 50×50 mm → panel 160×160 mm với rail 5 mm, gap 2 mm, mouse-bite.
- Gerber panel xuất ra mở được bằng **CAM350 / Gerbv / KiCad** không lỗi.
- Đường V-cut/mouse-bite đúng vị trí, kích thước theo cấu hình.
