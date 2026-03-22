const DEFAULT_EXPANDED_MAX_HEIGHT = "720px";
const DEFAULT_COLLAPSED_TRANSLATE_Y = "-4px";

type CollapsibleOptions = {
  heightVarName?: string;
  expandedFallbackHeight?: string;
  collapsedTranslateY?: string;
};

export function setCollapsibleMeasuredHeight(
  element: HTMLElement,
  height: string,
  options: CollapsibleOptions = {},
): void {
  element.style.setProperty(
    options.heightVarName ?? "--group-members-max-height",
    height,
  );
}

export function syncCollapsibleState(
  element: HTMLElement,
  collapsed: boolean,
  options: CollapsibleOptions = {},
): void {
  const heightVarName = options.heightVarName ?? "--group-members-max-height";
  const expandedHeight =
    element.style.getPropertyValue(heightVarName) ||
    options.expandedFallbackHeight ||
    DEFAULT_EXPANDED_MAX_HEIGHT;

  element.dataset.collapsed = collapsed ? "true" : "false";

  if (collapsed) {
    element.style.maxHeight = "0px";
    element.style.opacity = "0";
    element.style.transform = `translateY(${options.collapsedTranslateY ?? DEFAULT_COLLAPSED_TRANSLATE_Y})`;
    element.style.pointerEvents = "none";
    return;
  }

  element.style.maxHeight = expandedHeight;
  element.style.opacity = "1";
  element.style.transform = "translateY(0)";
  element.style.pointerEvents = "";
}
