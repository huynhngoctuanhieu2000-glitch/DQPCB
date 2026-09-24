# Quan trọng: Outline · Drill · Slot

Ba thứ quyết định **kích thước bo (→ giá)** và **hình bo đúng hay sai**. Mọi luật dưới đây
nằm trong `src/lib/gerber-reader/` (`geometry.ts`, `outlineLoops.ts`, `identify.ts`,
`reader.ts`) và phần vẽ trong `src/modules/viewer2d/Viewer2D.WebGL.tsx`.

---

## A. Outline (viền bo)

### A1. Chọn lớp viền

- Có thể có nhiều file nhận là viền (`.GKO`, `.GM1`, `Edge_Cuts`, `Profile`, `Mechanical 1`…).
- **Chỉ lớp có ô bao lớn nhất (tính bằng mm) dựng thân bo và cho kích thước.** Các lớp viền
  khác thành tài liệu "… (viền phụ)" (ẩn, bật xem được). *(22/09, `f186434` — trước đó
  viewer lấy lớp dựng sau cùng: Slaver_Ceiling bản lẻ lấy nhầm GM1 = khung rơ-le.)*
- Corpus: 34/614 bộ có nhiều lớp viền (21 trùng khít, 13 nằm trong, 1 lấn ra ngoài).

### A2. Nối nét thành vòng (`stitchOutline`)

| Bước | Luật |
|---|---|
| Bẻ cung | Cung → đoạn thẳng (web-gerber bóp cung thành đoạn nếu để nguyên) |
| Bỏ đoạn trùng | CAM350 ghi viền 4 lần. Đoạn ngắn so sai số 0.001 mm (góc bo tròn KiCad 10 là 500 đoạn ~0.02 mm); cung so tâm + bán kính + góc giữa |
| Nối | Dung sai 0.05 mm (inch: 0.05/25.4). Ưu tiên đoạn khít tuyệt đối, theo thứ tự file; mảnh còn hở nối lại với dung sai ×10 |
| **Tách vòng "số 8"** | Chuỗi đi qua cùng một đỉnh hai lần (panel V-cut, hai bo chung cạnh) → tách thành vòng đơn. Chỉ đỉnh trùng khít và phần tách ≥ 1 mm² *(21/09)* |
| Giữ vòng | ≥ 3 đoạn (kể cả hở); 1–2 đoạn chỉ giữ khi khép kín và có cung (lỗ tròn EasyEDA = 2 cung 180°, bo tròn CAM350 = 1 cung 360°) |
| **Rãnh một nét** | Nét thẳng 1–2 đoạn, nằm hẳn trong bo (cách mép ≥ 1 mm), rộng ≥ 0.3 mm, đứng riêng, bề rộng không dùng cho đường vẽ nhiều khúc → dựng hình thuôn rộng bằng nét, thành lỗ khoét *(22/09, `706ea9f`, CHAT_BOT_4)* |
| Kích thước | Ô bao **các vòng thân bo** + nửa nét — không tính lỗ khoét, khấc phay bỏ hay chữ / nét chú thích vẽ trong lớp viền *(23/09, `7b90b45`, FRIWO P84390: 185 × 206 → 170 × 199 mm)*; không dùng số thô (chấm lẻ Edge_Cuts KiCad làm bo 41.5 mm thành 89.68 mm) |
| Kiểu phần tử | Mỗi đoạn viền đã nối bọc theo **nét vẽ đầu tiên** của lớp, không theo vùng tô: vùng tô G36 đứng trước khung bo làm khung thành "vùng tô một đoạn", 2D/3D mất lõi bo *(22/09, `dbbea67`, Anh Nhat)* |
| Aperture chưa khai | Lớp viền dùng `Dnn` không có `%AD` → khai nét 0.1 mm (web-gerber tự cho 1.75 mm: khung viền dày, kích thước cộng nửa nét) *(22/09, `5a8b10f`, Dao Quoc Thai)* |

### A3. Vòng nào là thân bo, lỗ khoét hay nét phay (`splitOutlineLoops`)

