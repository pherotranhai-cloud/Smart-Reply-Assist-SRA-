# Kết quả kiểm thử PWA — Smart Reply Assist

- **Link kiểm thử:** http://127.0.0.1:3000 (build production `npm run build`, chạy local bằng `node dist/server.cjs`; API Claude được thay bằng mock cục bộ `pwa-test-run/tools/mock_claude.mjs`, có câu trả lời phản ánh đúng nội dung request để phát hiện kết quả cache sai)
- **Ngày:** 2026-11-10 · **Trình duyệt:** Chromium (Playwright 1.63). Phiên này không có trình duyệt hiển thị, nên phần kiểm tra trực quan được làm bằng ảnh chụp Playwright (`pwa-test-run/spotcheck/`)
- **Phạm vi:** toàn bộ giao diện — Dịch, Soạn tin, Từ vựng, Lịch sử, Cài đặt, Điều hướng & bố cục, Trợ lý chuyên gia, PWA core
- **Kết luận nhanh:** Lượt đầu đạt 244/269 lượt (91%), tìm thấy **9 lỗi**; thêm **1 lỗi thứ 10** lộ ra trong lúc sửa. Nặng nhất: lịch sử hỏng trong localStorage làm **trắng toàn bộ app**. Thứ hai là **các Service Worker tranh nhau** khiến chế độ offline lỗi.
- **Sau khi sửa cả 10 lỗi: 269/269 lượt đạt (100%)** (xem cuối báo cáo).

## Tổng quan

| Tính năng | Kịch bản | Lượt lặp | Tổng lượt | Đạt | Lỗi | Tỷ lệ đạt |
|---|---|---|---|---|---|---|
| Dịch | 31 | 10 | 41 | 40 | 1 | 98% |
| Soạn tin | 25 | 10 | 35 | 31 | 4 | 89% |
| Từ vựng | 22 | 10 | 32 | 31 | 1 | 97% |
| Lịch sử | 20 | 10 | 30 | 29 | 1 | 97% |
| Cài đặt | 27 | 10 | 37 | 37 | 0 | 100% |
| Điều hướng & bố cục | 24 | 10 | 34 | 34 | 0 | 100% |
| Trợ lý chuyên gia | 20 | 10 | 30 | 29 | 1 | 97% |
| PWA core | 20 | 10 | 30 | 13 | 17 | 43% |
| **Tổng** | **189** | **80** | **269** | **244** | **25** | **91%** |

_(Bảng trên là số liệu trước khi sửa.)_

Lỗi tìm thấy: **10** (Cao: 1 · Trung bình: 6 · Thấp: 3). BUG-10 lộ ra trong lúc sửa: trước đó nó bị lỗi cache của BUG-05 che mất.

## Danh sách lỗi

### BUG-01 · Lịch sử hỏng trong localStorage làm trắng toàn bộ app — Mức độ: Cao
- **Hiện tượng:** Khi mở tab Lịch sử, cả ứng dụng biến thành màn hình trống, kể cả thanh điều hướng. Console báo `l.filter is not a function`. Người dùng không tự thoát ra được, trừ khi tự xoá dữ liệu trình duyệt.
- **Cách tái hiện:** 1) Đặt `localStorage.smart_reply_history = '{bad'` (dữ liệu ghi dở hoặc từ phiên bản cũ). 2) Mở app. 3) Bấm tab Lịch sử.
- **Nguyên nhân:**
  - `src/services/storage.ts` → `adapter.get()` (~dòng 16): khi `JSON.parse` lỗi, hàm trả về nguyên chuỗi thô.
  - `getHistory()` (~dòng 164) chỉ dùng `|| []`, nên chuỗi `'{bad'` lọt qua.
  - `useHistoryTab.ts` → `history.filter(...)` gặp chuỗi này và ném lỗi.
  - App không có Error Boundary, nên lỗi gỡ (unmount) toàn bộ cây React.
- **Đề xuất sửa:**
  - Trong `getHistory()`, kiểm tra kiểu như `getVocab()` đã làm: `const h = await adapter.get(...); return Array.isArray(h) ? h : [];`.
  - Kiểm tra tương tự cho `getTranslationCache()`: chỉ chấp nhận object thường.
  - Nên thêm một Error Boundary quanh mỗi tab.
- **Ca test lỗi:** `history/corrupt` (1/1) · Ảnh: `pwa-test-run/spotcheck/4-history-crash.png`

