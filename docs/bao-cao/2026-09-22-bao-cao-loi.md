# Báo cáo lỗi — 21–22/09/2026

Phạm vi: phần **đọc file** (viền, khoan, slot) và **báo giá ghép panel**. Tất cả lỗi đều
gặp trên bộ file thật của khách; mỗi lỗi có đường dẫn để mở lại.

Tóm tắt:

| # | Lỗi | Bộ file | Trạng thái |
|---|---|---|---|
| 1 | Lỗ slot / lỗ chữ nhật Altium không hiện | Vu Bao — AGVH7 | Đã sửa · `8e2ada0` |
| 2 | Hai bo chung cạnh nối thành vòng "số 8", mất nửa thân bo | Le Quoc Huy — Dynamic Master, Slaver (panel) | Đã sửa · `8e2ada0` |
| 3 | Rail bị khoét thủng | Le Quoc Huy — Dynamic Master | Đã sửa · `8e2ada0`, chỉnh lại `f9121a0` |
| 4 | Đường phay hở bị tô thành mảng bo | Le Quoc Huy — Slaver (panel) | Đã sửa · `8e2ada0`, chỉnh lại `f9121a0` |
| 5 | Rãnh / lỗ khoét trong bo không hiện ở 2D, 3D | Le Quoc Huy — Ceiling Master | Đã sửa · `8e2ada0` |
| 6 | Hồi quy do lỗi 3–4: khấc mép, lỗ mouse-bite, bo con hở viền | AC_Board, Dual USB, SAL-66 | Đã sửa · `f9121a0` |
| 7 | Bảng tra giá vẫn áp cho bo ghép panel | (luật giá) | Đã sửa · `9884463` |
| 8 | File khoan Altium `FILE_FORMAT=4:3` co 100 lần, lỗ dồn ngoài góc | Nguyen Van Quang — ESP32_DR | Đã sửa · `f186434` |
| 9 | Nhiều lớp viền: GM1 (khung linh kiện) thành thân bo | Le Quoc Huy — Slaver_Ceiling bản lẻ | Đã sửa · `f186434` |
| 10 | J11 của ESP32_DR: đồng/lỗ sát mép, vạch trắng có khấc | Nguyen Van Quang — ESP32_DR | Không phải lỗi — file vẽ vậy |
| 11 | Hộp chọn file bản web không mở đúng thư mục vừa dùng | (mở file) | Đã sửa · `49468cd` |

---

## 1. Lỗ slot / lỗ chữ nhật Altium không hiện

- **Bộ file:** `D:\JobDatMach\Vu Bao\2026\21-09\Vu Bao 5pcs Green AGVH7.zip`
- **Hiện tượng:** 6 lỗ slot trong `AGVH7-SlotHoles.TXT` không vẽ; badge chỉ ghi file lỗ tròn.
- **Nguyên nhân:**
  1. Altium vẽ slot và lỗ chữ nhật bằng lệnh **phay**: `G00` tới điểm đầu → `M15` hạ dao →
     `G01` chạy → `M16` nhấc dao. Bộ đếm cũ chỉ đếm dòng bắt đầu bằng `X`, nên file slot
     ra **0 lỗ** và bị viewer bỏ qua (dù đã dựng được hình).
  2. `RoundHoles.TXT` chứa cả lỗ mạ lẫn lỗ Ø3.2 không mạ. Bộ đọc chỉ nhìn dòng `;TYPE=`
     đầu tiên → gán PTH. Sửa riêng cho đúng "mixed" thì viewer lại coi nó là file khoan
     GỘP và chỉ vẽ nó → slot vẫn mất.
- **Cách giải quyết:**
  - `countExcellonHoles`: mỗi lần hạ dao `M15` là một lỗ; dòng chỉ có `Y…` (giữ X cũ)
    cũng là một lỗ (trước bị bỏ sót → đếm thiếu ở rất nhiều bộ).
  - `drillPlatingOf`: đọc TỪNG mục `;TYPE=`, mục nào có mũi thật; có cả hai → `mixed`.
  - `isPartialDrillFile`: file tách theo **hình lỗ** của Altium (`RoundHoles`,
    `SlotHoles`, `RectHoles`, `SquareHoles`, `Slot.txt`) là một phần của bộ khoan → vẽ hết.
