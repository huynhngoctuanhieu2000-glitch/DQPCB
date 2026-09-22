# Đánh giá UX thao tác — nút bấm và điều khiển

Ngày 22/09/2026 · Chỉ đo và đánh giá, **chưa sửa code** (theo `CLAUDE.md`).

## Cách đo

- App chạy `npm run dev`, nạp 2 bo thật: `D:\JobDatMach\22-06\gerber_mcu_ss_aiq.zip`
  và `D:\JobDatMach\Anh Nhat\16-08-23\Gerber Anh Nhat.zip` (15 lớp).
- Đo DOM mọi phần tử bấm được (button, select, checkbox, div/span có
  `cursor: pointer`): kích thước, cỡ chữ, tương phản chữ/nền, có nhãn `title` không.
- Hai khung: máy tính 1135px và điện thoại 375×812.
- Quy chuẩn đối chiếu: skill `ui-ux-pro-max` (`.claude/skills/`), mục Touch,
  Accessibility, Forms & Feedback. Vùng chạm: iOS 44pt, Android 48dp, web tối thiểu
  24px (WCAG 2.5.8), cách nhau ≥ 8px. Tương phản chữ ≥ 4.5:1.

## Tóm tắt

| | Máy tính | Điện thoại (375px) |
|---|---|---|
| Phần tử bấm được | 89 | 10 màn chính · 39 bảng Thông tin · 64 bảng Lớp |
| Dưới 24px (dưới mức WCAG) | **66 (74%)** | phần lớn |
| 24–31px | 7 | — |
| Đạt ≥ 32px | 16 | chỉ ô nhập; 4 nút chân hộp Báo giá cao 28px |
| Chữ nút < 12px | 22 loại nút (10–11px) | như máy tính |
| Chữ/nền < 4.5:1 | 5 nút chính (mục 3) | như máy tính |
| Vòng focus bàn phím | không có quy định riêng | — |

Nhận xét chung: bố cục đã đúng (không tràn ngang, không gãy dòng ở 4 cỡ máy — xem
`docs/ui-dien-thoai.md`), nhưng **nút quá nhỏ và quá sát nhau** là vấn đề lớn nhất,
nhất là trên điện thoại. Các nút đang được làm cho chuột (20–22px), chưa làm cho
ngón tay.

## 1. Nút quá nhỏ — Mức: CAO

Đo ở điện thoại (rộng × cao, px):

| Chỗ | Nút | Kích thước | Ghi chú |
|---|---|---|---|
| Thanh trên | File · ⚙ · 📄 · + Mở | 31×22 · 23×22 · 40×22 · 54×22 | Bốn nút hay dùng nhất, đều dưới 24px cao |
| Thanh dưới | ✕ đóng bo | **18×20** | Sát ô chọn bo và nút + → dễ đóng nhầm bo |
| Thanh dưới | + mở thêm bo | 24×24 | Vừa chạm mức WCAG |
| Bảng Lớp | ✓ All On · ✕ All Off | **41×14 · 43×14** | Nhỏ nhất app; chữ 11px |
| Bảng Lớp | checkbox bật/tắt lớp | **13×13** | Mỗi bo 10–20 lớp, bấm liên tục |
| Bảng Lớp | 🎯 (soi lớp) | 23×18 | Không rõ công dụng nếu không rê chuột |
| Bảng Lớp | All / Top Side / Bot Side | 117×20 | Rộng đủ nhưng thấp |
| Bảng Thông tin | nút số lượng 5·10·15…200 | **26×20** | 11 nút sát nhau, cách 4px |
| Bảng Thông tin | Bảng tra / Công thức | 56×18 · 65×18 | Chữ 10px |
| Bảng Thông tin | ⚙ (mở Cài đặt) | **11×18** | Gần như không bấm trúng |
| Bảng Thông tin | ▸ Tuỳ chọn | 345×22 | Chữ 10px |
| Hộp Báo giá | ✕ đóng hộp | **11×18** | |
| Hộp Báo giá | ⤓ Từ bo · + Stencil · + Dòng · + Giảm giá | 58–75 × 22 | |
| Hộp Báo giá | ✕ xoá dòng hàng | ~14×18 | Xoá không hỏi lại (mục 2) |
| Các hộp | Khách lẻ / Công ty · tab Cài đặt | 63–66 × 26 | |

