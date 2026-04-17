import TabCommandController from "./tabCommands";
import TabGroupStore from "./groupStore";
import TabTrackerService from "./tabTracker";
import { TrackedTab } from "./types";

export interface SidebarMultiSelectHost {
  trackedTabsByKey: Map<string, TrackedTab>;
  selectedTabKeys: Set<string>;
  selectedGroupMemberKeys: Set<string>;
  lastSelectedIndex: number;
  lastSelectedGroupId: string | null;
  listContainer?: HTMLElement;
  countBadge?: HTMLElement;
  tracker: TabTrackerService;
  groupStore: TabGroupStore;
  commandController: TabCommandController;
  shouldRenderTab(tab: TrackedTab): boolean;
  getGroupIdForKey(tabKey: string): string | null;
  showPanelWithGroupButtons(
    panelId: string,
    groups: ReturnType<TabGroupStore["getGroups"]>,
    handlerFactory: (
      group: ReturnType<TabGroupStore["getGroups"]>[number],
    ) => () => void,
  ): void;
  clearMultiSelect(): void;
}

type SelectionSnapshot = {
  tabKeys: Set<string>;
  memberKeys: Set<string>;
};

const previousSelections = new WeakMap<
  SidebarMultiSelectHost,
  SelectionSnapshot
>();

export function toggleMultiSelect(
  host: SidebarMultiSelectHost,
  tabKey: string | null,
  memberKey: string | null,
  event: MouseEvent,
  groupId?: string | null,
): boolean {
  const activeKey = memberKey || tabKey;
  if (!activeKey) {
    return false;
  }

  let currentList: string[] = [];
  if (groupId) {
    const group = host.groupStore.findGroupById(groupId);
    if (group) {
      currentList = group.members.map((member) => member.key);
    }
  } else {
    const allTabs = host.tracker
      .getSnapshot()
      .tabs.filter((tab) => host.shouldRenderTab(tab));
    currentList = allTabs
      .filter((tab) => host.getGroupIdForKey(tab.key) === null)
      .map((tab) => tab.key);
  }

  const currentIndex = currentList.indexOf(activeKey);
  if (currentIndex === -1) {
    return false;
  }

  if (event.ctrlKey || event.metaKey || event.shiftKey) {
    if (groupId) {
      if (host.selectedGroupMemberKeys.has(activeKey)) {
        host.selectedGroupMemberKeys.delete(activeKey);
      } else {
        host.selectedGroupMemberKeys.add(activeKey);
      }
    } else if (host.selectedTabKeys.has(activeKey)) {
      host.selectedTabKeys.delete(activeKey);
    } else {
      host.selectedTabKeys.add(activeKey);
    }

    if (
      event.shiftKey &&
      host.lastSelectedIndex >= 0 &&
      host.lastSelectedGroupId === groupId
    ) {
      const start = Math.min(host.lastSelectedIndex, currentIndex);
      const end = Math.max(host.lastSelectedIndex, currentIndex);
      for (let index = start; index <= end; index += 1) {
        const key = currentList[index];
        if (groupId) {
          host.selectedGroupMemberKeys.add(key);
        } else {
          host.selectedTabKeys.add(key);
        }
      }
    }

    host.lastSelectedIndex = currentIndex;
    host.lastSelectedGroupId = groupId || null;
  } else {
    if (
      (groupId && host.selectedGroupMemberKeys.size > 0) ||
      host.selectedTabKeys.size > 0
    ) {
      return true;
    }
    return false;
  }

  updateMultiSelectUI(host);
  return true;
}

export function toggleGroupMemberMultiSelect(
  host: SidebarMultiSelectHost,
  memberKey: string,
  event: MouseEvent,
): boolean {
  if (!memberKey) {
    return false;
  }

  if (event.ctrlKey || event.metaKey || event.shiftKey) {
    if (host.selectedGroupMemberKeys.has(memberKey)) {
      host.selectedGroupMemberKeys.delete(memberKey);
    } else {
      host.selectedGroupMemberKeys.add(memberKey);
    }
    updateMultiSelectUI(host);
    return true;
  }

  return host.selectedGroupMemberKeys.size > 0;
}

