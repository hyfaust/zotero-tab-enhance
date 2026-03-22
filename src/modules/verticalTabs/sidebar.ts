import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import { getJSONPref, setJSONPref } from "../../utils/prefs";
import TabTrackerService from "./tabTracker";
import TabCommandController, { TabCommandItem } from "./tabCommands";
import TabGroupStore from "./groupStore";
import {
  GROUP_COLOR_PALETTE,
  LIBRARY_TAB_ID,
  SidebarState,
  TabTrackerSnapshot,
  TrackedTab,
  VirtualGroup,
  VirtualGroupMember,
} from "./types";

const DEFAULT_EXPANDED_WIDTH = 260;
const COLLAPSED_WIDTH = 44;
const DROP_POSITION_HYSTERESIS = 8;
const SIDEBAR_STATE_PREF_KEY = "verticalTabs.sidebarState";
const GROUPS_STATE_PREF_KEY = "verticalTabs.groups";

type DropPosition = "before" | "after";
type SidebarViewMode = "default" | "recent" | "type";

type ContextMenuTarget =
  | { kind: "tab"; tabKey: string }
  | { kind: "group-header"; groupId: string }
  | { kind: "group-member"; groupId: string; memberKey: string };

type RenderableGroup = {
  group: VirtualGroup;
  members: VirtualGroupMember[];
};

type AggregateSection = {
  id: string;
  title: string;
  tabs: TrackedTab[];
};

export default class VerticalTabSidebar {
  private readonly window: _ZoteroTypes.MainWindow;
  private readonly document: Document;
  private readonly tracker: TabTrackerService;
  private readonly commandController: TabCommandController;
  private readonly groupStore: TabGroupStore;
  private initialized = false;
  private collapsed = false;
  private expandedWidth = DEFAULT_EXPANDED_WIDTH;
  private searchQuery = "";
  private viewMode: SidebarViewMode = "default";
  private sidebar?: XULElement;
  private splitter?: XULElement;
  private toggleButton?: XULElement;
  private createGroupButton?: HTMLButtonElement;
  private viewSwitcher?: HTMLElement;
  private headerTitle?: HTMLElement;
  private countBadge?: HTMLElement;
  private listContainer?: HTMLElement;
  private searchInput?: HTMLInputElement;
  private contextMenu?: XULPopupElement;
  private stylesheet?: HTMLElement;
  private unsubscribeTracker?: () => void;
  private unsubscribeGroupStore?: () => void;
  private trackedTabsByKey = new Map<string, TrackedTab>();
  private trackedTabsByMemberKey = new Map<string, TrackedTab>();
  private draggedTabKey: string | null = null;
  private dragOverTabKey: string | null = null;
  private dragOverPosition: DropPosition | null = null;

  private readonly handleResizeEnd = () => {
    if (!this.sidebar || this.collapsed) {
      return;
    }
    const width = Math.round(this.sidebar.getBoundingClientRect().width);
    if (width >= 160) {
      this.expandedWidth = width;
      this.applySidebarWidth();
      this.persistSidebarState();
    }
  };

  private readonly handleListDragOver = (event: DragEvent) => {
    if (!this.draggedTabKey || !this.listContainer) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    const row = this.getSortableRowFromEventTarget(event.target);
    if (row) {
      return;
    }

    const target = this.resolveDropTargetFromPoint(event.clientY);
    if (!target) {
      this.clearDropIndicator();
      return;
    }

    this.setDropIndicator(target.tabKey, target.position);
  };

  private readonly handleListDrop = (event: DragEvent) => {
    if (!this.draggedTabKey || !this.listContainer) {
      return;
    }

    event.preventDefault();
    const row = this.getSortableRowFromEventTarget(event.target);
    if (row) {
      this.commitDrop(
        row.dataset.tabKey ?? null,
        this.getDropPosition(row, event),
      );
      return;
    }

    const target = this.resolveDropTargetFromPoint(event.clientY);
    if (!target) {
      this.clearDragState();
      return;
    }

    this.commitDrop(target.tabKey, target.position);
  };

  private readonly handleWindowDragEnd = () => {
    this.clearDragState();
  };

  constructor(window: _ZoteroTypes.MainWindow, tracker: TabTrackerService) {
    this.window = window;
    this.document = window.document;
    this.tracker = tracker;
    this.commandController = new TabCommandController(window);
    this.groupStore = new TabGroupStore(window);
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

    this.restorePersistedState();
    this.initialized = true;
    this.unsubscribeGroupStore = this.groupStore.subscribe(() => {
      if (this.initialized) {
        this.persistGroupsState();
        this.render(this.tracker.getSnapshot());
      }
    });
    this.unsubscribeTracker = this.tracker.subscribe((snapshot) => {
      this.groupStore.syncTrackedTabs(
        snapshot.tabs.map((tab) => this.normalizeTab(tab)),
      );
      this.render(snapshot);
    });
    this.window.addEventListener("mouseup", this.handleResizeEnd);
    this.window.addEventListener("dragend", this.handleWindowDragEnd, true);
    ztoolkit.log("VerticalTabSidebar initialized");
  }

