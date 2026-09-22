# Quy tắc làm giao diện điện thoại (≤ 768px)

Rút từ các lỗi đã gặp khi đưa DQPCB lên web/PWA (tháng 9/2026). Sửa gì trên
giao diện cũng phải đối chiếu danh sách này TRƯỚC khi commit.

## 1. Khung và vùng an toàn

- Dùng `100dvh`, không `100vh` — `100vh` trên Safari iPhone cao hơn màn thật, nút
  đáy bị thanh địa chỉ che.
- App chạy toàn màn hình (thêm vào màn hình chính) nên nội dung tràn dưới đồng hồ
  / pin. Khung gốc (`Layout.tsx`) đã lùi bằng `env(safe-area-inset-top/bottom)`,
  **nhưng mọi hộp thoại `position: fixed` không hưởng lề đó** — hộp full màn hình
  (`modalMobile`) phải tự thêm `paddingTop/Bottom: env(safe-area-inset-*)`.
  (Lỗi đã gặp: hộp Báo giá bị đồng hồ đè lên tiêu đề.)
- Viewport: `maximum-scale=1, viewport-fit=cover`. Không dùng mẹo ép ô nhập 16px
  để chặn iOS tự phóng — nó làm lệch cỡ chữ cả app.
- Điểm gãy: một nơi duy nhất `src/ui/useIsMobile.ts` (`max-width: 768px`). Không
  tự viết `matchMedia` ở chỗ khác.

## 2. Bố cục

- Hộp thoại trên điện thoại = trọn màn hình (`width 100vw, height 100dvh`, không bo
  góc, không viền). Không dùng `min(…, 94vw)` rồi mong nó vừa.
- Hai cột bên (Lớp / Thông tin) không thành hai ngăn kéo hẹp — gộp thành **một
  bảng trượt từ đáy**, full bề ngang, có tab. Bảng thông tin cần bề ngang để đọc.
- **Không bao giờ để thân hộp cuộn ngang.** Bảng rộng hơn màn thì bọc riêng trong
  `<div style={{ overflowX: 'auto' }}>` — bảng tự cuộn tại chỗ, thân hộp đứng yên.
- Đầu hộp: chỉ giữ tiêu đề (không xuống dòng) + tab + nút đóng; bỏ phụ đề, rút
  nhãn dài ("Khách lẻ (không VAT)" → "Khách lẻ", "Về mặc định" → "Mặc định").
- Chân hộp nhiều hơn 3 nút thì xếp **lưới 2 cột** (`className="quote-footer"` +
  CSS trong `index.css`), không để `flex-wrap` tự gãy thành hàng lởm chởm. Công tắc
  Nhập liệu/Xem trước và dòng trạng thái chiếm cả hàng (`span2`).
- Dãy tab bo: trên điện thoại từ 2 bo trở lên đổi thành ô chọn (`<select>`); nút
  **+** mở thêm bo phải có ở cả hai dạng.

## 3. Ô nhập, ô chọn, nút

- `button, input, select, textarea { font-family: inherit }` (đã có trong
  `index.css`). `<select>` trên iOS còn tự vẽ to/đậm/mũi tên riêng → đặt
  `appearance: none` và vẽ mũi tên ▼ bằng span riêng, dùng đúng style của nút bên
  cạnh (`drawerBtn`).
- Nhãn nút trên điện thoại: icon hoặc 1–2 từ (📄, ⚙, "+ Mở"); nhãn đầy đủ để trong
  `title`.
- Nút chỉ có icon: cỡ tối thiểu 30×30, không để chữ dài kế bên chồng lên (lỗi đã
  gặp: "BOT — nhìn từ dưới" đè lên "📋 Copy ảnh 2 mặt" → rút thành BOT + 📷).
- Không trộn `background` với `backgroundColor`, `border` với `borderColor` trong
  cùng một phần tử qua hai style spread — React cảnh báo và màu nhấp nháy.

## 4. Xem trước / nội dung khổ cố định

- Nội dung có bề ngang cố định (tờ báo giá 928px) đặt trong `ZoomBox`: mở ra là
  **co vừa bề ngang**, người dùng zoom hai ngón / nút +− / Ctrl+lăn; đo bằng
  `useLayoutEffect` để không loé bản 100% trước.
- Tách phần "tờ" thuần (`QuotationSheet`) khỏi khung có nút; in PDF và xuất ảnh
  dùng tờ thuần, không bao giờ để nút zoom lọt vào PDF.

## 5. Xuất file / chia sẻ trên điện thoại

- Web không có Electron: PDF dựng trong trình duyệt (`html2canvas` → `pdf-lib`).
  **Không dùng `<svg><foreignObject>` → canvas**: Safari dựng ở bề ngang màn hình
  rồi kéo giãn, chữ gãy dòng, mất mã QR.
- `html2canvas` phải đặt `windowWidth` ≥ bề ngang tờ, không thì iframe dựng lại
  rộng bằng màn điện thoại.
- Tờ dài hơn 1 trang ≤ 1.4 lần thì co vừa 1 trang, đừng cắt ngang mã QR.
- Chia sẻ: `navigator.canShare({files})` kiểm tra **đúng MIME** (có máy nhận PDF
  nhưng không nhận .xlsx); luôn có nút Tải bên cạnh nút Chia sẻ.
- Chữ trong tờ: font Times trên iPhone rộng hơn Times New Roman một chút — dòng
  nào không được gãy thì `whiteSpace: nowrap` và để cỡ dư ~10%.

## 6. Cách kiểm tra (bắt buộc trước khi báo xong)

Trình duyệt trong app đặt khung 375×812 (Viewport → Mobile). Ảnh chụp của pane
hay bị treo, nên **đo bằng DOM** thay vì nhìn:

```js
// dán vào javascript_tool: hộp thoại có tràn ngang không, phần tử nào lòi ra
const modal = document.querySelector('[style*="100dvh"]') || document.body
const body = [...modal.children].find(c => getComputedStyle(c).overflowY === 'auto') || modal
JSON.stringify({
  vw: innerWidth,
  bodyOverflow: [body.scrollWidth, body.clientWidth],
  wide: [...modal.querySelectorAll('*')]
    .filter(e => e.getBoundingClientRect().right > innerWidth + 1)
    .slice(0, 5).map(e => e.tagName + ':' + e.textContent.slice(0, 20)),
  wrappedButtons: [...modal.querySelectorAll('button')]
    .filter(b => b.getBoundingClientRect().height > 40).map(b => b.textContent),
})
```

Checklist:
1. `bodyOverflow[0] === bodyOverflow[1]` (không cuộn ngang).
2. `wide` rỗng; `wrappedButtons` rỗng (nút không gãy 2 dòng).
3. Đầu hộp một dòng; chân hộp ≤ 3 hàng lưới.
4. `read_console_messages onlyErrors` sau khi tải lại: không có cảnh báo style.
5. `npx tsc -b` sạch.
6. Máy tính (khung desktop) không đổi.