| Loại | Luật |
|---|---|
| **Nét phay** (chỉ vẽ nét) | Chuỗi hở, nằm trong một vòng khác, khoảng hở ≥ nửa chiều dài nét (đường phay gấp khúc, vạch cắt) |
| **Khấc mép** | Vòng nhỏ (≤ 10% vòng bị vắt qua) có đỉnh nằm hẳn trong và đỉnh nằm hẳn ngoài (cách mép > 0.2 mm) một vòng lớn hơn → **lỗ khoét**, không tính vào kích thước *(22/09, `5a8b10f`, Dao Quoc Thai: 70.01 → 66.28 mm)* |
| **"Nằm trong"** | Tâm ô bao nằm trong vòng lớn hơn **và** ≥ 50% ô bao chồng lên (khấc lấn mép vài phần trăm mm vẫn tính là trong) |
| Không nằm trong vòng nào | **Thân bo** nếu to (≥ 5% vòng lớn nhất) hoặc dài như rail (≥ nửa một cạnh của cả tấm); vòng nhỏ khác (lỗ mouse-bite giữa các bo) → **lỗ khoét** |
| Nằm trong, có ≥ 3 pad/đường mạch bên trong | **Bo con** — dù bé cỡ nào. Không đếm mảng phủ (CAM350 phủ đồng tràn qua chỗ phay). Trước 24/09 phép thử này chỉ chạy cho vòng ≥ 5%, nên 30 nửa bo của tấm FRIWO "55807.930" (mỗi nửa 2.2% tấm) bị khoét thủng ở 2 Mặt / 2D / 3D *(24/09, `a6a79fc`)* |
| Nằm trong, không có mạch, < 5% vòng lớn nhất | **Lỗ khoét** |
| Nằm trong, không có mạch, ≥ 5% | **Lỗ khoét** (rãnh LED "3W NHUA XANH" 9.1%) |
| **Chữ chú thích** | Lỗ khoét vẽ bằng nét gần như 0 (Pulsonix: `C,0.00001`) trong khi thân bo vẽ bằng nét thật ≥ 0.05 mm, nhỏ hơn 10 mm², và **lõm** hoặc hẹp dưới 0.5 mm → chỉ **vẽ nét**, không khoét. Lỗ bắt ốc cũng hay vẽ nét 0 nhưng **lồi** nên vẫn thủng (bo "chery-3x6-v3": 8 lỗ tròn 2.4 mm) *(24/09, `a6a79fc`, FRIWO P84390 "Non-plated holes": 117 lỗ → 9)* |

### A4. Vẽ

- Thân bo: mỗi vòng dựng riêng (web-gerber chỉ dựng một shape mỗi lần).
- Lỗ khoét: CAM vẽ trắng theo lớp Outline; 2D/3D đưa vào cụm khoan để xuyên suốt bề dày bo
  — **phải nhân 25.4 nếu viền inch** (21/09: rãnh Ceiling Master nhỏ 25 lần, không thấy).

---

## B. Drill (lỗ khoan)

### B1. Đếm lỗ (`countHoles` / `countExcellonHoles`)

- Excellon: mỗi dòng toạ độ (`X…Y…`, **cả dòng chỉ có `Y…`** hay `X…`) là một lỗ; `G85` một
  dòng; lệnh phay: mỗi lần hạ dao `M15` là một lỗ, `G00/G01` là di chuyển.
- Gerber khoan (Proteus): mỗi `D03` một lỗ + mỗi chuỗi `D02 → D01` là một rãnh.
- Số đếm quyết định file nào được vẽ và số "N lỗ" trên badge; hồi quy 21/09 khớp số hình dựng.

### B2. Chọn file khoan để vẽ

- File **một phần** (`isPartialDrillFile`): PTH, NPTH, đuôi `-PTH/-NPTH` KiCad, hoặc tách theo
  hình lỗ Altium `RoundHoles/SlotHoles/RectHoles/SquareHoles`, `Slot.txt` → **vẽ tất cả**.
- Còn lại coi là file **gộp** → chỉ vẽ file gộp nhiều lỗ nhất (KiCad xuất cả bản gộp lẫn bản tách).
- Có Excellon thì bản Gerber khoan (KiCad/Altium xuất đôi, bản vẽ khoan `.DRD` của OrCAD
  Layout) thành tài liệu — tránh đếm đôi / vẽ nhầm ký hiệu. *(OrCAD: 22/09, `11dc1bb`, 252 bộ)*
