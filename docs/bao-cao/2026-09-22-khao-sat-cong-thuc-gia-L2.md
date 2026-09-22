# Khảo sát công thức giá bo 2 lớp (L2) so với code — 22/09/2026

> **Chỉ khảo sát, KHÔNG sửa code.** Mọi con số của code lấy từ `priceFromFormula` / `computePrice`
> trong `src/modules/pricing/PricingModel.ts` với cấu hình đang có (`src/config/pricing-rules.json`,
> `materials.FR4`), không tính tay.

## 1. Hai công thức đặt cạnh nhau

Ký hiệu: **KT** = Dài × Rộng một tấm (cm²), **DT** = KT × Số lượng (cm²).

**Công thức cần kiểm** (chỉ làm tròn lên 1.000đ ở bước cuối):

- < 50 cái: `180.000 + 450 × DT`
- ≥ 50 cái: `360.000 + 1.300 × KT + 288 × DT`

**Code hiện tại**, chế độ `flat` (mặc định). Giá vốn tính bằng tệ, quy ra VND theo 4.000 × 1,8 = **7.200đ/tệ**:

- < 50 cái: `(20 + 0,054 × DT)` tệ, tức `144.000 + 388,8 × DT`
- ≥ 50 cái: `(50 + 0,18 × KT + 0,042 × DT)` tệ, tức `360.000 + 1.296 × KT + 302,4 × DT`

| Nhánh | Hệ số | Công thức cần kiểm | Code | Code chênh |
|---|---|---:|---:|---:|
| < 50 | Phí cố định | 180.000 | 144.000 | **−36.000 (−20%)** |
| < 50 | × DT (đ/cm²) | 450 | 388,8 | **−61,2 (−13,6%)** |
| ≥ 50 | Phí cố định | 360.000 | 360.000 | 0 |
| ≥ 50 | × KT (đ/cm²) | 1.300 | 1.296 | −4 (−0,3%) |
| ≥ 50 | × DT (đ/cm²) | 288 | 302,4 | **+14,4 (+5%)** |

## 2. Khác biệt ngoài hệ số

| # | Chỗ khác | Công thức cần kiểm | Code | Ảnh hưởng |
|---|---|---|---|---|
| 1 | Làm tròn | Lên 1.000đ ở cuối | Lên **1 tệ** (7.200đ) rồi mới lên 1.000đ | Code cao hơn tối đa khoảng 7.200đ mỗi đơn |
| 2 | Phí bo lớn | Không có | KT > 650 cm² thì cộng `bước × 20 + bước × DT / 1000` tệ, với bước = ⌈(KT − 650)/50⌉ | Bo lớn lệch **+10% đến +57%** (mục 4) |
| 3 | Mốc 50 cái | 50 cái tính nhánh ≥ 50 | Giống (`qty < 50` là nhánh nhỏ) | Khớp |
| 4 | Bo < 10×10 cm, không ghép panel | Tra bảng cố định | Tra bảng cố định (5 cái 180k, 10 cái 210k…) | Khớp |
| 5 | Chế độ tiered | Không có | Có đường giá bậc thang (ship, cước theo kg, 3 bậc hệ số, ×1,13) | Lệch −28% đến +23%, không theo quy luật |

## 3. Ví dụ trên bộ file thật

### 3.1 Nhánh < 50: Anh Toan, 18/09/2026

- Bộ file: `D:\JobDatMach\Anh Toan\2026\18-09\A Toan\Quoc Toan 5pcs 008- CPU-INO-V2.rar`
- Báo giá đã gửi: `Bao gia Anh Toan 18_09_26.pdf`, dòng 5: **008- CPU-INO-V2**, 2 lớp, 75×151mm, xanh lá, 5 cái, **485.000**
- Bo 7,5 × 15,1 cm lớn hơn 10×10 nên đi đường công thức.

KT = 7,5 × 15,1 = **113,25 cm²**. DT = 113,25 × 5 = **566,25 cm²**.

