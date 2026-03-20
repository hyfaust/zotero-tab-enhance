import { config } from "../../package.json";

type PluginPrefsMap = _ZoteroTypes.Prefs["PluginPrefsMap"];
type PrefValue = string | number | boolean;

const PREFS_PREFIX = config.prefsPrefix;
const DEFAULT_PREF_VALUES: PluginPrefsMap = {
  enableVerticalTabs: true,
  enableHorizontalTabEnhance: true,
  enableCopyReference: true,
  enableGoToAttachment: true,
  enableReloadTab: true,
};

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

/**
 * Clear preference value.
 * Wrapper of `Zotero.Prefs.clear`.
 * @param key
 */
export function clearPref(key: string) {
  return Zotero.Prefs.clear(`${PREFS_PREFIX}.${key}`, true);
}