### BUG-02 · Nhiều Service Worker cùng đăng ký cho scope "/" — Mức độ: Trung bình
- **Hiện tượng:**
  - Mỗi lần mở app khi offline đều có lỗi JS chưa được bắt: `Failed to register a ServiceWorker … /sw.js`.
  - Trình duyệt giữ hai bộ cache song song (`smart-reply-cache-v1` và `workbox-precache-v2`).
  - Service Worker đang điều khiển trang tuỳ vào việc lệnh `register()` nào chạy sau.
- **Cách tái hiện:** 1) Mở app online, rồi reload. 2) Chuyển sang offline và reload. 3) Xem console: lỗi đăng ký `/sw.js`.
- **Nguyên nhân:** Có hai cơ chế đăng ký Service Worker chạy cùng lúc:
  - `vite.config.ts` → `VitePWA({...})` (~dòng 12) để mặc định `injectRegister`. Nó chèn `registerSW.js` vào `index.html` để đăng ký `/sw.js` (Workbox).
  - `src/pwa/registerSW.ts` (dòng 4), được gọi từ `src/main.tsx:7`, lại đăng ký `/service-worker.js` (viết tay, trong `public/`).
  - Lúc sửa còn phát hiện chỗ đăng ký thứ ba: một thẻ `<script>` inline trong `index.html` (dòng 24–31) cũng đăng ký `/service-worker.js`.
  - Các lệnh đăng ký cùng scope ghi đè lẫn nhau. Khi offline, lệnh đăng ký `/sw.js` thất bại và không có `.catch`.
- **Đề xuất sửa:** Chỉ giữ một Service Worker. Nên giữ Workbox của VitePWA, vì nó precache đủ JS/CSS đã hash:
  - Xoá `setupPWA()` khỏi `main.tsx`, xoá `src/pwa/registerSW.ts` và `public/service-worker.js`.
  - Thêm `workbox: { navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api\//] }` vào `VitePWA`.
  - Nếu muốn giữ SW viết tay thì ngược lại: đặt `injectRegister: false` và `strategies: 'injectManifest'`.
- **Ca test lỗi:** `pwa/single-sw` (1/1), `pwa/offline-reload` (1/1), `pwa/core` (10/10)

### BUG-03 · App không mở được khi offline sau lần truy cập đầu tiên, và đường dẫn con offline bị lỗi — Mức độ: Trung bình
- **Hiện tượng:**
  - Người dùng mở app một lần rồi mất mạng: reload ra trang trống, vì file JS/CSS chưa được cache.
  - Mở một đường dẫn con khi offline (ví dụ `/foo/bar`) thì trình duyệt báo lỗi mạng thay vì hiện app.
- **Cách tái hiện:**
  1. Mở app lần đầu (storage trống) và đợi Service Worker active.
  2. Xoá HTTP cache, chuyển sang offline rồi reload: trang trắng.
  3. Với lỗi đường dẫn con: đang offline, mở `/foo/bar`.
- **Nguyên nhân:**
  - `public/service-worker.js` chỉ precache `/`, `/index.html`, manifest và icon. File JS/CSS (đã hash tên) chỉ được cache theo kiểu stale-while-revalidate, sau khi SW đã điều khiển trang, nên lần tải đầu tiên không được lưu.
  - Nhánh fetch `return cachedResponse || fetchPromise` (~dòng 97) trả `undefined` khi mạng lỗi, nên `respondWith(undefined)` thành lỗi mạng.
  - SW không có fallback điều hướng về `index.html`.
- **Đề xuất sửa:**
  - Sửa chung với BUG-02: Workbox của VitePWA đã precache toàn bộ asset, và `navigateFallback` xử lý đường dẫn con.
  - Nếu giữ SW viết tay: precache danh sách asset lúc build, và với `request.mode === 'navigate'` thì trả `caches.match('/index.html')` khi offline.
- **Ca test lỗi:** `pwa/offline-first-visit` (1/1), `pwa/deep-offline` (1/1)

### BUG-04 · Bật "Summary Mode" rồi dịch lại vẫn ra bản dịch đầy đủ cũ — Mức độ: Trung bình
- **Hiện tượng:** Người dùng dịch một đoạn, bật Summary Mode rồi bấm Dịch lại. App hiện ngay bản dịch đầy đủ cũ kèm thông báo "Instant translation from cache", và không bao giờ tạo bản tóm tắt cho đoạn đó.
- **Cách tái hiện:** 1) Nhập "shift report" và bấm Dịch. 2) Bật Summary Mode. 3) Bấm Dịch: vẫn ra bản dịch đầy đủ, không có request mới.
- **Nguyên nhân:** `src/hooks/useTranslateTab.ts` → `handleTranslate()` (dòng 92): khoá cache `generateHash(translateInput + targetLang + imageHash)` không chứa `isSummaryMode`, nên bản đầy đủ và bản tóm tắt dùng chung một ô cache.
- **Đề xuất sửa:** `generateHash(translateInput + targetLang + (isSummaryMode ? '|summary' : '') + imageHash)`
- **Ca test lỗi:** `translate/summary-after-full` (1/1) · Ảnh: `pwa-test-run/spotcheck/1-summary-cached.png`

