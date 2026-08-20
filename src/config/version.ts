/**
 * The app version, injected at build time from package.json's "version" by the
 * __APP_VERSION__ define in vite.config.ts. package.json is the single source
 * of truth — do not hardcode a version string here or anywhere else.
 */
export const APP_VERSION = `v${__APP_VERSION__}`;

export const UPDATE_CHANGELOG = {
  title: `Có gì mới trong phiên bản ${APP_VERSION}?`,
  features: [
    "**Desktop UI** hoàn toàn mới",
    "Cập nhật mô hình AI mặc định sang **gpt 5.6 luna**",
    "Hướng dẫn cài đặt thông minh"
  ]
};
