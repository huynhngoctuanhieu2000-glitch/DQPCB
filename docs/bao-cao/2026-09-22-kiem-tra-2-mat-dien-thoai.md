# Kiểm tra chế độ "2 Mặt" trên điện thoại và máy tính bảng

Ngày 22/09/2026 · Chỉ đo và đánh giá, **chưa sửa code** (theo `CLAUDE.md`).

## Cách đo

- Bản đã commit `4a5cce1`, chạy trong worktree riêng (phiên khác đang sửa dở `Layout.tsx`
  và `Viewer2D.WebGL.tsx` trên cây chính).
- Bo thật: `D:\JobDatMach\Anh Nhat\16-08-23\Gerber Anh Nhat.zip` (80 × 75 mm) và
  `D:\JobDatMach\22-06\gerber_mcu_ss_aiq.zip`.
- Khung: điện thoại dọc 375×812, điện thoại ngang 812×375, máy tính bảng dọc 820×1180.
  Đo DOM (kích thước khung vẽ, vị trí nút/nhãn) và chụp màn hình.

## Tóm tắt

| # | Vấn đề | Mức | Gặp ở |
|---|---|---|---|
| 1 | Xoay máy / đổi cỡ khung thì bo thu nhỏ còn ~1/8, bấm "Vừa khung" cũng không to lại | **Cao** | mọi cỡ, cả máy tính khi đổi cỡ cửa sổ |
| 2 | Màn dọc chia đôi trái/phải: mỗi mặt chỉ rộng 174px, ~75% chiều cao bỏ trống | Cao | điện thoại dọc, máy tính bảng dọc |
| 3 | Nhãn tên bo lòi dưới mép màn hình và chồng lên nút "Vừa khung" bên trái | Trung bình | điện thoại ngang |
| 4 | Nút "Chụp" copy ảnh vào clipboard — trên điện thoại báo lỗi, và điện thoại cần gửi/lưu ảnh hơn là copy | Trung bình | điện thoại |
| 5 | Hai thanh công cụ chiếm 100/375px (27%) chiều cao khi xoay ngang | Thấp | điện thoại ngang |
| 6 | Hai nút "Vừa khung" to (106×40) ở hai góc dưới, chiếm chỗ nhìn bo | Thấp | điện thoại |

## 1. Xoay máy thì bo thu nhỏ, "Vừa khung" không cứu được — Mức: CAO

**Hiện tượng:** mở 2 Mặt ở màn dọc (bo vừa khung), xoay sang ngang → mỗi mặt chỉ còn
~50px trong khung rộng 392px. Bấm "Vừa khung" ở cả hai khung: không đổi. Tải lại trang
ở tư thế ngang thì bo vừa khung đúng — tức là lỗi chỉ xảy ra khi khung đổi cỡ sau khi đã dựng.

**Nguyên nhân** (`src/modules/viewer2d/Viewer2D.WebGL.tsx`):

- `fitDist` — khoảng cách camera để bo vừa khung — được tính **một lần** lúc dựng cảnh,
  theo tỉ lệ khung lúc đó (dòng ~1056: `Math.max(h, w / aspectNow())`).
- `ResizeObserver` (dòng ~1160) chỉ cập nhật kích thước renderer và `cam.aspect`, không
  tính lại `fitDist`.
- `resetView` (nút "Vừa khung", dòng ~1099) đặt `view.dist = fitDist` — dùng lại con số
  cũ. Giới hạn zoom `minDist`/`maxDist` cũng tính theo `fitDist` cũ.

Khung dọc 174×712 rất hẹp → `fitDist` lớn (bị bề ngang giới hạn). Sang khung ngang
392×275 vẫn dùng khoảng cách đó → bo nhỏ xíu.

Cùng lỗi này xảy ra ở máy tính khi đổi cỡ cửa sổ, mở/đóng bảng bên, hoặc đổi từ 1 khung
sang 2 Mặt nếu cảnh được giữ lại.

**Đề xuất:** tính `fitDist` bằng hàm theo tỉ lệ khung hiện tại; `resetView` gọi hàm đó;
trong `ResizeObserver`, nếu người dùng chưa zoom/kéo (đang ở trạng thái vừa khung) thì
tự vừa khung lại. Giới hạn zoom tính theo `fitDist` mới.

## 2. Màn dọc chia đôi trái/phải — Mức: CAO

