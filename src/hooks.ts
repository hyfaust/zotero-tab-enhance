import { HelperExampleFactory, KeyExampleFactory } from "./modules/examples";
import { initPreference, registerPrefsScripts } from "./modules/preferenceScript";
import TabEnhance from "./modules/tabEnhance";
import VerticalTabSidebar from "./modules/verticalTabs/sidebar";
import TabTrackerService from "./modules/verticalTabs/tabTracker";
import { initLocale } from "./utils/locale";
import { getPref } from "./utils/prefs";
import { createZToolkit } from "./utils/ztoolkit";

function registerTabNotifier() {
  if (addon.data.tabNotifierID) {
    return;
  }

  addon.data.tabNotifierID = Zotero.Notifier.registerObserver(
    {
      notify: async (event, type, ids, extraData) => {
        await addon.hooks.onNotify(event, type, ids, extraData);
      },
    },
    ["tab"],
    addon.data.config.addonRef,
  );
}

function syncWindowFeatures(win: _ZoteroTypes.MainWindow): void {
  const enableVerticalTabs = getPref("enableVerticalTabs");
  const enableHorizontalTabEnhance = getPref("enableHorizontalTabEnhance");

  if (enableVerticalTabs) {
    if (!addon.tabTrackerInstances.has(win)) {
      const tabTracker = new TabTrackerService(win);
      tabTracker.init();
      addon.tabTrackerInstances.set(win, tabTracker);
      ztoolkit.log("TabTrackerService instance created for window");
    } else {
      addon.tabTrackerInstances.get(win)?.reconcile("feature-sync");
    }

    if (!addon.verticalTabSidebarInstances.has(win)) {
      const tabTracker = addon.tabTrackerInstances.get(win);
      if (tabTracker) {
        const verticalTabSidebar = new VerticalTabSidebar(win, tabTracker);
        verticalTabSidebar.init();
        addon.verticalTabSidebarInstances.set(win, verticalTabSidebar);
        ztoolkit.log("VerticalTabSidebar instance created for window");
      }
    }
  } else {
    const verticalTabSidebar = addon.verticalTabSidebarInstances.get(win);
    if (verticalTabSidebar) {
      verticalTabSidebar.destroy();
      addon.verticalTabSidebarInstances.delete(win);
      ztoolkit.log("VerticalTabSidebar instance destroyed for window");
    }

    const tabTracker = addon.tabTrackerInstances.get(win);
    if (tabTracker) {
      tabTracker.destroy();
      addon.tabTrackerInstances.delete(win);
      ztoolkit.log("TabTrackerService instance destroyed for window");
    }
  }

  if (enableHorizontalTabEnhance) {
    if (!addon.tabEnhanceInstances.has(win)) {
      const tabEnhance = new TabEnhance(win);
      tabEnhance.init();
      addon.tabEnhanceInstances.set(win, tabEnhance);
      ztoolkit.log("TabEnhance instance created for window");
    }
  } else {
    const tabEnhance = addon.tabEnhanceInstances.get(win);
    if (tabEnhance) {
      tabEnhance.destroy();
      addon.tabEnhanceInstances.delete(win);
      ztoolkit.log("TabEnhance instance destroyed for window");
    }
  }
}

function syncAllWindowsFeatures(): void {
  Zotero.getMainWindows().forEach((win) => syncWindowFeatures(win));
}

function refreshAllVerticalSidebars(): void {
  addon.verticalTabSidebarInstances.forEach((verticalTabSidebar) => {
    verticalTabSidebar.refreshDisplayPrefs();
  });
}

function unregisterTabNotifier() {
  if (!addon.data.tabNotifierID) {
    return;
  }

  Zotero.Notifier.unregisterObserver(addon.data.tabNotifierID);
  addon.data.tabNotifierID = undefined;
}

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();
  initPreference();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  registerTabNotifier();
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  syncWindowFeatures(win);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  const verticalTabSidebar = addon.verticalTabSidebarInstances.get(win);
  if (verticalTabSidebar) {
    verticalTabSidebar.destroy();
    addon.verticalTabSidebarInstances.delete(win);
    ztoolkit.log("VerticalTabSidebar instance destroyed for window");
  }

  const tabTracker = addon.tabTrackerInstances.get(win);
  if (tabTracker) {
    tabTracker.destroy();
    addon.tabTrackerInstances.delete(win);
    ztoolkit.log("TabTrackerService instance destroyed for window");
  }

  const tabEnhance = addon.tabEnhanceInstances.get(win);
  if (tabEnhance) {
    tabEnhance.destroy();
    addon.tabEnhanceInstances.delete(win);
    ztoolkit.log("TabEnhance instance destroyed for window");
  }

  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  unregisterTabNotifier();

  addon.verticalTabSidebarInstances.forEach((verticalTabSidebar) => {
    verticalTabSidebar.destroy();
  });
  addon.verticalTabSidebarInstances.clear();

  addon.tabTrackerInstances.forEach((tabTracker) => {
    tabTracker.destroy();
  });
  addon.tabTrackerInstances.clear();

  addon.tabEnhanceInstances.forEach((tabEnhance) => {
    tabEnhance.destroy();
  });
  addon.tabEnhanceInstances.clear();

  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  if (type === "tab") {
    addon.tabTrackerInstances.forEach((tabTracker) => {
      const reason = `${event}:${ids.join(",")}`;
      tabTracker.reconcile(reason);
      if (event === "add" || event === "load") {
        tabTracker.scheduleDelayedReconcile(reason);
      }
    });
  }

}

async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      await registerPrefsScripts(data.window);
      break;
    case "featureToggle":
      syncAllWindowsFeatures();
      break;
    case "displayPrefsChanged":
      refreshAllVerticalSidebars();
      break;
    default:
      return;
  }
}

function onShortcuts(type: string) {
  switch (type) {
    case "larger":
      KeyExampleFactory.exampleShortcutLargerCallback();
      break;
    case "smaller":
      KeyExampleFactory.exampleShortcutSmallerCallback();
      break;
    default:
      break;
  }
}

function onDialogEvents(type: string) {
  switch (type) {
    case "dialogExample":
      HelperExampleFactory.dialogExample();
      break;
    case "clipboardExample":
      HelperExampleFactory.clipboardExample();
      break;
    case "filePickerExample":
      HelperExampleFactory.filePickerExample();
      break;
    case "progressWindowExample":
      HelperExampleFactory.progressWindowExample();
      break;
    case "vtableExample":
      HelperExampleFactory.vtableExample();
      break;
    default:
      break;
  }
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};