Ảnh hưởng: trên điện thoại bấm trượt, bấm nhầm nút kế bên (nhất là dãy số lượng và
✕ đóng bo). Trên máy tính dùng được nhưng mỏi mắt vì chữ 10–11px.

Đề xuất:
- Điện thoại: mọi nút **cao ≥ 36px, khuyến nghị 44px**; nút chỉ có icon ≥ 40×40;
  khoảng cách ≥ 8px. Có thể giữ hình nhỏ nhưng nới vùng chạm bằng padding.
- Máy tính: tối thiểu 28px cao, chữ nút ≥ 12px.
- Checkbox lớp: cả hàng là vùng bấm (bấm vào tên lớp cũng bật/tắt).
- Dãy số lượng: trên điện thoại xếp 2 hàng nút to hơn, hoặc ô số có nút −/+.
- Làm một bộ style nút dùng chung (mục 6) thay vì mỗi file tự đặt kích thước.

## 2. Nút phá huỷ sát nút thường, không hỏi lại — Mức: CAO

| Thao tác | Hiện tại | Rủi ro |
|---|---|---|
| ✕ trên tab bo / cạnh ô chọn bo | Đóng ngay | Nút 18×20 sát tên bo và nút +; đóng nhầm là mất phần nhập giá của bo đó |
| File → Đóng tất cả bo | Đóng ngay | Mất hết bo đang mở |
| ✕ xoá dòng trong Báo giá | Xoá ngay, không hoàn tác | Mất dòng đã gõ tay |
| Cài đặt → Mặc định | Đặt lại bảng giá (chưa Lưu thì còn huỷ được bằng Đóng) | Nằm cạnh Lưu; bấm Mặc định rồi Lưu là mất bảng giá tự nhập |

Đề xuất: "Đóng tất cả" và "Mặc định" → hỏi xác nhận. Đóng bo và xoá dòng → không cần
hỏi, nhưng hiện thanh "Đã đóng … · Hoàn tác" 5 giây. Tách ✕ xa vùng bấm tên bo.

## 3. Thứ bậc và tương phản nút — Mức: TRUNG BÌNH

