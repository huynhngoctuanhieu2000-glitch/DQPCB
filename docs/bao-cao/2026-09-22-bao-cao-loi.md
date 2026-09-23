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
| 16 | File khoan không khai định dạng số (lỗ co 10 lần) hoặc lệch gốc so với Gerber | FRIWO — 55807.931-90FE (+ 302 bộ / 18.496 bộ) | Đã sửa · `c680077`, `3ec37c4` |
| 17 | 2D / 3D chọn "Bot Side" không thấy mặt dưới | FRIWO — 55807.931-90FE | Đã sửa · `020e8de` |
| 18 | Chuyển qua lại giữa các bo đang mở chậm 0.5–3.3 s, không báo đang tải | FRIWO, PHAONUOC, CHAT_BOT_4 (mở cùng lúc) | Đã sửa · `71bf3a5` |
| 19 | 2D / 3D mất lõi bo: vùng tô trong lớp viền làm khung bo bị gán sai kiểu | Anh Nhat — Gerber Anh Nhat (+ 2 bộ) | Đã sửa · `dbbea67` |
| 20 | Mất rãnh của file khoan chỉ có rãnh; khấc mép tính là thân bo (bo rộng thêm); nét viền dày | Dao Quoc Thai 5pcs (+ Ghep, Gateway, Thu Van, 5 bộ đổi kích thước) | Đã sửa · `5a8b10f` |
| 21 | Lớp in lụa 150k hình treo app 3 phút và lỗi hết bộ nhớ; bo một mặt ghi 2 lớp; khung bao bo tính là bo; chữ trong lớp viền cộng vào kích thước | FRIWO 23/09 — 55807.930, P84241-S02, P84390-S02 | Đã sửa · `7b90b45`, `e52458f` |

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

## 16. File khoan đọc sai tỉ lệ / lệch gốc — dò theo pad

- **Bộ file:** `D:\JobDatMach\FRIWO\2026\22-09\FRIWO 55807.931-90FE.zip` (và các bộ
  lộ ra khi quét kho, xem Kiểm)
- **Hiện tượng:** FRIWO — bo (panel 4 × 2) nằm lọt thỏm góc trên phải khung nhìn; một cụm
  nhỏ lạc tận giữa dưới. Cụm đó là toàn bộ 2641 lỗ khoan.
- **Nguyên nhân — hai kiểu lỗi file khoan:**
  1. **Không khai định dạng số.** Excellon chỉ ghi dãy số liền, không dấu thập phân
     (`X01011283`); phải có lời khai mới biết mấy số phần nguyên. Pulsonix xuất `INCH` trơn
     (không `LZ/TZ`, không `;FILE_FORMAT`) với định dạng 3.5 → 10.11283 in. Parser áp mặc
     định 2.4 → 1.011283 in: cả cụm lỗ **nhỏ đi 10 lần**. Cùng họ lỗi 8 (Altium 4:3) nhưng ở
     đây không có dòng khai để đọc.
  2. **Lệch gốc toạ độ.** Định dạng đúng nhưng file khoan xuất theo gốc khác Gerber — cả
     cụm lỗ bị dời (vd PCB_doline, Altium: +87.9, +25.5 mm). Xưởng khoan theo file này sẽ
     khoan lệch → đây là **lỗi thật của file khách**, không chỉ lỗi hiển thị.
