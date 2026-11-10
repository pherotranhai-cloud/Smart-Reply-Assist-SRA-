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
 * Data lives in changelog.json (newest release first) and is GENERATED, not
 * hand-edited: `npm run changelog` reads the commits since the last release,
 * has Claude write 3-5 plain Vietnamese lines about what a user will notice,
 * bumps the minor version and prepends the release. The "Update changelog"
 * GitHub Action runs it on every push to main. Internal-only work produces no
 * release, so the popup correctly stays shut. See scripts/changelog.ts.
 *
 * Shown once per release: App compares `version` against the
 * `app_last_seen_version` entry in localStorage and opens ChangelogModal when
 * they differ. Deliberately NOT keyed to APP_VERSION, which changes on every
 * commit and would put the popup in front of every user on every deploy.
 */
import changelog from './changelog.json';

export interface ChangelogRelease {
  version: string;
  date: string;
  /** Last commit the release notes cover; the generator starts after it. */
  commit: string;
  features: string[];
}

export const RELEASES: ChangelogRelease[] = changelog.releases;

const latest = RELEASES[0];

export const UPDATE_CHANGELOG = {
  version: latest.version,
  title: `Có gì mới trong phiên bản ${latest.version}?`,
  features: latest.features,
};