- **Kiểm:** hồi quy 238 bộ; số lỗ mới khớp số hình dựng được (vd. 28 → 150 = 150;
  453 = 445 tròn + 8 slot). 4 test mới.
- **Vấn đề còn tồn:** xem mục "Vấn đề còn tồn" cuối file (`.DRD`).

## 2. Hai bo chung cạnh nối thành vòng "số 8"

- **Bộ file:** `D:\JobDatMach\Le Quoc Huy\2026\21-09\Gerber\` — *Dynamic Master*, *Slaver_Ceiling*
- **Hiện tượng:** Dynamic Master: vùng rơ-le bo dưới trắng toát giữa mạch. Slaver: 3D cắt
  chéo mất hai góc bo.
- **Nguyên nhân:** panel V-cut vẽ mỗi bo một đường bao, hai bo chung một cạnh. Ở góc chung
  có 4 đoạn gặp nhau, bước nối viền (`chainUp`) đi thẳng sang bo bên cạnh → MỘT vòng ôm cả
  hai bo, đi qua cạnh chung hai lần. Đa giác tự chạm thì tô sai.
- **Cách giải quyết:** `stitchOutline` → `splitAtRepeats`: tách chuỗi tại đỉnh bị đi qua
  hai lần (chỉ đỉnh trùng khít ≤ 0.001 mm và phần tách có diện tích ≥ 1 mm², để không vỡ
  góc bo tròn KiCad 10 vẽ bằng hàng trăm đoạn ngắn). Xét cả chuỗi HỞ (Slaver: cạnh chung
  bo–rail chỉ vẽ một lần).
- **Kiểm:** test dựng lại đúng dáng Dynamic Master (bản cũ ra 1 vòng 12 đoạn, bản mới 2 vòng).

## 3. Rail bị khoét thủng

- **Bộ file:** Dynamic Master (rail 5 mm trên/dưới), nhiều bộ "Rail" trong corpus.
- **Nguyên nhân:** luật cũ "vòng < 5% vòng lớn nhất là lỗ khoét" chạy trước khi xét vị trí.
  Rail 144.8 × 5 mm chỉ bằng 2.4% khung → bị khoét.
- **Cách giải quyết:** vòng không nằm trong vòng nào thì không phải lỗ — **trừ** vòng nhỏ
  mà không dài như rail (xem lỗi 6). "Dài như rail" = dài ≥ nửa một cạnh của cả tấm.

## 4. Đường phay hở bị tô thành mảng bo

- **Bộ file:** Slaver_Ceiling (panel) — đường gấp khúc tách cụm đầu nối.
- **Nguyên nhân:** nét hở ≥ 3 đoạn được giữ và tô như vòng kín → hai đầu hở nối thẳng.
- **Cách giải quyết:** loại thứ ba `lines`: nét hở nằm trong một vòng khác và hở RÕ (khoảng
  hở ≥ nửa chiều dài nét) → chỉ vẽ nét, không tô, không khoét.

## 5. Rãnh / lỗ khoét trong bo không hiện ở 2D, 3D

- **Bộ file:** `...\Gerber\Le Quoc Huy Gerber Ceiling Master LAF 14072025.zip`
- **Hiện tượng:** CAM thấy rãnh 38 × 1.24 mm và lỗ Ø3.5 mm; 2D/3D không thấy.
- **Nguyên nhân:** viền theo **inch**. Ở 2D/3D lỗ khoét được tách sang cụm khoan (để xuyên
  suốt bề dày bo) nhưng không đổi inch → mm: nhỏ đi 25.4 lần, dồn về một góc. CAM không bị
  vì lỗ khoét là con của lớp Outline, ăn theo phép đổi đơn vị của lớp.
- **Cách giải quyết:** nhân 25.4 cho lỗ khoét khi tách ra (`Viewer2D.WebGL.tsx`).
- **Phạm vi:** mọi bộ có viền inch.

## 6. Hồi quy do lỗi 3–4

Chạy hồi quy 138 bộ sau `8e2ada0`: 43 bộ đổi cách chia vòng, trong đó có lỗi thật:

| Bộ | Lỗi | Sửa (`f9121a0`) |
|---|---|---|
| Chinh Pham — AC_Board_Mon22_2 | Khấc mép vẽ lấn ra ngoài cạnh 0.025–0.037 mm → không "nằm trong" → thành thân bo | "Nằm trong" = tâm trong vòng chứa và ≥ nửa ô bao chồng lên |
| Anh Giang TL — Dual USB Switch-Panel | Lỗ mouse-bite giữa các bo (không nằm trong bo nào) thành thân bo | Vòng nhỏ lẻ vẫn là lỗ, trừ khi dài như rail |
| Nguyen Duy Thuc — SAL-66 | Bo con hở viền một khe nhỏ bị coi là nét phay → mất nền | Chỉ là nét khi khoảng hở ≥ nửa chiều dài |

Sau sửa còn 30 bộ khác bản cũ; xem hình cũ/mới từng bộ: không bộ nào tệ đi, nhiều bộ tốt
hơn (rail hết bị khoét: Gerber Rail, pmtaudio, Rail mtfc, PCA 2x1, ph_analyzer; PHAONUOC hết
tam giác chéo sai; Rosario: rãnh móc câu nhất quán là lỗ).

## 7. Bảng tra giá vẫn áp cho bo ghép panel

- **Hiện tượng:** chế độ "file ghép sẵn" (⇅) vẫn tra bảng giá nhà máy.
- **Luật đúng:** bảng tra chỉ cho **bo đơn lẻ** — không ghép panel, không nhiều thiết kế,
  không mouse bite, không V-cut.
- **Cách giải quyết:** tích "Ghép panel" (bất kỳ kiểu nào) là buộc đi công thức; nút
  "Bảng tra" khoá, ghi lý do "đã ghép panel".

## 8. File khoan Altium `FILE_FORMAT=4:3` co 100 lần

- **Bộ file:** `D:\JobDatMach\Nguyen Van Quang\2026\22-09\Nguyen Van Quang 5pcs Green Project Outputs for ESP32_DR.zip`
- **Hiện tượng:** không lỗ khoan nào nằm trên bo; một cục trắng ngoài góc dưới trái. Pad
  oval hàng chân ESP32 không có lỗ.
- **Nguyên nhân:** file khoan khai `;FILE_FORMAT=4:3` + `METRIC,LZ`: `X0050419` = 50.419 mm.
  web-gerber **không đọc dòng chú thích** này, áp mặc định → 0.50419 mm. Luật cũ của DQPCB
  lại cố tình bỏ qua file có khai FILE_FORMAT vì tưởng web-gerber đọc được. Inch 2:4 (AGVH7)
  vô tình trùng mặc định nên không lộ. **Lỗi có từ trước** — `347bc53` cũng sai y hệt.
- **Cách giải quyết:** `reader.ts` — có `FILE_FORMAT=a:b` + kiểu số 0 (LZ/TZ) + toạ độ chưa
  có dấu chấm → tự chèn dấu thập phân đúng format (LZ bù đuôi, TZ bù đầu); dò trên mọi toạ
  độ X/Y kể cả sau `G00/G01` (RectHoles/SlotHoles).
- **Kiểm:** hồi quy 171 bộ có FILE_FORMAT: 5 bộ đổi, **cả 5 từ 0 lỗ trong bo → đủ lỗ**
  (RGBW_LED LINEAR 0→134/134, LOA_CADCAM 0→64/64, Bidirectional_Switch 0→203/203,
  Nguyen Tan Tai 0→153/153, GERBER_DRILL 0→182/182). Không bộ nào tệ đi. Test mới.

## 9. Nhiều lớp viền — GM1 thành thân bo

- **Bộ file:** `D:\JobDatMach\Le Quoc Huy\2026\21-09\Slaver_Ceiling_ EC_21092026.zip` (bản lẻ, Altium gốc)
- **Hiện tượng:** 2D chỉ có hai mảng xanh đậm; phần còn lại của bo không có nền.
- **Nguyên nhân:** có hai lớp nhận là viền: `.GKO` (viền thật) và `.GM1` (Mechanical 1 — ở
  bộ này chỉ là khung hai rơ-le). Kích thước lấy đúng lớp lớn nhất, nhưng viewer lấy lớp
  viền dựng **sau cùng** làm thân bo → GM1. **Lỗi có từ trước** (`347bc53` đã bị).
- **Cách giải quyết:** chỉ lớp viền có ô bao lớn nhất (so bằng mm) dựng thân bo; lớp còn lại
  chuyển thành tài liệu "… (viền phụ)", tắt sẵn, vẫn bật xem được.
- **Corpus:** 34/614 bộ có nhiều lớp viền — 21 trùng khít (không đổi), 13 nằm trong (như
  Slaver), 1 lấn ra ngoài.

## 10. J11 của ESP32_DR — không phải lỗi

- Hàng pad trên của J11 cách mép bo 0.75 mm; đồng mặt trên chạy tới y = 91.06 mm, **vượt
  viền (90.80) 0.26 mm** → vùng xám phía trên pad là ngoài bo, đúng như file.
- Vạch trắng có khấc nửa tròn là **in lụa** khung linh kiện (khấc = dấu chân số 1).
- Nên báo khách: đồng lấn ra ngoài viền, lỗ sát mép.

## 11. Hộp chọn file bản web không mở đúng thư mục vừa dùng

- **Hiện tượng:** bấm mở file, hộp thoại vào một thư mục cũ trong lịch sử.
- **Nguyên nhân:** đó là hộp chọn của **trình duyệt** (bộ lọc "Custom Files…", logo ứng dụng
  Claude ở góc) — đang dùng **bản web**, không phải app Electron. Nhớ thư mục (hộp chọn gốc
  Windows) chỉ có ở Electron; trên web trình duyệt tự quyết. Kèm lỗi nhỏ ở Electron: đường
  dẫn thư mục bo chỉ tách theo "/", Windows dùng "\\".
- **Cách giải quyết:** bản web Chrome/Edge (kể cả khung trình duyệt của Claude, bản Vercel
  https) dùng File System Access API — `showOpenFilePicker` / `showDirectoryPicker` với
  `id: 'dqpcb-gerber'`: trình duyệt tự mở lại thư mục lần trước. Huỷ không báo lỗi. Trình
  duyệt chưa hỗ trợ (Firefox, Safari, điện thoại) dùng hộp chọn cũ. Sửa tách đường dẫn.
- **Kiểm:** preview có đủ hai API, là secure context; việc mở lại đúng thư mục cần thử tay.

---

## Vấn đề còn tồn

1. **`.DRD` bị chọn thay `THRUHOLE.tap`** (Dinh Quang Viet — Gerber Dinh Quang Viet.zip,
   Dinh Ngoc Tram — AUTOMATION-2): `.drd` đang gán là dữ liệu khoan (Eagle) nhưng ở các bộ
   này có vẻ là bản vẽ khoan; viewer chọn file "gộp" nhiều lỗ nhất. Đã có từ trước.
2. **Tam giác chéo sai** ở một số panel (Rail.zip, GWLRWEX-CELLULAR, ph_analyzer…): đa giác
   viền tô lệch. Bản cũ cũng bị y hệt.
3. **Chưa nhận biết file đa thiết kế:** CHAT_BOT_1 (4 bo ghép) vẫn đi bảng tra khi chưa tích
   Ghép panel — app đếm được số bo trong viền, có thể tự nhắc.
4. **V-cut / mouse bite chưa vào giá:** chỉ nhắc nhở (cạnh < 15 mm, tấm V-cut < 70 mm), công
   thức chưa có phí V-cut.
5. **Báo giá ghép panel ghi số set hay số PCB** — đang ghi số set, chờ chốt.
6. **DFM chưa có:** đồng/lỗ khoan ngoài hoặc quá sát viền (như J11 của ESP32_DR) chưa tự báo.

## Ghi chú: "mất logo" khi chụp (22/09) — không phải lỗi app

Khi kiểm ảnh chụp trong khung trình duyệt của Claude, hàm ghi clipboard của trang bị thay
tạm để đọc ảnh ra. Anh dùng đúng tab đó nên bấm Copy không vào clipboard, dán ra ảnh cũ →
tưởng mất logo. Tải lại tab là hết. Từ nay kiểm clipboard/ảnh chụp bằng **tab riêng**.

## Cách kiểm lại

- `npx vitest run test/*.test.ts` — 131 test.
- `npm run build` — build thật (`tsc -b` chặt hơn `tsc --noEmit`; lỗi build Vercel ở
  `f12b339` là do chỉ chạy lệnh nhẹ).
- Hồi quy corpus: script trong `test/_scratch/` (không commit) so bản cũ/mới trên
  `D:\JobDatMach` — viền (số vòng, thân/lỗ/nét), khoan (tỉ lệ lỗ nằm trong bo).
