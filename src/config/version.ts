/**
 * ---------------------------------------------------------------------------
 * APP_VERSION — the build number.
 * ---------------------------------------------------------------------------
 * Injected at build time from package.json's "version" by the __APP_VERSION__
 * define in vite.config.ts. package.json is the single source of truth, and the
 * pre-commit hook increments its patch component on every commit, so this moves
 * constantly. Never hardcode a version string here or anywhere else.
 *
 * Shown in Settings and the desktop sidebar. It already carries the leading
 * "v" — do not prefix another one at the render site.
 */
export const APP_VERSION = `v${__APP_VERSION__}`;

/**
 * ---------------------------------------------------------------------------
 * UPDATE_CHANGELOG — the "what's new" popup.
 * ---------------------------------------------------------------------------
 * Shown once per release: App compares `version` below against the
 * `app_last_seen_version` entry in localStorage and opens ChangelogModal when
 * they differ.
 *
 * This is deliberately NOT keyed to APP_VERSION. APP_VERSION changes on every
 * single commit, so keying the popup to it would put a modal in front of every
 * user on every deploy — including for a typo fix.
 *
 * RELEASE CHECKLIST — when preparing a merge:
 *   1. Bump `version` below (minor for a user-facing release, e.g. 2.13.0).
 *   2. Rewrite `features` to say, in plain language, what a user will notice.
 *      Three to five short lines. Describe the change, not the implementation:
 *      "chữ rõ hơn trên mọi hình nền", not "raised --text-muted to 4.5:1".
 *   3. Leave the wording in Vietnamese — this is the factory-floor audience.
 * Skip both steps for internal-only work; the popup then correctly stays shut.
 */
export const UPDATE_CHANGELOG = {
  version: 'v2.13.0',
  title: 'Có gì mới trong phiên bản v2.13.0?',
  features: [
    "Tab **Dịch** gọn hơn: chọn ngôn ngữ và **Chế độ tóm tắt** nằm chung một hàng, nút Dịch vừa tầm tay",
    "**Dịch trực tiếp** dễ đọc hẳn: nền không còn bị trong suốt, chữ rõ trên mọi hình nền và mọi chủ đề",
    "Nút **Tái sử dụng** trong Lịch sử đã hoạt động: mở lại đúng tab Dịch hoặc Soạn thảo kèm nội dung cũ",
    "Không còn mất nội dung đang nhập khi chuyển tab hoặc đổi giữa điện thoại và máy tính",
    "Nhãn và chữ gợi ý đậm hơn, dễ đọc hơn trong mọi chủ đề"
  ]
};
