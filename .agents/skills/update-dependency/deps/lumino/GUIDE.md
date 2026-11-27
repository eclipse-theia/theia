# Lumino

- **Packages:** `@lumino/widgets` (pinned exactly in `packages/core/package.json`, because Theia overrides private members of it and minor versions change behaviour), `@lumino/algorithm`, `commands`, `coreutils`, `domutils`, `dragdrop`, `messaging`, `properties`, `signaling`, `virtualdom` (caret ranges). All are re-exported as `@theia/core/shared/@lumino/*`.
- **Cadence:** on demand, usually when an upstream fix is needed (2.5.0 in 2025-03, 2.7.2 in 2025-11, 2.7.5 in 2026-02, 2.11.0 in 2026-11). Not part of the post-release run; the NPM upgrade only moves the caret ranges, never `@lumino/widgets`.
- **Docs:** upstream [releases](https://github.com/jupyterlab/lumino/releases) (one date tag `vYYYY.M.D` per release for all packages; find the tag of a version with `npm view @lumino/widgets time`), upstreaming of Theia's changes [#15680](https://github.com/eclipse-theia/theia/issues/15680), `isVisible` alignment [#16585](https://github.com/eclipse-theia/theia/issues/16585).

Split this file into `ISSUES.md` and `LOG.md` next to it once a section gets too long to scan.

## Theia's changes to Lumino

### No patch since 2.11.0

Up to 2.10.0, Theia patched `@lumino/widgets` (`dev-packages/cli/patches/@lumino+widgets+<version>.patch`, applied by `theia-patch` on `postinstall`) so that `Menu` works in secondary windows. 2.11.0 contains the same support upstream ([jupyterlab/lumino#883](https://github.com/jupyterlab/lumino/pull/883)): the document-level `pointerdown` listener, the viewport data and the submenu host come from the menu's document, the window-data cache is kept per document, and `Widget.attach` adopts the node into the host document before `onBeforeAttach`. The patch's inline `top`/`left` reset is not needed: Lumino's `menu.css` sets both to `0`, and secondary windows mirror the main window's stylesheets (`secondary-window-style-mirror.ts`). Theia opens context menus in a secondary window with `host` set to that window's `body` (`browser-context-menu-renderer.ts`). Not covered, neither by the old patch: `MonacoContextMenuService` opens Monaco's own menus (e.g. of the minimap) with `menu.open(x, y)` and no `host`, so in a secondary window they appear in the main window. Monaco passes only coordinates for them, so the fix needs the editor's window.

`theia-patch` stays: adopters run it on `postinstall`, and with no patch files it prints "No patch files found" and exits 0.

### If a patch is needed again

Generate it from a build, never by rebasing an old patch (the 2.7.5 patch carried a stale `index.min.js` of 2.7.2 for that reason):

1. `git clone https://github.com/jupyterlab/lumino`, `git checkout v<date-tag>`, check `packages/widgets/package.json` has the target version. Run `node .yarn/releases/yarn-<ver>.cjs install` (no corepack needed; scripts are disabled by `.yarnrc.yml`, that is fine).
2. Change `packages/widgets/src`, then `yarn build` and `yarn minimize` in `packages/widgets`.
3. Verify the build is reproducible: `diff` the built `dist/index.es6.js` against the published one, only your changes may differ. Otherwise use the exact tag and lockfile.
4. In Theia: replace `node_modules/@lumino/widgets` with the extracted published package (`npm pack @lumino/widgets@<v>`), copy the built `dist/*`, the changed `src/*.ts` and `types/*.d.ts` over it and run `npx patch-package @lumino/widgets --patch-dir dev-packages/cli/patches`.
5. Verify: put the pristine package back, run `npx theia-patch` (must report `@lumino/widgets@<v> ✔`) and `cmp` the patched files with the build output.

### Private overrides

Theia overrides or reads private Lumino members (`this['_x']`, `prototype['_x']`), which break silently when upstream renames them or changes their meaning:

- `theia-dock-panel.ts`: `_onCurrentChanged`, `_createTabBar`, `_onTabActivateRequested`, `_onTabCloseRequested`, `_onTabDetachRequested`, `_tabsConstrained`
- `theia-split-panel.ts`: `_evtPointerDown`, `_releaseMouse`, `_pressData`, `_updateIntersectionHover`
- `browser-menu-plugin.ts`: `DynamicMenuBarWidget.prototype._openChildMenu`; `DynamicMenuWidget` reads `_parentMenu` and has a copy of the hit test of `Menu._evtPointerDown`
- `view-container.ts`: `ViewContainerLayout._items`
- `application-shell.ts`: `TabBar._previousTitle`
- `output-widget.ts` (`@theia/output`): `NoopDragOverDockPanel` replaces `_evtDragOver`, `_evtDrop`, `_evtDragLeave`
- `tab-bars.ts`: skips Lumino's `preventDefault` on tab presses for native tab drags (`tab-bars.spec.ts` fails if Lumino stops calling it); calls `TabBar._releaseMouse`; `ScrollableTabBar.onBeforeAttach`/`onAfterDetach` replace Lumino's to listen on the `contentNode` instead of the `node`, so `tabEventTypes` must list the same events as `TabBar.onBeforeAttach` (`tab-bars.spec.ts` compares them)

## Steps

1. **Versions.** `npm view @lumino/<pkg> version` for all ten packages; compare with `packages/core/package.json` and the installed versions in `package-lock.json`. Check the dependency ranges of the new `@lumino/widgets` (`npm view @lumino/widgets@<new> dependencies`) against the installed `@lumino/*` versions.
2. **Read what changed.** Release notes of every tag in between, then diff the sources of both versions: `npm pack @lumino/widgets@<v>` for old and new, extract, `diff` `src/*.ts`, `style/*.css` and `types/`. Look at every change in `menu.ts`, `menubar.ts`, `tabbar.ts`, `docklayout.ts`, `dockpanel.ts`, `splitlayout.ts`, `splitpanel.ts`, `widget.ts`, and check every member in "Private overrides" (still present, same meaning).
3. **Pins.** `packages/core/package.json` (exact for `widgets`), `package-lock.json` (for an exact bump with unchanged transitive versions: edit `version`, `resolved`, `integrity` and the `dependencies` ranges of the `node_modules/@lumino/widgets` entry plus the `packages/core` entry by hand), regenerate `packages/core/README.md` with `npx theia-re-exports template README_TEMPLATE.md > README.md` in `packages/core`.
4. **Adapt Theia** where the diff of step 2 touches overridden internals or event handling.

## Coupled versions

| When this changes | Also update |
|---|---|
| `@lumino/widgets` version | `package-lock.json`, `packages/core/README.md`, the patch file name and content if there is one |
| `@lumino/widgets` dependency ranges | the other `@lumino/*` caret ranges in `packages/core/package.json` if the installed versions no longer satisfy them |
| Event types or private members of `Menu`, `MenuBar`, `TabBar`, `DockPanel`, `SplitPanel` | the overrides in "Private overrides", `tab-bars.ts` event handling |

## Checks

- Full **forced** compile: `tsc --build` does not notice changed typings in `node_modules` and reports success without rebuilding; use `--force` (or `npm run compile` after `npm run clean`).
- `npx lerna run test --scope @theia/core`, `npm run lint`, `npm run build:browser`, `npm run test:playwright` if possible.
- To compare behaviour with the previous version, build a baseline bundle: put the old published package into `node_modules/@lumino/widgets` (plus its patch, if any, applied with `patch -p1` after stripping `node_modules/@lumino/widgets/` from the paths), `npx theia build --mode development` in `examples/browser`, then restore. Stop the backend before rebuilding: `theia build` also rewrites the backend bundle and native modules, and the running backend dumps core.
- Scripted checks with Puppeteer: menu `.lm-Menu` count and bounding boxes against `innerWidth`/`innerHeight` (also in the secondary window page `secondary-window.html`, opened via `SecondaryWindowHandler.moveWidgetToSecondaryWindow` with an editor; the Explorer is not extractable), `document.activeElement` after clicking a tab, side panel width after dragging its split handle, `CommandRegistry.onDidExecuteCommand` after clicking a menu item. Look up menu bar items and tabs by label, not index: the api-samples add a "Sample Menu". `puppeteer.connect` with a `defaultViewport` also resizes the secondary window page. Close stale pages with `runBeforeUnload: false`; a page stuck in a `beforeunload` prompt blocks every page of the same origin.
- Manual test with [TEST-PLAN.md](TEST-PLAN.md) in the browser and in Electron, after every fix again. Add the behaviour changes of the update to its run, and new checks and non-bugs to the plan.

## Known issues

### `DynamicMenuWidget` handles `pointerdown` twice

Theia registers the same `pointerdown` capture listener as Lumino (`ownerDocument`, `this`, capture), so the browser deduplicates it, and `handleEvent` runs Theia's copy of the hit test plus Lumino's `_evtPointerDown`. The second `close()` on an already detached menu does nothing. Since 2.10.0 Lumino closes on `pointerdown` itself, so Theia's copy is a candidate for removal once tested.

### Clicks inside an open menu no longer reach document `mousedown` listeners

Since 2.10.0 Lumino calls `preventDefault`/`stopPropagation` on `pointerdown` (was `mousedown`) for presses inside an open menu and on menu bar titles, which suppresses the compatibility mouse events (verified in the browser: only `pointerdown`/`pointerup` arrive). Theia's document `mousedown` listeners (menu bar Alt tracking, hover service, shell mouse tracker) do not see these presses any more. Menu items still execute on `pointerup`, and via keyboard. Split handles and dock tabs suppressed `mousedown` already before, so `ApplicationShellMouseTracker` misses those presses too.

### Clicking the title of an open main menu closes it (2.10.0)

`MenuBar` now handles `pointerdown` in its document capture listener before the menu's, and stops immediate propagation, so a click on the title of the open menu closes it (open, close, open, ...), as in VS Code. With 2.7.5 Theia's `DynamicMenuWidget` closed it first and `MenuBar` reopened it, so the menu stayed open. Intended upstream behaviour, but visible to users.

### Every menu item announced as an unchecked checkbox (2.10.0)

`Menu.Renderer.createItemARIA` gives the `menuitemcheckbox` role to items that are `isToggleable || isToggled` ([jupyterlab/lumino#823](https://github.com/jupyterlab/lumino/pull/823)), and `@lumino/commands` sets `isToggleable` to `!!options.isToggled` unless a command passes it. `DynamicMenuWidget.createItems` passed `isToggled` for every command, so every item got `aria-checked="false"`. It now passes `isToggled` only for toggled items, as with 2.7.5: Theia's menu model does not know which commands can be toggled, so unchecked toggle items stay `menuitem`. `MonacoContextMenuService` passes it only for actions with `checked` defined. Covered by `browser-menu-plugin.spec.ts`; to check by hand, open the View menu and list `role` and `aria-checked` of its `.lm-Menu-item` elements.

### Menu bar overflow is disabled

`DynamicMenuBarWidget` passes `overflowMenuOptions: { isVisible: false }` because of a `RangeError` at zero width ([jupyterlab/lumino#811](https://github.com/jupyterlab/lumino/issues/811), theia#17352). 2.11.0 fixes the stale overflow index ([jupyterlab/lumino#850](https://github.com/jupyterlab/lumino/pull/850)), so the workaround can be revisited; Theia's CSS also never constrains the menu bar width, so the overflow menu would not show anyway.

### Tab width freezing on close (2.8.0) has no visible effect in Theia

Lumino freezes tab widths after a close-icon or middle-click close until the pointer leaves the tab bar (in Theia: the `contentNode`), applied in `TabBar.onUpdateRequest`. `ScrollableTabBar` and `SideTabBar` override `onUpdateRequest` without calling `super`, so no widths are frozen; on pointer leave Lumino only clears inline `width`/`flex-basis` (Theia uses `minWidth`/`maxWidth`) and toggles `lm-mod-unfreezing`.

### Theia's tabs get no `tabindex` (2.11.0)

`TabBar` now keeps one tab at `tabindex="0"` and the others at `-1`, updated in `onUpdateRequest` and on `focusin`/`focusout`. Theia's tab renderer sets no `tabindex` and its tab bars skip `super.onUpdateRequest`, so the tabs are not focusable and the `focusin` listener on the `contentNode` never fires: the tab bars cannot be reached with Tab, as with 2.7.5. Focus still ends up in the widget after clicking a tab (`restoreFocusAfterTabPress`, verified for editors).

### Tapping the close icon of a tab does nothing (2.10.0)

Since 2.10.0 a touch release on the close icon only records the close request, and the `click` that follows emits it. `ScrollableTabBar` replaces `TabBar.onBeforeAttach` to listen on the `contentNode` and only listened to the events of 2.7.5 (`pointerdown`, `dblclick`, `keydown`), so the `click` never arrived; `pointerleave` (2.8.0) and `focusin`/`focusout` (2.11.0) were missing as well. `tabEventTypes` now lists all events of `TabBar.onBeforeAttach`, `onAfterDetach` calls `super` to clear Lumino's pending close and freeze state, and `tab-bars.spec.ts` compares the events with Lumino's. Verified with Chromium touch emulation.

### Split and dock handle drags are applied per animation frame (2.11.0)

`SplitPanel` and `DockPanel` coalesce pointer moves into one `requestAnimationFrame`, adjust the sizers with the new `SplitLayout.adjustHandle` and send a `ResizeMessage` instead of an `update-request`; `update()` and `handleMoved` follow on release. `moveHandle` (used by `SplitPositionHandler`) still updates the parent. Code that reacts to an ongoing drag must listen to resizes, not update requests. Where two orthogonal handles cross, a press now drags both (`lm-mod-intersection`, `move` cursor).

Lumino only looks for crossings in orthogonal `SplitPanel` children of the panel whose handle is pressed. In the shell, the side panel handles find the bottom panel handle within 8 px, but not the other way round: the bottom split panel's children are `DockPanel`s, so a press on the bottom handle only moves the bottom panel. Both handles had `z-index: 6` and the bottom one comes later in the DOM, so it covered the side handle at the junction (2 px of it left); `split-widget.css` puts the handles of a split panel with split panel children on top (`z-index: 7`), so a press at the junction drags both. Lumino puts `lm-mod-intersection` on both handles, but only the outer one is hovered, so `view-container.css` and `dockpanel.css` highlight `.lm-mod-intersection::after` like `:hover`. Lumino clears the class on `pointerleave`, also while a handle is pressed, and `@lumino/dragdrop` causes one as soon as it captures the pointer to its cursor backdrop, so both handles lost the highlight on press. `TheiaSplitPanel.handleEvent` ignores `pointerleave` while a handle is pressed and recomputes the highlight on `pointerup` (Lumino does not); `DockPanel` (editor splits) still loses it during the drag (upstream). The same capture takes the pointer away from `TheiaSplitPanel`'s own `setPointerCapture` (#15643) right away.

### Layouts keep the DOM order equal to the layout order (2.11.0)

`SplitLayout`, `BoxLayout` and `AccordionLayout` insert new widgets after the previous section and move nodes on `moveWidget` (with the browser's `moveBefore`, so iframes keep their state). `ViewContainerLayout.attachWidget` reorders the nodes itself; that is now redundant but harmless.

### Widgets inside hidden containers report `isVisible === true`/`false` unexpectedly

`@lumino/widgets` 2.7.0 changed `isVisible` to a recursive parent check. `BaseWidget.isVisible` keeps the pre-2.7.0 flag check until #16585. (#16586)

### `TS2611` on Lumino members declared as property but implemented as accessor

See [deps/typescript](../typescript/GUIDE.md). Suppressed in `tab-bars.ts` and `view-container.ts`; check that the `@ts-expect-error` is still needed.

## Log

Newest first. One entry per merged update and target branch.

| Date | Branch | From → To | PR | Notes |
|---|---|---|---|---|
| 2026-11-26 | master | widgets 2.7.5 → 2.11.0 | #18454 | Patch removed: secondary window menus are supported upstream since 2.11.0 (jupyterlab/lumino#883). 2.10.0: `Menu`/`MenuBar` switched to pointer events, clicking an open menu title closes it, tab width freezing on close (inert in Theia), `menuitemcheckbox` role for every Theia menu item and touch close of tabs via `click` (both fixed in Theia). 2.11.0: handle drags per animation frame and two-axis drags at crossings (from the side panel handles only; highlight and junction stacking fixed in Theia), DOM order follows layout order, tab `tabindex` management, menu bar overflow fixes. Other `@lumino/*` already latest. Verified with a scripted browser smoke test and a manual test in the browser and Electron (custom and native title bar), incl. secondary windows; touch only with DevTools emulation. |
| 2026-02-26 | master | widgets 2.7.2 → 2.7.5, dragdrop | #16970 | Patch rebased; `index.min.js` not regenerated. |
| 2025-11-20 | master | widgets 2.5.0 → 2.7.2, all `@lumino/*` | #16586 | Menu bar hover fix; `BaseWidget.isVisible` kept at pre-2.7.0 behaviour (#16585). |
| 2025-03-17 | master | PhosphorJS → Lumino 2.5.0 | #14320 | Migration; secondary window patch ported from `@phosphor/widgets`; `.p-` to `.lm-` CSS. |
