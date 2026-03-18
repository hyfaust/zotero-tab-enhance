import { config } from "../../../package.json";
import TabTrackerService from "./tabTracker";
import { LIBRARY_TAB_ID, TabTrackerSnapshot, TrackedTab } from "./types";

const DEFAULT_EXPANDED_WIDTH = 260;
const COLLAPSED_WIDTH = 44;

export default class VerticalTabSidebar {
  private readonly window: _ZoteroTypes.MainWindow;
  private readonly document: Document;
  private readonly tracker: TabTrackerService;
  private initialized = false;
  private collapsed = false;
  private expandedWidth = DEFAULT_EXPANDED_WIDTH;
  private sidebar?: XULElement;
  private splitter?: XULElement;
  private toggleButton?: XULElement;
  private headerTitle?: HTMLElement;
  private countBadge?: HTMLElement;
  private listContainer?: HTMLElement;
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
    this.stylesheet?.remove();
    this.sidebar = undefined;
    this.splitter = undefined;
    this.toggleButton = undefined;
    this.headerTitle = undefined;
    this.countBadge = undefined;
    this.listContainer = undefined;
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

    const listContainer = ztoolkit.UI.createElement(this.document, "div", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tabs-list"],
      attributes: {
        role: "listbox",
      },
    }) as HTMLDivElement;

    header.appendChild(toggleButton);
    header.appendChild(headerText);
    header.appendChild(countBadge);
    sidebar.appendChild(header);
    sidebar.appendChild(listContainer);

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
    this.listContainer = listContainer;
    this.applySidebarWidth();
    return true;
  }

  private ensureStylesheet(): HTMLElement {
    const stylesheetId = `${config.addonRef}-vertical-tabs-style`;
    const existing = this.document.getElementById(
      stylesheetId,
    ) as HTMLElement | null;
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
    } else {
      this.sidebar.classList.remove("is-collapsed");
      this.sidebar.style.width = `${this.expandedWidth}px`;
      this.splitter.removeAttribute("hidden");
    }
  }

  private render(snapshot: TabTrackerSnapshot): void {
    if (!this.listContainer || !this.countBadge || !this.headerTitle) {
      return;
    }

    const visibleTabs = snapshot.tabs.filter((tab) =>
      this.shouldRenderTab(tab),
    );
    const listContainer = this.listContainer;
    this.trackedTabsByKey.clear();
    this.headerTitle.textContent = this.collapsed ? "" : "Tabs";
    this.countBadge.textContent = String(visibleTabs.length);
    listContainer.textContent = "";

    if (visibleTabs.length === 0) {
      const emptyState = ztoolkit.UI.createElement(this.document, "div", {
        namespace: "html",
        classList: ["tab-enhance-vertical-tabs-empty"],
        properties: {
          textContent: this.collapsed ? "0" : "No tabs open",
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
    return row;
  }

  private readonly handleRowClick = (event: MouseEvent) => {
    const row = event.currentTarget as HTMLDivElement | null;
    ztoolkit.log("VerticalTabSidebar row click", {
      targetType: event.target?.constructor?.name ?? "unknown",
      currentTargetType: event.currentTarget?.constructor?.name ?? "unknown",
      tabKey: row?.dataset.tabKey ?? null,
    });
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
    ztoolkit.log("VerticalTabSidebar row keydown", {
      key: event.key,
      currentTargetType: event.currentTarget?.constructor?.name ?? "unknown",
      tabKey: row?.dataset.tabKey ?? null,
    });
    if (!row) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.selectTrackedTabByKey(row.dataset.tabKey ?? null);
  };

  private selectTrackedTabByKey(tabKey: string | null): void {
    ztoolkit.log("VerticalTabSidebar selectTrackedTabByKey", {
      tabKey,
      knownKeys: Array.from(this.trackedTabsByKey.keys()),
    });
    if (!tabKey) {
      return;
    }

    const tracked = this.trackedTabsByKey.get(tabKey);
    if (!tracked) {
      ztoolkit.log("VerticalTabSidebar missing tracked tab for key", tabKey);
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

    ztoolkit.log("VerticalTabSidebar click", {
      tabId,
      title: tab.title,
      nativeIndex: tab.nativeIndex,
    });

    try {
      const { tabIndex } = this.window.Zotero_Tabs._getTab(tabId);
      this.window.Zotero_Tabs.jump(tabIndex);
      return;
    } catch (error) {
      ztoolkit.log(
        "VerticalTabSidebar jump(from _getTab) failed",
        tabId,
        error,
      );
    }

    try {
      this.window.Zotero_Tabs.select(tabId);
      return;
    } catch (error) {
      ztoolkit.log("VerticalTabSidebar select(tabId) failed", tabId, error);
    }

    try {
      this.window.Zotero_Tabs.jump(tab.nativeIndex);
      return;
    } catch (error) {
      ztoolkit.log(
        "VerticalTabSidebar jump(nativeIndex) failed",
        tab.nativeIndex,
        error,
      );
    }

    this.tracker.reconcile("failed-select");
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