export function clearMultiSelect(host: SidebarMultiSelectHost): void {
  host.selectedTabKeys.clear();
  host.selectedGroupMemberKeys.clear();
  host.lastSelectedIndex = -1;
  host.lastSelectedGroupId = null;
  updateMultiSelectUI(host);
}

export function selectAllMembersInGroup(
  host: SidebarMultiSelectHost,
  groupId: string,
): void {
  const group = host.groupStore.findGroupById(groupId);
  if (!group) {
    return;
  }

  group.members.forEach((member) => {
    host.selectedGroupMemberKeys.add(member.key);
  });
  host.lastSelectedGroupId = groupId;
  updateMultiSelectUI(host);
}

export function updateMultiSelectUI(host: SidebarMultiSelectHost): void {
  const listContainer = host.listContainer;
  if (!listContainer) {
    return;
  }

  const previous =
    previousSelections.get(host) ?? {
      tabKeys: new Set<string>(),
      memberKeys: new Set<string>(),
    };
  const next: SelectionSnapshot = {
    tabKeys: new Set(host.selectedTabKeys),
    memberKeys: new Set(host.selectedGroupMemberKeys),
  };

  const updateRow = (selector: string, selected: boolean): void => {
    const row = listContainer.querySelector(selector) as HTMLDivElement | null;
    if (row) {
      row.classList.toggle("is-multi-selected", selected);
    }
  };

  previous.tabKeys.forEach((tabKey) => {
    if (!next.tabKeys.has(tabKey)) {
      updateRow(
        `.tab-enhance-vertical-tab-row[data-tab-key="${escapeAttributeValue(tabKey)}"]`,
        false,
      );
    }
  });
  next.tabKeys.forEach((tabKey) => {
    if (!previous.tabKeys.has(tabKey)) {
      updateRow(
        `.tab-enhance-vertical-tab-row[data-tab-key="${escapeAttributeValue(tabKey)}"]`,
        true,
      );
    }
  });

  previous.memberKeys.forEach((memberKey) => {
    if (!next.memberKeys.has(memberKey)) {
      updateRow(
        `.tab-enhance-vertical-tab-row[data-member-key="${escapeAttributeValue(memberKey)}"]`,
        false,
      );
    }
  });
  next.memberKeys.forEach((memberKey) => {
    if (!previous.memberKeys.has(memberKey)) {
      updateRow(
        `.tab-enhance-vertical-tab-row[data-member-key="${escapeAttributeValue(memberKey)}"]`,
        true,
      );
    }
  });

  previousSelections.set(host, next);

  if (host.countBadge) {
    const totalCount =
      host.selectedTabKeys.size + host.selectedGroupMemberKeys.size;
    if (totalCount > 0) {
      host.countBadge.textContent = `${totalCount}✓`;
      host.countBadge.classList.add("is-multi-select");
    } else {
      const openTabs = host.tracker
        .getSnapshot()
        .tabs.filter((tab) => host.shouldRenderTab(tab));
      host.countBadge.textContent = String(openTabs.length);
      host.countBadge.classList.remove("is-multi-select");
    }
  }
}

function escapeAttributeValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function getSelectedTabs(host: SidebarMultiSelectHost): TrackedTab[] {
  return Array.from(host.selectedTabKeys)
    .map((key) => host.trackedTabsByKey.get(key))
    .filter((tab): tab is TrackedTab => tab != null);
}

export function addSelectedToGroup(
  host: SidebarMultiSelectHost,
  groupId: string,
): void {
  const selectedTabs = getSelectedTabs(host);
  if (selectedTabs.length > 0) {
    host.groupStore.addTabsToGroup(groupId, selectedTabs);
    host.clearMultiSelect();
  }
}

