import { config } from "../../package.json";
import { GROUP_COLOR_PALETTE } from "../modules/verticalTabs/types";

type PluginPrefsMap = _ZoteroTypes.Prefs["PluginPrefsMap"];
type PrefValue = string | number | boolean;

const PREFS_PREFIX = config.prefsPrefix;
export const GROUP_COLOR_PREF_KEYS = [
  "groupColor1",
  "groupColor2",
  "groupColor3",
  "groupColor4",
  "groupColor5",
  "groupColor6",
] as const;
const DEFAULT_PREF_VALUES: PluginPrefsMap = {
  enableVerticalTabs: false,
  enableHorizontalTabEnhance: false,
  enableCopyReference: true,
  enableGoToAttachment: true,
  enableReloadTab: true,
  verticalTabTitleMode: "title",
  verticalTabSubtitleMode: "source",
  groupColor1: GROUP_COLOR_PALETTE[0],
  groupColor2: GROUP_COLOR_PALETTE[1],
  groupColor3: GROUP_COLOR_PALETTE[2],
  groupColor4: GROUP_COLOR_PALETTE[3],
  groupColor5: GROUP_COLOR_PALETTE[4],
  groupColor6: GROUP_COLOR_PALETTE[5],
};

function normalizeHexColor(
  value: PluginPrefsMap[keyof PluginPrefsMap],
  fallback: string,
): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return fallback;
  }

  return trimmed.toUpperCase();
}

/**
 * Get preference value.
 * Wrapper of `Zotero.Prefs.get`.
 * @param key
 */
export function getPref<K extends keyof PluginPrefsMap>(key: K) {
  try {
    const value = Zotero.Prefs.get(`${PREFS_PREFIX}.${key}`, true);
    if (value === null || value === undefined) {
      return DEFAULT_PREF_VALUES[key];
    }
    return value as PluginPrefsMap[K];
  } catch (error) {
    ztoolkit.log("getPref failed, using default", { key, error });
    return DEFAULT_PREF_VALUES[key];
  }
}

/**
 * Set preference value.
 * Wrapper of `Zotero.Prefs.set`.
 * @param key
 * @param value
 */
export function setPref<K extends keyof PluginPrefsMap>(
  key: K,
  value: PluginPrefsMap[K],
) {
  return Zotero.Prefs.set(`${PREFS_PREFIX}.${key}`, value, true);
}

export function getRawPref<T>(key: string, fallbackValue: T): T {
  try {
    const value = Zotero.Prefs.get(`${PREFS_PREFIX}.${key}`, true);
    return (value ?? fallbackValue) as T;
  } catch (error) {
    ztoolkit.log("getRawPref failed", { key, error });
    return fallbackValue;
  }
}

export function setRawPref(key: string, value: PrefValue) {
  return Zotero.Prefs.set(`${PREFS_PREFIX}.${key}`, value, true);
}

export function getJSONPref<T>(key: string, fallbackValue: T): T {
  const rawValue = getRawPref<string | null>(key, null);
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return fallbackValue;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch (error) {
    ztoolkit.log("getJSONPref failed", { key, error });
    return fallbackValue;
  }
}

export function setJSONPref(key: string, value: unknown) {
  return setRawPref(key, JSON.stringify(value));
}

export function getGroupColorPalette(): string[] {
  return GROUP_COLOR_PREF_KEYS.map((key, index) =>
    normalizeHexColor(getPref(key), GROUP_COLOR_PALETTE[index]),
  );
}

/**
 * Clear preference value.
 * Wrapper of `Zotero.Prefs.clear`.
 * @param key
 */
export function clearPref(key: string) {
  return Zotero.Prefs.clear(`${PREFS_PREFIX}.${key}`, true);
}
