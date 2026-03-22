import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { GROUP_COLOR_PREF_KEYS, getPref, setPref } from "../utils/prefs";

const PREF_CONTROL_IDS = [
  `${config.addonRef}-pref-enable-vertical-tabs`,
  `${config.addonRef}-pref-enable-horizontal-tab-enhance`,
  `${config.addonRef}-pref-enable-copy-reference`,
  `${config.addonRef}-pref-enable-go-to-attachment`,
  `${config.addonRef}-pref-enable-reload-tab`,
] as const;

const DISPLAY_SELECT_CONFIG = [
  {
    id: `${config.addonRef}-pref-vertical-tab-title-mode`,
    key: "verticalTabTitleMode" as const,
  },
  {
    id: `${config.addonRef}-pref-vertical-tab-subtitle-mode`,
    key: "verticalTabSubtitleMode" as const,
  },
] as const;

const GROUP_COLOR_INPUT_CONFIG = GROUP_COLOR_PREF_KEYS.map((key, index) => ({
  id: `${config.addonRef}-pref-group-color-${index + 1}`,
  key,
})) as ReadonlyArray<{
  id: string;
  key: (typeof GROUP_COLOR_PREF_KEYS)[number];
}>;

function initPreference() {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });
}

async function registerPrefsScripts(window: Window) {
  addon.data.prefs = {
    window,
    bound: false,
  };
  bindPrefEvents();
}

function bindPrefEvents() {
  const prefsWindow = addon.data.prefs?.window;
  if (!prefsWindow || addon.data.prefs?.bound) {
    return;
  }

  PREF_CONTROL_IDS.forEach((id) => {
    prefsWindow.document.getElementById(id)?.addEventListener("command", () => {
      void addon.hooks.onPrefsEvent("featureToggle", {});
    });
  });

  DISPLAY_SELECT_CONFIG.forEach(({ id, key }) => {
    const select = prefsWindow.document.getElementById(id) as HTMLSelectElement | null;
    if (!select) {
      return;
    }
    select.value = String(getPref(key));
    select.addEventListener("change", () => {
      setPref(key, select.value as never);
      void addon.hooks.onPrefsEvent("displayPrefsChanged", {});
    });
  });

  GROUP_COLOR_INPUT_CONFIG.forEach(({ id, key }) => {
    const input = prefsWindow.document.getElementById(id) as HTMLInputElement | null;
    if (!input) {
      return;
    }
    input.value = String(getPref(key));
    const syncColor = () => {
      setPref(key, input.value as never);
      void addon.hooks.onPrefsEvent("displayPrefsChanged", {});
    };
    input.addEventListener("input", syncColor);
    input.addEventListener("change", syncColor);
  });

  const prefsState = addon.data.prefs;
  if (prefsState) {
    prefsState.bound = true;
  }
}

export { initPreference, registerPrefsScripts, bindPrefEvents };
