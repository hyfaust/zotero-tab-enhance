import { config } from "../../package.json";
import { getString } from "../utils/locale";

const PREF_CONTROL_IDS = [
  `${config.addonRef}-pref-enable-vertical-tabs`,
  `${config.addonRef}-pref-enable-horizontal-tab-enhance`,
  `${config.addonRef}-pref-enable-copy-reference`,
  `${config.addonRef}-pref-enable-go-to-attachment`,
  `${config.addonRef}-pref-enable-reload-tab`,
] as const;

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

  const prefsState = addon.data.prefs;
  if (prefsState) {
    prefsState.bound = true;
  }
}

export { initPreference, registerPrefsScripts, bindPrefEvents };