| Khung | Mỗi mặt (rộng × cao) | Bo hiển thị | Chiều cao bỏ trống |
|---|---|---|---|
| Điện thoại dọc 375×812 | 174 × 712 | ~150px rộng | ~75% |
| Máy tính bảng dọc 820×1180 | 396 × 1080 | ~290px rộng | ~75% |
| Điện thoại ngang 812×375 | 392 × 275 | vừa khung (sau khi tải lại) | ít |

Bo PCB thường nằm ngang hoặc gần vuông, nên chia trái/phải trên màn dọc là phí nhất.

**Đề xuất:** màn dọc (cao > rộng) thì xếp **trên/dưới** — TOP ở trên, BOT ở dưới. Ở
375×812 mỗi mặt thành ~375 × 350 → bo rộng ~340px, **to gấp ~2.2 lần**. Màn ngang giữ
trái/phải như hiện tại. Ảnh "Chụp" (dùng để gửi khách) giữ bố cục trái/phải như cũ — chỉ
đổi cách xem trên màn hình.

## 3. Nhãn tên bo lòi mép dưới, chồng nút — Mức: TRUNG BÌNH

Điện thoại ngang 812×375: nhãn "Gerber Anh Nhat | 2 lớp | 80.00 x 75.00 mm" nằm ở
y 356→388, **lòi 13px dưới mép màn hình**, và chồng lên nút "Vừa khung" của khung TOP
(276→382, 325→365).

Nhãn đặt theo mép bo trong khung (`BoardBadge`, `Layout.tsx`) nhưng không kẹp vào vùng
nhìn thấy, cũng không né các nút nổi.

**Đề xuất:** kẹp vị trí nhãn trong khung (chừa 8px + chiều cao nút đáy), hoặc trên điện
thoại đặt nhãn ở trên cùng giữa hai nhãn TOP/BOT.

## 4. Nút "Chụp" trên điện thoại — Mức: TRUNG BÌNH

- Nút copy ảnh hai mặt vào **clipboard**. Khi thử trên khung điện thoại, app báo đỏ
  "Trình duyệt chặn copy vào clipboard — bấm vào khung bo rồi thử lại".
  *Lưu ý:* lần thử là bấm bằng script, trình duyệt có thể coi là không phải thao tác của
  người dùng — chưa chắc trên máy thật cũng lỗi. Nhưng Safari iPhone vốn hạn chế ghi ảnh
  vào clipboard.
- Dù copy được, trên điện thoại người dùng cần **gửi Zalo / lưu ảnh**, không phải dán.
- Thanh báo lỗi đỏ nằm đè lên nhãn BOT và không tự tắt (còn nguyên sau khi xoay máy).

**Đề xuất:** trên điện thoại (hoặc khi clipboard lỗi) mở bảng chia sẻ với file PNG —
dùng lại `shareOrDownload` đã có cho PDF (Zalo, Lưu ảnh…); máy không có bảng chia sẻ thì
tải ảnh về. Thông báo lỗi tự tắt sau vài giây.

## 5. Thanh công cụ chiếm chỗ khi xoay ngang — Mức: THẤP

Điện thoại ngang: thanh trên (48px) + thanh dưới (52px) = 100 / 375px chiều cao. Khung
xem còn 275px.

**Đề xuất:** khi màn thấp (< 480px cao) gộp hai thanh làm một hàng, hoặc ẩn thanh trên
(Tệp / ⚙ / Báo giá / Mở vẫn vào được từ menu).

## 6. Hai nút "Vừa khung" — Mức: THẤP

Mỗi khung một nút 106×40 ở góc dưới (điện thoại dọc: 58→164 và 259→365, y 762). Chiếm
chỗ và trùng việc. Có sẵn cử chỉ chạm đúp để vừa khung.

**Đề xuất:** trên điện thoại chỉ hiện icon (40×40), hoặc một nút chung "Vừa khung cả hai".

## Thứ tự nên làm

| # | Việc | Công |
|---|---|---|
| 1 | Tính lại vừa khung theo cỡ khung hiện tại (mục 1) — sửa cả máy tính | 1–2 giờ |
| 2 | Màn dọc xếp TOP/BOT trên–dưới (mục 2) | 2–3 giờ |
| 3 | Kẹp nhãn tên bo trong khung (mục 3) | 1 giờ |
| 4 | "Chụp" → chia sẻ/lưu ảnh trên điện thoại; lỗi tự tắt (mục 4) | 1–2 giờ |
| 5 | Thanh công cụ gọn khi xoay ngang; nút Vừa khung chỉ icon (mục 5, 6) | 1 giờ |

Chờ chọn mục nào làm thì mới sửa code.