- Chọn tay "Drill" ở danh sách lớp thì file đó luôn là file khoan.
- File khoan **chỉ có rãnh phay** (`isSlotOnlyDrill`, bất kể tên) luôn vẽ kèm file gộp, trừ khi file
  gộp đã có rãnh *(22/09, `5a8b10f`: `SqDrl.txt` của Dao Quoc Thai; `Slot.txt`, `SlotHoles.TXT`,
  `RectHoles.TXT` của 3 bộ khác trước bị bỏ khi bộ có file gộp)*.
- Tất cả file khoan là con của một khung rỗng (trước đây file thứ hai bị nhân inch hai lần).

### B3. Đọc số — xem `dinh-dang-file.md` mục 4

Lỗi nặng nhất đợt này: **Altium metric `FILE_FORMAT=4:3`** bị đọc nhỏ 100 lần → mọi lỗ dồn
ngoài góc bo. 5/171 bộ Altium trong corpus bị; sửa 22/09 (`f186434`).

Cùng họ lỗi: **file khoan không khai định dạng số** (Pulsonix xuất `INCH` trơn, toạ độ 3.5
giữ số 0 đầu — `X01011283` = 10.11283 in; parser áp 2.4 → nhỏ 10 lần) và **file khoan lệch
gốc** so với Gerber (Altium xuất theo gốc tương đối). Cả hai giải bằng **dò theo pad**: lỗ
thật nằm trên pad/via, nên cách đọc đúng (định dạng + độ dời) là cách cho nhiều tâm lỗ trúng
pad đồng nhất. Chốt chặn khớp giả: file đã khai định dạng chỉ được xét lệch gốc; NPTH không
dò theo pad mà theo file khoan cùng bộ; cách đọc khác phải giữ cụm lỗ trải ≥ 25% vùng pad.
Khung bo chỉ là phương án cuối. Lớp được sửa có `drillFix` → dải cảnh báo dưới danh sách lớp
(lệch gốc thì nhắc báo khách). Sửa 22/09 (FRIWO 55807.931-90FE, PCB_doline, The Cold).

### B4. Vẽ

- 2D: ép cụm khoan thành lát mỏng ngay mặt đang nhìn (không thì phối cảnh kéo lỗ lệch tâm).
- 3D: trụ cao đúng bề dày bo + một lượng rất nhỏ (tránh z-fighting mất lỗ).

---

## C. Slot / rãnh / lỗ chữ nhật

| Nguồn | Dạng trong file | Đọc |
|---|---|---|
| Altium `-SlotHoles.TXT`, `-RectHoles.TXT` | Excellon phay `G00 → M15 → G01 → M16` | web-gerber dựng thành `imageRegion` (hình thuôn theo bề rộng dao); DQPCB đếm theo `M15` |
| Altium `-SquareHoles.TXT` | Toạ độ thường | Lỗ tròn (vuông khoan bằng mũi tròn) |
| Excellon `G85` | `X…Y…G85X…Y…` | Slot một dòng |
| Gerber khoan (Proteus) | `D02 → D01` | Rãnh |
| Rãnh vẽ trong **lớp viền** | Vòng kín nhỏ trong bo | Lỗ khoét (mục A3); 2D/3D đi cùng cụm khoan |
| Đường phay hở trong lớp viền | Nét hở | Nét phay (mục A3) — vẽ nét, không khoét |
| **Rãnh một nét** trong lớp viền (CHAT_BOT_4) | Một nét thẳng = đường tâm dao | CAM vẽ đúng nét; 2D/3D khoét hình thuôn rộng bằng nét (mục A2) |

Lưu ý:

- Rect hole của Altium là **rãnh phay bằng dao tròn** — góc hình chữ nhật sẽ bo theo bán kính dao.
- Số lỗ slot tính vào tổng "N lỗ" trên badge.
- Toạ độ slot Altium nằm SAU `G00/G01` — mọi luật đọc số (như FILE_FORMAT) phải dò cả ở đó
  (ESP32_DR: `RectHoles.TXT` ban đầu vẫn sai vì chỉ dò dòng bắt đầu bằng X/Y).

---

## E. Nhận biết file ghép — `panelDetect.ts` (22/09, `6249b00`)