  public destroy(): void {
    if (!this.initialized) {
      return;
    }

    this.persistSidebarState();
    this.persistGroupsState();

    this.unsubscribeTracker?.();
    this.unsubscribeTracker = undefined;
    this.unsubscribeGroupStore?.();
    this.unsubscribeGroupStore = undefined;
    this.window.removeEventListener("mouseup", this.handleResizeEnd);
    this.window.removeEventListener("dragend", this.handleWindowDragEnd, true);

    this.sidebar?.remove();
    this.splitter?.remove();
    this.contextMenu?.remove();
    this.stylesheet?.remove();
    this.sidebar = undefined;
    this.splitter = undefined;
    this.toggleButton = undefined;
    this.createGroupButton = undefined;
    this.viewSwitcher = undefined;
    this.headerTitle = undefined;
    this.countBadge = undefined;
    this.listContainer = undefined;
    this.searchInput = undefined;
    this.contextMenu = undefined;
    this.stylesheet = undefined;
    this.trackedTabsByKey.clear();
    this.trackedTabsByMemberKey.clear();
    this.groupStore.destroy();
    this.clearDragState();
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

    const createGroupButton = ztoolkit.UI.createElement(
      this.document,
      "button",
      {
        namespace: "html",
        classList: ["tab-enhance-vertical-tabs-create-group"],
        properties: {
          textContent: "+",
          title: getString("create-group-from-selection"),
        },
        listeners: [
          {
            type: "click",
            listener: (event: Event) => {
              event.preventDefault();
              event.stopPropagation();
              this.createGroupFromSelectedTab();
            },
          },
        ],
      },
    ) as HTMLButtonElement;

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
            this.persistSidebarState();
            this.render(this.tracker.getSnapshot());
          },
        },
      ],
    }) as HTMLInputElement;

    const viewSwitcher = ztoolkit.UI.createElement(this.document, "div", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tabs-view-switcher"],
    }) as HTMLDivElement;

    (
      [
        ["default", getString("view-default")],
        ["recent", getString("view-recent")],
        ["type", getString("view-type")],
      ] as const
    ).forEach(([mode, label]) => {
      const button = ztoolkit.UI.createElement(this.document, "button", {
        namespace: "html",
        classList: ["tab-enhance-vertical-tabs-view-button"],
        properties: {
          textContent: label,
          title: label,
        },
        attributes: {
          type: "button",
          "data-view-mode": mode,
        },
        listeners: [
          {
            type: "click",
            listener: (event: Event) => {
              event.preventDefault();
              event.stopPropagation();
              this.setViewMode(mode);
            },
          },
        ],
      }) as HTMLButtonElement;
      viewSwitcher.appendChild(button);
    });

    const listContainer = ztoolkit.UI.createElement(this.document, "div", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tabs-list"],
      attributes: {
        role: "listbox",
      },
      listeners: [
        {
          type: "dragover",
          listener: this.handleListDragOver,
        },
        {
          type: "drop",
          listener: this.handleListDrop,
        },
      ],
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
    header.appendChild(createGroupButton);
    sidebar.appendChild(header);
    sidebar.appendChild(searchInput);
    sidebar.appendChild(viewSwitcher);
    sidebar.appendChild(listContainer);

    const popupHost =
      this.document.getElementById("mainPopupSet") ??
      this.document.documentElement;
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
    this.createGroupButton = createGroupButton;
    this.viewSwitcher = viewSwitcher;
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
    this.hideContextMenu();
    this.applySidebarWidth();
    this.persistSidebarState();
    this.render(this.tracker.getSnapshot());
  }

  private setViewMode(mode: SidebarViewMode): void {
    if (this.viewMode === mode) {
      this.updateViewSwitcher();
      return;
    }

    this.viewMode = mode;
    this.hideContextMenu();
    this.clearDragState();
    this.persistSidebarState();
    this.render(this.tracker.getSnapshot());
  }

  private updateViewSwitcher(): void {
    if (!this.viewSwitcher) {
      return;
    }

    const buttons = this.viewSwitcher.querySelectorAll(
      ".tab-enhance-vertical-tabs-view-button",
    );
    buttons.forEach((node: Element) => {
      const button = node as HTMLButtonElement;
      const mode = button.dataset.viewMode as SidebarViewMode | undefined;
      const isActive = mode === this.viewMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
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

  private restorePersistedState(): void {
    const sidebarState = getJSONPref<Partial<SidebarState>>(
      SIDEBAR_STATE_PREF_KEY,
      {},
    );

    if (typeof sidebarState.collapsed === "boolean") {
      this.collapsed = sidebarState.collapsed;
    }

    if (
      typeof sidebarState.width === "number" &&
      Number.isFinite(sidebarState.width) &&
      sidebarState.width >= 160
    ) {
      this.expandedWidth = Math.round(sidebarState.width);
    }

    if (typeof sidebarState.searchQuery === "string") {
      this.searchQuery = sidebarState.searchQuery;
      if (this.searchInput) {
        this.searchInput.value = sidebarState.searchQuery;
      }
    }

    if (this.isSidebarViewMode(sidebarState.viewMode)) {
      this.viewMode = sidebarState.viewMode;
    }

    const restoredGroups = this.sanitizeGroups(
      getJSONPref<VirtualGroup[]>(GROUPS_STATE_PREF_KEY, []),
    );
    if (restoredGroups.length > 0) {
      this.groupStore.setGroups(restoredGroups);
    }

    this.applySidebarWidth();
    this.updateViewSwitcher();
  }

  private persistSidebarState(): void {
    const state: SidebarState = {
      collapsed: this.collapsed,
      width: this.expandedWidth,
      searchQuery: this.searchQuery,
      selectedKeys: [],
      viewMode: this.viewMode,
    };
    setJSONPref(SIDEBAR_STATE_PREF_KEY, state);
  }

  private persistGroupsState(): void {
    setJSONPref(GROUPS_STATE_PREF_KEY, this.groupStore.getGroups());
  }

  private sanitizeGroups(groups: VirtualGroup[]): VirtualGroup[] {
    if (!Array.isArray(groups)) {
      return [];
    }

    const seenGroupIds = new Set<string>();
    return groups.flatMap((group, groupIndex) => {
      if (!group || typeof group !== "object") {
        return [];
      }

      const groupId =
        typeof group.id === "string" && group.id.trim()
          ? group.id
          : `restored-group-${groupIndex}`;
      if (seenGroupIds.has(groupId)) {
        return [];
      }
      seenGroupIds.add(groupId);

      const members = Array.isArray(group.members) ? group.members : [];
      const normalizedMembers = members.flatMap((member, memberIndex) => {
        if (!member || typeof member !== "object") {
          return [];
        }

        const itemID =
          typeof member.itemID === "number" ? member.itemID : null;
        const parentItemID =
          typeof member.parentItemID === "number" ? member.parentItemID : null;
        const hasResolvableItem =
          (itemID != null && Boolean(Zotero.Items.get(itemID))) ||
          (parentItemID != null && Boolean(Zotero.Items.get(parentItemID)));

        if ((itemID != null || parentItemID != null) && !hasResolvableItem) {
          return [];
        }

        const memberKey =
          typeof member.key === "string" && member.key.trim()
            ? member.key
            : null;
        if (!memberKey) {
          return [];
        }

        return [
          {
            id:
              typeof member.id === "string" && member.id.trim()
                ? member.id
                : `restored-member-${groupIndex}-${memberIndex}`,
            key: memberKey,
            sourceTabKey:
              typeof member.sourceTabKey === "string" && member.sourceTabKey.trim()
                ? member.sourceTabKey
                : null,
            tabId:
              typeof member.tabId === "string" && member.tabId.trim()
                ? member.tabId
                : null,
            type:
              typeof member.type === "string" && member.type.trim()
                ? member.type
                : "reader",
            title:
              typeof member.title === "string" && member.title.trim()
                ? member.title
                : memberKey,
            itemID,
            parentItemID,
            isOpen: Boolean(member.isOpen),
            openedAt:
              typeof member.openedAt === "number" && Number.isFinite(member.openedAt)
                ? member.openedAt
                : null,
            iconKey:
              typeof member.iconKey === "string" && member.iconKey.trim()
                ? member.iconKey
                : "reader",
          },
        ];
      });

      if (!normalizedMembers.length) {
        return [];
      }

      return [
        {
          id: groupId,
          name:
            typeof group.name === "string" && group.name.trim()
              ? group.name.trim()
              : getString("new-group"),
          color:
            typeof group.color === "string" && group.color.trim()
              ? group.color
              : GROUP_COLOR_PALETTE[groupIndex % GROUP_COLOR_PALETTE.length],
          collapsed: Boolean(group.collapsed),
          sortMode:
            group.sortMode === "recent" ||
            group.sortMode === "type" ||
            group.sortMode === "manual"
              ? group.sortMode
              : "manual",
          members: normalizedMembers,
        },
      ];
    });
  }

  private isSidebarViewMode(value: unknown): value is SidebarViewMode {
    return value === "default" || value === "recent" || value === "type";
  }

  private render(snapshot: TabTrackerSnapshot): void {
    if (!this.listContainer || !this.countBadge || !this.headerTitle) {
      return;
    }

    const openTabs = snapshot.tabs
      .map((tab) => this.normalizeTab(tab))
      .filter((tab) => this.shouldRenderTab(tab));
    const renderableGroups = this.getRenderableGroups(openTabs);
    const visibleUngroupedTabs = this.groupStore
      .getUngroupedTabs(openTabs)
      .filter((tab) => this.matchesSearch(tab));
    const aggregateSections = this.getAggregateSections(openTabs);
    const listContainer = this.listContainer;

    this.trackedTabsByKey.clear();
    this.trackedTabsByMemberKey.clear();
    openTabs.forEach((tab) => {
      this.trackedTabsByKey.set(tab.key, tab);
      this.trackedTabsByMemberKey.set(
        this.groupStore.makeMemberKeyFromTab(tab),
        tab,
      );
    });

    this.hideContextMenu();
    this.updateViewSwitcher();
    this.headerTitle.textContent = this.getViewTitle();
    this.countBadge.textContent = String(openTabs.length);
    listContainer.textContent = "";

    if (
      this.draggedTabKey &&
      (this.viewMode !== "default" ||
        !visibleUngroupedTabs.some((tab) => tab.key === this.draggedTabKey))
    ) {
      this.clearDragState();
    }

    const hasDefaultContent =
      renderableGroups.length > 0 || visibleUngroupedTabs.length > 0;
    const hasAggregateContent = aggregateSections.some(
      (section) => section.tabs.length > 0,
    );

    if (
      (this.viewMode === "default" && !hasDefaultContent) ||
      (this.viewMode !== "default" && !hasAggregateContent)
    ) {
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

    if (this.viewMode === "default") {
      renderableGroups.forEach((renderableGroup) => {
        listContainer.appendChild(
          this.renderGroupSection(renderableGroup, snapshot.selectedTabKey),
        );
      });

      visibleUngroupedTabs.forEach((tab) => {
        if (
          tab.key === this.dragOverTabKey &&
          this.dragOverPosition === "before"
        ) {
          listContainer.appendChild(this.renderDropPlaceholder());
        }

        listContainer.appendChild(
          this.renderTabRow(tab, snapshot.selectedTabKey, {
            sortable: true,
            grouped: false,
          }),
        );

        if (
          tab.key === this.dragOverTabKey &&
          this.dragOverPosition === "after"
        ) {
          listContainer.appendChild(this.renderDropPlaceholder());
        }
      });
      return;
    }

    aggregateSections.forEach((section) => {
      if (!section.tabs.length) {
        return;
      }
      listContainer.appendChild(
        this.renderAggregateSection(section, snapshot.selectedTabKey),
      );
    });
  }

  private getViewTitle(): string {
    switch (this.viewMode) {
      case "recent":
        return getString("view-recent");
      case "type":
        return getString("view-type");
      default:
        return getString("view-default");
    }
  }

  private getAggregateSections(openTabs: TrackedTab[]): AggregateSection[] {
    const filteredTabs = openTabs.filter((tab) => this.matchesSearch(tab));
    if (this.viewMode === "recent") {
      return this.buildRecentSections(filteredTabs);
    }
    if (this.viewMode === "type") {
      return this.buildTypeSections(filteredTabs);
    }
    return [];
  }

  private buildRecentSections(tabs: TrackedTab[]): AggregateSection[] {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const sections: AggregateSection[] = [
      { id: "recent-now", title: getString("recent-just-now"), tabs: [] },
      { id: "recent-today", title: getString("recent-today"), tabs: [] },
      { id: "recent-earlier", title: getString("recent-earlier"), tabs: [] },
    ];

    tabs
      .slice()
      .sort((left, right) => (right.openedAt ?? 0) - (left.openedAt ?? 0))
      .forEach((tab) => {
        const openedAt = tab.openedAt ?? 0;
        if (openedAt && now - openedAt <= 10 * 60 * 1000) {
          sections[0].tabs.push(tab);
          return;
        }
        if (openedAt && openedAt >= startOfToday.getTime()) {
          sections[1].tabs.push(tab);
          return;
        }
        sections[2].tabs.push(tab);
      });

    return sections;
  }

  private buildTypeSections(tabs: TrackedTab[]): AggregateSection[] {
    const sectionMap = new Map<string, AggregateSection>();
    tabs.forEach((tab) => {
      const sectionId = tab.type || "unknown";
      if (!sectionMap.has(sectionId)) {
        sectionMap.set(sectionId, {
          id: `type-${sectionId}`,
          title: this.getTypeSectionTitle(sectionId),
          tabs: [],
        });
      }
      sectionMap.get(sectionId)?.tabs.push(tab);
    });

    return Array.from(sectionMap.values()).sort((left, right) =>
      left.title.localeCompare(right.title),
    );
  }

  private getTypeSectionTitle(type: string): string {
    switch (type) {
      case "reader":
      case "reader-unloaded":
        return getString("type-reader");
      case "note":
        return getString("type-note");
      case "web":
        return getString("type-web");
      default:
        return getString("type-other", { args: { type } });
    }
  }

  private renderAggregateSection(
    section: AggregateSection,
    selectedTabKey: string | null,
  ): HTMLElement {
    const container = ztoolkit.UI.createElement(this.document, "div", {
      namespace: "html",
      classList: ["tab-enhance-vertical-aggregate-section"],
    }) as HTMLDivElement;

    const header = ztoolkit.UI.createElement(this.document, "div", {
      namespace: "html",
      classList: ["tab-enhance-vertical-aggregate-header"],
    }) as HTMLDivElement;

    const title = ztoolkit.UI.createElement(this.document, "span", {
      namespace: "html",
      classList: ["tab-enhance-vertical-aggregate-title"],
      properties: {
        textContent: section.title,
      },
    }) as HTMLSpanElement;

    const count = ztoolkit.UI.createElement(this.document, "span", {
      namespace: "html",
      classList: ["tab-enhance-vertical-aggregate-count"],
      properties: {
        textContent: String(section.tabs.length),
      },
    }) as HTMLSpanElement;

    header.appendChild(title);
    header.appendChild(count);
    container.appendChild(header);

    section.tabs.forEach((tab) => {
      container.appendChild(
        this.renderTabRow(tab, selectedTabKey, {
          sortable: false,
          grouped: false,
        }),
      );
    });

    return container;
  }

  private renderGroupSection(
    renderable: RenderableGroup,
    selectedTabKey: string | null,
  ): HTMLElement {
    const container = ztoolkit.UI.createElement(this.document, "div", {
      namespace: "html",
      classList: ["tab-enhance-vertical-group"],
    }) as HTMLDivElement;
    container.style.setProperty("--group-color", renderable.group.color);
    container.classList.toggle("is-expanded", !renderable.group.collapsed);

    const header = ztoolkit.UI.createElement(this.document, "div", {
      namespace: "html",
      classList: ["tab-enhance-vertical-group-header"],
      properties: {
        title: renderable.group.name,
      },
      attributes: {
        role: "button",
        tabindex: "0",
      },
      listeners: [
        {
          type: "click",
          listener: (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            this.groupStore.toggleCollapsed(renderable.group.id);
          },
        },
        {
          type: "keydown",
          listener: (event: Event) => {
            const keyboardEvent = event as KeyboardEvent;
            if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") {
              return;
            }
            keyboardEvent.preventDefault();
            keyboardEvent.stopPropagation();
            this.groupStore.toggleCollapsed(renderable.group.id);
          },
        },
        {
          type: "contextmenu",
          listener: (event: Event) => {
            const mouseEvent = event as MouseEvent;
            mouseEvent.preventDefault();
            mouseEvent.stopPropagation();
            this.showContextMenu(
              { kind: "group-header", groupId: renderable.group.id },
              mouseEvent.screenX,
              mouseEvent.screenY,
            );
          },
        },
      ],
    }) as HTMLDivElement;

    const chevron = ztoolkit.UI.createElement(this.document, "span", {
      namespace: "html",
      classList: ["tab-enhance-vertical-group-chevron"],
      properties: {
        textContent: renderable.group.collapsed ? "▸" : "▾",
      },
    }) as HTMLSpanElement;

    const colorChip = ztoolkit.UI.createElement(this.document, "span", {
      namespace: "html",
      classList: ["tab-enhance-vertical-group-color"],
    }) as HTMLSpanElement;

    const title = ztoolkit.UI.createElement(this.document, "span", {
      namespace: "html",
      classList: ["tab-enhance-vertical-group-title"],
      properties: {
        textContent: renderable.group.name,
      },
    }) as HTMLSpanElement;

    const count = ztoolkit.UI.createElement(this.document, "span", {
      namespace: "html",
      classList: ["tab-enhance-vertical-group-count"],
      properties: {
        textContent: String(renderable.group.members.length),
      },
    }) as HTMLSpanElement;

    header.appendChild(chevron);
    header.appendChild(colorChip);
    header.appendChild(title);
    header.appendChild(count);
    container.appendChild(header);

    if (!renderable.group.collapsed) {
      const members = ztoolkit.UI.createElement(this.document, "div", {
        namespace: "html",
        classList: ["tab-enhance-vertical-group-members"],
      }) as HTMLDivElement;

      renderable.members.forEach((member) => {
        members.appendChild(
          this.renderGroupMemberRow(
            member,
            renderable.group.id,
            selectedTabKey,
          ),
        );
      });

      container.appendChild(members);
    }

    return container;
  }

  private getRenderableGroups(openTabs: TrackedTab[]): RenderableGroup[] {
    const groups = this.groupStore.getGroups();
    const openTabMap = new Map(
      openTabs.map(
        (tab) => [this.groupStore.makeMemberKeyFromTab(tab), tab] as const,
      ),
    );

    return groups
      .map((group) => {
        const groupNameMatches = this.matchesGroupName(group.name);
        const members = group.members.filter((member) => {
          if (groupNameMatches || !this.searchQuery) {
            return true;
          }

          const liveTab = openTabMap.get(member.key);
          return this.matchesGroupMember(liveTab ?? member);
        });

        if (!groupNameMatches && members.length === 0) {
          return null;
        }

        return {
          group,
          members: members.map((member) => {
            const liveTab = openTabMap.get(member.key);
            return liveTab
              ? {
                  ...member,
                  sourceTabKey: liveTab.key,
                  tabId: liveTab.tabId,
                  title: liveTab.title,
                  type: liveTab.type,
                  itemID: liveTab.itemID,
                  parentItemID: liveTab.parentItemID,
                  isOpen: true,
                  openedAt: liveTab.openedAt,
                  iconKey: liveTab.iconKey,
                }
              : member;
          }),
        };
      })
      .filter((group): group is RenderableGroup => Boolean(group));
  }

  private getVisibleSortableTabs(snapshot: TabTrackerSnapshot): TrackedTab[] {
    return this.groupStore
      .getUngroupedTabs(
        snapshot.tabs
          .map((tab) => this.normalizeTab(tab))
          .filter((tab) => this.shouldRenderTab(tab)),
      )
      .filter((tab) => this.matchesSearch(tab));
  }

  private renderDropPlaceholder(): HTMLElement {
    return ztoolkit.UI.createElement(this.document, "div", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tab-placeholder"],
      attributes: {
        "aria-hidden": "true",
      },
    }) as HTMLDivElement;
  }

  private isNoOpDropTarget(
    targetTabKey: string | null,
    position: DropPosition | null,
  ): boolean {
    if (!this.draggedTabKey || !targetTabKey || !position) {
      return false;
    }

    const visibleKeys = this.getVisibleSortableTabs(
      this.tracker.getSnapshot(),
    ).map((tab) => tab.key);
    const sourceIndex = visibleKeys.indexOf(this.draggedTabKey);
    const targetIndex = visibleKeys.indexOf(targetTabKey);
    if (sourceIndex < 0 || targetIndex < 0) {
      return false;
    }

    return (
      (position === "after" && targetIndex === sourceIndex - 1) ||
      (position === "before" && targetIndex === sourceIndex + 1)
    );
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

    const haystack =
      `${tab.title} ${this.getMetaText(tab)}`.toLocaleLowerCase();
    return haystack.includes(this.searchQuery);
  }

  private matchesGroupName(name: string): boolean {
    if (!this.searchQuery) {
      return true;
    }

    return name.toLocaleLowerCase().includes(this.searchQuery);
  }

  private matchesGroupMember(
    member: Pick<
      VirtualGroupMember,
      "title" | "type" | "itemID" | "parentItemID" | "isOpen"
    >,
  ): boolean {
    if (!this.searchQuery) {
      return true;
    }

    const haystack =
      `${member.title} ${this.getVirtualMemberMetaText(member)}`.toLocaleLowerCase();
    return haystack.includes(this.searchQuery);
  }

  private renderTabRow(
    tab: TrackedTab,
    selectedTabKey: string | null,
    options: {
      sortable: boolean;
      grouped: boolean;
      groupId?: string;
      memberKey?: string;
    },
  ): HTMLElement {
    const isSelected = selectedTabKey
      ? tab.key === selectedTabKey
      : Boolean(tab.isSelected);

    const row = ztoolkit.UI.createElement(this.document, "div", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tab-row"],
      properties: {
        title: tab.title,
        draggable: options.sortable,
      },
      attributes: {
        role: "button",
        tabindex: isSelected ? "0" : "-1",
      },
    }) as HTMLDivElement;

    row.dataset.tabKey = tab.key;
    row.dataset.nativeIndex = String(tab.nativeIndex);
    row.dataset.sortable = options.sortable ? "true" : "false";
    row.dataset.grouped = options.grouped ? "true" : "false";
    if (options.groupId) {
      row.dataset.groupId = options.groupId;
      row.classList.add("is-group-member");
    }
    if (options.memberKey) {
      row.dataset.memberKey = options.memberKey;
    }

    row.addEventListener("click", this.handleRowClick);
    row.addEventListener("keydown", this.handleRowKeyDown);
    row.addEventListener("contextmenu", this.handleRowContextMenu);
    if (options.sortable) {
      row.addEventListener("dragstart", this.handleRowDragStart);
      row.addEventListener("dragover", this.handleRowDragOver);
      row.addEventListener("drop", this.handleRowDrop);
      row.addEventListener("dragend", this.handleRowDragEnd);
    }

    if (isSelected) {
      row.classList.add("is-selected");
      row.setAttribute("aria-selected", "true");
    } else {
      row.setAttribute("aria-selected", "false");
    }

    if (tab.key === this.draggedTabKey) {
      row.classList.add("is-dragging");
    }

    row.appendChild(this.renderBadge(tab.iconKey));
    row.appendChild(this.renderRowContent(tab.title, this.getMetaText(tab)));

    if (!this.collapsed && tab.tabId) {
      row.appendChild(
        this.renderCloseButton(() => {
          this.commandController.close(tab.tabId);
        }),
      );
    }

    return row;
  }

  private renderGroupMemberRow(
    member: VirtualGroupMember,
    groupId: string,
    selectedTabKey: string | null,
  ): HTMLElement {
    const liveTab = this.trackedTabsByMemberKey.get(member.key) ?? null;
    if (liveTab) {
      return this.renderTabRow(liveTab, selectedTabKey, {
        sortable: false,
        grouped: true,
        groupId,
        memberKey: member.key,
      });
    }

    const row = ztoolkit.UI.createElement(this.document, "div", {
      namespace: "html",
      classList: [
        "tab-enhance-vertical-tab-row",
        "is-group-member",
        "is-virtual-member",
      ],
      properties: {
        title: member.title,
      },
      attributes: {
        role: "button",
        tabindex: "-1",
        "aria-selected": "false",
      },
    }) as HTMLDivElement;

    row.dataset.groupId = groupId;
    row.dataset.memberKey = member.key;
    row.dataset.sortable = "false";
    row.addEventListener("click", this.handleVirtualMemberClick);
    row.addEventListener("keydown", this.handleVirtualMemberKeyDown);
    row.addEventListener("contextmenu", this.handleVirtualMemberContextMenu);

    row.appendChild(this.renderBadge(member.iconKey));
    row.appendChild(
      this.renderRowContent(
        member.title,
        this.getVirtualMemberMetaText(member),
      ),
    );

    return row;
  }

  private renderBadge(iconKey: string): HTMLElement {
    return ztoolkit.UI.createElement(this.document, "span", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tab-badge", `is-${iconKey}`],
      properties: {
        textContent: this.getBadgeText(iconKey),
      },
    }) as HTMLSpanElement;
  }

  private renderRowContent(titleText: string, metaText: string): HTMLElement {
    const content = ztoolkit.UI.createElement(this.document, "span", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tab-content"],
    }) as HTMLSpanElement;

    const title = ztoolkit.UI.createElement(this.document, "span", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tab-title"],
      properties: {
        textContent: titleText,
      },
    }) as HTMLSpanElement;

    const meta = ztoolkit.UI.createElement(this.document, "span", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tab-meta"],
      properties: {
        textContent: metaText,
      },
    }) as HTMLSpanElement;

    content.appendChild(title);
    content.appendChild(meta);
    return content;
  }

  private renderCloseButton(handler: () => void): HTMLButtonElement {
    return ztoolkit.UI.createElement(this.document, "button", {
      namespace: "html",
      classList: ["tab-enhance-vertical-tab-close"],
      properties: {
        textContent: "x",
        title: getString("close-tab"),
        draggable: false,
      },
      listeners: [
        {
          type: "click",
          listener: (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            handler();
          },
        },
      ],
    }) as HTMLButtonElement;
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

    const groupId = row.dataset.groupId ?? null;
    const memberKey = row.dataset.memberKey ?? null;
    const target: ContextMenuTarget =
      groupId && memberKey
        ? { kind: "group-member", groupId, memberKey }
        : { kind: "tab", tabKey: row.dataset.tabKey ?? "" };
    this.showContextMenu(target, event.screenX, event.screenY);
  };

  private readonly handleVirtualMemberContextMenu = (event: MouseEvent) => {
    const row = event.currentTarget as HTMLDivElement | null;
    const groupId = row?.dataset.groupId ?? null;
    const memberKey = row?.dataset.memberKey ?? null;
    if (!row || !groupId || !memberKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.showContextMenu(
      { kind: "group-member", groupId, memberKey },
      event.screenX,
      event.screenY,
    );
  };

  private readonly handleVirtualMemberClick = (event: MouseEvent) => {
    const row = event.currentTarget as HTMLDivElement | null;
    const groupId = row?.dataset.groupId ?? null;
    const memberKey = row?.dataset.memberKey ?? null;
    if (!row || !groupId || !memberKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void this.activateGroupMember(groupId, memberKey);
  };

  private readonly handleVirtualMemberKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const row = event.currentTarget as HTMLDivElement | null;
    const groupId = row?.dataset.groupId ?? null;
    const memberKey = row?.dataset.memberKey ?? null;
    if (!row || !groupId || !memberKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void this.activateGroupMember(groupId, memberKey);
  };

  private readonly handleRowDragStart = (event: DragEvent) => {
    const row = event.currentTarget as HTMLDivElement | null;
    const tabKey = row?.dataset.tabKey ?? null;
    const tracked = tabKey ? this.trackedTabsByKey.get(tabKey) : null;
    if (!row || !tracked?.tabId) {
      event.preventDefault();
      return;
    }

    this.hideContextMenu();
    this.draggedTabKey = tabKey;
    this.dragOverTabKey = null;
    this.dragOverPosition = null;
    row.classList.add("is-dragging");

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.dropEffect = "move";
      event.dataTransfer.setData("text/plain", tracked.key);
    }
  };

  private readonly handleRowDragOver = (event: DragEvent) => {
    if (!this.draggedTabKey) {
      return;
    }

    const row = event.currentTarget as HTMLDivElement | null;
    if (!row) {
      return;
    }

    const tabKey = row.dataset.tabKey ?? null;
    if (!tabKey || tabKey === this.draggedTabKey) {
      event.preventDefault();
      this.clearDropIndicator();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    const target = this.resolveDropTargetFromPoint(event.clientY);
    if (!target) {
      this.clearDropIndicator();
      return;
    }

    this.setDropIndicator(target.tabKey, target.position);
  };

  private readonly handleRowDrop = (event: DragEvent) => {
    if (!this.draggedTabKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const target = this.resolveDropTargetFromPoint(event.clientY);
    if (!target) {
      this.clearDragState();
      return;
    }

    this.commitDrop(target.tabKey, target.position);
  };

  private readonly handleRowDragEnd = () => {
    this.clearDragState();
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

  private createGroupFromSelectedTab(): void {
    const selectedTab = this.tracker.getSelectedTab();
    if (!selectedTab) {
      return;
    }

    const name = this.promptForGroupName(selectedTab.title);
    if (name === null) {
      return;
    }

    this.groupStore.createGroupFromTab(this.normalizeTab(selectedTab), name);
  }

  private async activateGroupMember(
    groupId: string,
    memberKey: string,
  ): Promise<void> {
    await this.ensureGroupMemberOpen(groupId, memberKey, true);
  }

  private async ensureGroupMemberOpen(
    groupId: string,
    memberKey: string,
    selectIfAlreadyOpen: boolean,
  ): Promise<boolean> {
    const liveTab = this.trackedTabsByMemberKey.get(memberKey) ?? null;
    if (liveTab?.tabId) {
      if (selectIfAlreadyOpen) {
        this.selectTrackedTab(liveTab);
      }
      return true;
    }

    const group = this.groupStore.findGroupById(groupId);
    const member =
      group?.members.find((item) => item.key === memberKey) ?? null;
    if (!member) {
      return false;
    }

    const preferredItemID = member.itemID ?? member.parentItemID;
    if (preferredItemID == null) {
      return false;
    }

    try {
      let item = Zotero.Items.get(preferredItemID);
      if (!item) {
        return false;
      }

      if (!item.isFileAttachment?.()) {
        const bestAttachment = await item.getBestAttachment?.();
        if (bestAttachment) {
          item = bestAttachment;
        }
      }

      await (Zotero as any).FileHandlers.open(item);
      this.tracker.scheduleDelayedReconcile(
        `group-member-open:${member.key}`,
        [80, 220, 480],
      );
      return true;
    } catch (error) {
      ztoolkit.log("VerticalTabSidebar activateGroupMember failed", {
        groupId,
        memberKey,
        error,
      });
      return false;
    }
  }

  private async openGroupMembers(
    groupId: string,
    options: { closeOthers?: boolean } = {},
  ): Promise<void> {
    const group = this.groupStore.findGroupById(groupId);
    if (!group) {
      return;
    }

    if (options.closeOthers) {
      const memberKeys = new Set(group.members.map((member) => member.key));
      this.tracker
        .getTabs()
        .map((tab) => this.normalizeTab(tab))
        .filter((tab) => this.shouldRenderTab(tab))
        .forEach((tab) => {
          const tabMemberKey = this.groupStore.makeMemberKeyFromTab(tab);
          if (!memberKeys.has(tabMemberKey) && tab.tabId) {
            this.commandController.close(tab.tabId);
          }
        });
      this.tracker.scheduleDelayedReconcile(
        `group-close-others:${groupId}`,
        [80, 220],
      );
    }

    for (const member of group.members) {
      await this.ensureGroupMemberOpen(groupId, member.key, false);
      await this.wait(80);
    }

    this.tracker.reconcile(`group-open-all:${groupId}`);
    this.tracker.scheduleDelayedReconcile(
      `group-open-all:${groupId}`,
      [120, 320, 640],
    );
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.window.setTimeout(resolve, ms);
    });
  }

  private showContextMenu(
    target: ContextMenuTarget,
    screenX: number,
    screenY: number,
  ): void {
    if (!this.contextMenu) {
      return;
    }

    this.hideContextMenu();

    switch (target.kind) {
      case "tab":
        this.populateTabContextMenu(target.tabKey);
        break;
      case "group-header":
        this.populateGroupHeaderContextMenu(target.groupId);
        break;
      case "group-member":
        this.populateGroupMemberContextMenu(target.groupId, target.memberKey);
        break;
    }

    if (!this.contextMenu.firstChild) {
      return;
    }

    this.contextMenu.openPopupAtScreen(screenX, screenY, true);
  }

  private populateTabContextMenu(tabKey: string): void {
    const tracked = this.trackedTabsByKey.get(tabKey);
    if (!tracked || !this.contextMenu) {
      return;
    }

    this.commandController
      .getContextMenuItems(tracked.tabId)
      .forEach((item) =>
        this.contextMenu?.appendChild(this.renderContextMenuItem(item)),
      );

    this.appendSeparator();
    this.appendMenuItem(getString("create-group"), () => {
      const name = this.promptForGroupName(tracked.title);
      if (name === null) {
        return;
      }
      this.groupStore.createGroupFromTab(tracked, name);
    });

    const groups = this.groupStore.getGroups();
    if (groups.length > 0) {
      this.appendGroupSubmenu(
        getString("add-to-group"),
        groups,
        (group) => () => this.groupStore.addTabToGroup(group.id, tracked),
      );
    }
  }

  private populateGroupMemberContextMenu(
    groupId: string,
    memberKey: string,
  ): void {
    const group = this.groupStore.findGroupById(groupId);
    const member =
      group?.members.find((item) => item.key === memberKey) ?? null;
    if (!group || !member || !this.contextMenu) {
      return;
    }

    const liveTab = this.trackedTabsByMemberKey.get(member.key) ?? null;
    if (liveTab) {
      this.commandController
        .getContextMenuItems(liveTab.tabId)
        .forEach((item) =>
          this.contextMenu?.appendChild(this.renderContextMenuItem(item)),
        );
      this.appendSeparator();
    }

    this.appendMenuItem(getString("remove-from-group"), () => {
      this.groupStore.removeMember(group.id, member.key);
    });
  }

  private populateGroupHeaderContextMenu(groupId: string): void {
    const group = this.groupStore.findGroupById(groupId);
    if (!group) {
      return;
    }

    this.appendMenuItem(getString("open-group-all"), async () => {
      await this.openGroupMembers(group.id);
    });
    this.appendMenuItem(getString("open-group-only"), async () => {
      await this.openGroupMembers(group.id, { closeOthers: true });
    });
    this.appendMenuItem(getString("expand-only-group"), () => {
      this.groupStore.expandOnly(group.id);
    });
    this.appendSeparator();
    this.appendMenuItem(
      group.collapsed ? getString("expand-group") : getString("collapse-group"),
      () => this.groupStore.toggleCollapsed(group.id),
    );
    this.appendMenuItem(getString("rename-group"), () => {
      const nextName = this.promptForGroupName(group.name);
      if (nextName === null) {
        return;
      }
      this.groupStore.renameGroup(group.id, nextName);
    });
    this.appendColorSubmenu(group.id, group.color);
    this.appendSeparator();
    this.appendMenuItem(getString("dissolve-group"), () => {
      this.groupStore.dissolveGroup(group.id);
    });
  }

  private renderContextMenuItem(item: TabCommandItem): XULElement {
    return this.createMenuItem(
      item.label,
      async () => {
        this.hideContextMenu();
        if (item.disabled) {
          return;
        }
        await item.handler();
      },
      Boolean(item.disabled),
    );
  }

  private appendMenuItem(
    label: string,
    handler: () => void | Promise<void>,
    disabled = false,
  ): void {
    this.contextMenu?.appendChild(
      this.createMenuItem(label, handler, disabled),
    );
  }

  private appendSeparator(): void {
    if (!this.contextMenu || !this.contextMenu.firstChild) {
      return;
    }

    this.contextMenu.appendChild(
      ztoolkit.createXULElement(this.document, "menuseparator"),
    );
  }

  private appendGroupSubmenu(
    label: string,
    groups: VirtualGroup[],
    handlerFactory: (group: VirtualGroup) => () => void,
  ): void {
    if (!this.contextMenu || groups.length === 0) {
      return;
    }

    const menu = ztoolkit.createXULElement(this.document, "menu");
    menu.setAttribute("label", label);
    const popup = ztoolkit.createXULElement(this.document, "menupopup");

    groups.forEach((group) => {
      popup.appendChild(
        this.createMenuItem(
          group.name,
          handlerFactory(group),
          false,
          group.color,
        ),
      );
    });

    menu.appendChild(popup);
    this.contextMenu.appendChild(menu);
  }

  private appendColorSubmenu(groupId: string, currentColor: string): void {
    if (!this.contextMenu) {
      return;
    }

    const menu = ztoolkit.createXULElement(this.document, "menu");
    menu.setAttribute("label", getString("change-group-color"));
    const popup = ztoolkit.createXULElement(this.document, "menupopup");

    GROUP_COLOR_PALETTE.forEach((color, index) => {
      popup.appendChild(
        this.createMenuItem(
          `${getString("group-color")} ${index + 1}`,
          () => this.groupStore.setColor(groupId, color),
          color === currentColor,
          color,
        ),
      );
    });

    menu.appendChild(popup);
    this.contextMenu.appendChild(menu);
  }

  private createMenuItem(
    label: string,
    handler: () => void | Promise<void>,
    disabled = false,
    color?: string,
  ): XULElement {
    const menuItem = ztoolkit.createXULElement(this.document, "menuitem");
    menuItem.setAttribute("label", label);
    menuItem.addEventListener("command", async () => {
      this.hideContextMenu();
      if (disabled) {
        return;
      }
      await handler();
    });

    if (disabled) {
      menuItem.setAttribute("disabled", "true");
    }
    if (color) {
      menuItem.setAttribute("style", `color:${color};`);
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

  private commitDrop(
    targetTabKey: string | null,
    position: DropPosition,
  ): void {
    const sourceTabKey = this.draggedTabKey;
    this.clearDragState();

    if (!sourceTabKey || !targetTabKey || sourceTabKey === targetTabKey) {
      return;
    }

    if (this.isNoOpDropTarget(targetTabKey, position)) {
      return;
    }

    const sourceTab = this.trackedTabsByKey.get(sourceTabKey);
    const targetTab = this.trackedTabsByKey.get(targetTabKey);
    if (!sourceTab?.tabId || !targetTab?.tabId) {
      return;
    }

    const targetIndex = targetTab.nativeIndex + (position === "after" ? 1 : 0);
    ztoolkit.log("VerticalTabSidebar move", {
      sourceTabId: sourceTab.tabId,
      sourceIndex: sourceTab.nativeIndex,
      targetTabId: targetTab.tabId,
      targetIndex,
      position,
    });

    this.commandController.moveOpenTabs([sourceTab.tabId], targetIndex);
    this.tracker.reconcile(`sidebar-move:${sourceTab.tabId}:${targetIndex}`);
    this.tracker.scheduleDelayedReconcile(
      `sidebar-move:${sourceTab.tabId}:${targetIndex}`,
      [80, 220],
    );
  }

  private getDropPosition(row: HTMLDivElement, event: DragEvent): DropPosition {
    const rect = row.getBoundingClientRect();
    const pointerY = event.clientY ?? rect.top;
    const middleY = rect.top + rect.height / 2;
    const rowTabKey = row.dataset.tabKey ?? null;

    if (
      rowTabKey &&
      rowTabKey === this.dragOverTabKey &&
      this.dragOverPosition &&
      Math.abs(pointerY - middleY) <= DROP_POSITION_HYSTERESIS
    ) {
      return this.dragOverPosition;
    }

    return pointerY < middleY ? "before" : "after";
  }

  private setDropIndicator(
    tabKey: string | null,
    position: DropPosition | null,
  ): void {
    if (!tabKey || !position || tabKey === this.draggedTabKey) {
      this.clearDropIndicator();
      return;
    }

    if (this.isNoOpDropTarget(tabKey, position)) {
      this.clearDropIndicator();
      return;
    }

    if (this.dragOverTabKey === tabKey && this.dragOverPosition === position) {
      this.updateDropIndicator();
      return;
    }

    this.dragOverTabKey = tabKey;
    this.dragOverPosition = position;
    this.render(this.tracker.getSnapshot());
  }

  private clearDropIndicator(): void {
    if (!this.dragOverTabKey && !this.dragOverPosition) {
      this.updateDropIndicator();
      return;
    }

    this.dragOverTabKey = null;
    this.dragOverPosition = null;
    this.render(this.tracker.getSnapshot());
  }

  private clearDragState(): void {
    this.draggedTabKey = null;
    this.dragOverTabKey = null;
    this.dragOverPosition = null;
    this.updateDropIndicator();
  }

  private updateDropIndicator(): void {
    if (!this.listContainer) {
      return;
    }

    const rows = this.listContainer.querySelectorAll(
      '.tab-enhance-vertical-tab-row[data-sortable="true"]',
    );
    rows.forEach((node: Element) => {
      const row = node as HTMLDivElement;
      row.classList.remove("is-dragging");
      const rowTabKey = row.dataset.tabKey ?? null;
      if (rowTabKey && rowTabKey === this.draggedTabKey) {
        row.classList.add("is-dragging");
      }
    });
  }

  private resolveDropTargetFromPoint(
    clientY: number,
  ): { tabKey: string | null; position: DropPosition } | null {
    if (!this.listContainer) {
      return null;
    }

    const rows = Array.from(
      this.listContainer.querySelectorAll(
        '.tab-enhance-vertical-tab-row[data-sortable="true"]',
      ),
    ) as HTMLDivElement[];
    if (!rows.length) {
      return null;
    }

    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      const middleY = rect.top + rect.height / 2;
      if (clientY < middleY) {
        return {
          tabKey: row.dataset.tabKey ?? null,
          position: "before",
        };
      }
    }

    const lastRow = rows[rows.length - 1];
    return {
      tabKey: lastRow.dataset.tabKey ?? null,
      position: "after",
    };
  }

  private getSortableRowFromEventTarget(
    target: EventTarget | null,
  ): HTMLDivElement | null {
    const elementCtor = this.window.Element;
    if (!elementCtor || !target || !(target instanceof elementCtor)) {
      return null;
    }

    const row = (target as Element).closest(
      '.tab-enhance-vertical-tab-row[data-sortable="true"]',
    );
    return row ? (row as HTMLDivElement) : null;
  }

  private promptForGroupName(defaultValue: string): string | null {
    const value = this.window.prompt(
      getString("group-name-prompt"),
      defaultValue,
    );
    if (value === null) {
      return null;
    }

    const normalized = value.trim();
    return normalized || getString("new-group");
  }

  private getBadgeText(iconKey: string): string {
    switch (iconKey) {
      case "reader":
        return "P";
      case "note":
        return "N";
      case "web":
        return "W";
      default:
        return iconKey.slice(0, 1).toUpperCase() || "?";
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

  private getVirtualMemberMetaText(
    member: Pick<
      VirtualGroupMember,
      "type" | "itemID" | "parentItemID" | "isOpen"
    >,
  ): string {
    const parts = [member.isOpen ? member.type : `${member.type} · virtual`];
    if (member.parentItemID != null && member.parentItemID !== member.itemID) {
      parts.push(`item ${member.parentItemID}`);
    } else if (member.itemID != null) {
      parts.push(`item ${member.itemID}`);
    }
    return parts.join(" · ");
  }
}
