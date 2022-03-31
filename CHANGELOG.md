# Changelog

## History

- [Previous Changelogs](https://github.com/eclipse-theia/theia/tree/master/doc/changelogs/)

## v1.24.0 - 3/31/2022

[1.24.0 Milestone](https://github.com/eclipse-theia/theia/milestone/32)

- [application-manager] fixed `expose-loader` [#10845](https://github.com/eclipse-theia/theia/pull/10845)
- [application-package] added support to configure the `defaultLocale` [#10956](https://github.com/eclipse-theia/theia/pull/10956)
- [core] added handling to ensure the active element is preserved when opening a context menu [#10852](https://github.com/eclipse-theia/theia/pull/10852)
- [core] added handling to ensure the default icon theme is applied properly [#10938](https://github.com/eclipse-theia/theia/pull/10938)
- [core] added support for pinned tabs [#10817](https://github.com/eclipse-theia/theia/pull/10817)
- [core] fixed <kbd>cmd</kbd>+`click` check on macos [#10883](https://github.com/eclipse-theia/theia/pull/10883)
- [core] fixed `socket.io` endpoint path [#10858](https://github.com/eclipse-theia/theia/pull/10858)
- [core] fixed an issue with editor preferences not being applied [#10965](https://github.com/eclipse-theia/theia/pull/10965)
- [core] fixed compression if parent is also visible [#10872](https://github.com/eclipse-theia/theia/pull/10872)
- [core] fixed handling at app shutdown [#10861](https://github.com/eclipse-theia/theia/pull/10861)
- [core] fixed missing electron custom menu [#10847](https://github.com/eclipse-theia/theia/pull/10847)
- [core] fixed tail decoration rendering for the `TreeWidget` [#10898](https://github.com/eclipse-theia/theia/pull/10898)
- [core] improved tabbar styling [#10822](https://github.com/eclipse-theia/theia/pull/10822)
- [core] updated sash visibility handling [#10941](https://github.com/eclipse-theia/theia/pull/10941)
- [core] updated type check for `TreeContainerPRops` [#10881](https://github.com/eclipse-theia/theia/pull/10881)
- [core] updated validation warning for `undefined` preference values [#10887](https://github.com/eclipse-theia/theia/pull/10887)
- [core] updated view container styling [#10854](https://github.com/eclipse-theia/theia/pull/10854)
- [debug] fixed issue where the current debug configuration was not updated [#10917](https://github.com/eclipse-theia/theia/pull/10917)
- [debug] updated `requestretry` from `v3.1.0` to `v7.0.0` [#10831](https://github.com/eclipse-theia/theia/pull/10831)
- [debug] updated debug icons and theming [#10948](https://github.com/eclipse-theia/theia/pull/10948)
- [filesystem] fixed copy/paste within the same folder [#10767](https://github.com/eclipse-theia/theia/pull/10767)
- [filesystem] fixed startup issue when restoring a large/binary file [#10900](https://github.com/eclipse-theia/theia/pull/10900)
- [keymaps] improved rendering of keybindings [#10801](https://github.com/eclipse-theia/theia/pull/10801)
- [markers] updated theming for problem markers [#10950](https://github.com/eclipse-theia/theia/pull/10950)
- [messages] added support for indeterminate progress notifications [#10945](https://github.com/eclipse-theia/theia/pull/10945)
- [monaco] fixed quick-input list styling [#10923](https://github.com/eclipse-theia/theia/pull/10923)
- [monaco] updated the translation on monaco using default keys [#10946](https://github.com/eclipse-theia/theia/pull/10946)
- [monaco] updated where the quick-input menu is attached [#10909](https://github.com/eclipse-theia/theia/pull/10909)
- [monaco] upgraded `monaco` dependency from `0.23` to ca. `0.33` (state as of VSCode 1.65.2) [#10736](https://github.com/eclipse-theia/theia/pull/10736)
- [navigator] fixed `initiallyCollapsed` option for the `'Open Editors'` [#10930](https://github.com/eclipse-theia/theia/pull/10930)
- [navigator] updated visibility of the `add folder` command [#10840]
- [playwright] fixed playwright tests for Windows and MacOS [#10826](https://github.com/eclipse-theia/theia/pull/10826) - Contributed on behalf of STMicroelectronics
- [playwright] updated tests to use `THEIA_CONFIG_DIR` [#10925](https://github.com/eclipse-theia/theia/pull/10925)
- [plugin] added `SourceFixAll` declaration [#10921](https://github.com/eclipse-theia/theia/pull/10921)
- [plugin] added `allow` attributes in webviews [#10848](https://github.com/eclipse-theia/theia/pull/10848)
- [plugin] added support for `CompletionItemLabel` VS Code API [#10929](https://github.com/eclipse-theia/theia/pull/10929)
- [plugin] added support for `DocumentSymbolProviderMetadata` [#10811](https://github.com/eclipse-theia/theia/pull/10811) - Contributed on behalf of STMicroelectronics
- [plugin] added support for `Uri.from` [#10903](https://github.com/eclipse-theia/theia/pull/10903)
- [plugin] added support for `replace` in `OutputChannel` [#10915](https://github.com/eclipse-theia/theia/pull/10915)
- [plugin] added support for `title` option for `InputBoxOptions` VS Code API [#10920](https://github.com/eclipse-theia/theia/pull/10920)
- [plugin] added support for frontend extensions in `asWebviewUri` [#10849](https://github.com/eclipse-theia/theia/pull/10849)
- [plugin] added support to render icons in tree-views on hover [#10899](https://github.com/eclipse-theia/theia/pull/10899)
- [plugin] aligned `Task.detail` with VS Code API expectations [#10905](https://github.com/eclipse-theia/theia/pull/10905)
- [plugin] aligned `breakpoint` namespace with VS Code API expectations [#10919](https://github.com/eclipse-theia/theia/pull/10919)
- [plugin] aligned `getSession` with VS Code API expectations [#10837](https://github.com/eclipse-theia/theia/pull/10837)
- [plugin] aligned `updateWorkspaceFolders` with VS Code API expectations [#10918](https://github.com/eclipse-theia/theia/pull/10918)
- [plugin] fixed error when uninstalling extensions [#10829](https://github.com/eclipse-theia/theia/pull/10829)
- [plugin] fixed plugin submenu registration [#10897](https://github.com/eclipse-theia/theia/pull/10897)
- [preferences] added support for customizable node rendering [#10766](https://github.com/eclipse-theia/theia/pull/10766)
- [preferences] fixed rendering issue of preference types [#10870](https://github.com/eclipse-theia/theia/pull/10870)
- [preferences] improved extensibility of `PreferenceContext` [#10911](https://github.com/eclipse-theia/theia/pull/10911)
- [preferences] improved preference transaction handling [#10884](https://github.com/eclipse-theia/theia/pull/10884)
- [preferences] refactored the open-handler [#10810](https://github.com/eclipse-theia/theia/pull/10810)
- [repo] performed `yarn upgrade` [#10939](https://github.com/eclipse-theia/theia/pull/10939)
- [repo] updated windows build instructions [#10862](https://github.com/eclipse-theia/theia/pull/10862)
- [search-in-workspace] added possibility to open results in editor-previews [#10839](https://github.com/eclipse-theia/theia/pull/10839)
- [vsx-registry] added handling to prevent searching with no query present [#10833](https://github.com/eclipse-theia/theia/pull/10833)
- [vsx-registry] increased query delay when searching [#10813](https://github.com/eclipse-theia/theia/pull/10813)
- [vsx-registry] updated `requestretry` from `v3.1.0` to `v7.0.0` [#10831](https://github.com/eclipse-theia/theia/pull/10831)
- [workspace] fixed `'save as'` for `untitled` schemes [#10608](https://github.com/eclipse-theia/theia/pull/10608)
- [workspace] fixed the styling of the `path` in the dialog [#10814](https://github.com/eclipse-theia/theia/pull/10814)

<a name="breaking_changes_1.24.0">[Breaking Changes:](#breaking_changes_1.24.0)</a>

- [core] removed method `attachGlobalShortcuts` from `ElectronMainApplication`. Attaching shortcuts in that way interfered with internal shortcuts. Use internal keybindings instead of global shortcuts [#10869](https://github.com/eclipse-theia/theia/pull/10869)
- [debug] the getter `model` was renamed to `getModel` and accepts an optional `URI` parameter [#10875](https://github.com/eclipse-theia/theia/pull/10875)
- [debug] The interface method `DebugService#provideDynamicDebugConfigurations` changes the return type to  `Record<string, DebugConfiguration[]>` [#10910](https://github.com/eclipse-theia/theia/pull/10910)
  This impacts the corresponding return type for `DebugConfigurationManager#provideDynamicDebugConfigurations`.
  The following functions under `plugin-api-rpc.ts#DebugExt` and in the `PluginDebugAdapterContribution` are deprecated
    * $provideDebugConfigurations
    * $resolveDebugConfigurations
    * $resolveDebugConfigurationWithSubstitutedVariablesByHandle
    The `PluginDebugAdapterContributionRegistrator` interface has been removed
- [filesystem] The `generateUniqueResourceURI` method from the `FileSystemUtils` class has an updated signature. Additionally, the method now returns a generated Uri that uses spaces as separators. The naming scheme was also changed to match VSCode. [10767](https://github.com/eclipse-theia/theia/pull/10767)
- [markers] `ProblemDecorator` reimplemented to reduce redundancy and align more closely with VSCode. `collectMarkers` now returns `Map<string, TreeDecoration.Data>`, `getOverlayIconColor` renamed to `getColor`, `getOverlayIcon` removed, `appendContainerMarkers` returns `void` [#10820](https://github.com/eclipse-theia/theia/pull/10820)
- [monaco] the following breaking changes were made in the Monaco uplift. [#10736](https://github.com/eclipse-theia/theia/pull/10736)
  - `QuickPickItem` is now only for selectable items. Use `QuickPickItemOrSeparator` when either an item or a separator is intended.
  - `editor.autoSave` preference renamed `files.autoSave` and accepts `on`, `off`, `afterDelay`, `onFocusChange`. Use `!== 'off'` to check for any active state.
  - `editor.autoSaveDelay` renamed `files.autoSaveDelay`.
  - `commandService`, `instantiationService` removed from `MonacoEditor`. Use `StandaloneServices.get(IInstantationService / ICommandService)` instead.
  - `DecorationMiniMapOptions.position`, `DecorationOverviewRulerOptions.position` no longer optional.
  - Overrides used by `MonacoEditorFactory` accept the type `EditorServiceOverrides` rather than `{[key: string]: any}`.

## v1.23.0 - 2/24/2022

[1.23.0 Milestone](https://github.com/eclipse-theia/theia/milestone/31)

- [application-manager] added `path-browserify` to polyfill path in the browser [#10745](https://github.com/eclipse-theia/theia/pull/10745)
- [application-manager] replaced `changes-stream` with `nano` [#10764](https://github.com/eclipse-theia/theia/pull/10764)
- [application-manager] upgraded `electron-rebuild` to `v3.2.7` [#10726](https://github.com/eclipse-theia/theia/pull/10726)
- [cli] added localization cli command [#10187](https://github.com/eclipse-theia/theia/pull/10187)
- [core] added better `setPreference` handling for language overrides [#10665](https://github.com/eclipse-theia/theia/pull/10665)
- [core] added handling to hide the resize sash if a container or panel is collapsed [#10561](https://github.com/eclipse-theia/theia/pull/10561)
- [core] added handling to prevent multiple save dialogs for the same resource [#10614](https://github.com/eclipse-theia/theia/pull/10614)
- [core] added support for compressed tree nodes [#10713](https://github.com/eclipse-theia/theia/pull/10713)
- [core] fixed issue to return focus to last recently active tab [#10685](https://github.com/eclipse-theia/theia/pull/10685)
- [core] updated default loading animation [#10761](https://github.com/eclipse-theia/theia/pull/10761)
- [core] updated preferences and notifications styling [#10719](https://github.com/eclipse-theia/theia/pull/10719)
- [debug] added functionality to properly handle completion and evaluations in the debug console [#10469](https://github.com/eclipse-theia/theia/pull/10469)
- [debug] fixed `debuggingForeground` theming [#10760](https://github.com/eclipse-theia/theia/pull/10760)
- [documentation] added plugin API documentation [#10695](https://github.com/eclipse-theia/theia/pull/10695)
- [electron] added support for modal dialogs [#10769](https://github.com/eclipse-theia/theia/pull/10769)
- [electron] fixed issue <kbd>ctrl</kbd>+<kbd>r</kbd> keybinding in terminals [#10704](https://github.com/eclipse-theia/theia/pull/10704)
- [file-search] improved sorting for file search results [#10694](https://github.com/eclipse-theia/theia/pull/10694)
- [git] upgraded `dugite-extra` to `v0.1.15` which supports newer Node versions [#10722](https://github.com/eclipse-theia/theia/pull/10722)
- [localization] added machine translations for 12 languages [#10782](https://github.com/eclipse-theia/theia/pull/10782)
- [monaco] updated internal themes [#10525](https://github.com/eclipse-theia/theia/pull/10525)
- [playwright] added playwright framework [#10494](https://github.com/eclipse-theia/theia/pull/10494)
- [plugin] added missing property `untitledDocumentData` for `CustomDocumentOpenContext` [#10784](https://github.com/eclipse-theia/theia/pull/10784)
- [plugin] added more detail to logging of backend and frontend start-up, especially in plugin management [#10407](https://github.com/eclipse-theia/theia/pull/10407) - Contributed on behalf of STMicroelectronics
- [plugin] added support for VS Code web extensions [#10721](https://github.com/eclipse-theia/theia/pull/10721)
- [plugin] added support for `Authentication` API at `vscode@1.63.1` [#10709](https://github.com/eclipse-theia/theia/pull/10709)
- [plugin] added support for `disabled`, `isPreferred`, and `documentation` fields for code actions [#10777](https://github.com/eclipse-theia/theia/pull/10777)
- [plugin] added support for `vscode.CodeActionProvider.resolveCodeAction` [#10730](https://github.com/eclipse-theia/theia/pull/10730) - Contributed on behalf of STMicroelectronics
- [plugin] added support for `vscode.window.createStatusBarItem` [#10754](https://github.com/eclipse-theia/theia/pull/10754) - Contributed on behalf of STMicroelectronics
- [plugin] added support to correctly expose uri for frontend modules [#10747](https://github.com/eclipse-theia/theia/pull/10747)
- [plugin] aligned `vscode.window.createTerminal` API with VS Code [#10683](https://github.com/eclipse-theia/theia/pull/10683)
- [plugin] fixed the start of pseudoterminals [#10780](https://github.com/eclipse-theia/theia/pull/10780)
- [plugin] implemented `WebviewView` API [#10705](https://github.com/eclipse-theia/theia/pull/10705)
- [plugin] implemented preliminary `Workspace Trust` API [#10473](https://github.com/eclipse-theia/theia/pull/10473)
- [preferences] added validation logic for preferences used by the editor [#10607](https://github.com/eclipse-theia/theia/pull/10607)
- [repo] added browser compound launch configuration [#10720](https://github.com/eclipse-theia/theia/pull/10720)
- [repo] removed unused dependencies [#10717](https://github.com/eclipse-theia/theia/pull/10717)
- [repo] upgraded `typescript` to `v4.5.5` [#10355](https://github.com/eclipse-theia/theia/pull/10355)
- [toolbar] added a new `@theia/toolbar` extension to contribute a global toolbar to the framework [#10731](https://github.com/eclipse-theia/theia/pull/10731)
- [workspace] added handling to ensure correct `recentworkspace.json` format and entries [#10711](https://github.com/eclipse-theia/theia/pull/10711)

<a name="breaking_changes_1.23.0">[Breaking Changes:](#breaking_changes_1.23.0)</a>

- [core] moved methods `attachReadyToShow`, `restoreMaximizedState`, `attachCloseListeners`, `handleStopRequest`, `checkSafeToStop`, `handleReload`, `reload` from `ElectronMainAPplication` into new class `TheiaElectronWindow` [#10600](https://github.com/eclipse-theia/theia/pull/10600)
- [core] removed all of our own custom HTTP Polling implementation [#10514](https://github.com/eclipse-theia/theia/pull/10514)
- [core] removed method `attachGlobalShortcuts` from `ElectronMainApplication`. Attaching shortcuts in that way interfered with internal shortcuts. Use internal keybindings instead of global shortcuts. [#10704](https://github.com/eclipse-theia/theia/pull/10704)
- [core] removed the `Event.maxListeners` field; The feature still exists but please use `Event.getMaxListeners(event)` and `Event.setMaxListeners(event, maxListeners)` instead.
- [core] replaced raw WebSocket transport with Socket.io protocol, changed internal APIs accordingly [#10514](https://github.com/eclipse-theia/theia/pull/10514)
- [electron] the `open` and `save` dialogs are now modal by default [#10769](https://github.com/eclipse-theia/theia/pull/10769)
- [plugin] deprecated `PseudoTerminalOptions`. `ExternalTerminalOptions` should be used from now on instead [#10683](https://github.com/eclipse-theia/theia/pull/10683) - Contributed on behalf of STMicroelectronics
- [plugin] function `logMeasurement` of `PluginDeployerImpl` class and browser class `HostedPluginSupport` is replaced by `measure` using the new `Stopwatch` API [#10407](https://github.com/eclipse-theia/theia/pull/10407)
- [plugin] the constructor of `BackendApplication` class no longer invokes the `initialize` method. Instead, the `@postConstruct configure` method now starts by calling `initialize` [#10407](https://github.com/eclipse-theia/theia/pull/10407)
- In order to cleanup the code base, the constructor signature of the following classes got changed in an API-breaking way [#10737](https://github.com/eclipse-theia/theia/pull/10737):
  - `ProblemWidget`
  - `FileNavigatorWidget`
  - `TerminalServer`
  - `TimelineTreeWidget`
  - `TypeHierarchyTreeWidget`

## v1.22.0 - 1/27/2022

[1.22.0 Milestone](https://github.com/eclipse-theia/theia/milestone/30)

- [cli] replaced `colors` with `chalk` [#10612](https://github.com/eclipse-theia/theia/pull/10612)
- [cli] updated `node-fetch` from `2.6.6` to `2.6.7` [#10670](https://github.com/eclipse-theia/theia/pull/10670)
- [console] fixed an issue which caused the debug console to clear at the end of a debug session [#10671](https://github.com/eclipse-theia/theia/pull/10671)
- [core] added `appearance` sub-menu to view main-menu [#10220](https://github.com/eclipse-theia/theia/pull/10220)
- [core] added functionality to properly handle localhost uris on electron [#10590](https://github.com/eclipse-theia/theia/pull/10590)
- [core] added schema support for `keymaps.json` [#10613](https://github.com/eclipse-theia/theia/pull/10613)
- [core] added support for multiple selections when triggering `open folder` [#10357](https://github.com/eclipse-theia/theia/pull/10357)
- [core] fixed an issue when `window.menuBarVisibility` is set to `compact` [#10626](https://github.com/eclipse-theia/theia/pull/10626)
- [core] fixed memory leak in `ApplicationShell#activateWidget` [#10570](https://github.com/eclipse-theia/theia/pull/10570)
- [core] updated `markdown-it` dependency from `8.4.0` to `12.3.2` [#10634](https://github.com/eclipse-theia/theia/pull/10634)
- [editor] added `editor layout` sub-menu to view main-menu [#10220](https://github.com/eclipse-theia/theia/pull/10220)
- [electron] fixed path comparison for exit confirmation [#10597](https://github.com/eclipse-theia/theia/pull/10597)
- [electron] improved electron keybinding labels [#10673](https://github.com/eclipse-theia/theia/pull/10673)
- [electron] upgraded electron to `15.3.5` [#9936](https://github.com/eclipse-theia/theia/pull/9936)
- [localization] added missing translations to filesystem, and plugin menu items [#10564](https://github.com/eclipse-theia/theia/pull/10564)
- [localization] added missing translations to navigator menu items [#10565](https://github.com/eclipse-theia/theia/pull/10656)
- [messages] fixed rendering of notification progress as html [#10588](https://github.com/eclipse-theia/theia/pull/10588)
- [monaco] fixed codicon styling in quick-inputs [#10544](https://github.com/eclipse-theia/theia/pull/10544)
- [plugin] added fix to skip extension resolution if already installed [#10624](https://github.com/eclipse-theia/theia/pull/10624)
- [plugin] added support for `PluginContext.extension` [#10650](https://github.com/eclipse-theia/theia/pull/10650)
- [plugin] added support for `PluginContext.logUri` [#10650](https://github.com/eclipse-theia/theia/pull/10650)
- [plugin] added support for the `vscode.debug.stopDebugging` API [#10638](https://github.com/eclipse-theia/theia/pull/10638)
- [plugin] aligned `vscode.debug.startDebugging` API to the latest version [#10656](https://github.com/eclipse-theia/theia/pull/10656)
- [plugin] fixed `joinPath` on Windows [#10434](https://github.com/eclipse-theia/theia/pull/10434)
- [plugin] fixed `showOpenDialog` fallback to use workspace root [#10573](https://github.com/eclipse-theia/theia/pull/10573)
- [plugin] resolved an issue with widget options when opening custom editors [#10580](https://github.com/eclipse-theia/theia/pull/10580)
- [preferences] added functionality to prevent unopened files from producing problem markers [#10562](https://github.com/eclipse-theia/theia/pull/10562)
  - `AbstractResourcePreferenceProvider` providers no longer maintain a reference to a `MonacoTextModel`.
  - This removes preference files from the Problems view unless the file is opened by the user.
- [search-in-workspace] removed unnecessary `padding-left` statement [#10623](https://github.com/eclipse-theia/theia/pull/10623)
- [task] fixed an issue that caused errors on startup if no workspace was opened [#10576](https://github.com/eclipse-theia/theia/pull/10576)
- [terminal] added support for terminal `onKey` event [#10617](https://github.com/eclipse-theia/theia/pull/10617)
- [workspace] added support for files outside the workspace when executing the command `copy relative path` [#10674](https://github.com/eclipse-theia/theia/pull/10674)
- [workspace] added support for the `workbenchState` context key [#10550](https://github.com/eclipse-theia/theia/pull/10550)
- [workspace] added the possibility of performing a permanent deletion if trash deletion fails [#10161](https://github.com/eclipse-theia/theia/pull/10151)

<a name="breaking_changes_1.22.0">[Breaking Changes:](#breaking_changes_1.22.0)</a>

- [core] `ContextKeyService` is now an interface. Extenders should extend `ContextKeyServiceDummyImpl` [#10546](https://github.com/eclipse-theia/theia/pull/10546)
- [core] removed `MarkdownRenderer` class [#10589](https://github.com/eclipse-theia/theia/pull/10589)
- [core] removed deprecated API: `unfocusSearchFieldContainer`, `doUnfocusSearchFieldContainer()` [#10625](https://github.com/eclipse-theia/theia/pull/10625)
- [electron] upgraded electron [#9936](https://github.com/eclipse-theia/theia/pull/9936) - for additional details please see the [migration guide](https://github.com/eclipse-theia/theia/blob/master/doc/Migration.md#electron-update)
- [navigator] added `Open Containing Folder` command [#10523](https://github.com/eclipse-theia/theia/pull/10523)
- [plugin-ext] `PluginDeployerImpl` now uses the `UnresolvedPluginEntry: { id: string, type: PluginType }` interface as parameter types for resolving plugins. Affected methods: `deploy`, `deployMultipleEntries` and `resolvePlugins` [#10624](https://github.com/eclipse-theia/theia/pull/10624)
- [plugin-ext] `ViewContextKeyService#with` method removed. Use `ContextKeyService#with` instead. `PluginViewWidget` and `PluginTreeWidget` inject the `ContextKeyService` rather than `ViewContextKeyService`. [#10546](https://github.com/eclipse-theia/theia/pull/10546)
- [plugin] removed deprecated fields `id` and `label` from `theia.Command` [#10512](https://github.com/eclipse-theia/theia/pull/10512)
- [preferences] `AbstractResourcePreferenceProvider#model, textModelService, workspace, messageService, acquireLocks, releaseLocks, readPreferences, singleChangeLock, transactionLock` removed. `AbstractResourcePreferenceProvider#handleDirtyEditor` moved to `PreferenceTransaction`. `AbstractResourcePreferenceProvider#getEditOperations` moved to `MonacoJSONCEditor`. [#10562](https://github.com/eclipse-theia/theia/pull/10562)
