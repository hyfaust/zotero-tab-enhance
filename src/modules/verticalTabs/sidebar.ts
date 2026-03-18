import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import TabTrackerService from "./tabTracker";
import TabCommandController, { TabCommandItem } from "./tabCommands";
import { LIBRARY_TAB_ID, TabTrackerSnapshot, TrackedTab } from "./types";

const DEFAULT_EXPANDED_WIDTH = 260;
const COLLAPSED_WIDTH = 44;

export default class VerticalTabSidebar {
  private readonly window: _ZoteroTypes.MainWindow;
  private readonly document: Document;
  private readonly tracker: TabTrackerService;
  private readonly commandController: TabCommandController;
  private initialized = false;
  private collapsed = false;
  private expandedWidth = DEFAULT_EXPANDED_WIDTH;
  private searchQuery = "";
  private sidebar?: XULElement;
  private splitter?: XULElement;
  private toggleButton?: XULElement;
  private headerTitle?: HTMLElement;
  private countBadge?: HTMLElement;
  private listContainer?: HTMLElement;
  private searchInput?: HTMLInputElement;
  private contextMenu?: XULPopupElement;
  private stylesheet?: HTMLElement;
  private unsubscribeTracker?: () => void;
  private trackedTabsByKey = new Map<string, TrackedTab>();

  private readonly handleResizeEnd = () => {
    if (!this.sidebar || this.collapsed) {
      return;
    }
    const width = Math.round(this.sidebar.getBoundingClientRect().width);
    if (width >= 160) {
      this.expandedWidth = width;
      this.applySidebarWidth();
    }
  };


  constructor(window: _ZoteroTypes.MainWindow, tracker: TabTrackerService) {
    this.window = window;
    this.document = window.document;
    this.tracker = tracker;
    this.commandController = new TabCommandController(window);
  }

  public init(): void {
    if (this.initialized) {
      ztoolkit.log("VerticalTabSidebar already initialized, skipping");
      return;
    }

    if (!this.mountLayout()) {
      ztoolkit.log("VerticalTabSidebar failed to mount");
      return;
    }

    this.initialized = true;
    this.unsubscribeTracker = this.tracker.subscribe((snapshot) => {
      this.render(snapshot);
    });
    this.window.addEventListener("mouseup", this.handleResizeEnd);
    ztoolkit.log("VerticalTabSidebar initialized");
  }

  public destroy(): void {
    if (!this.initialized) {
      return;
    }

    this.unsubscribeTracker?.();
    this.unsubscribeTracker = undefined;
    this.window.removeEventListener("mouseup", this.handleResizeEnd);

    this.sidebar?.remove();
    this.splitter?.remove();
    this.contextMenu?.remove();
    this.stylesheet?.remove();
    this.sidebar = undefined;
    this.splitter = undefined;
    this.toggleButton = undefined;
    this.headerTitle = undefined;
    this.countBadge = undefined;
    this.listContainer = undefined;
    this.searchInput = undefined;
    this.contextMenu = undefined;
    this.stylesheet = undefined;
    this.trackedTabsByKey.clear();
    this.initialized = false;
    ztoolkit.log("VerticalTabSidebar destroyed");
  }

  private mountLayout(): boolean {
    const deck = this.window.Zotero_Tabs.deck as unknown as XULElement | null;
    const deckParent = deck?.parentNode;
    if (!deck || !deckParent) {
      return false;
    }

    this.stylesheet = this.ensureStylesheet();

    const sidebar = ztoolkit.UI.createElement(this.document, "vbox", {
      classList: ["tab-enhance-vertical-tabs-sidebar"],
      attributes: {
        id: `${config.addonRef}-vertical-tabs-sidebar`,
      },
    }) as XULElement;

    const header = ztoolkit.UI.createElement(this.document, "hbox", {
      classList: ["tab-enhance-vertical-tabs-header"],
    }) as XULElement;

    const toggleButton = ztoolkit.UI.createElement(
      this.document,
      "toolbarbutton",
      {
        classList: ["tab-enhance-vertical-tabs-toggle"],
        attributes: {
          label: "<",
          tooltiptext: "Toggle vertical tabs sidebar",
        },
        listeners: [
          {
            type: "command",
            listener: () => this.toggleCollapsed(),
          },
        ],
      },
    ) as XULElement;

    const headerText = ztoolkit.UI.createElement(this.document, "div", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tabs-title"],
      properties: {
        textContent: "Tabs",
      },
    }) as HTMLDivElement;