| Bước | Công thức cần kiểm | Code flat | Code tiered |
|---|---|---|---|
| Phí cố định | 180.000 | 20 tệ | 20 tệ |
| Diện tích | 450 × 566,25 = 254.812,5 | 0,054 × 566,25 = 30,5775 tệ | như flat |
| Cộng | 434.812,5 | 50,5775 → **51 tệ** (làm tròn lên) | 51 tệ |
| Quy VND | — | 51 × 7.200 = 367.200 | khối lượng 0,5 kg; ship 13 tệ; (13 + 51) × 3.800 + 0,5 × 100.000 = 293.200 → 294.000 + 25.000 = 319.000 |
| Hệ số | — | — | × 1,3889 = 443.056 → 444.000; × 1,13 = 501.720 |
| **Thành tiền** | **435.000** | **368.000** | **502.000** |
| So với công thức cần kiểm | — | **−67.000 (−15,4%)** | +67.000 (+15,4%) |
| So với giá đã báo (485.000) | −50.000 | −117.000 | +17.000 |

### 3.2 Nhánh ≥ 50: Do Huynh, 26/08/2026

- Bộ file: `D:\JobDatMach\Do Huynh\2026\26-08\OrderPCB_V51_260826.rar`
- Báo giá đã gửi: `Bao gia Do Huynh 26_08_26.pdf`, dòng 1: **OrderPCB_V51_260826**, 2 lớp, 88×123mm, phủ đen, 50 cái, **2.143.000**, có ghi chú "In số seri"

KT = 8,8 × 12,3 = **108,24 cm²**. DT = 108,24 × 50 = **5.412 cm²**.

| Bước | Công thức cần kiểm | Code flat |
|---|---|---|
| Phí cố định | 360.000 | 50 tệ |
| × KT | 1.300 × 108,24 = 140.712 | 0,18 × 108,24 = 19,4832 tệ |
| × DT | 288 × 5.412 = 1.558.656 | 0,042 × 5.412 = 227,304 tệ |
| Cộng | 2.059.368 | 296,7872 → **297 tệ**, × 7.200 = 2.138.400 |
| **Thành tiền** | **2.060.000** | **2.139.000** |
| So với công thức cần kiểm | — | **+79.000 (+3,8%)** |
| So với giá đã báo (2.143.000) | −83.000 | −4.000 |

Code tiered ra 2.056.000 (−0,2% so với công thức cần kiểm). Giá đã báo có thể đã gồm phụ phí phủ đen và in số seri. File `.xlsm` chỉ lưu thành tiền, không lưu cách tính, nên không suy ngược được.

## 4. Quét theo kích thước và số lượng

Chênh lệch = code − công thức cần kiểm. Không cỡ nào trong bảng rơi vào bảng tra (đều lớn hơn 10×10 cm).

