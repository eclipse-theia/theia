# Changelog 2021

## v1.21.0 - 12/16/2021

[1.21.0 Milestone](https://github.com/eclipse-theia/theia/milestone/29)

- [callhierarchy] added support for the `editorHasCallHierarchyProvider` context key [#10492](https://github.com/eclipse-theia/theia/pull/10492)
- [core] `WindowService` and `ElectronMainApplication` updated to allow for asynchronous pre-exit code in `electron` [#10379](https://github.com/eclipse-theia/theia/pull/10379)
- [core] added sash option for widget resize [#10441](https://github.com/eclipse-theia/theia/pull/10441)
- [core] improved handling of close and reload events [#10379](https://github.com/eclipse-theia/theia/pull/10379)
- [core, editor, editor-preview] additional commands added to tabbar context menu for editor widgets [#10394](https://github.com/eclipse-theia/theia/pull/10394)
- [debug] added timestamps to dap traces [#10484](https://github.com/eclipse-theia/theia/pull/10484)
- [debug] refactored the debug session lifecycle [#10333](https://github.com/eclipse-theia/theia/pull/10333)
- [editor] fixed localization formatting for configuring languages [#10510](https://github.com/eclipse-theia/theia/pull/10510)
- [electron] added handling to restore last window state if it still exists [#10436](https://github.com/eclipse-theia/theia/pull/10436)
- [filesystem] fixed `createFolder` emitter for user gestures [#10460](https://github.com/eclipse-theia/theia/pull/10460)
- [markers] added support for valid range column for problem matchers [#10509](https://github.com/eclipse-theia/theia/pull/10509)
- [messages] fixed implementation for expand and collapse actions in notifications [#10471](https://github.com/eclipse-theia/theia/pull/10471)
- [mini-browser] updated `getSourceUri` to properly handle previews [#10481](https://github.com/eclipse-theia/theia/pull/10481)
- [monaco] fixed localization formatting for configuring spaces versus tabs [#10510](https://github.com/eclipse-theia/theia/pull/10510)
- [navigator] added support for symlink decorations [#10439](https://github.com/eclipse-theia/theia/pull/10439)
- [ovsx-client] added `isVersionLTE` unit tests to cover preview versions [#10530](https://github.com/eclipse-theia/theia/pull/10530)
- [plugin] added support for codicon icon references in view containers [#10491](https://github.com/eclipse-theia/theia/pull/10491)
- [plugin] added support to set theme attributes in webviews [#10493](https://github.com/eclipse-theia/theia/pull/10493)
- [plugin] fixed running plugin hosts on `electron` for `Windows` [#10518](https://github.com/eclipse-theia/theia/pull/10518)
- [preferences] updated `AbstractResourcePreferenceProvider` to handle multiple preference settings in the same tick and handle open preference files.
  It will save the file exactly once, and prompt the user if the file is dirty when a programmatic setting is attempted. [#7775](https://github.com/eclipse-theia/theia/pull/7775)
- [preferences] added support for non-string enum values in schemas [#10511](https://github.com/eclipse-theia/theia/pull/10511)
- [preferences] added support for rendering markdown descriptions [#10431](https://github.com/eclipse-theia/theia/pull/10431)
- [scripts] added Electron frontend start-up performance measurement script [#10442](https://github.com/eclipse-theia/theia/pull/10442) - Contributed on behalf of STMicroelectronics
- [task] updated `OsSpecificCommand` and `ShellSpecificOptions` so they are exportable [#10547](https://github.com/eclipse-theia/theia/pull/10547)
- [vsx-registry] updated logic to open extensions with a single-click [#10498](https://github.com/eclipse-theia/theia/pull/10498)

<a name="breaking_changes_1.21.0">[Breaking Changes:](#breaking_changes_1.21.0)</a>

- [core/shared] removed `vscode-languageserver-types`; use `vscode-languageserver-protocol` instead [#10500](https://github.com/eclipse-theia/theia/pull/10500)
- [core] added `SelectionService` as a constructor argument of `TabBarRenderer` [#10394](https://github.com/eclipse-theia/theia/pull/10394)
- [core] removed deprecated `activeChanged` signal emitter in favor of `onDidChangeActiveWidget` [#10515](https://github.com/eclipse-theia/theia/pull/10515)
- [core] removed deprecated `currentChanged` signal emitter in favor of `onDidChangeCurrentWidget` [#10515](https://github.com/eclipse-theia/theia/pull/10515)
- [core] updated `WindowService` interface considerably [#10379](https://github.com/eclipse-theia/theia/pull/10379)
  - remove `canUnload(): boolean`- it's replaced by `isSafeToShutDown(): Promise<boolean>` to allow asynchronous handling in Electron.
  - add `isSafeToShutDown()` - replaces `canUnload()`.
  - add `setSafeToShutDown()` - ensures that next close event will not be prevented.
  - add `reload()` - to allow different handling in Electron and browser.
- [editor] moved the utilities for creating and manipulating dynamic stylesheets from `editor-decoration-style.ts` to `decoration-style.ts` in `core`.
  Each namespace now has its independent stylesheet. Only one rule should exist for a given selector in the provided stylesheet. [#10441](https://github.com/eclipse-theia/theia/pull/10441)
- [plugin] changed return type of `WebviewThemeDataProvider.getActiveTheme()` to `Theme` instead of `WebviewThemeType` [#10493](https://github.com/eclipse-theia/theia/pull/10493)
- [plugin] removed the application prop `resolveSystemPlugins`, builtin plugins should now be resolved at build time [#10353](https://github.com/eclipse-theia/theia/pull/10353)
- [plugin] renamed `WebviewThemeData.activeTheme` to `activeThemeType` [#10493](https://github.com/eclipse-theia/theia/pull/10493)
- [preferences] removed `PreferenceProvider#pendingChanges` field. It was previously set unreliably and caused race conditions.
  If a `PreferenceProvider` needs a mechanism for deferring the resolution of `PreferenceProvider#setPreference`, it should implement its own system.
  See PR for example implementation in `AbstractResourcePreferenceProvider`. [#7775](https://github.com/eclipse-theia/theia/pull/7775)
- [terminal] removed deprecated `activateTerminal` method in favor of `open`. [#10529](https://github.com/eclipse-theia/theia/pull/10529)
- [webpack] Source maps for the frontend renamed from `webpack://[namespace]/[resource-filename]...` to `webpack:///[resource-path]?[loaders]` where `resource-path` is the path to
  the file relative to your application package's root [#10480](https://github.com/eclipse-theia/theia/pull/10480)

## v1.20.0 - 11/25/2021

[1.20.0 Milestone](https://github.com/eclipse-theia/theia/milestone/28)

- [application-manager] added a workaround to the upstream `electron-rebuild` bug [#10429](https://github.com/eclipse-theia/theia/pull/10429)
- [application-manager] remove unnecessary `font-awesome-webpack` dependency [#10401](https://github.com/eclipse-theia/theia/pull/10401)
- [application-manager] updated `compression-webpack-plugin` to `v9.0.0` [#10391](https://github.com/eclipse-theia/theia/pull/10391)
- [application-package] fixed `electron.isDevMode` API on Windows [#10359](https://github.com/eclipse-theia/theia/pull/10359)
- [core] added handling to disable http fallback on a successful websocket connection [#10395](https://github.com/eclipse-theia/theia/pull/10395)
- [core] added support to remove workspaces from the recently opened workspace list [#10378](https://github.com/eclipse-theia/theia/pull/10378)
- [core] fixed `runtime-import-check` errors [#10418](https://github.com/eclipse-theia/theia/pull/10418)
- [core] fixed an issue with window paths [#10226](https://github.com/eclipse-theia/theia/pull/10226)
- [core] fixed the `new window` command in the browser application [#10364](https://github.com/eclipse-theia/theia/pull/10364)
- [core] improved `Deferred` typings [#10455](https://github.com/eclipse-theia/theia/pull/10455)
- [core] simplified default vscode localizations [#10319](https://github.com/eclipse-theia/theia/pull/10319)
- [core] updated `sinon` dependency to `v12.0.0` [#10381](https://github.com/eclipse-theia/theia/pull/10381)
- [monaco] fixed visibility of selected items in the peek widget [#10307](https://github.com/eclipse-theia/theia/pull/10307)
- [navigator] added support to decorate deleted files in the open editors widget [#10361](https://github.com/eclipse-theia/theia/pull/10361)
- [plugin] fixed an issue related to `taskExecutions` not returning executions properly on startup [#10330](https://github.com/eclipse-theia/theia/pull/10330)
- [plugin] fixed an issue when calling `showInput` subsequently due to `validateInput` [#10396](https://github.com/eclipse-theia/theia/pull/10396)
- [plugin] fixed issue causing notifications to not appear [#10399](https://github.com/eclipse-theia/theia/pull/10399)
- [plugin] fixed typedoc generation for the plugin system [#10274](https://github.com/eclipse-theia/theia/pull/10274)
- [plugin] fixed visibility of inline actions when hovering tree-views [#10375](https://github.com/eclipse-theia/theia/pull/10375)
- [repo] upgraded repository `yarn.lock` [#10349](https://github.com/eclipse-theia/theia/pull/10349)
- [search-in-workspace] added functionality to preserve `find in files` history [#10438](https://github.com/eclipse-theia/theia/pull/10438)
- [search-in-workspace] added support to follow symlinks when searching [#10413](https://github.com/eclipse-theia/theia/pull/10413)
- [search-in-workspace] fixed flickering when hovering results [#10388](https://github.com/eclipse-theia/theia/pull/10388)
- [search-in-workspace] fixed issue causing the scrollbar to display without results present [#10410](https://github.com/eclipse-theia/theia/pull/10410)
- [search-in-workspace] fixed selection of results [#10371](https://github.com/eclipse-theia/theia/pull/10371)
- [task] added functionality to substitute variables in `options.env` of tasks [#10208](https://github.com/eclipse-theia/theia/pull/10208)
- [task] improved extensibility of `ProcessTaskRunner` [#10392](https://github.com/eclipse-theia/theia/pull/10392)
- [terminal] added support for the `terminal.integrated.confirmOnExit` preference [#10374](https://github.com/eclipse-theia/theia/pull/10374)
- [vsx-registry] fixed the selection of extension results [#10373](https://github.com/eclipse-theia/theia/pull/10373)

<a name="breaking_changes_1.20.0">[Breaking Changes:](#breaking_changes_1.20.0)</a>

- [core] `T` defaults to `void` if not specified when defining a `Deferred` [#10455](https://github.com/eclipse-theia/theia/pull/10455)
- [core] `value` is now not optional in `Deferred<T>.resolve(value: T)` [#10455](https://github.com/eclipse-theia/theia/pull/10455)
- [plugin] renamed `HostedPluginClient` to `PluginDevClient` [#10352](https://github.com/eclipse-theia/theia/pull/10352)
- [plugin] renamed `HostedPluginServer` to `PluginDevServer` [#10352](https://github.com/eclipse-theia/theia/pull/10352)

## v1.19.0 - 10/28/2021

[1.19.0 Milestone](https://github.com/eclipse-theia/theia/milestone/25)

- [callhierarchy] updated `callhierarchy` support [#10310](https://github.com/eclipse-theia/theia/pull/10310):
  - `prepareCallHierarchy` types brought closer to VSCode / LSP expectations.
  - optional `data` field added to `CallHierarchyItem` and related type.
- [cli] added localization extraction to the cli [#10247](https://github.com/eclipse-theia/theia/pull/10247)
- [core] added support for `window.titleBarStyle` [#10044](https://github.com/eclipse-theia/theia/pull/10044)
- [core] added support for richer tooltip overlays [#10108](https://github.com/eclipse-theia/theia/pull/10108)
- [core] added support to drag-and-drop individual sections across view containers [#9644](https://github.com/eclipse-theia/theia/pull/9644)
- [core] fixed regressions when using `svg` icons causing them not to display [#10232](https://github.com/eclipse-theia/theia/pull/10232)
- [debug] added support for `debug.confirmOnExit` [#10270](https://github.com/eclipse-theia/theia/pull/10270)
- [debug] fixed an issue preventing `.theia/launch.json` from being re-created [#10222](https://github.com/eclipse-theia/theia/pull/10222)
- [debug] fixed the restoration of the selected configuration across application restarts [#10287](https://github.com/eclipse-theia/theia/pull/10287)
- [editor] added `close editor` command to the file main-menu [#10193](https://github.com/eclipse-theia/theia/pull/10193)
- [editor] added additional commands to the `go` main-menu [#10299](https://github.com/eclipse-theia/theia/pull/10299)
- [editor] added support for the `workbench.action.files.revert` command [#10294](https://github.com/eclipse-theia/theia/pull/10294)
- [editor] updated editor tooltips to display their full path [#10238](https://github.com/eclipse-theia/theia/pull/10238)
- [eslint-plugin] added a new rule to warn against the usage of `src` imports over `lib` [#10234](https://github.com/eclipse-theia/theia/pull/10234)
- [filesystem] added better support when uploading with existing files [#10216](https://github.com/eclipse-theia/theia/pull/10216)
- [filesystem] fixed an issue causing the open dialog not to open when a workspace is deleted [#10171](https://github.com/eclipse-theia/theia/pull/10171)
- [markers] added better ordering support for markers [#9691](https://github.com/eclipse-theia/theia/pull/9691)
- [monaco] added better theming support for label colors in the action bar [#10301](https://github.com/eclipse-theia/theia/pull/10301)
- [monaco] added support for monaco editor localizations [#10084](https://github.com/eclipse-theia/theia/pull/10084)
- [monaco] fixed styling in the monaco suggestion overlay [#10241](https://github.com/eclipse-theia/theia/pull/10241)
- [ovsx-client] fixed a mismatch in the default supported api version [#10229](https://github.com/eclipse-theia/theia/pull/10229)
- [plugin-ext] added additional startup logging for plugin starting and application loading [#10116](https://github.com/eclipse-theia/theia/pull/10116) - Contributed on behalf of STMicroelectronics
- [plugin] added `LocationLink` and `Declaration` typings [#10139](https://github.com/eclipse-theia/theia/pull/10139)
- [plugin] added localization support for plugins through language packs [#10087](https://github.com/eclipse-theia/theia/pull/10087)
- [plugin] added support for `DebugAdapterNamedPipeServer` and `DebugAdapterInlineImplementation` [#10163](https://github.com/eclipse-theia/theia/pull/10163)
- [plugin] added support for descriptions in tree-views [#10253](https://github.com/eclipse-theia/theia/pull/10253)
- [plugin] aligned the behavior of the command `workbench.action.closeActiveEditor` closer to vscode [#10193](https://github.com/eclipse-theia/theia/pull/10193)
- [plugin] fixed a `webview` regression due to `postMessage` [#10336](https://github.com/eclipse-theia/theia/pull/10336)
- [plugin] fixed a potential JSON RPC error in the `quick-open` API [#10230](https://github.com/eclipse-theia/theia/pull/10230)
- [plugin] improved display of modal dialogs [#10245](https://github.com/eclipse-theia/theia/pull/10245)
- [plugin] updated api to default to vscode over theia [#10199](https://github.com/eclipse-theia/theia/pull/10199)
- [repo] added localization support for the entire framework [#10106](https://github.com/eclipse-theia/theia/pull/10106)
- [scripts] added extension impact script [#10192](https://github.com/eclipse-theia/theia/pull/10192) - Contributed on behalf of STMicroelectronics
- [scripts] added startup performance measurement script [#9777](https://github.com/eclipse-theia/theia/pull/9777) - Contributed on behalf of STMicroelectronics
- [search-in-workspace] added support for the `replace in files` command [#10242](https://github.com/eclipse-theia/theia/pull/10242)
- [task] added handling to fill task options explicitly if `problemMatchers` is set [#10166](https://github.com/eclipse-theia/theia/pull/10166)
- [task] updated duplicated task configurations from `workspace` and `folder` scopes [#10335](https://github.com/eclipse-theia/theia/pull/10335)

<a name="breaking_changes_1.19.0">[Breaking Changes:](#breaking_changes_1.19.0)</a>

- [callhierarchy][plugin] retyped `callhierarchy` methods `getRootDefinition`, `$provideRootDefinition`, `provideRootDefinition`, and `prepareCallHierarchy` to allow a return of an item or an array of items [#10310](https://github.com/eclipse-theia/theia/pull/10310)
- [core] moved `DEFAULT_WINDOW_HASH` to `common/window.ts` [#10291](https://github.com/eclipse-theia/theia/pull/10291)
- [core] moved `NewWindowOptions` to `common/window.ts` [#10291](https://github.com/eclipse-theia/theia/pull/10291)
- [core] moved `nls` localization namespace from `browser` to `common`. [#10153](https://github.com/eclipse-theia/theia/pull/10153)
- [electron] `ElectronMainMenuFactory` now inherits from `BrowserMainMenuFactory` and its methods have been renamed. [#10044](https://github.com/eclipse-theia/theia/pull/10044)
  - renamed `handleDefault` to `handleElectronDefault`
  - renamed `createContextMenu` to `createElectronContextMenu`
  - renamed `createMenuBar` to `createElectronMenuBar`
- [output] moved `output-channel` from `common` to `browser` [#10154](https://github.com/eclipse-theia/theia/pull/10154)
- [output] moved `output-preferences` from `common` to `browser` [#10154](https://github.com/eclipse-theia/theia/pull/10154)
- [ovsx-client] removed `postJson` method from `OVSXClient` [#10325](https://github.com/eclipse-theia/theia/pull/10325)
- [plugin] removed unnecessary function `getCaption` [#10253](https://github.com/eclipse-theia/theia/pull/10253)
- [view-container] updated the `ViewContainerPart` constructor to take two new parameters: `originalContainerId` and `originalContainerTitle` [#9644](https://github.com/eclipse-theia/theia/pull/9644)
  - the existing `viewContainerId` parameter has been renamed to `currentContainerId` to enable drag & drop views.
- [vsx-registry] removed `OVSXAsyncClient` [#10327](https://github.com/eclipse-theia/theia/pull/10327)
- [vsx-registry] updated `VSXEnvironment` from a class to an interface and symbol implemented in both `browser` and `node` [#10327](https://github.com/eclipse-theia/theia/pull/10327)

## v1.18.0 - 9/30/2021

[1.18.0 Milestone](https://github.com/eclipse-theia/theia/milestone/24)

- [callhierarchy] added support for `SymbolTag.Deprecated` styling when rendering nodes [#10114](https://github.com/eclipse-theia/theia/pull/10114)
- [cli] added support for downloading `.theia` plugins [#10082](https://github.com/eclipse-theia/theia/pull/10082)
- [core] added support for editor `breadcrumbs` [#9920](https://github.com/eclipse-theia/theia/pull/9920)
  - contributions to `breadcrumbs` contributions were added from `core`, `filesystem`, `outline-view` and `workspace`.
- [core] added support for sub-headings in view-container parts [#9909](https://github.com/eclipse-theia/theia/pull/9909)
- [core] added support to hide the statusbar [#10092](https://github.com/eclipse-theia/theia/pull/10092)
- [core] fixed font-size for the compact sidebar menu [#10180](https://github.com/eclipse-theia/theia/pull/10180)
- [core] updated menu separator styling with vscode [#10080](https://github.com/eclipse-theia/theia/pull/10080)
- [debug] added functionality to support `DebugVariables` navigation [#10165](https://github.com/eclipse-theia/theia/pull/10165)
- [debug] added support for dynamic debug configurations API [#10134](https://github.com/eclipse-theia/theia/pull/10134)
- [debug] fixed flickering when clicking toolbar items [#10062](https://github.com/eclipse-theia/theia/pull/10062)
- [debug] updated `DebugConfigurationManager` to wait for preferences being ready before initializing debug configurations [#10167](https://github.com/eclipse-theia/theia/pull/10167)
- [documentation] fixed broken roadmap links in publishing documentation [#9984](https://github.com/eclipse-theia/theia/pull/9984)
- [eslint-plugin] added new `runtime-import-check` rule to error when importing from folders meant for incompatible runtimes [#10124]
- [filesystem] fixed `canRead` implementation which caused false positives [#10131](https://github.com/eclipse-theia/theia/pull/10131)
- [filesystem] updated file dialog to properly apply the default filter [#10133](https://github.com/eclipse-theia/theia/pull/10133)
- [mini-browser] fixed issues when attempting open source or preview of resources [#10047](https://github.com/eclipse-theia/theia/pull/10047)
- [monaco] updated focused `quick-input` styling [#10074](https://github.com/eclipse-theia/theia/pull/10074)
- [monaco] updated the `QuickInputService` to properly pass `options` when calling `input` [#10096](https://github.com/eclipse-theia/theia/pull/10096)
- [outline-view] fixed minor documentation typo [#10071](https://github.com/eclipse-theia/theia/pull/10071)
- [plugin] added `DebugConsoleMode` enum [#10113](https://github.com/eclipse-theia/theia/pull/10113)
- [plugin] added deprecated `LanguageConfiguration` fields (`__characterPairSupport` and `__electricCharacterSupport`) [#10050](https://github.com/eclipse-theia/theia/pull/10050)
- [plugin] added functionality to allow downloads from webviews [#10064](https://github.com/eclipse-theia/theia/pull/10064)
- [plugin] added handling to avoid infinite redirect loop for webviews [#10064](https://github.com/eclipse-theia/theia/pull/10064)
- [plugin] added handling to check message source frame in webviews [#10202](https://github.com/eclipse-theia/theia/pull/10202)
- [plugin] added missing `CompletionItemKind` constants [#10123](https://github.com/eclipse-theia/theia/pull/10123)
- [plugin] added stub for `ExtensionMode` to not fail plugin activation [#10205](https://github.com/eclipse-theia/theia/pull/10205)
- [plugin] added stub for `setKeysForSync` to not fail plugin activation [#10205](https://github.com/eclipse-theia/theia/pull/10205)
- [plugin] added support for `CancellationError` [#10035](https://github.com/eclipse-theia/theia/pull/10035)
- [plugin] added support for callhierarchy `tags` [#10114](https://github.com/eclipse-theia/theia/pull/10114)
- [plugin] added support for the `vscode.openWith` command [#9881](https://github.com/eclipse-theia/theia/pull/9881)
- [plugin] added support for the `workbench.action.openWorkspaceConfigFile` command [#10039](https://github.com/eclipse-theia/theia/pull/10039)
- [plugin] fixed an issue where items in the `quick-pick` menu were not properly updated [#10065](https://github.com/eclipse-theia/theia/pull/10065)
- [plugin] fixed bug which prevented tree-searching in tree-views [#10097](https://github.com/eclipse-theia/theia/pull/10097)
- [plugin] fixed issue where `panel` location was not respected [#10162](https://github.com/eclipse-theia/theia/pull/10162)
- [plugin] update `instanceof ThemeIcon` to `is` method [#10012](https://github.com/eclipse-theia/theia/pull/10012)
- [plugin] updated `DocumentSelector` to correctly use a `ReadonlyArray` instead of `Array` [#10070](https://github.com/eclipse-theia/theia/pull/10070)
- [plugin] updated custom-editor opener to support `option` priority [#10158](https://github.com/eclipse-theia/theia/pull/10158)
- [plugin] updated the default vscode API from `1.50.0` to `1.53.2` [#9959](https://github.com/eclipse-theia/theia/pull/9959)
- [preview] fixed opening of markdown sources to align with vscode behavior [#10047](https://github.com/eclipse-theia/theia/pull/10047)
- [repo] added `dash-licenses` CI workflow to verify dependencies for 3PP FOSS license compatibility [#9953](https://github.com/eclipse-theia/theia/pull/9953)
- [repo] fixed `attach to electron frontend` debug launch configuration [#10101](https://github.com/eclipse-theia/theia/pull/10101)
- [repo] reworked and simplified build system for Theia development [#9710](https://github.com/eclipse-theia/theia/pull/9710)
- [repo] updated existing icons to `codicons` [#9864](https://github.com/eclipse-theia/theia/pull/9864)
- [scripts] added `ts-clean` script to help when performing major refactorings [#10156](https://github.com/eclipse-theia/theia/pull/10156)
- [task] updated `provideTasks` implementation similarly to vscode [#10061](https://github.com/eclipse-theia/theia/pull/10061)
- [task] updated `required` field to be optional in `TaskDefinition` for compatibility [#10015](https://github.com/eclipse-theia/theia/pull/10015)
- [terminal] added mouse support for GUI terminal applications (ex: vim) [#9805](https://github.com/eclipse-theia/theia/pull/9805)

<a name="breaking_changes_1.18.0">[Breaking Changes:](#breaking_changes_1.18.0)</a>

- [application-manager] break `rebuild` API: second argument is now an optional object instead of an optional array [#9710](https://github.com/eclipse-theia/theia/pull/9710)
- [core] `setTopPanelVisibily` renamed to `setTopPanelVisibility` [#10020](https://github.com/eclipse-theia/theia/pull/10020)
- [core] added `BreadcrumbsRendererFactory` to constructor arguments of `DockPanelRenderer` and `ToolbarAwareTabBar` [#9920](https://github.com/eclipse-theia/theia/pull/9920)
- [core] added `PreferenceService` to constructor arguments of `StatusBarImpl` [#10092](https://github.com/eclipse-theia/theia/pull/10092)
- [git] removed exports from namespace `defaultGutterStyles`, `maxWidth`, `continuationStyle`, and `highlightStyle` [#9999](https://github.com/eclipse-theia/theia/pull/9999)
- [task] `TaskDefinition.properties.required` is now optional to align with the specification [#10015](https://github.com/eclipse-theia/theia/pull/10015)

## v1.17.2 - 9/1/2021

[1.17.2 Milestone](https://github.com/eclipse-theia/theia/milestone/27)

- [core] fixed an issue which caused the top-level menu to fail to display on startup [#10034](https://github.com/eclipse-theia/theia/pull/10034)

## v1.17.1 - 8/31/2021

[1.17.1 Milestone](https://github.com/eclipse-theia/theia/milestone/26)

- [core] upgraded `inversify` to `v5.1.1` [#9979](https://github.com/eclipse-theia/theia/pull/9979)
- [electron] fixed the restoration (position and size) of windows on restart [#9995](https://github.com/eclipse-theia/theia/pull/9995)
- [electron] fixed the restoration of previous workspaces on restart [#9995](https://github.com/eclipse-theia/theia/pull/9995)
- [plugin] fixed `ThemeIcon` rendering in tree-views [#10012](https://github.com/eclipse-theia/theia/pull/10012)

## v1.17.0 - 8/26/2021

[1.17.0 Milestone](https://github.com/eclipse-theia/theia/milestone/23)

- [api-tests] added additional file-search tests [#9674](https://github.com/eclipse-theia/theia/pull/9674)
- [application-manager] updated `css-loader` dependency [#9819](https://github.com/eclipse-theia/theia/pull/9819)
- [application-manager] updated `webpack` version range [#9831](https://github.com/eclipse-theia/theia/pull/9831)
- [application-package] added support for `yarn aliases` [#9880](https://github.com/eclipse-theia/theia/pull/9880)
- [application-package] updated `deepmerge` dependency to `4.2.2` [#9405](https://github.com/eclipse-theia/theia/pull/9405)
- [cli] added the ability to declare excluded plugin ids when downloading plugins [#9956](https://github.com/eclipse-theia/theia/pull/9956)
- [cli] fixed help, argument and error handling [#9842](https://github.com/eclipse-theia/theia/pull/9842)
- [console] fixed the `selectedSession` not being properly set when first starting a debug session [#9963](https://github.com/eclipse-theia/theia/pull/9963)
- [core] added `@vscode/codicons` dependency [#9828](https://github.com/eclipse-theia/theia/pull/9828)
- [core] added functionality to disable spellcheck for input and textarea fields [#9907](https://github.com/eclipse-theia/theia/pull/9907)
- [core] added handling to prevent subsequent electron windows from overlapping [#9560](https://github.com/eclipse-theia/theia/pull/9560)
- [core] added http fallback when websockets are unavailable [#9731](https://github.com/eclipse-theia/theia/pull/9731)
- [core] added internationalization support [#9538](https://github.com/eclipse-theia/theia/pull/9538)
- [core] added support for `window.menuBarVisibility` [#9830](https://github.com/eclipse-theia/theia/pull/9830)
- [core] added support for composite tree decorations to reflect decorations from multiple providers [#9473](https://github.com/eclipse-theia/theia/pull/9473)
- [core] fixed `handleExpansionToggleDblClickEvent` binding [#9877](https://github.com/eclipse-theia/theia/pull/9877)
- [core] fixed the display of recently used items in the `quick-commands` menu [#9921](https://github.com/eclipse-theia/theia/pull/9921)
- [core] implemented `fuzzy` searching and highlighting for the quick-input [#9928](https://github.com/eclipse-theia/theia/pull/9928)
- [core] modified handling of toolbar items for `ViewContainer`s to handle `onDidChange` correctly. [#9798](https://github.com/eclipse-theia/theia/pull/9798)
- [core] updated menus to not break the layout if a referenced command is missing [#9886](https://github.com/eclipse-theia/theia/pull/9886)
- [debug] updated `DebugRequestTypes` to reflect `DAP` changes [#9833](https://github.com/eclipse-theia/theia/pull/9833)
- [documentation] added `SECURITY.md` documentation [#9804](https://github.com/eclipse-theia/theia/pull/9804)
- [documentation] introduced `migration` document to help adopters during release migrations [#9817](https://github.com/eclipse-theia/theia/pull/9817)
- [documentation] updated prerequisite documentation for `keytar` [#9807](https://github.com/eclipse-theia/theia/pull/9807)
- [dynamic-require] introduced the `dynamic-require` dev package to reduce dynamic requires for bundling [#9660](https://github.com/eclipse-theia/theia/pull/9660)
- [editor] added missing descriptions to monaco editor preferences [#9852](https://github.com/eclipse-theia/theia/pull/9852)
- [electron] added support for the `new window` command [#9519](https://github.com/eclipse-theia/theia/pull/9519)
- [file-search] fixed the display of resource paths in the `quick-file-open` menu [#9952](https://github.com/eclipse-theia/theia/pull/9952)
- [filesystem] added ability to open read-only files in electron [#9950](https://github.com/eclipse-theia/theia/pull/9950)
- [filesystem] improved `MAX_FILE_SIZE_MB` definition [#9972](https://github.com/eclipse-theia/theia/pull/9972)
- [filesystem] updated the uploading of files to use http over websockets [#9820](https://github.com/eclipse-theia/theia/pull/9820)
- [keymaps] fixed broken 'supported keys' link in readme [#9929](https://github.com/eclipse-theia/theia/pull/9929)
- [monaco] adjusted the `find-widget` font-family [#9937](https://github.com/eclipse-theia/theia/pull/9937)
- [monaco] refactored monaco interfaces behind core services [#9727](https://github.com/eclipse-theia/theia/pull/9727)
- [monaco] restored the `drop-shadow` styling for the quick-input [#9938](https://github.com/eclipse-theia/theia/pull/9938)
- [navigator] added support for opening external files by drag and dropping into the main panel [#9543](https://github.com/eclipse-theia/theia/issues/9543)
- [plugin-dev] fixed the starting of hosted plugins [#9874](https://github.com/eclipse-theia/theia/pull/9874)
- [plugin-ext] added missing `CompletionItemKind` enum values [#9908](https://github.com/eclipse-theia/theia/pull/9908)
- [plugin-ext] fixed the `selectedRepository` not being properly set in a multi-root [#9954](https://github.com/eclipse-theia/theia/pull/9954)
- [plugin-ext] improved extensibility of `PluginViewRegistry` [#9847](https://github.com/eclipse-theia/theia/pull/9847)
- [plugin-ext] updated to use correct host id for frontend hosted plugins [#9902](https://github.com/eclipse-theia/theia/pull/9902)
- [preferences] added support for `json` commands to open `settings.json` at different preference scopes [#9832](https://github.com/eclipse-theia/theia/pull/9832)
- [preferences] fixed the opening of the preferences-view [#9932](https://github.com/eclipse-theia/theia/pull/9932)
- [preferences] improved the extensibility of rebinding schemas [#9883](https://github.com/eclipse-theia/theia/pull/9883)
- [scm] added `onDidChangeCommitTemplate` event support [#9792](https://github.com/eclipse-theia/theia/pull/9792)
- [scm] fixed incorrect tree state when using the `vscode-builtin-git` plugin [#9915](https://github.com/eclipse-theia/theia/pull/9915)
- [task] introduced lock to prevent parallel task executions [#9858](https://github.com/eclipse-theia/theia/pull/9858)
- [workspace] added ability to case-sensitively rename files and folders on Windows [#9709](https://github.com/eclipse-theia/theia/pull/9709)
- [workspace] added support for url encoding [#9850](https://github.com/eclipse-theia/theia/pull/9850)

<a name="breaking_changes_1.17.0">[Breaking Changes:](#breaking_changes_1.17.0)</a>

- [core] `ViewContainerPart` methods and properties related to hiding and showing toolbar removed: `toHideToolbar`, `hideToolbar`, `showToolbar`, `toolbarHidden`. `ViewContainerPart` toolbars are now hidden or shown using CSS properties [#9935](https://github.com/eclipse-theia/theia/pull/9935)
- [core] `handleExpansionToggleDblClickEvent` in `TreeWidget` can no longer be overridden. Instead, `doHandleExpansionToggleDblClickEvent` can be overridden [#9877](https://github.com/eclipse-theia/theia/pull/9877)
- [core] moved from ES5 to ES2017 [#9436](https://github.com/eclipse-theia/theia/pull/9436) - Contributed on behalf of STMicroelectronics
- [core] registering toolbar items for commands that explicitly target a `ViewContainer` rather than a child widget may not behave as expected. Such registrations should be made in the `ViewContainer` by overriding the `updateToolbarItems` method and using the `registerToolbarItem` utility. See the modifications to the `scm` and `vsx-registry` packages in the PR for examples [#9798](https://github.com/eclipse-theia/theia/pull/9798)
  - `VSXExtensionsContribution` no longer implements `TabBarToolbarContribution` and is not bound as such. Extensions of the class that expect such behavior should reimplement it with caution. See caveats in PR.
- [core] `SidePanelHandler.addMenu` and `SidePanelHandler.removeMenu` no longer exists, instead added `addBottomMenu` and `addTopMenu` for adding menu, `removeTopMenu` and `removeBottomMenu` for removing menu [#9830](https://github.com/eclipse-theia/theia/pull/9830)
  - `SidebarBottomMenu` interface is renamed `SidebarMenu` and handles not only bottom menu's.
  - Changed style class name from `theia-sidebar-bottom-menu` to `theia-sidebar-menu`
  - `TheiaDockPanel` constructor takes a new parameter `preferences`

## v1.16.0 - 7/29/2021

[1.16.0 Milestone](https://github.com/eclipse-theia/theia/milestone/22)

- [bulk-edit] fixed incorrect border styling property [#9100](https://github.com/eclipse-theia/theia/pull/9100)
- [callhierarchy] added additional call-hierarchy support [#9681](https://github.com/eclipse-theia/theia/pull/9681)
- [core] downgraded `keytar` dependency to `7.2.0` for broader operating system compatibility [#9694](https://github.com/eclipse-theia/theia/pull/9694)
- [core] fixed `diff` labels [#9786](https://github.com/eclipse-theia/theia/pull/9786)
- [core] fixed file-tree scroll bug [#9713](https://github.com/eclipse-theia/theia/pull/9713)
- [core] updated `:focus` styling to remove `!important` rule for extensibility [#9700](https://github.com/eclipse-theia/theia/pull/9700)
- [core] updated `workbench.editor.closeOnFileDelete` default to `false` [#9720](https://github.com/eclipse-theia/theia/pull/9720)
- [core] updated expansion-toggle icon styling when selected [#9770](https://github.com/eclipse-theia/theia/pull/9770)
- [core] updated selected tree node styling [#9742](https://github.com/eclipse-theia/theia/pull/9742)
- [core] updated view-container to preserve the collapsed state of a tree-view when reloading the application [#9636](https://github.com/eclipse-theia/theia/pull/9636)
- [debug] added support for managing debug sessions for extensions from the debug panel (previously only possible using `Hosted Plugin` commands) [#8706](https://github.com/eclipse-theia/theia/pull/8706)
- [debug] added support for the `debugIcon.startForeground` color [#9759](https://github.com/eclipse-theia/theia/pull/9759)
- [debug] fixed behavior which incorrectly modifies the `settings.json` when adding debug configurations [#9719](https://github.com/eclipse-theia/theia/pull/9719)
- [debug | plugin] added `DebugSessionOptions` vscode API [#9613](https://github.com/eclipse-theia/theia/pull/9613)
- [documentation] updated `yarn` prerequisites [#9726](https://github.com/eclipse-theia/theia/pull/9726)
- [editor] added support for the `workbench.action.revertAndCloseActiveEditor` command [#9728](https://github.com/eclipse-theia/theia/pull/9728)
- [monaco] fixed quick-command separator when no recently used commands are present [#9783](https://github.com/eclipse-theia/theia/pull/9783)
- [monaco] support `in` operator for `when` clauses [#9492](https://github.com/eclipse-theia/theia/pull/9492)
- [monaco] updated styling in the peek-widget [#9725](https://github.com/eclipse-theia/theia/pull/9725)
- [monaco] upgraded `monaco` dependency to `0.23.0` [#9154](https://github.com/eclipse-theia/theia/pull/9154)
- [navigator] added support for `open editors` [#9284](https://github.com/eclipse-theia/theia/pull/9284)
- [plugin] added support `deprecated` diagnostic-tags [#9721](https://github.com/eclipse-theia/theia/pull/9721)
- [plugin] added support for searching in `tree-view` parts [#9703](https://github.com/eclipse-theia/theia/pull/9703)
- [plugin] added support for the `workbench.files.action.refreshFilesExplorer` command [#9738](https://github.com/eclipse-theia/theia/pull/9738)
- [plugin] aligned collapsible item behavior with vscode [#9696](https://github.com/eclipse-theia/theia/pull/9696)
- [plugin] fixed `TaskDto` conversion [#9740](https://github.com/eclipse-theia/theia/pull/9740)
- [plugin] fixed `is_electron` TypeError [#9730](https://github.com/eclipse-theia/theia/pull/9730)
- [plugin] fixed `stop` and `restart` for hosted-plugins [#9780](https://github.com/eclipse-theia/theia/pull/9780)
- [plugin] fixed custom-editor activation [#9671](https://github.com/eclipse-theia/theia/pull/9671)
- [plugin] fixed hosted-plugin dialog for the electron target [#9764](https://github.com/eclipse-theia/theia/pull/9764)
- [plugin] fixed incorrect `tree-view` item ordering [#9775](https://github.com/eclipse-theia/theia/pull/9775)
- [plugin] fixed webworker creating for frontend plugins [#9715](https://github.com/eclipse-theia/theia/pull/9715)
- [preferences] added additional open preferences commands [#9785](https://github.com/eclipse-theia/theia/pull/9785)
- [quality] fixed incorrect `src/` import statements [#9753](https://github.com/eclipse-theia/theia/pull/9753)
- [quality] fixed miscellaneous typos [#9753](https://github.com/eclipse-theia/theia/pull/9753)
- [repo] upgraded `yarn.lock` [#9683](https://github.com/eclipse-theia/theia/pull/9683)
- [scm] added tooltip support for resources [#9745](https://github.com/eclipse-theia/theia/pull/9745)
- [search-in-workspace] added history support in input fields [#9524](https://github.com/eclipse-theia/theia/pull/9524)
- [search-in-workspace] added support for the `expand-all` toolbar item [#9749](https://github.com/eclipse-theia/theia/pull/9749)
- [search-in-workspace] improved the search result message under different conditions [#9429](https://github.com/eclipse-theia/theia/pull/9429)
- [task] added support for deep task comparison [#9647](https://github.com/eclipse-theia/theia/pull/9647)
- [task] fixed fallback to `lastCwd` when `getCwdURI` fails [#9695](https://github.com/eclipse-theia/theia/pull/9695)
- [vsx-registry] fixed search input behavior [#9772](https://github.com/eclipse-theia/theia/pull/9772)
- [workspace] added support for multiple selections in `add folder to workspace` dialog [#9684](https://github.com/eclipse-theia/theia/pull/9684)

<a name="notable_changes_1.16.0">[Notable Changes:](#notable_changes_1.16.0)</a>

- [application-manager] defines a new range for `webpack` (`^5.36.2 <5.47.0`). `webpack@5.47.0` depends on `webpack-sources@^3.0.1` but this new version produces bogus bundles in Theia applications. The fix works by constraining the `webpack` version range to not pull newer versions for Theia v1.16.0 meaning clients creating Theia applications will not be affected by the bundling failures caused by the new dependency. The bogus library will most likely be fixed before next release (v1.17.0) so we'll need to update the `webpack` range back to pull newer versions again (bug/performance/security updates).

<a name="breaking_changes_1.16.0">[Breaking Changes:](#breaking_changes_1.16.0)</a>

- [callhierarchy] `CurrentEditorAccess` is deprecated. Use the version implemented in the `editor` package instead. The services in `call-hierarchy` that previously used the local `CurrentEditorAccess` no longer do [#9681](https://github.com/eclipse-theia/theia/pull/9681)
- [debug] `DebugSession` and `PluginDebugSession` constructors accept a `parentSession` of type `DebugSession | undefined` as their 3rd parameter, offsetting every subsequent parameter by one [#9613](https://github.com/eclipse-theia/theia/pull/9613)
- [monaco] upgraded to monaco 0.23.0 including replacement of `quickOpen` API (0.20.x) with `quickInput` API (0.23.x) [#9154](https://github.com/eclipse-theia/theia/pull/9154)
- [workspace] `WorkspaceCommandContribution.addFolderToWorkspace` no longer accepts `undefined`. `WorkspaceService.addRoot` now accepts a `URI` or a `URI[]` [#9684](https://github.com/eclipse-theia/theia/pull/9684)

## v1.15.0 - 6/30/2021

[1.15.0 Milestone](https://github.com/eclipse-theia/theia/milestone/21)

- [application-package] refined the configuration typings allowing for partial `ApplicationConfig` updates [#9568](https://github.com/eclipse-theia/theia/pull/9568)
- [core] added API to filter contributions at runtime [#9317](https://github.com/eclipse-theia/theia/pull/9317) - Contributed on behalf of STMicroelectronics
- [core] added `BackendApplicationServer` which controls how to serve frontend files [#9461](https://github.com/eclipse-theia/theia/pull/9461)
- [core] added `dompurify` as a shared dependency [#9571](https://github.com/eclipse-theia/theia/pull/9571)
- [core] added handling to gracefully kill process trees on exit [#8947](https://github.com/eclipse-theia/theia/pull/8947)
- [core] added handling to make IPC debug tracing configurable [#9602](https://github.com/eclipse-theia/theia/pull/9602)
- [core] added handling to normalize environment variables before merging [#9631](https://github.com/eclipse-theia/theia/pull/9631)
- [core] added support for `expandOnlyOnExpansionToggleClick` in `TreeProps` [#9583](https://github.com/eclipse-theia/theia/pull/9583)
- [core] added support for `resourceDirName` and `resourcePath` context keys [#9499](https://github.com/eclipse-theia/theia/pull/9499)
- [core] added support for a unique id for non-command toolbar items [#9586](https://github.com/eclipse-theia/theia/pull/9586)
- [core] fixed incorrectly wrapped disposable [#9376](https://github.com/eclipse-theia/theia/pull/9376)
- [debug] fixed handling when `supportSetVariable` is disabled [#9616](https://github.com/eclipse-theia/theia/pull/9616)
- [editor-preview] refactored `editor-preview` resolving outstanding bugs [#9518](https://github.com/eclipse-theia/theia/pull/9518)
  - rewrote `editor-preview`-package classes as extensions of `editor`-package classes
- [editor] updated logic to open last seen editor and not last created [#9542](https://github.com/eclipse-theia/theia/pull/9542)
- [file-search] added handling to preserve editor state when re-opening a closed editor [#9557](https://github.com/eclipse-theia/theia/pull/9557)
- [file-search] fixed issue with potential infinite recursion [#9635](https://github.com/eclipse-theia/theia/pull/9635)
- [file-search] updated default goto line and column `range` to `undefined` [#9529](https://github.com/eclipse-theia/theia/pull/9629)
- [filesystem] added logic to use a supplied filter by default [#9659](https://github.com/eclipse-theia/theia/pull/9659)
- [mini-browser] added handling to warn if deployed in an insecure context [#9563](https://github.com/eclipse-theia/theia/pull/9563)
- [monaco] fixed resizing of editor inputs [#9527](https://github.com/eclipse-theia/theia/pull/9527)
- [monaco] updated fetching of `onigasm wasm` to use `fetch` instead of old `AJAX` [#9620](https://github.com/eclipse-theia/theia/pull/9620)
- [outline] aligned expansion behavior of the `outline-view` with vscode [#9583](https://github.com/eclipse-theia/theia/pull/9583)
- [plugin] added `toJSON` implementation for `Range` and `Position` [#9652](https://github.com/eclipse-theia/theia/pull/9652)
- [plugin] added support for `secrets` plugin API [#9463](https://github.com/eclipse-theia/theia/pull/9463)
- [plugin] added support for prefix arguments when executing `workbench.action.quickOpen` [#9566](https://github.com/eclipse-theia/theia/pull/9566)
- [plugin] fixed `ELECTRON_RUN_AS_NODE` environment variable [#9283](https://github.com/eclipse-theia/theia/pull/9283)
- [plugin] fixed issue where tree-views would re-open after reload despite being explicitly closed [#9539](https://github.com/eclipse-theia/theia/pull/9539)
- [plugin] fixed tree-view selection [#9673](https://github.com/eclipse-theia/theia/pull/9673)
- [plugin] updated logic to transform `iconPath` to `url` [#9608](https://github.com/eclipse-theia/theia/pull/9608)
- [preferences] added handling to ensure that `WorkspacePreferenceProvider` waits for the `WorkspaceService` to be ready [#9531](https://github.com/eclipse-theia/theia/pull/9531)
- [preferences] fixed tab tracking when scrolling the preferences tree [#9549](https://github.com/eclipse-theia/theia/pull/9549)
- [preferences] refactored the `preferences-view` with major improvements to useability and performance [#9439](https://github.com/eclipse-theia/theia/pull/9439)
- [property-view] added unit-tests [#9630](https://github.com/eclipse-theia/theia/pull/9630)
- [repo] fixed `compile-references` script error message [#9667](https://github.com/eclipse-theia/theia/pull/9667)
- [repo] upgraded repository `yarn.lock` [#9536](https://github.com/eclipse-theia/theia/pull/9536)
- [search-in-workspace] fixed search debounce issue [#9579](https://github.com/eclipse-theia/theia/pull/9579)
- [vsx-registry] added support for `@builtin` and `@installed` search queries [#9572](https://github.com/eclipse-theia/theia/pull/9572)
- [vsx-registry] added support for `extensionPack` handling at buildtime [#9425](https://github.com/eclipse-theia/theia/pull/9425)
- [vsx-registry] added support for `extensions.json` functionality [#9043](https://github.com/eclipse-theia/theia/pull/9043)
- [vsx-registry] upgraded `sanitize-html` dependency [#9525](https://github.com/eclipse-theia/theia/pull/9525)
- [workspace] improved extensibility of `workspace-service` private members and methods [#9597](https://github.com/eclipse-theia/theia/pull/9597)

<a name="breaking_changes_1.15.0">[Breaking Changes:](#breaking_changes_1.15.0)</a>

- [core] added `keytar` (a native node dependency) which may require `libsecret` to be installed [#9463](https://github.com/eclipse-theia/theia/pull/9463)
  - Please see [prerequisites](https://github.com/eclipse-theia/theia/blob/master/doc/Developing.md#prerequisite_keytar) for additional information.
- [core] `outline-view-tree.ts` has been renamed to `outline-view-tree-model.ts` to match class name. [#9583](https://github.com/eclipse-theia/theia/pull/9583)
- [editor-preview] `EditorPreviewWidget` now extends `EditorWidget` and `EditorPreviewManager` extends and overrides `EditorManager`. `instanceof` checks can no longer distinguish between preview and non-preview editors; use `.isPreview` field instead. [#9518](https://github.com/eclipse-theia/theia/pull/9517)
- [process] `@theia/process/lib/node/shell-process` no longer exports `mergeProcessEnv` as a raw function. Use `@theia/core/lib/node/environment-utils` and the injectable `EnvironmentUtils` class instead.
- [process] `ShellProcess` constructor takes a new `environmentUtils` parameter to handle environment operations.
- [vsx-registry] removed support for `VSXApiVersionProvider` [#9425](https://github.com/eclipse-theia/theia/pull/9425)

## v1.14.0 - 5/27/2021

[1.14.0 Milestone](https://github.com/eclipse-theia/theia/milestone/20)

- [api-samples] fixed dynamic label example [#9517](https://github.com/eclipse-theia/theia/pull/9517)
- [application-manager] upgraded to `webpack v5` [#9451](https://github.com/eclipse-theia/theia/pull/9451)
- [core] added events to notify about websocket upgrades [#9459](https://github.com/eclipse-theia/theia/pull/9459)
- [core] added support for language-specific preferences in the frontend configuration object [#9358](https://github.com/eclipse-theia/theia/pull/9358)
- [debug] fixed `Add Configurations` command behavior when an empty `launch.json` present [#9467](https://github.com/eclipse-theia/theia/pull/9467)
- [debug] fixed issue when setting non-code breakpoints [#9479](https://github.com/eclipse-theia/theia/pull/9479)
- [file-search] added support for `goto line and column` in the file search [#9478](https://github.com/eclipse-theia/theia/pull/9478)
- [filesystem] added ability to perform a `~` substitution in the browser file dialog [#9416](https://github.com/eclipse-theia/theia/pull/9416)
- [messages] added explicit handling to sanitize notification messages before rendering [#9520](https://github.com/eclipse-theia/theia/pull/9520)
- [monaco] improved styling of the `rename` input [#9419](https://github.com/eclipse-theia/theia/pull/9419)
- [output] fixed styling issue where `errors` and `warnings` were not colored [#9496](https://github.com/eclipse-theia/theia/pull/9496)
- [plugin] added support for `extensionsUri` [#9428](https://github.com/eclipse-theia/theia/pull/9428)
- [plugin] added support for `vscode.URI` APIs [#9422](https://github.com/eclipse-theia/theia/pull/9422)
- [plugin] added support for the `hosted-plugin.launchOutFiles` preference [#9176](https://github.com/eclipse-theia/theia/pull/9176)
- [plugin] aligned `FileDecoration` API with the latest version [#8911](https://github.com/eclipse-theia/theia/pull/8911)
- [plugin] improved extensibility of `replacer` and `reviver` [#9422](https://github.com/eclipse-theia/theia/pull/9422)
- [plugin] improved support for additional submenu contributions [#9371](https://github.com/eclipse-theia/theia/pull/9371)
- [preferences] updated initial reading of preference files to before the `ready` promise resolves [#9362](https://github.com/eclipse-theia/theia/pull/9362)
- [process][terminal] fixed issue where the output of short-lived tasks are not displayed [#9409](https://github.com/eclipse-theia/theia/pull/9409)
- [quality] removed duplicate implementations of `InMemoryTextResource` [#9504](https://github.com/eclipse-theia/theia/pull/9504)
- [search-in-workspace] added ability to perform searches outside workspace by specifying `include` path [#9307](https://github.com/eclipse-theia/theia/pull/9307)
- [search-in-workspace] added support for the `search.smartCase` preference to control searching behavior [#9408](https://github.com/eclipse-theia/theia/pull/9408)
- [search-in-workspace] fixed issue when revealing a result [#9504](https://github.com/eclipse-theia/theia/pull/9504)
- [search-in-workspace] improved search behavior for additional `include`/`exclude` patterns [#9307](https://github.com/eclipse-theia/theia/pull/9307)
- [search-in-workspace] updated `search and replace` to only display diff if a replace term is present [#9516](https://github.com/eclipse-theia/theia/pull/9516)
- [terminal] fixed merging of environment variables [#9437](https://github.com/eclipse-theia/theia/pull/9437)
- [terminal] removed incorrect `process.env` from the browser environment [#9452](https://github.com/eclipse-theia/theia/pull/9452)
- [vsx-registry] added handling to sanitize readme before rendering [#9424](https://github.com/eclipse-theia/theia/pull/9424)
- [vsx-registry] updated compatibility check for vscode builtins to verify compatible version rather than engine [#9486](https://github.com/eclipse-theia/theia/pull/9486)

<a name="breaking_changes_1.14.0">[Breaking Changes:](#breaking_changes_1.14.0)</a>

- [debug] `DebugConfigurationManager` no longer `@injects()` the `FileService` and now uses `MonacoTextModelService` instead. [#9467](https://github.com/eclipse-theia/theia/pull/9467)
- [filesystem] `ReactRenderer`, `LocationListRenderer`, and `FileDialogTreeFiltersRenderer` have been made injectable/factoritized [#9416](https://github.com/eclipse-theia/theia/pull/9416)
  - `FileDialog` and its children have been updated to use property injection where appropriate and initialization inside constructor has been moved to `postConstruct`
- [vsx-registry] `VSXRegistryAPI.getLatestCompatibleVersion` now accepts `VSXSearchEntry` as a parameter [#9486](https://github.com/eclipse-theia/theia/pull/9486)

## v1.13.0 - 4/29/2021

[1.13.0 Milestone](https://github.com/eclipse-theia/theia/milestone/19)

- [console] sanitized HTML content the `ansi-console` [#9339](https://github.com/eclipse-theia/theia/pull/9339)
- [core] added `isEqual` method for `URI` [#8925](https://github.com/eclipse-theia/theia/pull/8925)
- [core] added handling to automatically reconnect websocket on offline event [#9299](https://github.com/eclipse-theia/theia/pull/9299)
- [core] added missing `useCapture` argument to `removeEventListener` [#9273](https://github.com/eclipse-theia/theia/pull/9273)
- [core] added re-export of common packages strategy [#9124](https://github.com/eclipse-theia/theia/pull/9124)
- [core] improved handling of `saveAll` by checking if a widget is dirty before saving [#9393](https://github.com/eclipse-theia/theia/pull/9393)
- [core] updated `nsfw` dependency to `^2.1.2` [#9267](https://github.com/eclipse-theia/theia/pull/9267)
- [debug] fixed hover issues for the `currentFrame` editor [#9256](https://github.com/eclipse-theia/theia/pull/9256)
- [debug] improved error messages [#9386](https://github.com/eclipse-theia/theia/pull/9386)
- [documentation] added roadmap information to the readme [#9308](https://github.com/eclipse-theia/theia/pull/9308)
- [documentation] updated pre-publishing steps [#9257](https://github.com/eclipse-theia/theia/pull/9257)
- [editor-preview] updated logic to activate editor-preview editors only if already active [#9346](https://github.com/eclipse-theia/theia/pull/9346)
- [editor] added support for `reopen closed editor` [#8925](https://github.com/eclipse-theia/theia/pull/8925)
- [editor] added support to open multiple editors for the same file [#9369](https://github.com/eclipse-theia/theia/pull/9369)
  - added `split editor` command.
  - added `split editor up` command.
  - added `split editor down` command.
  - added `split editor right` command.
  - added `split editor left` command.
  - added `split editor orthogonal` command.
- [electron] added command and keybinding for `toggle full screen` [#9399](https://github.com/eclipse-theia/theia/pull/9399)
- [getting-started] fixed the opening of external links in `electron` [#9390](https://github.com/eclipse-theia/theia/pull/9390)
- [getting-started] updated links to be keyboard operable [#9318](https://github.com/eclipse-theia/theia/pull/9318)
- [getting-started] updated links to not modify the URL hash [#9318](https://github.com/eclipse-theia/theia/pull/9318)
- [git] added handling to group context-menu by category [#9324](https://github.com/eclipse-theia/theia/pull/9324)
- [monaco] fixed regression which did not respect `setContext` [#9343](https://github.com/eclipse-theia/theia/pull/9343)
- [monaco] improved handling of themes on startup by using `indexedDB` if available [#9303](https://github.com/eclipse-theia/theia/pull/9303)
- [plugin] added `CodeActionTriggerKind` enum [#9368](https://github.com/eclipse-theia/theia/pull/94039368)
- [plugin] added handling for empty command `id` with available arguments [#9223](https://github.com/eclipse-theia/theia/pull/9223)
- [plugin] added support for the `CustomExecution` API [#9189](https://github.com/eclipse-theia/theia/pull/9189)
- [plugin] added support for the `PluginContext` API [#9276](https://github.com/eclipse-theia/theia/pull/9276)
- [plugin] added support to read `args` from `keybindings` [#9372](https://github.com/eclipse-theia/theia/pull/9372)
- [plugin] fixed dialog `canSelectMany` implementation [#9278](https://github.com/eclipse-theia/theia/pull/9278)
- [plugin] fixed handling for `.focus` view commands [#9364](https://github.com/eclipse-theia/theia/pull/9364)
- [plugin] refactored the `RPCProtocol` for quality [#8972](https://github.com/eclipse-theia/theia/pull/8972)
- [plugin] removed unnecessary coupling to `editor-preview` [#9302](https://github.com/eclipse-theia/theia/pull/9302)
- [plugin] updated `safeStringify` output error [#9223](https://github.com/eclipse-theia/theia/pull/9223)
- [preferences] added handling to properly re-render view when extensions which provide preferences are uninstalled [#9313](https://github.com/eclipse-theia/theia/pull/9313)
- [preferences] fixed `preference-array.css` styling due to typos [#9270](https://github.com/eclipse-theia/theia/pull/9270)
- [preferences] fixed regression for the preferences-view without plugin support [#9403](https://github.com/eclipse-theia/theia/pull/9403)
- [preferences] updated handling to activate the preferences-view when opened through the `OPEN_PREFERENCES` command [#9355](https://github.com/eclipse-theia/theia/pull/9355)
- [preferences] updated the formatting of preferences [#9381](https://github.com/eclipse-theia/theia/pull/9381)
- [task] added handling to update workspace model on workspace location change [#9331](https://github.com/eclipse-theia/theia/pull/9331)
- [task] added support for task presentation options [#9248](https://github.com/eclipse-theia/theia/pull/9248)
  - added support for `presentationOptions.clear`.
  - added support for `presentationOptions.echo`.
  - added support for `presentationOptions.focus`.
  - added support for `presentationOptions.panel`.
  - added support for `presentationOptions.reveal`.
  - added support for `presentationOptions.showReuseMessage`.
- [timeline] addef missing `@theia/navigator` dependency [#9267](https://github.com/eclipse-theia/theia/pull/9267)
- [vsx-registry] added `copy extension id` and `copy` commands to the extension context-menu [#9292](https://github.com/eclipse-theia/theia/pull/9292)
- [vsx-registry] added handling to preserve recently uninstalled extensions from the extensions-view until reload [#9236](https://github.com/eclipse-theia/theia/pull/9236)
- [vsx-registry] updated api compatibility handling to improve performance, and check for compatibility when installing builtins from the extensions-view [#9280](https://github.com/eclipse-theia/theia/pull/9280)
- [workspace] improved `save as...` command behavior [#9022](https://github.com/eclipse-theia/theia/pull/9022)

<a name="breaking_changes_1.13.0">[Breaking Changes:](#breaking_changes_1.13.0)</a>

- [workspace] `WorkspaceCommands.SAVE_AS` command no longer accepts an `URI` argument. It now uses the currently selected editor to determine the file to be saved [#9022](https://github.com/eclipse-theia/theia/pull/9022)

## v1.12.1 - 3/29/2021

- [core][filesystem] Use `nsfw@^2.1.2` to fix an issue on Windows where file watching did not work at all.

## v1.12.0 - 3/25/2021

[1.12.0 Milestone](https://github.com/eclipse-theia/theia/milestone/17)

- [core] added API to remove toolbar items [#9044](https://github.com/eclipse-theia/theia/pull/9044)
- [core] added `onDidChangeActiveEmitter` when a quick-pick is accepted [#9175](https://github.com/eclipse-theia/theia/pull/9175)
- [core] added support for creating lazy preference proxies [#9169](https://github.com/eclipse-theia/theia/pull/9169)
- [core] fixed `when` clause for commands registered to the command-palette [#9188](https://github.com/eclipse-theia/theia/pull/9188)
- [core] updated connection status service to prevent false positive alerts about offline mode [#9068](https://github.com/eclipse-theia/theia/pull/9068)
- [editor] fixed issue with revealing selection when opening editors [#9004](https://github.com/eclipse-theia/theia/pull/9004)
- [electron] added `folder` dialog fallback when setting `canSelectFiles` and `canSelectFolders` dialog props simultaneously on non-OSX machines [#9179](https://github.com/eclipse-theia/theia/pull/9179)
- [electron] added support for the `window.zoomLevel` preference [#9121](https://github.com/eclipse-theia/theia/pull/9121)
- [external-terminal] added new extension to spawn external terminals in electron applications [#9186](https://github.com/eclipse-theia/theia/pull/9186)
- [filesystem] added file dialog enhancements including text input and a navigate up icon [#8748](https://github.com/eclipse-theia/theia/pull/8748)
- [filesystem] added ability for downstream applications to control file-watching [#9163](https://github.com/eclipse-theia/theia/pull/9163)
- [filesystem] fixed `electron` dialogs to set the proper `defaultPath` (cwd) [#9135](https://github.com/eclipse-theia/theia/pull/9135)
- [filesystem] fixed logic when performing copy and paste in a duplicate file/folder [#9037](https://github.com/eclipse-theia/theia/pull/9037)
- [markers] added fallback `owner` sort when sorting markers for an individual resource [#9211](https://github.com/eclipse-theia/theia/pull/9211)
- [markers] fixed the marker `copy` command to correctly set the `owner` [#9160](https://github.com/eclipse-theia/theia/pull/9160)
- [mini-browser] fixed host pattern logic for `HOST_PATTERN_ENV` [#9201](https://github.com/eclipse-theia/theia/pull/9201)
- [mini-browser] fixed virtual host env logic [#9209](https://github.com/eclipse-theia/theia/pull/9209)
- [mini-browser] removed dead/unused electron-specific code for quality [#9209](https://github.com/eclipse-theia/theia/pull/9209)
- [monaco] exposed `_preview` editor from the references widget [#9245](https://github.com/eclipse-theia/theia/pull/9245)
- [monaco] fixed editor gutter size by updating `lineNumberMinChars` [#9168](https://github.com/eclipse-theia/theia/pull/9168)
- [monaco] update fallback `font-family` for the editor [#9147](https://github.com/eclipse-theia/theia/pull/9147)
- [output] fixed `registerToolbarItems` to allow async registration [#9044](https://github.com/eclipse-theia/theia/pull/9044)
- [plugin] added support for `CustomEditor` APIs [#8910](https://github.com/eclipse-theia/theia/pull/8910)
- [plugin] added support for `TaskScope.Workspace` [#9032](https://github.com/eclipse-theia/theia/pull/9032)
- [plugin] added support for `onStartupFinished` activation event [#9212](https://github.com/eclipse-theia/theia/pull/9212)
- [plugin] added support for `workbench.files.openFileFolder` command [#9213](https://github.com/eclipse-theia/theia/pull/9213)
- [plugin] added support for the `workspace.workspaceFile` API [#9132](https://github.com/eclipse-theia/theia/pull/9132)
- [plugin] fixed `when` clause for views [#9156](https://github.com/eclipse-theia/theia/pull/9156)
- [plugin] fixed custom debug request handling to pass the `body` instead of `response` object [#9131](https://github.com/eclipse-theia/theia/pull/9131)
- [plugin] fixed dialog implementation to open appropriate dialogs on browser or electron [#9179](https://github.com/eclipse-theia/theia/pull/9179)
- [plugin] fixed issue where `onDidExpandViewEmitter` was not properly fired [#9229](https://github.com/eclipse-theia/theia/pull/9229)
- [plugin] update error handling when setting storage without a workspace [#9137](https://github.com/eclipse-theia/theia/pull/9137)
- [plugin] updated `SCM` API to latest version [#9045](https://github.com/eclipse-theia/theia/pull/9045)
- [plugin] updated `vscode.window.createTerminal` to accept URI current working directories [#9140](https://github.com/eclipse-theia/theia/pull/9140)
- [preferences] added `updateValue` API for the `PreferenceService` [#9178](https://github.com/eclipse-theia/theia/pull/9178)
- [preferences] added functionality to restore the preference state including search term, preference scope, and editor location [#9166](https://github.com/eclipse-theia/theia/pull/9166)
- [property-view] added initial version of a selection-based property-view [#8655](https://github.com/eclipse-theia/theia/pull/8655)
  - A default implementation is available for file selections (via file navigator and default editors).
- [repo] enabled eslint checks for `theia.d.ts` [#9200](https://github.com/eclipse-theia/theia/pull/9200)
- [repo] updated readme 'new issue' link to point to issue templates [#9180](https://github.com/eclipse-theia/theia/pull/9180)
- [search-in-workspace] added ability to perform search when glob fields (include and exclude) are updated [#9183](https://github.com/eclipse-theia/theia/pull/9183)
- [search-in-workspace] added logic to remove search results for deleted files [#9218](https://github.com/eclipse-theia/theia/pull/9218)
- [search-in-workspace] fixed the comparison of editors when working with dirty files [#9192](https://github.com/eclipse-theia/theia/pull/9192)
- [search-in-workspace] removed usage of the deprecated `keyCode` API [#9183](https://github.com/eclipse-theia/theia/pull/9183)
- [tasks] added support for workspace-scoped task configurations. [#8917](https://github.com/eclipse-theia/theia/pull/8917)
- [terminal] fixed `xterm` addon versions which broke searching [#9167](https://github.com/eclipse-theia/theia/pull/9167)
- [variable-resolver] added support for `pathSeparator` variable substitution [#9054](https://github.com/eclipse-theia/theia/pull/9054)
- [vsx-registry] added `Install from VSIX...` command to install a local extension [#9184](https://github.com/eclipse-theia/theia/pull/9184)
- [vsx-registry] added toolbar menu support for the extensions-view [#9184](https://github.com/eclipse-theia/theia/pull/9184)
- [workspace] add support for configurations outside the `settings` object and add `WorkspaceSchemaUpdater` to allow configurations sections to be contributed by extensions [#8917](https://github.com/eclipse-theia/theia/pull/8917)

<a name="breaking_changes_1.12.0">[Breaking Changes:](#breaking_changes_1.12.0)</a>

- [core] `PreferenceService` and `PreferenceProvider` `getConfigUri` and `getContainingConfigUri` methods accept `sectionName` argument to retrieve URI's for non-settings configurations [#8917](https://github.com/eclipse-theia/theia/pull/8917)
- [filesystem] `FileDialog` and `LocationListRenderer` now require `FileService` to be passed into constructor for text-based file dialog navigation in browser [#8748](https://github.com/eclipse-theia/theia/pull/8748)
- [mini-browser] Removed `@theia/mini-browser/lib/electron-main/` and its bindings in the `electron-main` context [#9209](https://github.com/eclipse-theia/theia/pull/9209)
- [tasks] `TaskConfigurationModel.scope` field now protected. `TaskConfigurationManager` setup changed to accommodate workspace-scoped tasks [#8917](https://github.com/eclipse-theia/theia/pull/8917)
- [workspace] `WorkspaceData` interface modified and workspace file schema updated to allow for `tasks` outside of `settings` object. `WorkspaceData.buildWorkspaceData` `settings` argument now accepts an object with any of the keys of the workspace schema [#8917](https://github.com/eclipse-theia/theia/pull/8917)

## v1.11.0 - 2/25/2021

[1.11.0 Milestone](https://github.com/eclipse-theia/theia/milestone/16)

- [api-samples] added example to echo the currently supported vscode API version [#8191](https://github.com/eclipse-theia/theia/pull/8191)
- [bulk-edit] added support for previewing refactorings [#8589](https://github.com/eclipse-theia/theia/pull/8589)
- [core] fixed context-menu position when the electron application is scaled (zoom in/zoom out) [#9082](https://github.com/eclipse-theia/theia/pull/9082)
- [core] fixed keyboard shortcuts when working with devTools in the electron application [#8943](https://github.com/eclipse-theia/theia/pull/8943)
- [core] fixed tabbar-toolbar mouse event handler [#9125](https://github.com/eclipse-theia/theia/pull/9125)
- [core] fixed theming issue for secondary buttons when using light themes [#9008](https://github.com/eclipse-theia/theia/pull/9008)
- [core] updated `ProgressMessageOptions.cancelable` documentation to reflect updated default [#9033](https://github.com/eclipse-theia/theia/pull/9033)
- [core] updated the tree search-box to align with vscode [#9005](https://github.com/eclipse-theia/theia/pull/9005)
- [core] updated tree-view parts header styling [#9128](https://github.com/eclipse-theia/theia/pull/9128)
- [documentation] added documentation on how to debug plugin sources in 'developing.md' [#9018](https://github.com/eclipse-theia/theia/pull/9018)
- [documentation] fixed typo in 'developing.md' [#9092](https://github.com/eclipse-theia/theia/pull/9092)
- [editor] added `onFocusChanged` event in order to update the active editor when switching editors [#9013](https://github.com/eclipse-theia/theia/pull/9013)
- [file-search] added support for performing file searches with whitespaces [#8989](https://github.com/eclipse-theia/theia/pull/8989)
- [git] added handling to remove extraneous entries in the `scm` for nested git repositories [#7629](https://github.com/eclipse-theia/theia/pull/7629)
- [keymaps] fixed keybinding disablement and remapping [#9088](https://github.com/eclipse-theia/theia/pull/9088)
- [keymaps] fixed serialization for the `keymaps.json` file [#9088](https://github.com/eclipse-theia/theia/pull/9088)
- [markers] fixed issue when enabling/disabling problem marker tabbar decorations [#9059](https://github.com/eclipse-theia/theia/pull/9059)
- [monaco] fixed theming issue when using third-party themes [#8964](https://github.com/eclipse-theia/theia/pull/8964)
- [monaco] fixed theming issues when registering themes with null or undefined properties [#9097](https://github.com/eclipse-theia/theia/pull/9097)
- [navigator] fixed issue when dragging-and-dropping files into the main area [#8927](https://github.com/eclipse-theia/theia/pull/8927)
- [navigator] fixed issue when performing a drag-and-drop without the proper selection [#9093](https://github.com/eclipse-theia/theia/pull/9093)
- [output] generalized the `output` APIs for extensibility [#9060](https://github.com/eclipse-theia/theia/pull/9060)
- [plugin] added API stub for terminal links [#9048](https://github.com/eclipse-theia/theia/pull/9048)
- [plugin] added missing `group` property to the `TaskDTO` interface [#8971](https://github.com/eclipse-theia/theia/pull/8971)
- [plugin] added support for submenu contributions [#8996](https://github.com/eclipse-theia/theia/pull/8996)
- [plugin] extracted plugin URI generation into an injectable class [#9027](https://github.com/eclipse-theia/theia/pull/9027)
- [plugin] fixed issue where `problemMatchers` were not properly set when configuring tasks [#8971](https://github.com/eclipse-theia/theia/pull/89771)
- [plugin] fixed welcome-view empty condition [#9047](https://github.com/eclipse-theia/theia/pull/9047)
- [preferences] added a `clear-all` button in the preferences-view input for clearing search results [#9113](https://github.com/eclipse-theia/theia/pull/9133)
- [preferences] added a result count badge in the preferences-view input when performing a search [#9113](https://github.com/eclipse-theia/theia/pull/9133)
- [preferences] fixed issue when attempting to validate numeric values from the preferences-view [#9089](https://github.com/eclipse-theia/theia/pull/9089)
- [preferences] fixed the `PreferenceChangeEvent<T>` typing [#9057](https://github.com/eclipse-theia/theia/pull/9057)
- [preferences] improved overall performance of the preferences-view, including filtering and switching scopes [#8263](https://github.com/eclipse-theia/theia/pull/8263)
- [repo] updated list of builtin extensions when using the example applications [#9017](https://github.com/eclipse-theia/theia/pull/9017)
- [repo] uplifted CI/CD to use Python3 exclusively [#9085](https://github.com/eclipse-theia/theia/pull/9085)
- [search-in-workspace] fixed styling of the replace item border [#9090](https://github.com/eclipse-theia/theia/pull/9090)
- [task] updated logic to activate corresponding terminal when using the `show running tasks` action [#9016](https://github.com/eclipse-theia/theia/pull/9016)
- [vsx-registry] added API compatibility handling when installing extensions through the 'extensions-view' [#8191](https://github.com/eclipse-theia/theia/pull/8191)

<a name="breaking_changes_1.11.0">[Breaking Changes:](#breaking_changes_1.11.0)</a>

- [core] updated `SearchBox.input` field type from `HTMLInputElement` to `HTMLSpanElement` [#9005](https://github.com/eclipse-theia/theia/pull/9005)

<a name="1.11.0_user-storage_scheme_updated"></a>
-   [[user-storage]](#1.11.0_user-storage_scheme_updated) `UserStorageUri` scheme was changed from 'user_storage' to 'user-storage' as '\_' is not a valid char in scheme (according to [RFC 3986](https://tools.ietf.org/html/rfc3986#page-17)) [#9049](https://github.com/eclipse-theia/theia/pull/9049)


## v1.10.0 - 1/28/2021

- [api-samples] added example on how to contribute toggleable toolbar items [#8968](https://github.com/eclipse-theia/theia/pull/8968)
- [api-tests] fixed the `Saveable#closeOnFileDelete` integration test [#8942](https://github.com/eclipse-theia/theia/pull/8942)
- [core] added support for vscode settings schemas [#8761](https://github.com/eclipse-theia/theia/pull/8761)
- [core] added unit tests for `uri.isEqualOrParent` [#8876](https://github.com/eclipse-theia/theia/pull/8876)
- [core] fixed display issue with horizontal scrollbars in tab areas [#8898](https://github.com/eclipse-theia/theia/pull/8898)
- [core] fixed error message when a command fails to execute [#8978](https://github.com/eclipse-theia/theia/pull/8978)
- [core] fixed issue to allow late client registration [#8586](https://github.com/eclipse-theia/theia/pull/8686)
- [core] fixed issue with `TreeWidget#applyFontStyles` [#8937](https://github.com/eclipse-theia/theia/pull/8937)
- [core] fixed minor typo `mounpoint` to `mountpoint` [#8928](https://github.com/eclipse-theia/theia/pull/8928)
- [core] removed the `save without formatting` menu entry under `file` [#8877](https://github.com/eclipse-theia/theia/pull/8877)
- [core] updated rendering of toggleable toolbar items to highlight them when toggled [#8968](https://github.com/eclipse-theia/theia/pull/8968)
- [dependencies] updated to use fixed versions when publishing, `"x.y.z"` instead of `"^x.y.z"` in dependencies [#8880](https://github.com/eclipse-theia/theia/pull/8880)
- [documentation] updated `NOTICE.md` [#8957](https://github.com/eclipse-theia/theia/pull/8957)
- [filesystem] added support for the `files.trimTrailingWhitespace` preference [#8742](https://github.com/eclipse-theia/theia/pull/8742)
- [filesystem] fixed the type guard for `FileStat.is` [#8986](https://github.com/eclipse-theia/theia/pull/8986)
- [navigator] update the navigator widget factory for extensibility [#8962](https://github.com/eclipse-theia/theia/pull/8962)
- [navigator] updated the menu order for `select for compare` and `compare with selected` [#8926](https://github.com/eclipse-theia/theia/pull/8926)
- [plugin] added `createDeployQuickOpenItem` method to create `DeployQuickOpenItem` in order to make extension deploy command extensible [#8919](https://github.com/eclipse-theia/theia/pull/8919)
- [plugin] added support for `viewsWelcome` in `TreeViews` [#8678](https://github.com/eclipse-theia/theia/pull/8678)
- [plugin] added support for the `CommentThread` Plugin API [#8870](https://github.com/eclipse-theia/theia/pull/8870)
- [plugin] added support for the `workbench.action.navigateBack` command [#8958](https://github.com/eclipse-theia/theia/pull/8958)
- [plugin] added support for the `workbench.action.navigateForward` command [#8958](https://github.com/eclipse-theia/theia/pull/8958)
- [plugin] added support for the `workbench.action.navigateToLastEditLocation` command [#8958](https://github.com/eclipse-theia/theia/pull/8958)
- [plugin] fixed tree-view reveal to not invalidate item command [#8922](https://github.com/eclipse-theia/theia/pull/8922)
- [plugin] updated the logging of embedded languages [#8938](https://github.com/eclipse-theia/theia/pull/8938)
- [preview] upgraded `highlight.js` from `^9.12.2` to `10.4.1` to resolve security vulnerability [#8881](https://github.com/eclipse-theia/theia/pull/8881)
- [scm] updated code required to highlight nodes on search in the `ScmTreeWidget` [#8929](https://github.com/eclipse-theia/theia/pull/8929)
- [task] fixed issue where tasks were not successfully executed without `cwd` explicitly set [#8949](https://github.com/eclipse-theia/theia/pull/8949)
- [terminal] reduced the severity of certain terminal logs [#8908](https://github.com/eclipse-theia/theia/pull/8908)

<a name="breaking_changes_1.10.0">[Breaking Changes:](#breaking_changes_1.10.0)</a>

- [scm] added the `caption` field to the `ScmTreeWidget.Props` interface. Removed `name` from `ScmResourceComponent.Props`, `groupLabel` from `ScmResourceGroupComponent.Props`, and `path` from `ScmResourceFolderElement.Props` interfaces. [#8929](https://github.com/eclipse-theia/theia/pull/8929)
