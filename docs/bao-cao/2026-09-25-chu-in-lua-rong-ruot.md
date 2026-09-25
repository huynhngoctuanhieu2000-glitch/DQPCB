# Chữ in lụa chỉ còn cái khung — bo nhỏ nhìn như mất chữ

Ngày 25/09/2026 · Khảo sát và **đã sửa** (mã commit ở cuối).

- **Bộ file:** `D:\JobDatMach\Mr Huy\2026\25-09\Gerber_mach-remote-esc_PCB_mach-remote-esc_2026-09-24.zip`
  (EasyEDA, bo 15.24 × 24.73 mm, 2 lớp)
- Hiện tượng anh gửi: mở ở **2 Mặt**, chữ in lụa (`U1`, `R2`, `H3`, `C1`, `LED1`…) và khung
  linh kiện chỉ còn **đường viền rỗng ruột**; bo nhỏ nên nhìn như mất luôn chữ.

## Lỗi 1 — `renderThree` vẽ vùng tô thành viền rỗng

**Đo được.** Lớp in lụa của bộ này có **293 vùng tô**, mỗi vùng đúng 4 đoạn
(`line, arc, line, arc`) — tức là **viền quanh một nét vẽ** (hai đầu bo tròn), đúng như mọi
file khác: `plot()` biến mọi nét thành vùng tô.

Dựng lại chính lớp đó ngoài app bằng cách **tô đặc** từng vùng (ảnh 1000 px) thì ra chữ ĐẶC,
khung ĐẶC — đúng như bản vẽ của khách. Còn trong app, đường vẽ thường (`renderThree` của
web-gerber) cho ra viền rỗng: nét mảnh thì nhìn vẫn như một vạch, nhưng nét chữ dày hơn thì
lộ ruột rỗng, và bo nhỏ thì chữ biến mất.

**Đã sửa.** Lớp **in lụa luôn vẽ bằng lưới nhanh** (`fastLayer.ts`, làm ngày 23/09) thay vì
`renderThree` — lưới nhanh tô đặc từng vùng nên ra đúng bản vẽ. Không đụng tới lớp đồng và
lớp phủ (đang vẽ đúng), và lớp in lụa nào có hình đảo cực thì vẫn đi đường cũ (lưới nhanh
chưa biết khoét).

Đổi lại: lớp in lụa ở 3D là hình phẳng, không có bề dày — với lớp mực in thì không đáng kể.
Bù lại bo nhẹ hơn: lụa 293 hình còn **5.382 đỉnh** thay vì **359.172 đỉnh**.

## Lỗi 2 — Lưới nhanh bị cull mất một nửa (lỗi của bản 24/09)

Khi thử cho lớp lụa này đi đường lưới nhanh thì **gần như không thấy gì**, dù lưới dựng ra đủ
5.382 đỉnh và ô bao trùng khít bo.

**Nguyên nhân:** vật liệu của lưới nhanh để mặc định `side = FrontSide`, mà vùng tô trong file
có thể vẽ theo **chiều kim đồng hồ** — tam giác quay mặt sau, three cắt bỏ. Bộ FRIWO hôm
23/09 may mắn vẽ ngược chiều kim đồng hồ nên không lộ.

**Đã sửa:** vật liệu lưới nhanh đặt `side = DoubleSide`.

Lỗi này có từ `bf511b8` (23/09) và ảnh hưởng mọi lớp đi đường nhẹ, nên đáng lẽ bộ FRIWO
P84390 cũng có thể mất lớp tuỳ chiều vẽ của file.

## Kiểm

- Bộ "mach-remote-esc": CAM và 2 Mặt đều ra chữ đặc, khung đặc — khớp ảnh dựng từ file.
- Tấm FRIWO 55807.930 (30 bo) vẫn đọc và vẽ đúng, bộ nhớ trang 356 MB với 2 bo đang mở.
- 196 test pass · `npm run build` chạy · checklist giao diện điện thoại 375 / 360: không cuộn
  ngang, không phần tử lòi ra, nút không gãy dòng.

## Còn tồn

- Lớp in lụa có hình đảo cực vẫn vẽ bằng đường cũ (viền rỗng). Chưa gặp bộ nào như vậy trong
  corpus, nhưng muốn chắc thì phải cho `fastLayer` biết khoét.
- Chưa tìm ra vì sao `renderThree` tô đặc được vùng của lớp đồng mà không tô vùng của lớp
  lụa — đây là bên trong thư viện, ghi lại để khỏi đoán lại.
