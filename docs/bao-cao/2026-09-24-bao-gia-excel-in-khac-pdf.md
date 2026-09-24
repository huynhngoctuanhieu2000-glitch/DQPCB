# Báo giá: file Excel in ra không giống PDF xuất thẳng — 24/09/2026

Đã sửa · `a6fbb71`

- **Bộ file:** báo giá "Phạm Minh Đức — Project Outputs for TDA7498E_update 0926" (ảnh
  khách gửi 24/09). Bản PDF xuất thẳng để đối chiếu: `test/Bao gia Duc Quang 23_09_2026.pdf`,
  `test/Bao gia Friwro 22_09_2026.pdf`.

## Hiện tượng

Tải file Excel về rồi in (hoặc lưu) thành PDF thì ra một tờ khác hẳn nút **Xuất PDF** của app:

- Nội dung co lại chỉ chiếm hơn nửa trên trang A4 ngang, nửa dưới bỏ trắng.
- Chữ nhỏ hơn nhiều, đọc trên giấy rất khó.
- Không có khung viền ngoài bao khối ghi chú và khối tài khoản.
- Hai mã QR chuyển khoản chồng lên nhau.

## Nguyên nhân

Bản xem trước (và bản PDF) dựng tờ báo giá rộng **1062 px** — đúng bề ngang in được của A4
ngang, lề 8 mm ở 96 dpi — cao khoảng 700 px. Tỉ lệ 1062 × 700 gần đúng tỉ lệ vùng in của
trang, nên PDF phủ kín trang.

File Excel thì tự đặt bố cục riêng, hai chỗ lệch cộng dồn:

1. **Bề rộng cột đặt tay** (`7.9 / 80 / 10.7 / 18.4 / 14 / 7.4 / 16.7 / 16.7 / 88.7` ký tự)
   ≈ **1870 px**, rộng gấp 1.8 lần tờ PDF, trong khi chiều cao gần như bằng.
2. **Cỡ chữ ghi thẳng bằng point**: `size: 12` trong Excel là 12 pt = 16 px, to hơn chữ 12 px
   của bản xem trước 1/3 — nên cột phải nới rộng ra mới đủ chỗ, càng bè thêm.

Tờ bè như vậy, Excel in theo "ép vừa bề ngang một trang" phải co xuống còn khoảng 55% chiều
cao trang: chữ nhỏ, nửa dưới trắng. (Máy thử còn cho ra trang 22 × 17 inch vì `fitToPage`
tính với khổ của máy in mặc định, không phải A4.)

Hai lỗi nhỏ đi kèm:

- **Mã QR chồng nhau:** ExcelJS nhận số cột dạng số lẻ để neo ảnh, nhưng quy phần lẻ ra EMU
  bằng công thức riêng — *bề rộng cột tính theo KÝ TỰ × 10000*, nhỏ hơn bề rộng thật gần 7
  lần (1 ký tự ≈ 7 px ≈ 66 675 EMU). Mã thứ hai vì thế chỉ dịch được ~1/7 quãng cần dịch.
- **Chữ bị cắt:** dòng hàng đặt cứng chiều cao (22.8 pt) mà vẫn bật xuống dòng, nên tên file
  dài hai dòng chỉ hiện dòng trên; số tài khoản dài ở form VAT cũng bị cắt.

## Cách sửa

- Thêm `src/modules/quotation/sheetLayout.ts`: bề rộng 9 cột, chiều cao từng loại hàng và cỡ
  chữ — tất cả tính bằng **px của bản xem trước**. `QuotationPreview.tsx` và `exportExcel.ts`
  dùng chung bộ số này; phía Excel chỉ đổi đơn vị: 1 px = 0.75 pt, cột rộng w ký tự = 7w + 5 px.
- Khổ in đổi sang A4 ngang **lề 8 mm cả bốn cạnh**, đúng lề của bản xuất PDF.
- Tờ cao không quá **1.4 trang** thì ép vừa một trang (`fitToHeight = 1`), dài hơn mới cho
  sang trang hai — cùng luật với `exportImage.ts` khi xuất PDF.
- Dòng hàng **không đặt chiều cao** nữa, để Excel tự nới theo chữ; số tài khoản bỏ xuống dòng
  (tràn sang ô trống bên cạnh, như bản xem trước).
- Neo ảnh (logo, mã QR) bằng **EMU** (1 px = 9525 EMU) thay vì số cột dạng số lẻ.
- Thêm cho khớp bản xem trước: khung viền ngoài bao cả tờ, gạch ngang ngăn khối ghi chú với
  khối tài khoản, lời mở đầu in nghiêng.

## Cách kiểm

- Dựng file Excel mẫu, dùng Excel in ra PDF rồi so với PDF xuất thẳng, hai trường hợp:
  - báo giá lẻ 1 dòng: tờ phủ kín trang, cỡ chữ và vị trí từng khối khớp bản PDF;
  - báo giá VAT 7 dòng tên dài (xuống 2 dòng) + dòng giảm giá: vẫn gọn một trang, không cắt chữ.
- `test/quotation-excel.test.ts` (5 test) giữ giao kèo: bề rộng cột = cột bản xem trước đổi ra
  ký tự, cỡ chữ = cỡ px đổi ra point, chiều cao hàng theo `ROW_PX`, dòng hàng không có chiều
  cao cố định, khổ in A4 ngang lề 8 mm, báo giá 40 dòng thì `fitToHeight = 0`.

## Chưa xử lý

- **Hai số tài khoản:** bản PDF xếp cạnh nhau, mỗi số một mã QR ngay dưới. Excel chỉ đặt được
  chữ ở đầu ô nên mỗi số một dòng (hai mã QR vẫn cạnh nhau). Muốn giống hệt thì phải chèn hộp
  chữ (text box) — chưa làm.
- **Nền vàng "Ghi chú:"** trong Excel tô hết ô (cột B, 298 px), bản PDF chỉ tô ôm vừa chữ.
  Excel không tô riêng một đoạn chữ trong ô được.
