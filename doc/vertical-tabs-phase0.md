# Vertical Tabs Phase 0 Baseline

## Goal

Lock down the API baseline for a vertical tab sidebar that tracks Zotero's
native tabs instead of mutating the native horizontal tab DOM as the primary
source of truth.

This document is the completion artifact for `PLAN.md -> Phase 0`.

## Current Repository Baseline

- Current runtime integration is centered on `src/hooks.ts` and
  `src/modules/tabEnhance.ts`.
- The existing plugin behavior is limited to context-menu enhancements on the
  native horizontal tab bar.
- No sidebar model, tab tracker, group store, or ordering controller exists in
  the current branch yet.
- The abandoned `dev` branch explored direct grouping inside the native tab bar
  by injecting group headers into native tab DOM and reordering
  `Zotero_Tabs._tabs`.

## Native Tab Source of Truth

### Stable enough to depend on directly

From local `zotero-types`:

- `window.Zotero_Tabs.selectedID`
- `window.Zotero_Tabs.selectedIndex`
- `window.Zotero_Tabs.getState()`
- `window.Zotero_Tabs.getTabIDByItemID(itemID)`
- `window.Zotero_Tabs.select(id, reopening?, options?)`
- `window.Zotero_Tabs.close(id | ids)`
- `window.Zotero_Tabs.move(id, newIndex)`

These should be the preferred entry points for Phase 1+ when they satisfy the
required behavior.

### Internal APIs that may still be required, but must be wrapped

- `window.Zotero_Tabs._tabs`
- `window.Zotero_Tabs._getTab(tabId)`
- `window.Zotero_Tabs._update()`
- DOM selectors such as `.tabs-wrapper .tabs` and `.tab[data-id]`

Rule: use these only behind a plugin-owned adapter/service so future Zotero API
changes are isolated to one layer.

## Action Mapping

The following mapping is fixed for the next phase unless Zotero source review
proves otherwise.

| Need | Preferred API | Fallback / Internal |
| --- | --- | --- |
| Enumerate open tabs | `Zotero_Tabs.getState()` | `Zotero_Tabs._tabs` |
| Read selected tab | `Zotero_Tabs.selectedID` | DOM selected class |
| Select tab | `Zotero_Tabs.select(id)` | none |
| Close tab | `Zotero_Tabs.close(id)` | none |
| Move open tab | `Zotero_Tabs.move(id, newIndex)` | `_tabs + _update()` only if Zotero behavior is insufficient |
| Resolve tab by id | none | `Zotero_Tabs._getTab(tabId)` |
| Resolve tab by item | `Zotero_Tabs.getTabIDByItemID(itemID)` | scan tracked model |
| Open reader for virtual member | `Zotero.Reader.open(...)` | file-handler/open helper depending on item type |

## Stable Model Decisions

Phase 1 should build on plugin-owned model types instead of raw Zotero tab
objects.

### `TrackedTab`

- `key`: stable plugin key, preferred `tab:${tab.id}` for open tabs and
  `item:${itemID}` for virtual entries later
- `tabId`: native tab id or `null` for virtual members
- `type`: Zotero tab type
- `title`: display title
- `itemID`: attachment or item id if available
- `parentItemID`: top-level item id if resolvable
- `isOpen`: whether the tab exists in native `Zotero_Tabs`
- `isSelected`: whether currently selected
- `nativeIndex`: current position in the native horizontal tab strip
- `openedAt`: plugin-maintained timestamp, because Zotero tabs do not expose a
  stable "opened time" field for this use case
- `iconKey`: symbolic display type for sidebar rendering

### `SidebarState`

- `collapsed`
- `width`
- `searchQuery`
- `selectedKeys`

### `VirtualGroup`

Not implemented in Phase 0, but its future member identity must be based on
stable keys, not DOM positions or transient tab indexes.

## `dev` Branch Findings

Useful findings from `dev`:

- `Zotero_Tabs._getTab(tabId)` is practical for resolving reader metadata.
- Direct tab movement by mutating `_tabs` and calling `_update()` can work in
  experiments.
- Group commands such as create/add/remove can be prototyped against current
  Zotero tab data.

Findings explicitly not carried forward:

- Injecting group headers into the native horizontal tab DOM.
- Treating the native tab bar as the primary grouped view.
- Persisting group membership by tab position.
- Using native tab relocation to emulate collapsed virtual groups.

Why rejected:

- It couples plugin behavior too tightly to Zotero's tab DOM and layout.
- Group headers become fragile when native tab rendering changes.
- Virtual groups need identities that survive close/reopen cycles.

## Source Locations To Consult

Primary local references:

- `src/hooks.ts`
- `src/modules/tabEnhance.ts`
- `node_modules/zotero-types/types/zoteroTabs.d.ts`

Official Zotero code paths to consult when implementation behavior is unclear:

- `chrome/content/zotero/tabs.js`
- reader opening flow used by `Zotero.Reader.open(...)`

Template/toolkit references to prefer first:

- `zotero-plugin-template` lifecycle hooks already used in `src/hooks.ts`
- `zotero-plugin-toolkit` XUL creation helpers already used in
  `src/modules/tabEnhance.ts`

## Phase 0 Exit Criteria

Phase 0 is considered complete in this branch when:

- this document exists and reflects the current repository reality
- stable plugin-owned tab model fields are defined in code
- public vs internal `Zotero_Tabs` usage boundaries are documented
- `dev` branch experimentation outcomes are explicitly triaged for reuse vs
  rejection