### BUG-05 · Soạn tin trả kết quả cũ khi chỉ đổi định dạng, người nhận, độ dài hoặc bật ngữ cảnh — Mức độ: Trung bình
- **Hiện tượng:** Người dùng soạn một yêu cầu, rồi đổi định dạng (ví dụ sang Email trang trọng), người nhận, độ dài, hoặc chuyển sang "Linked to Context", rồi bấm Generate. App trả lại đúng câu trả lời cũ mà không gọi AI.
- **Cách tái hiện:** 1) Tab Soạn tin, nhập "format test" và bấm Generate Reply. 2) Nhấn giữ nút Custom, đổi Format sang Formal Email rồi lưu. 3) Bấm Generate Reply: không có request mới, kết quả giữ nguyên.
- **Nguyên nhân:** `src/hooks/useComposeTab.ts` → `handleCompose()` (dòng 76): ``cacheKey = `${composeReq}-${lang}-${tone}-${goal}` `` thiếu `format`, `audience`, `length`, trạng thái `useContextInCompose` và nội dung ngữ cảnh.
- **Đề xuất sửa:** Đưa đủ các tham số vào khoá:
  ```ts
  const cacheKey = JSON.stringify([composeReq, composeParams, goal, useContextInCompose && currentContext?.lastUpdatedIso]);
  ```
- **Ca test lỗi:** `compose/format-change`, `compose/audience-change`, `compose/length-change`, `compose/context-toggle-cache` (4/4) · Ảnh: `pwa-test-run/spotcheck/2-compose-cached.png`

### BUG-06 · Tab Từ vựng hiện "0 terms" nếu mở trước khi đồng bộ xong — Mức độ: Trung bình
- **Hiện tượng:** Lần đầu mở app, nếu người dùng vào tab Từ vựng trong lúc app đang tải bộ từ vựng, tab hiện "0 terms" và không tự cập nhật. Storage đã có 867 từ, nhưng phải reload mới thấy.
- **Cách tái hiện:** 1) Mở app trên máy chưa có dữ liệu (hoặc mạng chậm). 2) Vào ngay tab Vocab. 3) Đợi đồng bộ xong: vẫn "0 terms".
- **Nguyên nhân:**
  - `src/hooks/useVocabManager.ts` (dòng 18) chỉ đọc `storage.getVocab()` một lần lúc mount.
  - Đồng bộ trong `App.tsx` (~dòng 286) cập nhật state `vocab` của App, không phải state riêng của VocabManager.
  - Tab giờ được giữ mounted, nên không có lần mount lại nào để đọc lại.
- **Đề xuất sửa:**
  - Truyền `vocab` của App xuống `VocabManager` làm prop, thay cho state riêng.
  - Hoặc làm như `useHistoryTab`: đọc lại storage khi tab được kích hoạt, hoặc khi `vocab` ở App thay đổi.
- **Ca test lỗi:** `vocab/stale-after-sync` (1/1) · Ảnh: `pwa-test-run/spotcheck/3-vocab-stale.png`

### BUG-07 · Có hai manifest với thông tin khác nhau — Mức độ: Thấp
- **Hiện tượng:**
  - Trang có hai thẻ `<link rel="manifest">`.
  - `manifest.json` ghi short_name "SRA" và màu `#006D77`.
  - `manifest.webmanifest` (do VitePWA sinh ra) ghi "Smart Reply" và màu `#050505`.
  - Vì vậy tên và màu khi cài app tuỳ trình duyệt chọn file nào.
- **Cách tái hiện:** Xem mã nguồn trang đã build: có 2 thẻ manifest. So sánh hai file.
- **Nguyên nhân:** `index.html` (dòng 13) tự link `/manifest.json` (file trong `public/`), trong khi `vite.config.ts` → `VitePWA({ manifest: {...} })` chèn thêm `manifest.webmanifest`.
- **Đề xuất sửa:** Chỉ giữ một. Ví dụ, xoá dòng 13 trong `index.html` cùng file `public/manifest.json`, rồi đưa tên và màu mong muốn vào `VitePWA.manifest`.
- **Ca test lỗi:** `pwa/one-manifest` (1/1), `pwa/manifest-consistent` (1/1)

