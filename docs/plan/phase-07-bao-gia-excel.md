# PHA 7 — XUẤT BÁO GIÁ EXCEL

## Mục tiêu
Từ bo đang mở trong app, xuất ra file báo giá Excel theo đúng mẫu Thiên Lam PCB đang dùng.

Hai form mẫu ở [templates/bao-gia/](../../templates/bao-gia/):
- `Bao gia Thanh Huy 07_09_26.xlsm` — khách lẻ, **không VAT**
- `Bao gia Dang Loc VAT 13_08_26.xlsm` — khách công ty, **có VAT 8%**

## Vì sao chọn Excel (không phải PDF)
PDF (jsPDF/pdfmake) không có sẵn glyph tiếng Việt, phải nhúng font Roboto/Noto và xử lý encoding. Excel dùng UTF-8, chạy ngay. Quan trọng hơn: báo giá cần **sửa được** — khách và người lập đều chỉnh giá, thêm dòng, tính lại.

Tách phần **dữ liệu báo giá** khỏi phần **xuất file**, sau này thêm PDF chỉ viết thêm một bộ xuất.

---

## 1. Cấu trúc form (đã phân tích từ file thật)

Hai form **dùng chung 90% bố cục**:

| Vùng | Vị trí | Nội dung |
|---|---|---|
| Header công ty | `D1:I2` (merged) | Tên, địa chỉ, hotline, email, website |
| Tiêu đề | `A3:I4` | BẢNG BÁO GIÁ GIA CÔNG MẠCH IN PCB |
| Thông tin khách | dòng 5–7 | Ngày báo giá, Kính gửi, liên hệ |
| Lời mở đầu | `A8` | đoạn văn cố định |
| Header bảng | dòng 9 | STT / TÊN / SỐ LỚP / KÍCH THƯỚC / MÀU PHỦ / SL / THÀNH TIỀN / ĐƠN GIÁ / GHI CHÚ |
| Line items | từ dòng 10 | mỗi bo một dòng |
| Tổng cộng | ngay sau items | khác nhau giữa 2 form — xem dưới |
| Ghi chú | cột B | điều khoản ship, thời gian, hiệu lực |
| Thông số mặc định | cột G | FR4, 1.6mm, 1oz, silkscreen trắng, HASL |
| Tài khoản | cột B | STK ngân hàng |
| Chữ ký | `G`/`I` | Khách hàng / Người lập |

### Khác nhau giữa hai form

| | Không VAT | Có VAT |
|---|---|---|
| Tên sheet | `Bao Gia` | `BAO GIA` |
| Cột B | TÊN FILE | TÊN HÀNG HOÁ |
| Thông tin khách | SĐT, Địa chỉ | **MST**, Email, Địa chỉ |
| Tổng | 1 dòng `TỔNG CỘNG` | 3 dòng: `Thành tiền trước thuế` → `Tiền thuế VAT (8%)` → `TỔNG CỘNG` |
| Tài khoản | cá nhân | công ty |
| Hoả tốc | 5–6 ngày | 4–5 ngày |

→ Làm **một template, một cờ `coVAT`**, không phải hai bộ code.

---

## 2. Dữ liệu app đã có sẵn

4 trong 9 cột điền tự động từ bo đang mở:

| Cột Excel | Nguồn |
|---|---|
| TÊN FILE | `boardState.projectName` |
| SỐ LỚP | `boardState.layerCount` |
| KÍCH THƯỚC | `bounds.widthMM × heightMM` → `"56*58mm"` |
| MÀU PHỦ | `boardState.maskColor` → nhãn tiếng Việt trong `MASK_COLORS` |

Nhập tay: SL, THÀNH TIỀN, GHI CHÚ.

**Lưu ý về đơn giá:** trong file mẫu, `H = G/F` — người lập nhập **THÀNH TIỀN**, đơn giá tự tính ngược. Không phải nhập đơn giá rồi nhân lên. Giữ đúng chiều này.

---

## 3. Những chỗ hỏng trong file mẫu — KHÔNG bê nguyên xi

Phải sạch trong file xuất ra:

**Công thức `#REF!`** — file Đăng Lộc có 33 dòng `G11:G43` = `=F11*#REF!`, tàn dư của lần sửa trước. Copy nguyên sẽ mang lỗi sang.

**Dòng rác lệch cột** — `A10:A43` chứa STT 2, 8, 9…40 với dữ liệu lẫn lộn (`A10=2`, `B10=100000`, `C10="Hỗ trợ phí ship…"`). Line item thật nằm ở `A44:A46`.

**Công thức tổng phức tạp** ở form không VAT:
```
=SUM(INDIRECT("G9:G" & (ROW()-1))) - 2*SUMIF(INDIRECT("A9:A" & (ROW()-1)), "", INDIRECT("G9:G" & (ROW()-1)))
```
Dùng `INDIRECT` để tự co giãn theo số dòng. Khi sinh file bằng code ta **biết chính xác** vùng dữ liệu, nên viết thẳng `=SUM(G10:G{n})` — ngắn, đọc được, không vỡ khi chèn dòng.