- Chữ trắng trên nền màu sáng không đủ tương phản:

  | Nút | Tương phản | Cần |
  |---|---|---|
  | + Open Gerber ZIP (trắng / #10b981) | 2.5 : 1 | 4.5 : 1 |
  | 📄 Báo giá (trắng / #0ea5e9) | 2.8 : 1 | |
  | ↑ Đưa vào báo giá | 2.8 : 1 | |
  | nút số lượng đang chọn | 2.8 : 1 | |
  | Công thức · ⚙ · ▸ Tuỳ chọn · ✕ (chữ xám) | 3.1–3.8 : 1 | |

  Sửa: nền đậm hơn một bậc (`#059669`, `#0284c7`) hoặc chữ tối trên nền sáng.
- Thanh trên có **hai nút nổi bật cùng lúc** (Báo giá xanh dương + Open Gerber xanh lá)
  → mắt không biết đâu là việc chính. Nên giữ một nút đặc, nút kia chuyển sang kiểu viền.
- Hộp Báo giá: "Tải PDF" là nút chính — đúng. Nhưng trên web có tới 5 nút xuất (Tải
  PDF, Chia sẻ PDF, Tải Excel, Chia sẻ Excel, In): nên gộp Excel/In vào nút "Khác ▾".
- Nhãn trộn Anh–Việt: "Open Gerber ZIP", "All / Top Side / Bot Side", "All On / All
  Off", "Layers", "Drop Gerber ZIP file here", "Browse Files", "Fit" bên cạnh "Báo
  giá", "Cài đặt", "Lớp". Nên thống nhất tiếng Việt.

## 4. Nhận biết công dụng — Mức: TRUNG BÌNH

- Nút chỉ có icon: 📄, ⚙, 🎯, 📷, ✕. Có `title` nên máy tính rê chuột thấy nhãn, nhưng
  **điện thoại không rê chuột được** → 🎯 và 📷 gần như không ai hiểu. Cả `src` chỉ 1
  file có `aria-label`.
- Emoji làm icon hiện khác nhau giữa Windows / iPhone / Android (skill xếp là
  anti-pattern mức HIGH). Nên dùng một bộ icon SVG.
- Một số thứ bấm được là `div`/`span` có `onClick` (tab bo, menu File, tab trong bảng
  trượt điện thoại) → không dùng được bằng phím Tab/Enter, trình đọc màn hình không
  biết là nút.
- Không có quy định vòng focus (`:focus-visible`) → dùng bàn phím khó biết đang ở đâu.

Đề xuất: điện thoại hiện chữ dưới icon (hoặc chữ thay icon) cho 🎯 📷; đổi div/span
bấm được thành `<button>`; thêm `:focus-visible` một chỗ trong `index.css`.

## 5. Riêng điện thoại — Mức: TRUNG BÌNH

- **Nút Back của Android / vuốt lùi iPhone** thoát khỏi trang thay vì đóng hộp Báo giá
  / Cài đặt / bảng trượt đang mở (app không ghi lịch sử khi mở hộp).
- Hộp Báo giá: cột **Tên file** trong bảng dòng hàng bị bóp còn ~30px ("Gert…") trong
  khi là cột quan trọng nhất. Trên điện thoại nên hiện mỗi dòng hàng thành một thẻ (tên
  trên; số lớp, kích thước, SL, tiền bên dưới) thay vì bảng 9 cột cuộn ngang.
- Dãy "⤓ Từ bo · + Stencil · + Dòng · + Giảm giá" cuộn ngang: nút cuối bị cắt nửa,
  người dùng không biết còn nút phía sau.
- Khung thông tin (Viền / Khoan / Mũi nhỏ nhất / Load) đè lên phần trên của bo ở chế
  độ 2D, chiếm ~1/5 màn hình; nên thu gọn được.
- Nút "⤢ Fit" 52×28 ở góc dưới phải — đủ ngang nhưng thấp.

## 6. Nguyên nhân gốc

Mỗi file tự khai kích thước/màu nút (`S.smallBtn`, `S.tab`, `drawerBtn`, `S.chip`,
`S.segBtn`, `S.pathBtn`…) — cùng một loại nút có 5–6 bộ số khác nhau (padding 2–6px,
chữ 10–13px). Vì vậy nâng kích thước phải sửa rải rác và dễ sót.

Đề xuất: một file `src/ui/buttons.ts` (hoặc class CSS trong `index.css`) với 3 cỡ
(máy tính 28px · 36px · điện thoại 44px) × 3 kiểu (chính / phụ / nguy hiểm), có sẵn
`:focus-visible`, trạng thái disabled, và tự lên cỡ khi `useIsMobile()`.

## Thứ tự nên làm (ước lượng)

| # | Việc | Mức | Công |
|---|---|---|---|
| 1 | Bộ style nút dùng chung + vòng focus | nền cho các việc sau | 0.5 ngày |
| 2 | Vùng chạm điện thoại ≥ 40px: thanh trên, ✕ đóng bo, checkbox lớp, All On/Off, dãy số lượng, ⚙, ✕ hộp | Cao | 0.5 ngày |
| 3 | Hỏi lại / Hoàn tác: đóng bo, đóng tất cả, xoá dòng, Mặc định | Cao | 0.5 ngày |
| 4 | Tương phản nút chính + một nút chính trên thanh trên | Trung bình | 1–2 giờ |
| 5 | Back của điện thoại đóng hộp / bảng trượt | Trung bình | 2–3 giờ |
| 6 | Dòng hàng Báo giá dạng thẻ trên điện thoại | Trung bình | 0.5 ngày |
| 7 | Thống nhất nhãn tiếng Việt; icon SVG thay emoji | Thấp | 0.5 ngày |

Chờ chọn mục nào làm thì mới sửa code.
