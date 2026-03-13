export interface TrackedTab {
  // Stable plugin key. Open tabs use `tab:${tabId}`.
  key: string;
  tabId: string | null;
  type: string;
  title: string;
  itemID: number | null;
  parentItemID: number | null;
  isOpen: boolean;
  isSelected: boolean;
  nativeIndex: number;
  openedAt: number | null;
  iconKey: string;
}

export interface SidebarState {
  collapsed: boolean;
  width: number | null;
  searchQuery: string;
  selectedKeys: string[];
}

export interface VirtualGroup {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  memberKeys: string[];
  sortMode: "manual" | "recent" | "type";
}

export interface TabTrackerSnapshot {
  tabs: TrackedTab[];
  selectedTabKey: string | null;
}

export const LIBRARY_TAB_ID = "zotero-pane";