| Thứ tự | Dấu hiệu | Kết luận |
|---|---|---|
| 1 | **Viền rời**: lớp viền có ≥ 2 bo tách nhau. Bỏ vòng cạnh ngắn < 8 mm, vòng **không có mạch bên trong** (rail, tai bo, khung) và khung bao trọn bo khác. Từ 24/09 không còn luật "bỏ vòng nhỏ hơn 10% vòng lớn nhất" — bộ "Bo Dem Linhgragon ESP32-S3" có hai bo con bằng 9.5% bo lớn, trượt nửa bước nên app đọc thành 1 bo *(`a6a79fc`)* | Có |
| 2 | **Cả bo lặp lại** theo một bước cỡ một bo. Chấm bằng **chữ in lụa** (bo ghép lặp y hệt cả tên linh kiện; kênh giống nhau trong một bo thì tên mỗi kênh khác nhau), bo không có lụa thì bằng đồng. Bước ≥ 15% cạnh ngắn của tấm (loại hàng chân linh kiện bội 2.54 mm). Không dùng lỗ khoan (file khoan không khai định dạng thì toạ độ lỗ là đoán) | Khớp ≥ 90% → Có · 60–90% → Có thể |
| 3 | Tên file chứa "ghep", "panel", "array"… | Có thể |
| — | Không có dấu hiệu nào | Không |

### E1. Mấy THIẾT KẾ trên một tấm (24/09, `a6a79fc`)

Nhiều bo rời không đồng nghĩa "panel bo giống nhau": bộ "Bo Dem Linhgragon ESP32-S3" có
1 bo lớn + 2 bo nhỏ giống hệt nhau → **3 bo, 2 thiết kế**, mỗi thiết kế một giá.

`findRepeats` không trả lời được câu đó (nó tìm MỘT bước lặp cho cả tấm), nên `groupDesigns`
so từng bo với nhau:

1. Cắt lấy điểm mạch nằm trong ô bao từng bo, dời về **trọng tâm** của chính bo đó (neo theo
   góc ô bao thì bo xoay lệch vài phần mười mm là trượt hết — "CHAT_BOT" tụt còn 35%).
2. Ô bao lệch ≤ 0.3 mm (thử cả xoay 90/180/270°) **và** khớp ≥ 80% hai chiều → cùng thiết kế.
3. Điểm mẫu của pad chữ nhật lấy **tâm**, không lấy góc — lấy góc thì bo xoay 90° có điểm
   mẫu nhảy sang vị trí khác.

Badge ghi `Ghép: Có — 3 bo · 2 thiết kế`; thẻ giá nhắc tách báo giá thay vì gợi ý nhân số set.

- Số bo theo mỗi hướng = độ trải của các điểm khớp / bước + 1, không quá (bề ngang tấm / bước) + 1.
- Hướng thứ hai tìm riêng trong các bước không song song với hướng thứ nhất (panel dài theo
  một chiều thì bước chiều đó chiếm hết phiếu — FRIWO 4×2).
- Mũi khoan nhỏ nhất (`minDrill`): lỗ tròn nhỏ nhất + số lỗ; rãnh hẹp nhất = 2 × bán kính cung.

---

## D. Checklist khi sửa luật đọc file

1. Viết test trong `test/` dựng lại đúng dáng file thật gây lỗi.
2. Chạy `npm run build` (không chỉ `tsc --noEmit`).
3. Hồi quy corpus `D:\JobDatMach`: so bản cũ/mới — kích thước bo, số vòng + thân/lỗ/nét, số
   lỗ và tỉ lệ lỗ nằm trong bo. Xem hình cũ/mới các bộ bị đổi trước khi chốt.
4. Mở lại bộ mẫu: FC_F405RGT6_Wing (KiCad 6 lớp), BOAD NUT NHAN (EasyEDA), AGVH7 (Altium inch,
   slot), Ceiling Master / Dynamic Master (panel inch), Slaver_Ceiling bản lẻ (GKO + GM1),
   ESP32_DR (Altium metric 4:3, RectHoles), CHAT_BOT_1 (panel 4 bo), DA82 (OrCAD Layout,
   thruhole.tap + .DRD), CHAT_BOT_4 (rãnh một
   nét), PHAONUOC (đường vẽ 0.8 mm không được thành rãnh), 3W NHUA XANH (CAM350, RAR).
