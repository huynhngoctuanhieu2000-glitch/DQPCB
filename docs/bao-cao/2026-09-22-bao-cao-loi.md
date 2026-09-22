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
| 12 | Rãnh phay vẽ bằng một nét trong lớp viền bị bỏ, bo "đọc thiếu" | Nguyen Van Quang — CHAT_BOT_4 | Đã sửa · `706ea9f` |
| 13 | CAM: nét phụ của lớp viền hiện màu xanh mask | (viewer) | Đã sửa · `706ea9f` |
| 14 | OrCAD Layout: vẽ bản vẽ khoan `.DRD` thay cho `thruhole.tap` | Dinh Anh Tuan — DA82 (+ 252 bộ OrCAD) | Đã sửa · `11dc1bb` |
| 15 | Lớp tài liệu / không rõ loại bật lên không có gì; không chọn tay được loại lớp | Dinh Anh Tuan — DA82 | Đã sửa · `11dc1bb` |

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
- **Sau đó:** lỗi 14 (`.DRD` của OrCAD Layout).

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

## 12. Rãnh phay vẽ bằng một nét bị bỏ — CHAT_BOT_4

- **Bộ file:** `D:\JobDatMach\Nguyen Van Quang\2026\22-09\Nguyen Van Quang 5pcs Green Project Outputs for CHAT_BOT_4.zip`
- **Hiện tượng:** 4 bo ghép trong khung chữ L, giữa các bo có 3 rãnh chia bo — app không
  hiện rãnh nào.
- **Nguyên nhân:** `GHEP_MACH.GKO` vẽ khung bằng nét 0.5 mm, còn **mỗi rãnh là MỘT nét thẳng
  0.8 mm** (đường tâm dao). Bước nối viền chỉ giữ chuỗi ≥ 3 đoạn, chuỗi 1–2 đoạn bị coi là
  vạch lẻ và bỏ.
- **Cách giải quyết** (`stitchOutline`): nét thẳng 1–2 đoạn là **rãnh phay** khi đủ cả:
  nằm hẳn trong bo (cách mép ≥ 1 mm — vạch V-cut chạm mép vẫn bỏ), nét rộng ≥ 0.3 mm (nét
  mảnh là nét vẽ), **đứng riêng** (không chạm nét khác) và bề rộng nét không dùng cho một
  đường vẽ nhiều khúc.
  - **CAM:** vẽ đúng một nét như file khách.
  - **2D / 3D:** khoét thủng hình thuôn rộng bằng nét (hai đầu tròn theo dao).
- **Kiểm:** CHAT_BOT_4 đủ 3 rãnh, kích thước giữ 87.80 × 97.00 mm. Hồi quy corpus: lần
  đầu PHAONUOC (Ngoc Anh) bị nhận nhầm 15 rãnh — là mảnh của đường vẽ gấp khúc 0.8 mm bị
  đứt → thêm hai điều kiện "đứng riêng" và "bề rộng". Sau sửa chỉ 6 bộ thêm rãnh, thân bo
  và kích thước không đổi: Hoang Long 6F E42 (+7), Dinh Ngoc Tram (+19), Hai Panel (+2),
  Panel 10 (+3), Phuong Ghep (+2), 30pcs (+4) — xem hình từng bộ, đều là rãnh thật
  (rộng 0.5–1.5 mm, dài 1.3–7 mm). Test mới.
- **Lưu ý:** bề rộng rãnh lấy theo nét trong file; xưởng có thể phay bằng dao của xưởng
  (1.0 / 1.6 mm) nên rãnh thật có thể rộng hơn hình.

## 13. CAM: nét phụ của lớp viền hiện màu xanh mask

- **Hiện tượng:** ở CAM, khung viền vàng nhưng rãnh / đường phay hở trong viền lại màu xanh.
- **Nguyên nhân:** web-gerber clone lớp viền làm lớp phủ mask; bản clone **dùng chung vật
  liệu** với lớp gốc. App tô xanh toàn bộ lớp phủ (để panel không loang lổ) → tô luôn các nét
  của lớp Outline, trừ mảnh đầu tiên (được web-gerber gán vật liệu riêng). Có từ trước.
- **Cách giải quyết:** tô trên bản sao vật liệu (`Viewer2D.WebGL.tsx`); vật liệu mới được
  giải phóng cùng cảnh.

## 14. OrCAD Layout: vẽ bản vẽ khoan `.DRD` thay cho `thruhole.tap`

- **Bộ file:** `D:\JobDatMach\Dinh Anh Tuan\2026\22-09\Dinh Anh Tuan 10pcs No Step DA82.rar`
- **Hiện tượng:** lớp `thruhole.tap` có trong danh sách nhưng không vẽ; badge ghi khoan từ
  `.DRD`, 2D không có lỗ.
