import { getString } from "../../utils/locale";
import { getPref } from "../../utils/prefs";
import { TrackedTab } from "./types";

export type TabCommandID =
  | "close"
  | "show-in-filesystem"
  | "reload"
  | "copy-to-clipboard";

export interface TabCommandItem {
  id: TabCommandID;
  label: string;
  disabled?: boolean;
  handler: () => Promise<void> | void;
}

function isReaderTab(tab: _ZoteroTypes.TabInstance | TrackedTab | null | undefined) {
  return Boolean(tab && (tab.type === "reader" || tab.type === "reader-unloaded"));
}

export default class TabCommandController {
  private readonly window: _ZoteroTypes.MainWindow;

  constructor(window: _ZoteroTypes.MainWindow) {
    this.window = window;
  }

  public select(tabId: string | null): void {
    if (!tabId) {
      return;
    }

    try {
      this.window.Zotero_Tabs.select(tabId);
    } catch (error) {
      ztoolkit.log("TabCommandController.select failed", tabId, error);
    }
  }

  public close(tabId: string | null): void {
    if (!tabId || tabId === "zotero-pane") {
      return;
    }

    try {
      this.window.Zotero_Tabs.close(tabId);
    } catch (error) {
      ztoolkit.log("TabCommandController.close failed", tabId, error);
    }
  }

  public async showInFilesystem(tabId: string | null): Promise<void> {
    try {
      const tab = this.getNativeTab(tabId);
      if (!tab || !isReaderTab(tab)) {
        return;
      }

      const itemID = tab.data?.itemID;
      if (typeof itemID !== "number") {
        return;
      }
      const item = Zotero.Items.get(itemID);
      const attachment = item.isFileAttachment()
        ? item
        : await item.getBestAttachment();
      if (!attachment) {
        return;
      }
      await this.window.ZoteroPane.showAttachmentInFilesystem(attachment.id);
    } catch (error) {
      ztoolkit.log("TabCommandController.showInFilesystem failed", tabId, error);
    }
  }

  public async reload(tabId: string | null): Promise<void> {
    try {
      const tab = this.getNativeTab(tabId);
      if (!tab || !isReaderTab(tab)) {
        return;
      }

      const itemID = tab.data?.itemID;
      if (typeof itemID !== "number") {
        return;
      }
      const item = Zotero.Items.get(itemID);
      this.window.Zotero_Tabs.close(tabId!);
      await (Zotero as any).FileHandlers.open(item);
    } catch (error) {
      ztoolkit.log("TabCommandController.reload failed", tabId, error);
    }
  }

  public copyReference(tabId: string | null): void {
    try {
      const tab = this.getNativeTab(tabId);
      if (!tab || !isReaderTab(tab)) {
        return;
      }

      const itemID = tab.data?.itemID;
      if (typeof itemID !== "number") {
        return;
      }
      const item = Zotero.Items.get(itemID).topLevelItem;
      let items = [item];

      let format = Zotero.QuickCopy.getFormatFromURL(
        Zotero.QuickCopy.lastActiveURL,
      );
      if (items.every((currentItem) => currentItem.isNote() || currentItem.isAttachment())) {
        format = Zotero.QuickCopy.getNoteFormat();
      }
      format = Zotero.QuickCopy.unserializeSetting(format);

      if (format.mode === "bibliography") {
        items = items.filter((currentItem) => currentItem.isRegularItem());
      }

      if (!items.length) {
        return;
      }

      const locale = format.locale
        ? format.locale
        : Zotero.Prefs.get("export.quickCopy.locale");

      if (format.mode === "bibliography") {
        (this.window.Zotero_File_Interface as any).copyItemsToClipboard(
          items,
          format.id,
          locale,
          format.contentType === "html",
          false,
        );
      } else if (format.mode === "export") {
        this.window.Zotero_File_Interface.exportItemsToClipboard(items, format);
      }
    } catch (error) {
      ztoolkit.log("TabCommandController.copyReference failed", tabId, error);
    }
  }

  public getContextMenuItems(tabId: string | null): TabCommandItem[] {
    const nativeTab = this.getNativeTab(tabId, false);
    const reader = isReaderTab(nativeTab);
    const items: TabCommandItem[] = [
      {
        id: "close",
        label: getString("close-tab"),
        handler: () => this.close(tabId),
      },
    ];

    if (getPref("enableCopyReference")) {
      items.push({
        id: "copy-to-clipboard",
        label: getString("copy-to-clipboard"),
        disabled: !reader,
        handler: () => this.copyReference(tabId),
      });
    }

    if (getPref("enableGoToAttachment")) {
      items.push({
        id: "show-in-filesystem",
        label: getString("show-in-filesystem"),
        disabled: !reader,
        handler: () => this.showInFilesystem(tabId),
      });
    }

    if (getPref("enableReloadTab")) {
      items.push({
        id: "reload",
        label: getString("reload"),
        disabled: !reader,
        handler: () => this.reload(tabId),
      });
    }

    return items;
  }

  private getNativeTab(tabId: string | null, logError = true) {
    if (!tabId) {
      return null;
    }

    try {
      return this.window.Zotero_Tabs._getTab(tabId).tab;
    } catch (error) {
      if (logError) {
        ztoolkit.log("TabCommandController.getNativeTab failed", tabId, error);
      }
      return null;
    }
  }
}
