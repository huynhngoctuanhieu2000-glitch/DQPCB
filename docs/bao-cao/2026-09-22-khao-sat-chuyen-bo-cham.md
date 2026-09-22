# Khảo sát: chuyển qua lại giữa các bo đang mở bị chậm

Ngày 22/09/2026 · Khảo sát xong thì được đồng ý làm cả 3 đề xuất — kết quả ở cuối.

## Hiện tượng

Mở 3 file, đang xem file 3, bấm lại tab file 1 → phải chờ vài giây mới hiện. Người dùng nghĩ
file đã tải lên là đã đọc xong, nên tưởng app bị treo.

## Số đo (bản dev, chế độ CAM, 3 bo mở cùng lúc)

| Bấm sang bo | Từ lúc bấm tới khi hình hiện | Log dựng hình |
|---|---|---|
| CHAT_BOT_4 (bo nhỏ) | 0.47 s | 395 ms, 9 lớp, **0 từ cache** |
| FRIWO 55807.931-90FE | **3.30 s** | 3241 ms, 8 lớp, **0 từ cache** |
| PHAONUOC | 1.89 s | 1783 ms, 9 lớp, **0 từ cache** |
| FRIWO (bấm lại lần 2) | **3.23 s** | 3158 ms, 8 lớp, **0 từ cache** |

Đối chiếu: dựng lại **cùng một bo** (đổi chế độ xem, mở 2 Mặt) lấy từ cache chỉ mất
**~4 ms** ("8 lớp, 8 từ cache").

## Nguyên nhân

`src/modules/viewer2d/Viewer2D.WebGL.tsx`:

1. **Bộ nhớ hình đã dựng chỉ giữ MỘT bo.** `built` chứa hình của đúng một `board.layers`;
   `ensureBuildCache` thấy bo khác là **xoá sạch rồi dựng lại từ đầu**. Bo đã mở, đã xem rồi,
   quay lại vẫn dựng lại như lần đầu — lần 2 vẫn "0 từ cache".
2. Dựng hình (`renderThree` của web-gerber) chạy **đồng bộ trên luồng giao diện**: suốt
   1–3 s đó cả app đứng yên, không bấm được gì.
3. **Không có dấu hiệu đang tải khi chuyển bo.** Màn chờ chỉ bật lúc mở file mới; chuyển tab
   thì khung xem đứng im với bo cũ tới khi bo mới dựng xong.

Phần đọc file (giải nén, nhận diện lớp) **không** chạy lại khi chuyển bo — dữ liệu đã đọc vẫn
giữ trong `BoardDataModel`. Chậm hoàn toàn ở bước dựng hình.

## Đề xuất

1. **Giữ hình đã dựng cho từng bo** (thay một `built` bằng bảng theo bo): quay lại bo đã
   xem → lấy từ cache, ~vài ms như đổi chế độ xem. Giải phóng GPU khi **đóng** bo, không phải
   khi chuyển bo. Giới hạn số bo giữ trong bộ nhớ (vd 5 bo gần nhất) để không đầy bộ nhớ đồ
   hoạ khi mở nhiều panel lớn.
2. **Dựng sẵn các bo còn lại lúc rảnh**: mở 3 file thì bo cuối hiện trước, hai bo kia dựng
   dần ở nền → lần đầu bấm sang cũng nhanh. Đổi lại: CPU bận thêm vài giây ngay sau khi mở.
3. **Hiện màn chờ khi chuyển sang bo chưa có trong cache** (dùng lại màn chờ lúc mở file), để
   người dùng biết đang tải chứ không phải treo.

Làm (1) + (3) là đủ cho trường hợp đã báo (bo đã xem rồi quay lại). (2) chỉ cần nếu muốn cả
lần bấm đầu tiên sang bo chưa xem cũng nhanh.

## Đã làm (22/09, được đồng ý cả 3 đề xuất)

`Viewer2D.WebGL.tsx`, `Layout.tsx`:

1. **Cache theo từng bo** (`boardCaches`, tối đa 5 bo dùng gần nhất). Bo đã đóng, hoặc đọc
   lại vì chọn tay loại lớp, thì giải phóng GPU ở lần dựng kế tiếp. Lớp dựng ra rỗng cũng
   ghi vào cache để khỏi dựng lại.
2. **Màn chờ "Đang dựng hình…"** khi chuyển sang bo chưa có hình cho chế độ đang xem
   (`isBoardBuilt`): bật màn chờ trước, 40 ms sau mới chuyển để màn chờ kịp hiện.
3. **Dựng sẵn ở nền** (`schedulePrebuild`): bo đang xem hiện xong 0.6 s thì dựng dần các bo
   còn lại theo chế độ xem hiện tại, mỗi lượt một lớp lúc trình duyệt rảnh, để giao diện vẫn
   bấm được. Đổi bo / đổi chế độ thì lượt cũ tự dừng. Khoá cache tính chung một hàm
   (`layerSpec`) với cảnh nên dựng sẵn ra đúng khoá cảnh cần.

Đo lại (cùng 3 bo, bản dev):

| Bấm sang bo | Trước | Sau |
|---|---|---|
| FRIWO 55807 (CAM) | 3.30 s | **0.06 s** (8/8 lớp từ cache) |
| PHAONUOC (CAM) | 1.89 s | **0.05 s** |
| CHAT_BOT_4 (CAM, lần 2) | 0.47 s | **0.08 s** |
| FRIWO ở 2D — chưa từng xem 2D, đã dựng sẵn ở nền | chưa đo (CAM là 3.3 s) | **0.055 s** |
| PHAONUOC ở 2D, bấm ngay khi vừa đổi chế độ (chưa kịp dựng sẵn) | ~1.8 s, không báo gì | ~1.8 s, **có màn chờ** |

Còn lại: lần bấm đầu tiên ngay sau khi mở file (bo kia chưa kịp dựng sẵn) có thể phải chờ
lớp đang dựng dở ở nền xong — đo được một lần 1.6 s. Một lớp nặng (lụa panel lớn) dựng mất
tới ~1.5 s, không chia nhỏ hơn được vì web-gerber dựng cả lớp một lần.