- **Cách giải quyết** (`reader.ts`) — **dò theo pad**: lỗ khoan thật nằm trên pad / via, nên
  cách đọc đúng là cách cho nhiều tâm lỗ trúng pad đồng nhất.
  1. Cách đọc mặc định trúng pad ≥ 50% → giữ nguyên.
  2. Không thì thử mọi cách đặt dấu thập phân hay gặp (`drillReadings`), mỗi cách thử thêm
     **độ dời** tốt nhất (bỏ phiếu trên hiệu toạ độ lỗ − pad). Lấy cách trúng pad nhiều nhất
     nếu ≥ 50% và hơn mặc định ≥ 30 điểm; ngang nhau thì ưu tiên không dời.
  3. File không dò được bằng pad (NPTH) → dùng lại cách đọc + độ dời đã chốt cho file khoan
     cùng bộ; cuối cùng mới lấy **khung bo làm thước** (chỉ khi cụm lỗ nằm hẳn ngoài bo).
  - **Chốt chặn khớp giả:** file đã khai định dạng (`FILE_FORMAT`, `LZ/TZ`) không thử cách
    đọc khác, chỉ xét lệch gốc; file NPTH không dò theo pad (lỗ bắt vít vốn không có pad);
    cách đọc khác phải giữ cụm lỗ trải ≥ 25% vùng pad (co thành một chấm thì dời đâu cũng
    lọt vài pad to). Bản đầu thiếu chốt này đã dồn 4 lỗ bắt vít của bộ EasyEDA 5395_1 vào
    một ô 4 × 4 mm.
  - **Cảnh báo trên giao diện** (dải dưới danh sách lớp): file nào app đọc lại thì ghi rõ
    đọc theo định dạng nào, dời bao nhiêu mm, căn cứ (khớp x% pad / theo file cùng bộ / theo
    khung bo); lệch gốc thì nhắc **báo khách kiểm lại file khoan**.
- **Kiểm:** FRIWO — 2641 lỗ về đúng vùng bo (0.90–1.47 in → 9.60–14.63 in), kích thước giữ
  137.4 × 147 mm. PCB_doline, The Cold (Switch_AC, lệch +37.5, +32.7 mm) — dời lại khớp 100%
  pad. Hồi quy corpus, đo bằng **tỉ lệ lỗ trúng pad** (cách đo cũ "lỗ trong khung bo" không
  thấy được cụm lỗ co về một góc bo): mẫu 1/10 kho (1.850 bộ), so với bản đọc gốc: **31 bộ đổi — cả 31 tốt lên, 0 tệ đi, không bộ nào đổi kích thước**; bộ có lỗ trúng pad < 50% giảm **34 → 3** (3 bộ còn lại là panel nhiều thiết kế, như trước). **Quét toàn kho (23/09, 18.496 zip, bản cuối):
  314 bộ đổi — 302 tốt lên, 0 tệ đi**, 12 bộ tỉ lệ trúng pad không đổi (6 bộ lỗ được đưa từ
  ngoài vào trong khung bo theo khung bo làm thước, bo không có pad để dò; 6 bộ không file khoan
  nào bị đọc lại — khác do phần viền); bộ trúng pad < 50% giảm **315 → 23**. 8 bộ đổi kích thước nhưng
  **không bộ nào do phần khoan** (không file khoan nào bị đọc lại): 5 bộ do sửa viền ở các
  commit sau bản đọc gốc dùng để so (vd `5a8b10f`), 3 bộ (FAB-Controller, BO KEO V2,
  Mach_bien_ap) chạy riêng thì không đổi — lệch do chạy chung một tiến trình. Hai chốt chặn thêm
  sau lần quét: (a) khung bo làm thước chỉ nhận khi tỉ lệ trúng pad tăng ≥ 20 điểm (lỗ vẫn nằm
  trong khung nhưng trúng 0% pad thì không dời bừa); (b) hình > 20 mm (logo, vùng đồng lớn)
  không tính là pad. File khoan nằm ngoài bo mà không cách đọc nào khớp thì để nguyên và
  **cảnh báo đỏ** trên giao diện. Trong 31 bộ của mẫu 1/10: 21 bộ sai định dạng số (Pulsonix 3.5, OrCAD `.tap`, CS2 khai `FILE_FORMAT=2:4` sai…), 10 bộ lệch gốc (PCB_doline −87.9/−25.5 mm, The Cold +37.5/+32.7, Pedal_edit +1794/+1583, PCB4 −51.7/−45.5…). Bản chỉ dùng khung bo (`c680077`) sửa được 10 bộ. Ca lạ: PCB_TEST (Do Trinh Hoan) là zip lẫn file khoan của 3 thiết kế — trúng pad 15% → 70%. 6 test mới (đọc sai tỉ lệ bo xa gốc / sát gốc,
  lệch gốc, NPTH theo file cùng bộ, NPTH có khai định dạng giữ nguyên, file đã đúng giữ nguyên).
