/**
 * Multi-select functionality for vertical tab sidebar
 * Provides Ctrl/Shift+click multi-selection support
 */

export interface MultiSelectState {
  selectedKeys: Set<string>;
  lastIndex: number;
  isEnabled: boolean;
}

export function createMultiSelectState(): MultiSelectState {
  return {
    selectedKeys: new Set<string>(),
    lastIndex: -1,
    isEnabled: true,
  };
}

export function toggleMultiSelect(
  state: MultiSelectState,
  key: string,
  index: number,
  event: MouseEvent,
): boolean {
  if (!state.isEnabled) {
    return false;
  }

  // Ctrl+Click: Toggle single selection
  if (event.ctrlKey) {
    if (state.selectedKeys.has(key)) {
      state.selectedKeys.delete(key);
    } else {
      state.selectedKeys.add(key);
    }
    state.lastIndex = index;
    return true;
  }

  // Shift+Click: Range selection
  if (event.shiftKey && state.lastIndex >= 0) {
    const start = Math.min(state.lastIndex, index);
    const end = Math.max(state.lastIndex, index);
    
    // Note: Actual range selection requires access to tab list
    // This will be handled by the sidebar's render logic
    state.selectedKeys.add(key);
    state.lastIndex = index;
    return true;
  }

  // Regular click: If there are selections, keep them; otherwise, open tab
  if (state.selectedKeys.size > 0) {
    return true; // Consume the click
  }

  return false; // Let original handler process
}

export function clearMultiSelect(state: MultiSelectState): void {
  state.selectedKeys.clear();
  state.lastIndex = -1;
}

export function hasMultiSelection(state: MultiSelectState): boolean {
  return state.selectedKeys.size > 0;
}

export function getSelectedCount(state: MultiSelectState): number {
  return state.selectedKeys.size;
}