### BUG-08 · `includeAssets` khai báo file không tồn tại — Mức độ: Thấp
- **Hiện tượng:** `/apple-touch-icon.png` và `/mask-icon.svg` không có thật. Server trả về trang HTML thay cho ảnh, nên icon trên iOS và Safari pinned tab bị sai.
- **Cách tái hiện:** Mở `/apple-touch-icon.png`: nhận về HTML thay vì ảnh PNG.
- **Nguyên nhân:** `vite.config.ts` (dòng 14): `includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg']`, nhưng `public/` chỉ có `favicon.ico` và các file `icon*.png`.
- **Đề xuất sửa:** Thêm hai file vào `public/`, hoặc bỏ chúng khỏi `includeAssets`.
- **Ca test lỗi:** `pwa/included-assets` (1/1)

### BUG-09 · Các nút của trợ lý chuyên gia không có tên cho trình đọc màn hình — Mức độ: Thấp
- **Hiện tượng:** Nút tròn nổi mở trợ lý, cùng các nút Gửi, Đóng và Sao chép bên trong, chỉ có icon. Trình đọc màn hình chỉ đọc là "button".
- **Cách tái hiện:** Xem cây accessibility: phần tử đầu tiên là `button` không có tên.
- **Nguyên nhân:** `src/components/FloatingAssistant.tsx` → `<motion.button>` (~dòng 124) và các nút Gửi/Đóng/Sao chép trong panel đều thiếu `aria-label`.
- **Đề xuất sửa:** Thêm nhãn, ví dụ `aria-label={t('assistant.title', 'Technical Expert')}` cho nút nổi; các nút còn lại dùng `t('send')`, `t('close')`, `t('copy')`.
- **Ca test lỗi:** `assistant/fab-name` (1/1)

### BUG-10 · Tham số "Tùy chỉnh (Custom)" của Soạn tin không bao giờ được áp dụng — Mức độ: Trung bình
- **Hiện tượng:** Trên điện thoại, người dùng nhấn giữ nút Custom, chọn người nhận, giọng điệu, độ dài hoặc định dạng (ví dụ Email trang trọng) rồi lưu. Ngay sau đó các tham số bị đặt lại về mặc định. Tin soạn ra vẫn dùng định dạng nhóm chat, và dòng "Subject:" của email không được tách riêng. Chỉ chạm vào nút Custom cũng reset như vậy.
- **Cách tái hiện:** 1) Tab Soạn tin trên mobile, nhấn giữ nút Custom. 2) Đổi Format sang Formal Email rồi lưu. 3) Soạn tin: request vẫn gửi `format: wechat_zalo`.
- **Nguyên nhân:** `src/components/common/PresetGrid.tsx` → `handleSaveCustom()` và nhánh click của `useLongPress`:
  - Sau `onUpdateCustomParams(localCustom)`, hàm gọi `onSelectPreset(CORE_PRESETS.find(p => p.id === 'custom'))`.
  - `ComposeTabMobile` gộp `preset.settings` của mục đó, tức giá trị mặc định cố định, đè lên tham số người dùng vừa chọn.
- **Đề xuất sửa:** Khi chọn Custom, truyền preset mang theo thiết lập của người dùng: `onSelectPreset({ ...customPreset, settings: localCustom })`.
- **Ca test lỗi:** `compose/format-change`, `compose/audience-change`, `compose/length-change` (lượt chạy sau khi sửa BUG-05). Test `compose/email-subject` đã được siết lại để bắt được lỗi này.

## Kết quả sau khi sửa