- **Còn lại:** file khoan không có pad nào để dò và không có file cùng bộ (bộ chỉ có NPTH,
  hoặc không có lớp đồng) thì chỉ còn cách khung bo: sửa được khi cụm lỗ nằm hẳn ngoài bo,
  không sửa được khi cụm lỗ lệch mà vẫn lọt trong khung.
- **Lưu ý:** file FRIWO là panel 4 × 2 nhưng các bo chỉ ngăn bằng đường V-cut, không có viền
  bo riêng → app vẫn đếm là 1 bo, không nhắc "file ghép sẵn" (cùng mục 3 vấn đề còn tồn).

## 17. 2D / 3D chọn "Bot Side" không thấy mặt dưới

- **Bộ file:** `D:\JobDatMach\FRIWO\2026\22-09\FRIWO 55807.931-90FE.zip`
- **Hiện tượng:** 2D/3D, bấm lọc **Bot Side**: chỉ thấy mảng xanh với các lỗ, không thấy đồng
  và chữ in mặt dưới.
- **Nguyên nhân:** nút lọc chỉ ẩn các lớp mặt trên, còn góc nhìn vẫn từ trên xuống. Lõi bo và
  lớp phủ mask che hết mặt dưới.
- **Cách giải quyết** (`Layout.tsx`): chọn Bot Side ở 2D/3D thì dùng góc nhìn từ dưới lên có
  sẵn của khung Bot trong "2 Mặt" (lật gương). All / Top Side quay về nhìn từ trên. CAM giữ
  nhìn từ trên để soi file đúng toạ độ gốc.
- **Kiểm:** FRIWO — 2D + Bot Side thấy rõ đồng và chữ in mặt dưới; All về mặt Top; 3D + Bot
  Side mở ở góc nhìn từ dưới.

---

## Vấn đề còn tồn

1. **Bộ OrCAD chỉ có `.DRD`** (không có `thruhole.tap`): vẫn vẽ bản vẽ khoan làm lỗ — cần
   xem có file khoan thật không, hoặc chọn tay. (`.DRD` cạnh `.tap` đã sửa ở lỗi 14.)
2. **Tam giác chéo sai** ở một số panel (Rail.zip, GWLRWEX-CELLULAR, ph_analyzer…): đa giác
   viền tô lệch. Bản cũ cũng bị y hệt.
3. **Nhận biết file ghép mức "Có thể"** (khớp 60–90%): app không tự phân biệt bo ghép có một
   bo xoay (CHAT_BOT_4) với bo lẻ có nhiều kênh giống nhau (DAQ 6AI…) — người lập tự xem.
   (Panel chỉ ngăn bằng rãnh / V-cut như FRIWO đã nhận được từ `6249b00`.)
4. **V-cut / mouse bite chưa vào giá:** chỉ nhắc nhở (cạnh < 15 mm, tấm V-cut < 70 mm), công
   thức chưa có phí V-cut.
5. **DFM chưa có:** đồng/lỗ khoan ngoài hoặc quá sát viền (như J11 của ESP32_DR) chưa tự báo.

## 18. Chuyển qua lại giữa các bo đang mở bị chậm

- **Hiện tượng:** mở 3 file, đang xem file 3, bấm lại file 1 → chờ 0.5–3.3 s (FRIWO 3.3 s, bấm
  lại lần 2 vẫn 3.2 s), không có dấu hiệu đang tải → tưởng app treo.
