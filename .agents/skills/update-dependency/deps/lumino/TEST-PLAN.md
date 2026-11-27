# Manual test plan for Lumino updates

Lumino is Theia's widget toolkit: menus, tabs, split and dock layouts, drag and drop.
Run this plan after every `@lumino/widgets` update, in the browser and in Electron; it can be handed to a testing agent as is.
Record the results per update (pass, finding, not tested) and add new checks and known issues here and in [GUIDE.md](GUIDE.md).

## Setup

- Build and start both apps: `npm run build:browser` and `npm run start:browser`, `npm run build:electron` and `npm run start:electron`. Rebuild after every fix.
- Electron: test with `window.titleBarStyle` set to `custom` and to `native` (needs a restart).
- Workspace: about 12 files, one Markdown file. Revert settings you change for a test (e.g. `workbench.tab.maximize`).
- Baseline: if a behaviour looks new, compare with a build of `master` (or the previous Lumino version, see "Checks" in the guide) before reporting it.
- Before testing, list the behaviour changes of this update from the release notes and the guide's known issues, and check each of them explicitly.
- Keep the browser console (DevTools in Electron: Help > Toggle Developer Tools) open the whole time.

## Main menu

- [ ] A click on a title opens its menu, hovering other titles switches menus, a click on the title of the open menu closes it.
- [ ] Submenus open on hover and stay inside the window, also near the right edge and in a narrow window.
- [ ] A click outside closes the menu; Escape closes a submenu first, then the menu.
- [ ] A click on an item runs its command, and focus returns to the previously focused widget (typing continues in the editor).
- [ ] Keyboard: arrow keys move through items, into and out of submenus and to the neighbouring menus; Enter runs the item.
- [ ] Toggle items (View > Toggle Minimap, Toggle Breadcrumbs, File > Auto Save) show their check mark and toggle it.
- [ ] Roles: paste the snippet below into the console and open the View menu within 3 seconds. Plain items (Command Palette, the views, Toggle Toolbar, Reload Window) are `menuitem`, checked toggles are `menuitemcheckbox` with `aria-checked="true"`, separators `presentation`, submenus have no role.
  ```js
  setTimeout(() => console.table([...document.querySelectorAll('.lm-Menu-item')].map(e => ({ label: e.querySelector('.lm-Menu-itemLabel')?.textContent, role: e.getAttribute('role'), checked: e.getAttribute('aria-checked') }))), 3000);
  ```
- [ ] Electron, custom title bar: hide the menu bar with `window.menuBarVisibility`, Alt shows it, switching the visibility twice still renders the menus (#17352). Browser: hidden menu bar.

## Context menus

- [ ] Context menus of the editor, explorer, editor tabs, view container part headers and the terminal open at the cursor.
- [ ] They stay inside the window near all edges and corners; submenus work; a click outside or Escape closes them.
- [ ] Monaco's own menu: right-click the minimap of an editor. Checkable items are `menuitemcheckbox` with `aria-checked` `true` or `false` (roles snippet above).

## Tabs

Main area tabs are dragged with the browser's native drag and drop (`NativeTabDragService`), side panel tabs with Lumino's drag.

- [ ] A click on a tab activates its widget and focuses it (typing goes into the editor).
- [ ] Close via the close icon and via middle click; dirty editors show their marker.
- [ ] Drag a tab within a group to reorder, onto an editor edge to split, into the bottom panel, and between the main window and a secondary window. The drop overlay disappears after the drop and after Escape during a drag.
- [ ] Tab context menu: Close Others, Close All, Pin.
- [ ] Many tabs: the tab bar scrolls, pinned tabs stay in place, a newly opened tab is scrolled into view.
- [ ] Double-click a tab with `workbench.tab.maximize: true`: toggles maximized (with the default `false` nothing happens).
- [ ] Side panels: a click on the active side tab collapses the panel, another click expands it; side tabs can be reordered and moved to the other side.

## Split and dock handles

- [ ] Resize the left, right and bottom panels by their handles; the sizes persist after a reload.
- [ ] Split an editor right and down, then resize the splits.
- [ ] Crossings (#17155), at the left and at the right side panel where its handle meets the bottom panel's handle:
  - [ ] hover on the side handle at the junction: `move` cursor, both lines highlighted
  - [ ] press and drag diagonally: both panels resize, both lines stay highlighted
  - [ ] release: still highlighted while the pointer stays there, cleared after moving away, nothing left highlighted after a release away from the lines
- [ ] Drag a handle across a webview (Markdown preview): the drag does not get stuck.

## View containers

- [ ] Explorer: expand and collapse the parts, resize between them.
- [ ] Reorder parts by drag, and move a part to another view container.
- [ ] Hide and show parts via the view container's title menu.
- [ ] The Tab key order follows the visual order of the parts.

## Secondary windows

- [ ] Move an editor to a secondary window: it renders, typing works, the dirty state is shown.
- [ ] Its context menu opens in that window (not in the main window), stays inside it near all corners, submenus open in the same window, a click outside or Escape closes it.
- [ ] Drag its tab back to the main window; "Move View to Main Window" works.
- [ ] Closing the secondary window closes its editors (`window.secondaryWindowCloseBehavior` defaults to `close`; with `moveToMainWindow` they go back).
- [ ] A Markdown preview (webview) works in a secondary window.

## Touch

DevTools device toolbar (Ctrl+Shift+M) with touch emulation; reload if taps do not register. A real touch device if available.

- [ ] Tap a menu title and an item: the item runs.
- [ ] Tap a tab: it activates. Tap the close icon of a tab: it closes.
- [ ] Drag a split handle by touch: the panel resizes.

## Other

- [ ] After a reload the layout is restored; Reset Workbench Layout works.
- [ ] Dragging an editor tab over the Output view shows no drop zones inside it.
- [ ] No errors in the console during the whole run. Known noise: the emitter leak warning of the logger watcher at start, `FrontendStopwatch` and TextMate grammar warnings, the focus warning of the Welcome view after Reset Workbench Layout.

## Known, not bugs (as of 2.11.0)

- Electron, custom title bar: a click on the empty title bar does not close an open menu; the title bar is a window drag region and the page never gets the click.
- Theia's main and side tabs are not reachable with the Tab key: the tab renderer sets no `tabindex`.
- A press on the bottom panel's handle next to a crossing only moves the bottom panel; Lumino looks for crossings only from the outer (side) handle. Crossings of editor splits lose the highlight during the drag (upstream).
- Monaco's own menus (e.g. of the minimap) of an editor in a secondary window open in the main window.
- "Open Preview to the Side" for a Markdown file in a secondary window opens the preview in the main window.
- In a very narrow window the menu bar cuts off the right-most titles: the menu bar overflow is disabled (#17352).

## Notes for testing agents

- Real input is needed for: drags across iframes, Lumino drags of side tabs and view container parts, right-click near edges, Escape during a real tab drag. Synthetic DOM events give false failures there (e.g. `setPointerCapture` throws `NotFoundError` for synthetic pointers); mark such items for a manual check.
- Electron cannot be driven with the browser setup; leave it to a manual run.
- Scripted checks (Puppeteer, headless Chromium): see "Checks" in the guide.
- Look up menu bar items and tabs by label, not by index.
- List every change made to the workspace or settings, and revert it at the end.

## Report

For each failure: steps, expected and actual result, browser or Electron (and title bar style), a screenshot, and whether `master` behaves the same. Summarize what was not tested.