| Cỡ (cm) | SL | Công thức cần kiểm | Code flat | Chênh flat | Code tiered | Chênh tiered |
|---|---:|---:|---:|---:|---:|---:|
| 10×15 | 5 | 518.000 | 440.000 | −78.000 (−15,1%) | 577.000 | +11,4% |
| 10×15 | 10 | 855.000 | 728.000 | −127.000 (−14,9%) | 777.000 | −9,1% |
| 10×15 | 30 | 2.205.000 | 1.894.000 | −311.000 (−14,1%) | 1.812.000 | −17,8% |
| 10×15 | 49 | 3.488.000 | 3.003.000 | −485.000 (−13,9%) | 2.568.000 | −26,4% |
| 10×15 | 50 | 2.715.000 | 2.823.000 | +108.000 (+4,0%) | 2.458.000 | −9,5% |
| 10×15 | 100 | 4.875.000 | 5.091.000 | +216.000 (+4,4%) | 4.391.000 | −9,9% |
| 10×15 | 200 | 9.195.000 | 9.627.000 | +432.000 (+4,7%) | 8.278.000 | −10,0% |
| 15×20 | 5 | 855.000 | 728.000 | −127.000 (−14,9%) | 777.000 | −9,1% |
| 15×20 | 30 | 4.230.000 | 3.644.000 | −586.000 (−13,9%) | 3.088.000 | −27,0% |
| 15×20 | 50 | 5.070.000 | 5.285.000 | +215.000 (+4,2%) | 4.524.000 | −10,8% |
| 15×20 | 200 | 18.030.000 | 18.893.000 | +863.000 (+4,8%) | 16.179.000 | −10,3% |
| 20×30 | 5 | 1.530.000 | 1.311.000 | −219.000 (−14,3%) | 1.286.000 | −15,9% |
| 20×30 | 30 | 8.280.000 | 7.143.000 | −1.137.000 (−13,7%) | 5.947.000 | −28,2% |
| 20×30 | 50 | 9.780.000 | 10.210.000 | +430.000 (+4,4%) | 8.676.000 | −11,3% |
| 20×30 | 200 | 35.700.000 | 37.426.000 | +1.726.000 (+4,8%) | 31.975.000 | −10,4% |
| 30×40 * | 5 | 2.880.000 | 4.536.000 | +1.656.000 (+57,5%) | 3.544.000 | +23,1% |
| 30×40 * | 30 | 16.380.000 | 18.576.000 | +2.196.000 (+13,4%) | 14.695.000 | −10,3% |
| 30×40 * | 50 | 19.200.000 | 26.396.000 | +7.196.000 (+37,5%) | 21.293.000 | +10,9% |
| 30×40 * | 200 | 71.040.000 | 95.084.000 | +24.044.000 (+33,8%) | 77.609.000 | +9,2% |

\* KT = 1.200 cm² > 650 nên code cộng phí bo lớn (286 tệ ở 5 cái, 2.860 tệ ở 200 cái).

**Nhận xét:**

1. **< 50 cái: code thấp hơn đều khoảng 14–15%.** Nguyên nhân là phí cố định thấp hơn 36.000đ và hệ số diện tích thấp hơn 61,2đ/cm². Đây là chỗ lệch lớn nhất và gặp nhiều nhất (đơn mẫu).
2. **≥ 50 cái, bo ≤ 650 cm²: code cao hơn khoảng 4–5%**, chủ yếu do hệ số DT 302,4 so với 288.
3. **Bo > 650 cm²:** code cao hơn nhiều vì có phí bo lớn, công thức cần kiểm không có.
4. **Giá tụt tại mốc 49 → 50 cái.** Theo công thức cần kiểm, 50 cái lại **rẻ hơn** 49 cái. Ví dụ 10×15 cm: 3.488.000 → 2.715.000, giảm 22%. Code cũng bị (3.003.000 → 2.823.000, −6%) nhưng nhẹ hơn. Khách đặt 45–49 cái sẽ có lợi nếu đặt lên 50.

## 5. Đề xuất (chưa làm, chờ anh quyết)

- Nếu chốt dùng công thức này cho L2, **không cần sửa code tính**, chỉ đổi hệ số L2 trong `pricing-rules.json`:
  - small: `base 25`, `area 0.0625` (= 180.000 / 7.200 và 450 / 7.200)
  - large: `base 50`, `board 0.180556`, `area 0.04` (= 1.300 / 7.200 và 288 / 7.200)
  - Như vậy vẫn còn lệch nhỏ do làm tròn lên 1 tệ (tối đa khoảng 7.200đ). Muốn khớp tuyệt đối thì phải bỏ bước làm tròn này, tức là sửa `PricingModel.ts`.
- Cần anh quyết thêm:
  1. Có giữ **phí bo lớn** (> 650 cm²) không?
  2. Có xử lý **giá tụt tại mốc 49 → 50** không, ví dụ lấy giá thấp hơn trong hai nhánh?
  3. Chế độ **tiered** có còn dùng không, hay chỉ dùng flat?
- Ngoài phạm vi, ghi lại để kiểm sau: báo giá `Dang Loc 17_09_26` (ATBTH500, 74×89mm, 2 lớp, 5 cái) đã báo 320.000, trong khi bảng tra ra 180.000.