export function removeSelectedFromGroup(
  host: SidebarMultiSelectHost,
  currentGroupId?: string,
): void {
  if (currentGroupId) {
    const group = host.groupStore.findGroupById(currentGroupId);
    if (group) {
      host.selectedGroupMemberKeys.forEach((memberKey) => {
        if (group.members.some((member) => member.key === memberKey)) {
          host.groupStore.removeMember(currentGroupId, memberKey);
        }
      });

      host.selectedTabKeys.forEach((tabKey) => {
        const tab = host.trackedTabsByKey.get(tabKey);
        if (!tab) {
          return;
        }
        const memberKey = host.groupStore.makeMemberKeyFromTab(tab);
        if (group.members.some((member) => member.key === memberKey)) {
          host.groupStore.removeMember(currentGroupId, memberKey);
        }
      });
    }
  } else {
    host.selectedTabKeys.forEach((tabKey) => {
      const tab = host.trackedTabsByKey.get(tabKey);
      if (!tab) {
        return;
      }
      const memberKey = host.groupStore.makeMemberKeyFromTab(tab);
      host.groupStore.getGroups().forEach((group) => {
        if (group.members.some((member) => member.key === memberKey)) {
          host.groupStore.removeMember(group.id, memberKey);
        }
      });
    });

    host.selectedGroupMemberKeys.forEach((memberKey) => {
      host.groupStore.getGroups().forEach((group) => {
        if (group.members.some((member) => member.key === memberKey)) {
          host.groupStore.removeMember(group.id, memberKey);
        }
      });
    });
  }

  if (host.selectedTabKeys.size > 0 || host.selectedGroupMemberKeys.size > 0) {
    host.clearMultiSelect();
  }
}

export function closeSelectedTabs(host: SidebarMultiSelectHost): void {
  const selectedTabs = getSelectedTabs(host);
  const tabsToClose = selectedTabs.filter((tab) => tab.tabId);

  tabsToClose.forEach((tab) => {
    if (tab.tabId) {
      host.commandController.close(tab.tabId);
    }
  });

  if (tabsToClose.length > 0) {
    host.clearMultiSelect();
    host.tracker.reconcile("multi-select-close");
  }
}

export function showGroupSelectionMenu(
  host: SidebarMultiSelectHost,
  tabs: TrackedTab[],
): void {
  void tabs;
  const groups = host.groupStore.getGroups();
  if (groups.length === 0) {
    return;
  }

  host.showPanelWithGroupButtons(
    "group-selection-panel",
    groups,
    (group) => () => addSelectedToGroup(host, group.id),
  );
}

export function showGroupMemberSelectionMenu(
  host: SidebarMultiSelectHost,
  groupId: string,
): void {
  void groupId;
  const groups = host.groupStore.getGroups();
  if (groups.length === 0) {
    return;
  }

  host.showPanelWithGroupButtons(
    "group-member-selection-panel",
    groups,
    (group) => () => addSelectedGroupMembersToGroup(host, group.id),
  );
}

export function addSelectedGroupMembersToGroup(
  host: SidebarMultiSelectHost,
  targetGroupId: string,
): void {
  const groups = host.groupStore.getGroups();
  const selectedMembers: Array<{ groupId: string; memberKey: string }> = [];

  host.selectedGroupMemberKeys.forEach((memberKey) => {
    const group = groups.find((candidate) =>
      candidate.members.some((member) => member.key === memberKey),
    );
    if (group) {
      selectedMembers.push({ groupId: group.id, memberKey });
    }
  });

  if (selectedMembers.length === 0) {
    return;
  }

  selectedMembers.forEach(({ memberKey }) => {
    const group = groups.find((candidate) =>
      candidate.members.some((member) => member.key === memberKey),
    );
    const member = group?.members.find(
      (candidate) => candidate.key === memberKey,
    );
    if (member && member.itemID != null) {
      host.groupStore.addItemsToGroup(targetGroupId, [
        {
          itemID: member.itemID,
          parentItemID: member.parentItemID,
          title: member.title,
        },
      ]);
    }
  });
  host.clearMultiSelect();
}
