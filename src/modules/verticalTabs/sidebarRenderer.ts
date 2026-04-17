export interface RenderEntry {
  key: string;
  signature: string;
  buildNode: () => HTMLElement;
}

type CachedRenderEntry = {
  signature: string;
  node: HTMLElement;
};

export default class SidebarRenderer {
  private readonly listContainer: HTMLElement;
  private readonly nodeCache = new Map<string, CachedRenderEntry>();

  constructor(listContainer: HTMLElement) {
    this.listContainer = listContainer;
  }

  public render(entries: RenderEntry[]): void {
    const desiredKeys = new Set<string>();
    const nextNodes: HTMLElement[] = [];

    entries.forEach((entry) => {
      desiredKeys.add(entry.key);

      const cached = this.nodeCache.get(entry.key);
      let node = cached?.node ?? null;

      if (!cached || cached.signature !== entry.signature || !node) {
        node = entry.buildNode();
        node.dataset.renderKey = entry.key;
        if (cached?.node && cached.node.parentNode === this.listContainer) {
          cached.node.replaceWith(node);
        }
        this.nodeCache.set(entry.key, {
          signature: entry.signature,
          node,
        });
      } else if (!node.dataset.renderKey) {
        node.dataset.renderKey = entry.key;
      }

      nextNodes.push(node);
    });

    for (const [key, cached] of this.nodeCache.entries()) {
      if (!desiredKeys.has(key)) {
        if (cached.node.parentNode === this.listContainer) {
          cached.node.remove();
        }
        this.nodeCache.delete(key);
      }
    }

    let referenceNode: Node | null = this.listContainer.firstChild;
    nextNodes.forEach((node) => {
      if (node === referenceNode) {
        referenceNode = referenceNode.nextSibling;
        return;
      }

      this.listContainer.insertBefore(node, referenceNode);
    });

    this.trimUnexpectedNodes(desiredKeys);
  }

  public clear(): void {
    this.nodeCache.clear();
    this.listContainer.replaceChildren();
  }

  public invalidate(): void {
    this.nodeCache.clear();
  }

  private trimUnexpectedNodes(desiredKeys: Set<string>): void {
    Array.from(this.listContainer.children).forEach((child) => {
      const element = child as HTMLElement;
      const renderKey = element.dataset.renderKey ?? "";
      if (!desiredKeys.has(renderKey)) {
        element.remove();
      }
    });
  }
}