- **Nguyên nhân:** `thruhole.tap` đọc đúng (339 lỗ). Nhưng `.DRD` của OrCAD Layout là **bản
  vẽ khoan** dạng Gerber (ký hiệu lỗ + bảng chú thích). App nhận "file khoan dạng Gerber"
  bằng dòng `%FS…X…`, mà OrCAD ghi `%FSLAN2X34Y34*%` — có thêm `N2` (số chữ số mã dòng)
  nên không khớp. `.DRD` bị coi là Excellon, là file gộp nhiều hình nhất → được chọn vẽ.
  **Có từ trước** (chính là mục ".DRD bị chọn thay THRUHOLE.tap" trong vấn đề còn tồn cũ).
- **Cách giải quyết:** `isGerberContent` nhận thêm `N`/`G`/`D`/`M` trong header. Có Excellon
  thì `.DRD` thành tài liệu "Drill (Gerber)" (ẩn, bật xem được).
- **Kiểm:** 291 bộ OrCAD Layout trong corpus. **252 bộ** trước vẽ `.DRD`, giờ vẽ
  `thruhole.tap`, 100% lỗ nằm trong bo, kích thước không đổi. Còn lại: bộ vốn sai kích thước
  từ trước (989 mm, 2143 mm… — lỗ bị tính ra ngoài), và bộ chỉ có `.DRD` (không `.tap`) vẫn
  vẽ `.DRD` như cũ, số lỗ đếm theo kiểu Gerber sát hơn (vd 1125 → 91). Test mới.

## 15. Lớp tài liệu / không rõ loại bật lên không có gì; chọn tay loại lớp

- **Hiện tượng:** DA82: `.AST`, `.FAB`, `.DRD` có trong danh sách, tích bật vẫn trống. App
  nhận sai loại thì không có cách sửa.
- **Nguyên nhân:** viewer chỉ dựng lớp có chỗ trong bo (đồng, mask, lụa, viền, khoan được
  chọn); lớp tài liệu, không rõ loại, paste và file khoan không được chọn bị bỏ hẳn.
- **Cách giải quyết:**
  - **CAM vẽ hết**: lớp nào bật là hiện. Chỉ dựng khi bật lần đầu nên mở file không chậm đi.
  - **Chọn tay loại lớp**: bấm vào lớp → ô "Loại lớp" (đồng / mask / lụa / paste / Outline /
    Drill / tài liệu / không rõ). Chọn xong cả bộ file được **đọc lại** (`rebuildBoard`):
    kích thước, file khoan được vẽ, viền chính tính lại. Lớp chọn tay có dấu ✎, nút
    **↺ Tự nhận** để bỏ. Lớp chọn tay là viền thì thắng lớp viền app tự nhận; chọn tay là
    khoan thì không bị hạ thành tài liệu.
- **Kiểm:** DA82 — đổi FAB thành Outline: viền lấy từ FAB, kích thước 121.16 × 85.47 → 122.55 ×
  87 mm; bấm ↺ về lại như cũ. Test mới.
- **Lưu ý:** `.DTS` là báo cáo chữ (bảng mũi khoan), không có hình để vẽ. DA82 không có file
  viền nên kích thước là viền ước lượng từ lớp đồng.

---

## Vấn đề còn tồn

1. **Bộ OrCAD chỉ có `.DRD`** (không có `thruhole.tap`): vẫn vẽ bản vẽ khoan làm lỗ — cần
   xem có file khoan thật không, hoặc chọn tay. (`.DRD` cạnh `.tap` đã sửa ở lỗi 14.)
2. **Tam giác chéo sai** ở một số panel (Rail.zip, GWLRWEX-CELLULAR, ph_analyzer…): đa giác
   viền tô lệch. Bản cũ cũng bị y hệt.
3. **Bo ghép chỉ ngăn bằng rãnh** (CHAT_BOT_4) vẫn đếm là 1 bo nên không có nhắc nhở "nhiều
   bo ghép" (`706ea9f` đã nhắc cho file có nhiều viền bo rời như CHAT_BOT_1).
4. **V-cut / mouse bite chưa vào giá:** chỉ nhắc nhở (cạnh < 15 mm, tấm V-cut < 70 mm), công
   thức chưa có phí V-cut.
5. **Báo giá ghép panel ghi số set hay số PCB** — đang ghi số set, chờ chốt.
6. **DFM chưa có:** đồng/lỗ khoan ngoài hoặc quá sát viền (như J11 của ESP32_DR) chưa tự báo.

## Ghi chú: "mất logo" khi chụp (22/09) — không phải lỗi app

Khi kiểm ảnh chụp trong khung trình duyệt của Claude, hàm ghi clipboard của trang bị thay
tạm để đọc ảnh ra. Anh dùng đúng tab đó nên bấm Copy không vào clipboard, dán ra ảnh cũ →
tưởng mất logo. Tải lại tab là hết. Từ nay kiểm clipboard/ảnh chụp bằng **tab riêng**.

## Cách kiểm lại

- `npx vitest run test/*.test.ts` — 139 test.
- `npm run build` — build thật (`tsc -b` chặt hơn `tsc --noEmit`; lỗi build Vercel ở
  `f12b339` là do chỉ chạy lệnh nhẹ).
- Hồi quy corpus: script trong `test/_scratch/` (không commit) so bản cũ/mới trên
  `D:\JobDatMach` — viền (số vòng, thân/lỗ/nét), khoan (tỉ lệ lỗ nằm trong bo).
