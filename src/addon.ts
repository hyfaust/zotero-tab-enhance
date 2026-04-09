import { config } from "../package.json";
import { DialogHelper } from "zotero-plugin-toolkit";
import hooks from "./hooks";
import TabEnhance from "./modules/tabEnhance";
import VerticalTabSidebar from "./modules/verticalTabs/sidebar";
import TabTrackerService from "./modules/verticalTabs/tabTracker";
import LibraryContextMenu from "./modules/libraryContextMenu";
import { createZToolkit } from "./utils/ztoolkit";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    // Env type, see build.js
    env: "development" | "production";
    initialized?: boolean;
    ztoolkit: ZToolkit;
    locale?: {
      current: any;
    };
    prefs?: {
      window: Window;
      bound?: boolean;
    };
    resettingPluginData?: boolean;
    dialog?: DialogHelper;
    tabNotifierID?: string;
  };
  public hooks: typeof hooks;
  public api: object;

  public tabEnhanceInstances: Map<Window, TabEnhance>;
  public tabTrackerInstances: Map<Window, TabTrackerService>;
  public verticalTabSidebarInstances: Map<Window, VerticalTabSidebar>;
  public libraryContextMenuInstances: Map<Window, LibraryContextMenu>;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
    };
    this.hooks = hooks;
    this.api = {};
    this.tabEnhanceInstances = new Map();
    this.tabTrackerInstances = new Map();
    this.verticalTabSidebarInstances = new Map();
    this.libraryContextMenuInstances = new Map();
  }
}

export default Addon;