- **Nguyên nhân:** bộ nhớ hình đã dựng chỉ giữ **một** bo — đổi bo là xoá sạch rồi dựng lại từ
  đầu; dựng hình chạy đồng bộ, chặn cả giao diện. File không đọc lại, chậm hoàn toàn ở bước dựng.
- **Cách giải quyết** (`Viewer2D.WebGL.tsx`, `Layout.tsx`): (1) giữ hình theo từng bo, tối đa
  5 bo gần nhất, giải phóng khi đóng bo; (2) chuyển sang bo chưa có hình thì bật màn chờ
  "Đang dựng hình…" trước; (3) dựng sẵn ở nền các bo còn lại lúc trình duyệt rảnh, mỗi lượt
  một lớp.
- **Kiểm:** FRIWO 3.30 → 0.06 s, PHAONUOC 1.89 → 0.05 s, CHAT_BOT_4 0.47 → 0.08 s; FRIWO ở 2D
  chưa từng xem (nhờ dựng sẵn) 0.055 s. Chi tiết: `2026-09-22-khao-sat-chuyen-bo-cham.md`.
- **Còn lại:** bấm ngay khi lớp nặng đang dựng dở ở nền thì chờ lớp đó xong (đo được 1.6 s).

## 19. 2D / 3D mất lõi bo — Anh Nhat

- **Bộ file:** `D:\JobDatMach\Anh Nhat\16-08-23\Gerber Anh Nhat.zip` (Altium, inch)
- **Hiện tượng:** CAM đúng (80 × 75 mm, bo góc); 2D/3D trắng mảng lớn góc trên trái và quanh
  cổng USB J1 — đúng những chỗ không có đồng ở cả hai mặt: lõi bo (FR-4 + mask) không được vẽ.
- **Nguyên nhân:** `BAI111.GKO` có một vùng tô G36 (rãnh khoét dưới anten Module1) đứng
  **trước** khung bo. `stitchOutline` bọc mỗi đoạn viền theo **mẫu = phần tử đầu tiên** → cả 8
  đoạn khung bo thành 8 "vùng tô" một đoạn; tô đặc ra **0 đỉnh**. CAM vẽ nét nên không lộ.
- **Cách giải quyết** (`geometry.ts`): mẫu lấy **nét vẽ đầu tiên**; lớp chỉ có vùng tô thì giữ
  như cũ. Test mới dựng lại đúng dáng file.
- **Kiểm:** thân bo 0 → 756 đỉnh, 2D phủ kín bo, rãnh khoét vẫn là lỗ. Hồi quy 157 bộ: đúng 3
  bộ đổi (Anh Nhat, Dao Quoc Thai 5pcs, CM5-gerber), cả 3 từ lõi bo rỗng → có lõi; kích thước và
  cách tách vòng giữ nguyên; 154 bộ còn lại không đổi. Chi tiết: `2026-09-22-khao-sat-anh-nhat.md`.

## 20. Dao Quoc Thai 5pcs — mất rãnh, khấc mép, nét viền dày

- **Bộ file:** `D:\JobDatMach\Dao Quoc Thai\2025\01-11\Dao Quoc Thai 5pcs.zip`
- **Hiện tượng / nguyên nhân / cách sửa:**
  1. **Mất 3 rãnh phay.** `SqDrl.txt` chỉ chứa rãnh (M15/M16, dao 0.8 mm); tên không khớp luật
     round/slot/rect/square nên bị coi là file gộp, thua `Drl.txt` (54 lỗ) → không vẽ. Sửa:
     file khoan **chỉ có rãnh** (`isSlotOnlyDrill`) luôn vẽ kèm file gộp, trừ khi file gộp đã có
     rãnh. Cùng lỗi ở bộ khác: file tách theo tên (`Slot.txt`, `SlotHoles.TXT`, `RectHoles.TXT`)
     cũng bị bỏ khi bộ có file gộp — giờ vẽ (Ghep, Gateway, Thu Van).
  2. **Khấc mép thành thân bo.** Vùng 6.3 × 18 mm vắt ngang mép phải (lấn vào 2.7 mm, thò ra
     3.6 mm) bị coi là thân bo thứ hai → bo 70.01 mm. Sửa: vòng **nhỏ (≤ 10%) vắt ngang mép** một
     vòng lớn hơn là **khấc phay bỏ** (lỗ khoét), không tính vào kích thước → **66.28 mm**.
  3. **Nét viền dày 1.75 mm.** Viền dùng aperture D37 không khai báo; web-gerber tự cho 0.069 in.
     Sửa: lớp viền dùng aperture chưa khai thì khai bằng nét 0.1 mm (`defineMissingApertures`).
