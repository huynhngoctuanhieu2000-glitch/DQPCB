# Phase 07 — Tính giá

Nguồn: `Tinh gia/bao-cao-cong-thuc-gia.html` (đọc từ sheet *TÍNH GIÁ KHÁCH → Bản giá mới 7_26*).
File báo cáo nằm ngoài repo, không commit.

## Hai đường giá, không gặp nhau

```
bo ≤ 10×10cm, không ghép panel, đúng loại bảng phủ  →  BẢNG TRA theo số lượng
mọi trường hợp còn lại                               →  CÔNG THỨC theo diện tích
```

**Bảng tra** — 11 mốc số lượng nhà máy nhận, giá là *thành tiền cả đơn*:

| pcs | 5 | 10 | 15 | 20 | 25 | 30 | 40 | 50 | 100 | 150 | 200 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| đ | 180K | 210K | 348K | 395K | 472K | 531K | 683K | 832K | 1.443K | 2.083K | 2.483K |

Bảng rẻ hơn công thức rất nhiều (bo 10×10cm, 5 pcs: bảng 180K, công thức 339K) — đây là
hai kênh giá riêng, không gộp được.

## Ba quyết định đã chốt

| Câu hỏi | Chốt |
|---|---|
| Số lượng ngoài 11 mốc | Nhà máy không có mốc khác → app báo `off-table`, **không nội suy**, người lập nhập tay. Nội suy ra con số nhà máy không bán là bịa. |
| Số lượng > 200 | Như trên. Không ngoại suy. |
| Tỉ giá CNY→VND (F-01) | **Giữ nguyên hai số như sheet**: đường phẳng 4.000, đường bậc thang 3.800. Bảy ca đối chiếu khớp sheet 100%. Sửa được trong Cài đặt. |
| Bảng tra áp cho loại bo nào | Bảng chỉ có một cột giá → khai báo `table.coversOption = "L2"`. Chọn mạ vàng / mạch dẻo / 4 lớp thì tự rơi sang công thức, kèm lý do hiện trên thẻ. Đây là **suy đoán** — sheet không ghi rõ; sai thì sửa một dòng trong Cài đặt. |

## Kiến trúc — ba tầng tách bạch

| Tầng | File | Vai trò |
|---|---|---|
| Cấu hình | `src/config/pricing-rules.json` | Mọi hằng số của sheet. Không con số nào nằm trong code. |
| Hàm thuần | `src/modules/pricing/PricingModel.ts` | `roundUp`, `priceFromTable`, `priceFromFormula`, `computePrice`. Không đọc file, không format, không đụng React. |
| Trạng thái | `src/modules/pricing/PricingStore.ts` | JSON mặc định + phần sửa ở localStorage. Trộn theo khoá nên thêm trường mới vào JSON không làm hỏng bản lưu cũ. |
| Hiển thị | `PricingCard.tsx`, `settings/SettingsPanel.tsx` | Thẻ ở cột phải + màn Cài đặt. |

## Lỗi của sheet đã vá

| ID | Vá |
|---|---|
| F-01 | Hai tỉ giá thành hai trường có tên rõ, không còn nằm lẫn trong công thức |
| F-02 | `mode: 'flat' \| 'tiered'`, mặc định khai báo trong config |
| F-04 | Phí thêm cộng ở một chỗ chung — sheet quên cộng ở dòng 1 lớp |
| F-05 | `priceRoundedVnd` và `priceWithVatVnd` tách hẳn nhau |
| F-06 | Một hằng `qtyBreak`, một toán tử `<` cho cả sáu phương án |
| F-07 | `base` tính một lần rồi gán biến |
| F-09 | `marginMultiplier` thay hệ số `*1` chết |
| F-11 | Chặn qty ≤ 0 và kích thước ≤ 0 ngay đầu vào, ném lỗi có thông điệp |
| F-13 | `totalAreaCm2` tách khỏi `boardAreaCm2` |

Còn treo: **F-12** — phí bo lớn đang nhân theo số lượng, không có trần, đúng như sheet.
Nếu đây là phí kỹ thuật một lần thì bỏ nhân số lượng; cần chốt chính sách trước khi sửa.

## Test

`test/pricing.test.ts` — `npm test`. 32 ca:

- Bảy ca T1–T7 của Bảng 6, lấy thẳng số đang hiện trong sheet
- Các đại lượng trung gian (F3 · G3 · N3 · M3)
- `roundUp` ở mọi bậc, kể cả nhiễu dấu phẩy động và số âm
- Biên 49/50 pcs cho cả sáu phương án (F-06)
- qty = 0, kích thước âm, phương án không tồn tại → ném lỗi
- 11 mốc bảng tra, off-table hai đầu, ngưỡng kích thước khi bo xoay 90°
- Chọn đường giá: ghép panel, bo lớn, `forceFormula`, `coversOption`

Màn Cài đặt chạy lại bảy ca T1–T7 ngay trên cấu hình đang sửa dở và hiện đỏ khi lệch —
sửa hằng số làm sai giá thì biết tại chỗ, không phải chờ tới lúc báo giá cho khách.