Cả 10 lỗi đã được sửa trên nhánh `claude/modest-brahmagupta-jz7udk` (PR #25). Toàn bộ bộ test được chạy lại trên bản build production mới:

| Tính năng | Tổng lượt | Đạt | Trước khi sửa |
|---|---|---|---|
| Dịch | 41 | 41 (100%) | 40 |
| Soạn tin | 35 | 35 (100%) | 31 |
| Từ vựng | 32 | 32 (100%) | 31 |
| Lịch sử | 30 | 30 (100%) | 29 |
| Cài đặt | 37 | 37 (100%) | 37 |
| Điều hướng & bố cục | 34 | 34 (100%) | 34 |
| Trợ lý chuyên gia | 30 | 30 (100%) | 29 |
| PWA core | 30 | 30 (100%) | 13 |
| **Tổng** | **269** | **269 (100%)** | **244** |

| Lỗi | Đã sửa ở |
|---|---|
| BUG-01 | `storage.ts`: `getHistory()` chỉ nhận mảng, `getTranslationCache()` chỉ nhận object |
| BUG-02, 03 | Chỉ còn Service Worker Workbox của VitePWA (`injectRegister: 'inline'`, `navigateFallback: '/index.html'`, loại trừ `/api/`). Đã xoá `public/service-worker.js`, `src/pwa/registerSW.ts` và script inline trong `index.html`. `main.tsx` xoá cache cũ `smart-reply-cache-v1` trên máy đã cài |
| BUG-04 | `useTranslateTab.ts`: khoá cache có thêm chế độ Summary |
| BUG-05 | `useComposeTab.ts`: khoá cache gồm toàn bộ `composeParams`, preset và ngữ cảnh đang dùng |
| BUG-06 | `useVocabManager(appVocab)`: đọc lại storage khi bộ từ vựng của App thay đổi; App truyền `vocab` xuống |
| BUG-07, 08 | Chỉ còn `manifest.webmanifest` (giữ "SRA", `#006D77`, `share_target`). Đã xoá `public/manifest.json` và thẻ link; `includeAssets` chỉ còn file có thật |
| BUG-09 | `FloatingAssistant.tsx`: `aria-label` cho các nút mở, đóng, gửi và sao chép; thêm chuỗi dịch `assistant.close` và `assistant.send` cho 4 ngôn ngữ |
| BUG-10 | `PresetGrid.tsx`: chọn hoặc lưu Custom dùng chính thiết lập của người dùng |

- **Kiểm tra khác:** `tsc --noEmit` sạch, `vitest` 17/17 đạt.
- **Audit PWA:** 17/19 mục đạt. Hai mục còn lại là cảnh báo nhầm của công cụ audit:
  - Workbox phục vụ `/` từ `index.html` đã precache, nên `caches.match('/')` trả rỗng dù app vẫn mở được khi offline.
  - Khi offline, các lệnh gọi `/api/*` lỗi là đúng bản chất, và app đã bắt lỗi.
- **Test đã chỉnh vì kiến trúc PWA thay đổi:** ba test trước đây kiểm tra cụ thể file `/manifest.json` và `/service-worker.js` (giờ đã xoá có chủ đích). Chúng được chuyển sang kiểm tra điều kiện tương đương một cách tổng quát: manifest đang link khớp theme-color, SW đang chạy trả về JavaScript, mọi icon được tham chiếu đều tồn tại.
- **Kết quả trước khi sửa:** lưu trong `pwa-test-run/results.before-fix.json`.

## Ghi chú
- **Không có ca chập chờn:** mọi ca lỗi đều lỗi 100% số lượt, và các luồng chính chạy lặp 10 lần đều ổn định.
- **Không test được trong môi trường headless:**
  - nhận giọng nói (Web Speech API) và đọc to (TTS);
  - hộp thoại cài app thật và nút Share của hệ điều hành;
  - gọi API Claude thật, vì không có `ANTHROPIC_API_KEY` (đã dùng mock);
  - đường dẫn `/.netlify/functions/import-vocab`, vốn chỉ dùng khi chạy trên `*.netlify.app`.
- **Ca test đã sửa vì lỗi do script, không phải lỗi app:**
  - Text bị trùng với tab đang ẩn (các tab được giữ mounted). Đã sửa bằng cách chỉ khớp phần tử đang hiển thị.
  - `getByRole('radio', {name:'Light'})` khớp nhầm "Aurora Soft light bands".
  - Theme được áp qua `data-theme`, không qua class.
  - Preset "Urgent" có id `report`.
  - Cột `my` trong bộ từ vựng không có mục nào đủ dài để tìm.
  - Giao diện desktop dùng placeholder và tiêu đề khác bản mobile.
  - Bộ lọc Lịch sử cần chờ animation thoát xong.
  - Mock tách đôi một emoji giữa hai cặp surrogate.
- **Chi tiết:** `pwa-test-run/suite.js`, `pwa-test-run/results.json`, `pwa-test-run/audit.json`, ảnh lỗi trong `pwa-test-run/screenshots/`, ảnh kiểm tra trực quan trong `pwa-test-run/spotcheck/`.
- **Chạy lại:**
  ```bash
  node pwa-test-run/tools/mock_claude.mjs 4011 &
  npm run build && ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://127.0.0.1:4011 NODE_ENV=production node dist/server.cjs &
  node pwa-test-run/tools/run_suite.js --suite pwa-test-run/suite.js --base-url http://127.0.0.1:3000 --out pwa-test-run
  ```