- **Kiểm:** Dao Quoc Thai: 66.28 × 33.14 mm, khoan "Drl.txt, SqDrl.txt · 57 lỗ", 2D có 3 rãnh ở
  các pad oval, khấc khoét ở mép phải. Hồi quy **523 bộ**: 505 không đổi; 18 đổi — 4 bộ giờ vẽ
  thêm file rãnh / lỗ chữ nhật trước bị bỏ; 5 bộ kích thước bỏ phần lỗ khoét thò ra ngoài mép, ra
  số tròn (90 × 80, 130 × 95, 110 × 100, 203.2 × 88.9 = 8 × 3.5 in, 85.73 × 84.84); 6 bộ chỉ đổi
  thứ tự file khoan. Bản đầu (không giới hạn 10%) nhận nhầm 2 bộ (panel PHAONUOC V3.9, Driver_Lift)
  — đã loại. 3 test mới.
- **Còn lại:** phần khấc thò ra ngoài mép vẫn vẽ thành ô trắng nhạt ngoài bo ở 2D (chỉ là hình).

## 21. Ba bộ FRIWO ngày 23/09

- **Thư mục:** `D:\JobDatMach\FRIWO\2026\23-09\FRIWO\` (Pulsonix: viền `(Keep Out)`, khoan
  `(Drilling Data).drl`, kèm ảnh `*spec*.png` ghi yêu cầu của khách).
- Chi tiết khảo sát: `2026-09-23-khao-sat-friwo-3-bo.md`.

| | Trước | Sau |
|---|---|---|
| Mở P84390-S02 | dựng **198 s**, app đứng hình, lụa mặt trên lỗi hết bộ nhớ | **9.3 s** (dựng 3.7 s) |
| P84241-S02 | 2 lớp | **1 lớp** (khách ghi "Single side", JLC cũng đọc 1 lớp) |
| P84241 / P84390 đếm bo | 2 bo (khung tính là bo) → nhắc nhầm "file ghép sẵn" | **1 bo** |
| Kích thước P84390 | 185.23 × 205.66 mm | **170.00 × 199.00 mm** |

- **Lớp quá nặng — tự ráp lưới, vẽ đủ** (`bf511b8`): `renderThree` dựng MỖI hình thành một
  khối riêng, nên lụa 150.220 vùng tô ra **180 triệu đỉnh** trong 30–42 s và tab hết bộ nhớ.
  Nay lớp > 50.000 hình đi đường riêng (`fastLayer.ts`): **một lưới tam giác cho cả lớp** —
  vùng tô cắt tai (hình lồi thì chia quạt cho rẻ), mỗi nét một chữ nhật theo bề rộng,
  mỗi pad một đa giác.

  | P84390-S02 | renderThree | Lưới nhanh |
  |---|---|---|
  | Lụa mặt dưới (85.570 hình) | 102.5 triệu đỉnh | **758.766 đỉnh** |
  | Mở cả bộ | 75.3 s | **9.0 s** |
  | Bộ nhớ trang | 4.5 GB | **1.2 GB** |

  Vẽ **đủ cả hai lớp lụa** ở cả bốn chế độ xem, phóng to đọc được chữ. Đánh đổi: hình phẳng
  không có bề dày, bỏ hình đảo cực — với lớp in lụa thì chấp nhận được. Badge ghi "N lớp
  nhiều hình vẽ ở chế độ nhẹ: …", tính từ danh sách lớp nên lấy từ cache vẫn ghi. Lớp dựng
  lỗi được nhớ lại nên không dựng lại mỗi lần.

  **Sửa tiếp (`2316510`)** — bản đầu vẽ sai hai chỗ:
  - `plot()` biến MỌI nét vẽ thành vùng tô viền quanh nét, nên cả một nét gấp khúc (nguyên
    chữ "R441" vẽ liền tay) là MỘT vùng lõm sâu. Tô kiểu chia quạt làm đầy luôn ruột chữ —
    diện tích tô ra **gấp 3,6 lần** thật ở lụa mặt trên, chữ bết thành cục. Nay cắt tai
    (ear clipping) nên đúng **1,0000 lần**; cung cũng bẻ ra đoạn 0,02 mm để đầu nét bo tròn.
  - Lưới phải bọc trong Group: three xếp thứ tự vẽ theo **groupOrder** (lấy từ Group cha)
    TRƯỚC rồi mới tới renderOrder, nên Mesh trần nằm thẳng trong Scene luôn bị vẽ đầu và lớp
    mask / đồng phủ đè lên — **2 Mặt, 2D, 3D không thấy in lụa**. Nay cả bốn chế độ đều hiện.

- **Số lớp** lấy theo số lớp đồng đọc được (bo một mặt = 1 lớp, có sẵn phương án giá L1).
- **Khung bao một bo** không tính là bo (so bằng bao trọn ô, không so tâm).
- **Kích thước** chỉ tính theo vòng thân bo — bỏ lỗ khoét, khấc và chữ / nét chú thích vẽ
  trong lớp viền.
- **Ảnh thông số của khách** (`*spec*.png`) giữ lại, thẻ thông tin bo có nút "Xem ảnh thông
  số của khách" để đối chiếu bề dày / bề mặt / số lớp (app không đọc chữ trong ảnh).
- **Kiểm:** hồi quy 521 bộ — 495 không đổi; 26 đổi: 12 bộ bo một mặt về 1 lớp; kích thước bỏ
  phần chú thích (TDM2409 63.13 → 50.95, butterfly_panel 114.01 → 100.00, PRO-HP-ESP 82.75 →
  75.75 — đều bằng đúng vòng thân bo); khung không còn tính là bo (PCB HMI V16-x4 2 → 1);
  hai bộ trước đếm bo hỏng (0) giờ ra 3. Test mới 3 cái, tổng 186 test. Checklist giao diện
  điện thoại 375 / 360 và khung 1366 sạch.
- **Còn lại:** lụa vẽ ở chế độ nhẹ là hình phẳng, không có bề dày như lớp thường — chỉ để
  xem, không dùng để đo.

## Tính năng mới (22/09): nhận biết file ghép, mũi khoan nhỏ nhất — `6249b00`

Khung thông báo ở góc khung xem thêm hai dòng:

- **Mũi nhỏ nhất:** lỗ tròn nhỏ nhất trong các file khoan và số lỗ cỡ đó; có rãnh phay thì
  ghi thêm rãnh hẹp nhất (bề rộng = 2 × bán kính cung đầu rãnh). **Tô màu** (`71bf3a5`): dưới
  0.254 mm đỏ, 0.254 – dưới 0.3 mm vàng; hiện 3 số lẻ khi cần để 0.254 không thành "0.25". Vd CHAT_BOT_4
  "Ø0.40 mm (16 lỗ) · rãnh 1.10 mm", FRIWO "Ø0.25 mm (2104 lỗ)".
- **Ghép:** có / có thể / không, bao nhiêu bo, nhận ra bằng cách nào (rê chuột xem giải thích).

Cách nhận biết (`panelDetect.ts`, xét lần lượt, gặp dấu hiệu nào trước thì dừng):

| Thứ tự | Dấu hiệu | Kết luận |
|---|---|---|
| 1 | **Viền rời**: lớp viền có ≥ 2 bo tách nhau (bỏ rail, mảnh vụn, khung ngoài) | Có |
| 2 | **Cả bo lặp lại** theo một bước cỡ một bo. Chấm bằng **chữ in lụa** (bo ghép lặp y hệt cả tên linh kiện; kênh giống nhau trong một bo thì tên mỗi kênh khác nhau), bo không có lụa thì bằng đồng. Bước ≥ 15% cạnh ngắn của tấm (loại hàng chân linh kiện bội 2.54 mm). Không dùng lỗ khoan (file khoan không khai định dạng thì toạ độ lỗ là đoán) | Khớp ≥ 90% → Có · 60–90% → Có thể |
| 3 | Tên file chứa "ghep", "panel", "array"… | Có thể |
| — | Không có dấu hiệu nào | Không |

Kết quả: FRIWO 55807 "Có — 8 bo (4×2)" · PHAONUOC "Có — 8 bo (2×4)" · CHAT_BOT_1 "Có — 4 bo,
viền rời" · CHAT_BOT_4 "có thể — 3+ bo giống nhau" (bo thứ 4 xoay) · ESP32_DR, AGVH7 "không".
400 bộ ngẫu nhiên trong corpus: 11 "Có" (8 viền rời, 3 bo lặp lại: arduinanoto 2×5, Terminal
6×3, PCB_BUTTON 4×4), 4 "Có thể" (DAQ 6AI, 7seg, NICHIA, Pan 8 — đa số có lẽ là bo lẻ nhiều
kênh). Bản đầu nhận nhầm các bo có bước 10.2 / 15.2 mm (hàng chân linh kiện) — đã loại hết
nhờ chấm bằng lụa. Mỗi bo dò tối đa ~0.3 s, tính một lần.

Thẻ giá dùng chung cách dò: "Có" → nhắc kèm nút "file ghép sẵn N bo/set" (giờ có cả FRIWO);
"Có thể" → chỉ nhắc nhẹ, không tự điền.

## Đã chốt: báo giá ghép panel ghi SL theo SỐ BO (22/09, đổi lại buổi tối)

Dòng báo giá của bo ghép panel: **SL = số bo khách nhận** (vd file ghép sẵn 4 × 2, 50 set →
SL 400), đơn giá = tiền / bo; số set nằm trong ghi chú tự điền "Panel 4*2 · 50 set". Thành
tiền vẫn tính theo số set. Sửa SL trên báo giá thì app quy ra số set (làm tròn lên: 401 bo →
51 set) rồi tính lại tiền. Menu chọn bo trong báo giá ghi "N pcs". Bản trước trong ngày ghi
số set vào cột SL (`40f7332`) — khách đọc thành 50 bo. Sửa ở `56ec0d4`.

## Ghi chú: "mất logo" khi chụp (22/09) — không phải lỗi app

Khi kiểm ảnh chụp trong khung trình duyệt của Claude, hàm ghi clipboard của trang bị thay
tạm để đọc ảnh ra. Anh dùng đúng tab đó nên bấm Copy không vào clipboard, dán ra ảnh cũ →
tưởng mất logo. Tải lại tab là hết. Từ nay kiểm clipboard/ảnh chụp bằng **tab riêng**.

## Cách kiểm lại

- `npx vitest run test/*.test.ts` — 186 test.
- `npm run build` — build thật (`tsc -b` chặt hơn `tsc --noEmit`; lỗi build Vercel ở
  `f12b339` là do chỉ chạy lệnh nhẹ).
- Hồi quy corpus: script trong `test/_scratch/` (không commit) so bản cũ/mới trên
  `D:\JobDatMach` — viền (số vòng, thân/lỗ/nét), khoan (tỉ lệ lỗ nằm trong bo).
