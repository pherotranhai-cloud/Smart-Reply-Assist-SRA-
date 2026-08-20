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
  version: 'v2.14.0',
  title: 'Có gì mới trong phiên bản v2.14.0?',
  features: [
    "**Cài đặt gọn hơn**: chỉ còn **một** mục chọn giao diện, có thêm tuỳ chọn **Theo hệ thống**",
    "Giao diện **Cyberpunk** đổi sang tông **tím điện**, chữ dịu mắt hơn khi nhìn lâu",
    "Chữ trên các nút bấm và viền ô nhập liệu đã rõ ràng ở mọi chủ đề",
    "Hình nền **hiển thị đúng tên mẫu giày**, và bạn có thể **tải nhiều ảnh từ máy** rồi tự đặt tên",
  ]
};