    const countBadge = ztoolkit.UI.createElement(this.document, "div", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tabs-count"],
      properties: {
        textContent: "0",
      },
    }) as HTMLDivElement;

    const searchInput = ztoolkit.UI.createElement(this.document, "input", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tabs-search"],
      attributes: {
        type: "search",
        placeholder: getString("search-tabs"),
      },
      listeners: [
        {
          type: "input",
          listener: (event: Event) => {
            const target = event.currentTarget as HTMLInputElement | null;
            this.searchQuery = target?.value.trim().toLocaleLowerCase() ?? "";
            this.render(this.tracker.getSnapshot());
          },
        },
      ],
    }) as HTMLInputElement;

    const listContainer = ztoolkit.UI.createElement(this.document, "div", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tabs-list"],
      attributes: {
        role: "listbox",
      },
    }) as HTMLDivElement;

    const contextMenu = ztoolkit.UI.createElement(this.document, "menupopup", {
      classList: ["tab-enhance-vertical-tabs-context-menu"],
      attributes: {
        id: `${config.addonRef}-vertical-tabs-context-menu`,
      },
    }) as unknown as XULPopupElement;

    header.appendChild(toggleButton);
    header.appendChild(headerText);
    header.appendChild(countBadge);
    sidebar.appendChild(header);
    sidebar.appendChild(searchInput);
    sidebar.appendChild(listContainer);

    const popupHost =
      this.document.getElementById("mainPopupSet") ?? this.document.documentElement;
    popupHost?.appendChild(contextMenu);

    const splitter = ztoolkit.UI.createElement(this.document, "splitter", {
      classList: ["tab-enhance-vertical-tabs-splitter"],
      attributes: {
        id: `${config.addonRef}-vertical-tabs-splitter`,
      },
    }) as XULElement;

    deckParent.insertBefore(splitter, deck);
    deckParent.insertBefore(sidebar, splitter);

    this.sidebar = sidebar;
    this.splitter = splitter;
    this.toggleButton = toggleButton;
    this.headerTitle = headerText;
    this.countBadge = countBadge;
    this.searchInput = searchInput;
    this.listContainer = listContainer;
    this.contextMenu = contextMenu;
    this.applySidebarWidth();
    return true;
  }

  private ensureStylesheet(): HTMLElement {
    const stylesheetId = `${config.addonRef}-vertical-tabs-style`;
    const existing = this.document.getElementById(stylesheetId) as HTMLElement | null;
    if (existing) {
      return existing;
    }

    const link = ztoolkit.UI.createElement(this.document, "link", {
      namespace: "html",
      attributes: {
        id: stylesheetId,
        rel: "stylesheet",
        type: "text/css",
        href: `chrome://${config.addonRef}/content/zoteroPane.css`,
      },
    }) as HTMLElement;
    this.document.documentElement?.appendChild(link);
    return link;
  }

  private toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    this.hideContextMenu();
    this.applySidebarWidth();
    this.render(this.tracker.getSnapshot());
  }

  private applySidebarWidth(): void {
    if (!this.sidebar || !this.splitter) {
      return;
    }

    this.toggleButton?.setAttribute("label", this.collapsed ? ">" : "<");

    if (this.collapsed) {
      this.sidebar.classList.add("is-collapsed");
      this.sidebar.style.width = `${COLLAPSED_WIDTH}px`;
      this.splitter.setAttribute("hidden", "true");
      this.searchInput?.setAttribute("hidden", "true");
    } else {
      this.sidebar.classList.remove("is-collapsed");
      this.sidebar.style.width = `${this.expandedWidth}px`;
      this.splitter.removeAttribute("hidden");
      this.searchInput?.removeAttribute("hidden");
    }
  }

  private render(snapshot: TabTrackerSnapshot): void {
    if (!this.listContainer || !this.countBadge || !this.headerTitle) {
      return;
    }

    const visibleTabs = snapshot.tabs
      .filter((tab) => this.shouldRenderTab(tab))
      .filter((tab) => this.matchesSearch(tab));
    const listContainer = this.listContainer;
    this.trackedTabsByKey.clear();
    this.hideContextMenu();
    this.headerTitle.textContent = this.collapsed ? "" : "Tabs";
    this.countBadge.textContent = String(visibleTabs.length);
    listContainer.textContent = "";

    if (visibleTabs.length === 0) {
      const emptyState = ztoolkit.UI.createElement(this.document, "div", {
        namespace: "html",
        classList: ["tab-enhance-vertical-tabs-empty"],
        properties: {
          textContent: this.searchQuery
            ? getString("no-matching-tabs")
            : this.collapsed
              ? "0"
              : "No tabs open",
        },
      }) as HTMLDivElement;
      listContainer.appendChild(emptyState);
      return;
    }

    visibleTabs.forEach((tab) => {
      const normalizedTab = this.normalizeTab(tab);
      this.trackedTabsByKey.set(normalizedTab.key, normalizedTab);
      listContainer.appendChild(
        this.renderTabRow(normalizedTab, snapshot.selectedTabKey),
      );
    });
  }

  private normalizeTab(tab: TrackedTab): TrackedTab {
    if (tab.key && tab.key.trim()) {
      return tab;
    }

    const fallbackKey = tab.tabId
      ? `tab:${tab.tabId}`
      : `fallback:${tab.nativeIndex}:${tab.title}`;

    return {
      ...tab,
      key: fallbackKey,
    };
  }

  private shouldRenderTab(tab: TrackedTab): boolean {
    return !(
      tab.tabId === LIBRARY_TAB_ID ||
      tab.type === "library" ||
      tab.type === "zotero-pane"
    );
  }

  private matchesSearch(tab: TrackedTab): boolean {
    if (!this.searchQuery) {
      return true;
    }

    const haystack = `${tab.title} ${this.getMetaText(tab)}`.toLocaleLowerCase();
    return haystack.includes(this.searchQuery);
  }

  private renderTabRow(
    tab: TrackedTab,
    selectedTabKey: string | null,
  ): HTMLElement {
    const isSelected = selectedTabKey
      ? tab.key === selectedTabKey
      : Boolean(tab.isSelected);

    const row = ztoolkit.UI.createElement(this.document, "div", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tab-row"],
      properties: {
        title: tab.title,
      },
      attributes: {
        role: "button",
        tabindex: isSelected ? "0" : "-1",
      },
    }) as HTMLDivElement;

    row.dataset.tabKey = tab.key;
    row.addEventListener("click", this.handleRowClick);
    row.addEventListener("keydown", this.handleRowKeyDown);
    row.addEventListener("contextmenu", this.handleRowContextMenu);

    if (isSelected) {
      row.classList.add("is-selected");
      row.setAttribute("aria-selected", "true");
    } else {
      row.setAttribute("aria-selected", "false");
    }

    const badge = ztoolkit.UI.createElement(this.document, "span", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tab-badge", `is-${tab.iconKey}`],
      properties: {
        textContent: this.getBadgeText(tab),
      },
    }) as HTMLSpanElement;

    const content = ztoolkit.UI.createElement(this.document, "span", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tab-content"],
    }) as HTMLSpanElement;

    const title = ztoolkit.UI.createElement(this.document, "span", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tab-title"],
      properties: {
        textContent: this.collapsed ? "" : tab.title,
      },
    }) as HTMLSpanElement;

    const meta = ztoolkit.UI.createElement(this.document, "span", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tab-meta"],
      properties: {
        textContent: this.collapsed ? "" : this.getMetaText(tab),
      },
    }) as HTMLSpanElement;

    content.appendChild(title);
    content.appendChild(meta);
    row.appendChild(badge);
    row.appendChild(content);

    if (!this.collapsed && tab.tabId) {
      const closeButton = ztoolkit.UI.createElement(this.document, "button", {
        namespace: "html",
        classList: ["tab-enhance-vertical-tab-close"],
        properties: {
          textContent: "x",
          title: getString("close-tab"),
        },
        listeners: [
          {
            type: "click",
            listener: (event: Event) => {
              event.preventDefault();
              event.stopPropagation();
              this.commandController.close(tab.tabId);
            },
          },
        ],
      }) as HTMLButtonElement;
      row.appendChild(closeButton);
    }

    return row;
  }

  private readonly handleRowClick = (event: MouseEvent) => {
    const row = event.currentTarget as HTMLDivElement | null;
    if (!row) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.selectTrackedTabByKey(row.dataset.tabKey ?? null);
  };

  private readonly handleRowKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const row = event.currentTarget as HTMLDivElement | null;
    if (!row) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.selectTrackedTabByKey(row.dataset.tabKey ?? null);
  };

  private readonly handleRowContextMenu = (event: MouseEvent) => {
    const row = event.currentTarget as HTMLDivElement | null;
    if (!row) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.showContextMenu(row.dataset.tabKey ?? null, event.screenX, event.screenY);
  };

  private selectTrackedTabByKey(tabKey: string | null): void {
    if (!tabKey) {
      return;
    }

    const tracked = this.trackedTabsByKey.get(tabKey);
    if (!tracked) {
      this.tracker.reconcile("missing-tab-key");
      return;
    }
    this.selectTrackedTab(tracked);
  }

  private selectTrackedTab(tab: TrackedTab): void {
    const tabId = tab.tabId;
    if (!tabId) {
      return;
    }

    try {
      this.commandController.select(tabId);
      return;
    } catch (error) {
      ztoolkit.log("VerticalTabSidebar select failed", tabId, error);
    }

    this.tracker.reconcile("failed-select");
  }

  private showContextMenu(tabKey: string | null, screenX: number, screenY: number): void {
    if (!this.contextMenu || !tabKey) {
      return;
    }

    const tracked = this.trackedTabsByKey.get(tabKey);
    if (!tracked) {
      return;
    }

    const items = this.commandController.getContextMenuItems(tracked.tabId);

    while (this.contextMenu.firstChild) {
      this.contextMenu.removeChild(this.contextMenu.firstChild);
    }

    items.forEach((item) => {
      this.contextMenu?.appendChild(this.renderContextMenuItem(item));
    });

    this.contextMenu.openPopupAtScreen(screenX, screenY, true);
  }

  private renderContextMenuItem(item: TabCommandItem): XULElement {
    const menuItem = ztoolkit.UI.createElement(this.document, "menuitem", {
      attributes: {
        label: item.label,
      },
      listeners: [
        {
          type: "command",
          listener: async () => {
            this.hideContextMenu();
            if (item.disabled) {
              return;
            }
            await item.handler();
          },
        },
      ],
    }) as XULElement;

    if (item.disabled) {
      menuItem.setAttribute("disabled", "true");
    }

    return menuItem;
  }

  private hideContextMenu(): void {
    if (!this.contextMenu) {
      return;
    }

    this.contextMenu.hidePopup();
    while (this.contextMenu.firstChild) {
      this.contextMenu.removeChild(this.contextMenu.firstChild);
    }
  }

  private getBadgeText(tab: TrackedTab): string {
    switch (tab.iconKey) {
      case "reader":
        return "P";
      case "note":
        return "N";
      case "web":
        return "W";
      default:
        return tab.iconKey.slice(0, 1).toUpperCase() || "?";
    }
  }

  private getMetaText(tab: TrackedTab): string {
    const parts = [tab.type];
    if (tab.parentItemID != null && tab.parentItemID !== tab.itemID) {
      parts.push(`item ${tab.parentItemID}`);
    } else if (tab.itemID != null) {
      parts.push(`item ${tab.itemID}`);
    }
    return parts.join(" · ");
  }
}
