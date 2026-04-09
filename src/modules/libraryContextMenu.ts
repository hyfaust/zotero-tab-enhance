/**
 * Library context menu enhancement
 * Adds "Add to Tab Group" menu item to Zotero library context menu
 */

import { getString } from "../utils/locale";
import TabGroupStore from "./verticalTabs/groupStore";

export default class LibraryContextMenu {
  private readonly window: _ZoteroTypes.MainWindow;
  private readonly document: Document;
  private readonly groupStore: TabGroupStore;
  private initialized = false;
  private handlePopupShowing!: (event: Event) => void;
  private originalBuildItemContextMenu?: Function;

  constructor(window: _ZoteroTypes.MainWindow, groupStore: TabGroupStore) {
    this.window = window;
    this.document = window.document;
    this.groupStore = groupStore;
  }

  public init(): void {
    if (this.initialized) {
      ztoolkit.log("LibraryContextMenu already initialized, skipping");
      return;
    }

    this.injectContextMenu();
    this.initialized = true;
    ztoolkit.log("LibraryContextMenu initialized successfully");
  }

  public destroy(): void {
    if (!this.initialized) {
      return;
    }

    // Remove event listener
    const menu = this.window.document.getElementById("zotero-itemmenu");
    if (menu && this.handlePopupShowing) {
      menu.removeEventListener("popupshowing", this.handlePopupShowing);
    }

    // Restore original function if we monkey-patched it
    if (this.originalBuildItemContextMenu) {
      (this.window as any).ZoteroPane.buildItemContextMenu = this.originalBuildItemContextMenu;
    }

    this.initialized = false;
    ztoolkit.log("LibraryContextMenu destroyed");
  }

  private injectContextMenu(): void {
    const ZoteroPane = (this.window as any).ZoteroPane;
    if (!ZoteroPane) {
      ztoolkit.log("LibraryContextMenu: ZoteroPane not found");
      return;
    }

    // Monkey-patch buildItemContextMenu to inject our menu item
    const originalBuildItemContextMenu = ZoteroPane.buildItemContextMenu;
    this.originalBuildItemContextMenu = originalBuildItemContextMenu;

    const self = this;
    ZoteroPane.buildItemContextMenu = async function (...args: any[]) {
      // Call original function first
      const result = await originalBuildItemContextMenu.apply(this, args);

      // Then inject our menu item
      await self.injectMenuItem();

      return result;
    };

    ztoolkit.log("LibraryContextMenu: monkey-patched buildItemContextMenu");
  }

  private async injectMenuItem(): Promise<void> {
    try {
      const ZoteroPane = (this.window as any).ZoteroPane;
      if (!ZoteroPane) {
        return;
      }

      // Get selected items
      const selectedItems = ZoteroPane.getSelectedItems();
      if (!selectedItems || selectedItems.length === 0) {
        return;
      }

      // Get available groups
      const groups = this.groupStore.getGroups();
      if (groups.length === 0) {
        return;
      }

      const menu = this.window.document.getElementById("zotero-itemmenu");
      if (!menu) {
        ztoolkit.log("LibraryContextMenu: zotero-itemmenu not found");
        return;
      }

      // Remove existing menu item if present
      const existingMenu = menu.querySelector("#tab-enhance-add-to-group");
      if (existingMenu) {
        existingMenu.remove();
      }

      // Create main menu item
      const mainMenu = this.window.document.createElementNS(
        "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
        "menu",
      );
      mainMenu.setAttribute("id", "tab-enhance-add-to-group");
      mainMenu.setAttribute("label", getString("add-to-tab-group"));

      // Create submenu
      const subMenu = this.window.document.createElementNS(
        "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
        "menupopup",
      );

      // Add group items
      groups.forEach((group) => {
        const groupItem = this.window.document.createElementNS(
          "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
          "menuitem",
        );
        groupItem.setAttribute("label", group.name);
        groupItem.setAttribute("style", `color: ${group.color}; font-weight: bold;`);
        groupItem.addEventListener("command", () => {
          this.addItemsToGroup(group.id, selectedItems);
        });
        subMenu.appendChild(groupItem);
      });

      mainMenu.appendChild(subMenu);

      // Find insertion point: look for a good spot (before exportItems or at a separator)
      const exportItemMenu = menu.querySelector('[id*="zotero-tb-export"]');
      if (exportItemMenu) {
        menu.insertBefore(mainMenu, exportItemMenu);
      } else {
        // Fallback: append to end
        menu.appendChild(mainMenu);
      }

      ztoolkit.log(`LibraryContextMenu: added menu item with ${groups.length} groups for ${selectedItems.length} items`);
    } catch (error) {
      ztoolkit.log("LibraryContextMenu: error injecting menu item", error);
    }
  }

  private addItemsToGroup(groupId: string, items: Zotero.Item[]): void {
    try {
      const itemData = items.map((item) => ({
        itemID: item.id,
        parentItemID: item.topLevelItem?.id ?? item.id,
      }));

      this.groupStore.addItemsToGroup(groupId, itemData);

      // Show notification
      const notification = new (this.window as any).Zotero.ProgressWindow();
      notification.changeHeadline(getString("add-to-tab-group"));
      notification.addDescription(
        `已添加 ${items.length} 个文献到分组`,
      );
      notification.show();
      notification.startCloseTimer(2000);

      ztoolkit.log(`LibraryContextMenu: added ${items.length} items to group ${groupId}`);
    } catch (error) {
      ztoolkit.log("LibraryContextMenu: error adding items to group", error);

      // Show error notification
      const notification = new (this.window as any).Zotero.ProgressWindow();
      notification.changeHeadline("添加失败");
      notification.addDescription("添加文献到分组时出错");
      notification.show();
      notification.startCloseTimer(3000);
    }
  }
}