---

## 4. Việc cần làm

- [x] Cài `exceljs`
- [x] `src/modules/quotation/QuotationModel.ts` — kiểu dữ liệu báo giá (thông tin khách, danh sách dòng, cờ VAT, hằng số công ty). Độc lập với Excel.
- [x] `src/modules/quotation/exportExcel.ts` — dựng workbook từ model
- [x] `src/modules/quotation/QuotationPanel.tsx` — form nhập: thông tin khách, bảng dòng hàng (nút "Lấy từ bo đang mở"), chọn có/không VAT
- [x] `src/modules/quotation/QuotationPreview.tsx` — tab **Xem trước**: dựng lại đúng bố cục sẽ ghi ra file, xem trước khi xuất
- [x] Nút xuất trên toolbar, lưu file qua Electron dialog (`ipcMain.handle('quotation:save')`); chạy trên trình duyệt thì rơi về tải xuống
- [x] Giữ định dạng: gộp ô, viền, font Times New Roman, vùng in

Phần cố định (tên/địa chỉ công ty, số tài khoản, ghi chú, thông số mặc định, thuế
suất, người lập, gợi ý ghi chú) nằm ở [`src/config/quotation-defaults.json`](../../src/config/quotation-defaults.json)
— sửa thẳng ở đó, không cần đụng code. Panel vẫn cho chỉnh từng lần xuất.

### Làm thêm sau khi chạy thử

- [x] **Mở nhiều bo cùng lúc.** Trước đây `parseInputFiles` dồn mọi file thả vào
  chung một `rawFiles`, nên thả hai ZIP ra một bo lẫn lộn và `projectName` bị
  archive sau ghi đè. Nay tách thành `extractBundles` (mỗi archive một gói) và
  `buildBoard` (một gói một bo). `BoardDataModel` giữ danh sách bo; các trường của
  bo đang chọn vẫn trải phẳng lên `BoardState` nên viewer và Layout không phải sửa.
  Thanh trên có tab từng bo, bấm để chuyển, dấu ✕ để đóng.
- [x] **"Lấy từ bo đang mở" cho chọn bo.** Mở một bo thì thêm thẳng; nhiều bo thì
  xổ danh sách kèm số lớp và kích thước, có thêm mục "Thêm tất cả N bo".
- [x] **Ô GHI CHÚ.** Nở cao vừa nội dung (ghi chú hai dòng vẫn thấy đủ khi đã rời
  ô), và nút ▾ chọn nhanh từ `noteSuggestions`. Chọn khi đang có chữ thì nối xuống
  dòng chứ không đè lên. Xuống dòng ở đây thành xuống dòng thật trong ô Excel.

## 5. Tiêu chí hoàn thành
- Xuất được cả hai dạng (có/không VAT), mở bằng Excel không báo lỗi
- Bố cục và in ra khớp file mẫu
- Không còn `#REF!` hay dòng rác
- Công thức `TỔNG CỘNG`, `VAT`, `ĐƠN GIÁ` tính đúng và **sửa được** trong Excel
- Nhiều dòng hàng: thêm/bớt dòng thì tổng vẫn đúng

---

## 6. Những chỗ đã tự quyết — đổi được nếu không vừa ý

**`.xlsm` → `.xlsx`.** File xuất ra không có macro. Macro trong file mẫu là tàn dư
của file gốc kế toán (`vbaProject.bin` đi kèm một đống `definedName` trỏ sang
workbook khác đã mất, kiểu `MA_NX`, `NHAP_XT`, đa số đã `#REF!`), không phục vụ gì
cho báo giá.

**Thông tin công ty và số tài khoản** — để trong `quotation-defaults.json`, tự đổi
theo cờ VAT (không VAT → tài khoản cá nhân, có VAT → tài khoản công ty). Panel vẫn
sửa được, và chỉ tự đổi khi người lập chưa động tay vào.

**Tên người lập** — mặc định "Huỳnh Ngọc Tuấn Hiếu", nhập lại được ở panel.

**Thuế suất** — mặc định 8%, có ô nhập ở panel khi chọn form VAT. Nhãn dòng thuế
và công thức đều lấy theo con số này.

**Giá** — vẫn nhập tay. `src/config/pricing-rules.json` đã có sẵn khung để sau này
tính tự động; model báo giá tách khỏi bộ xuất nên thêm vào không phải sửa Excel.

**Khổ giấy** — bản kế hoạch ghi "A4 dọc" nhưng cả hai file mẫu đều là **A4 ngang**
(`orientation="landscape"`, scale 52% và 56%). Bám theo file thật: A4 ngang, ép vừa
một trang bề ngang.

**Hai lỗi chính tả trong file mẫu đã sửa** ở `quotation-defaults.json`:
"Phíp sợ thủy tinh" → "sợi", "Mạ thiết - HASL" → "Mạ thiếc". Muốn giữ nguyên bản cũ
thì sửa lại trong file config.
