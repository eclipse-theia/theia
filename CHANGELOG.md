# Changelog

## History

- [Previous Changelogs](https://github.com/eclipse-theia/theia/tree/master/doc/changelogs/)

## v1.39.0 - 06/29/2023

- [debug] added support for conditional exception breakpoints [#12445](https://github.com/eclipse-theia/theia/pull/12445)

<a name="breaking_changes_1.39.0">[Breaking Changes:](#breaking_changes_1.39.0)</a>

- [cli] build process has been adapted to facilitate backend bundling [#12412](https://github.com/eclipse-theia/theia/pull/12412)
    - webpack compiles frontend files now into the `lib/frontend` directory (previously `lib`)
    - the `electron-main.js` has been moved from `src-gen/frontend` to `src-gen/backend`
    - `theia rebuild` needs to run **before** `theia build` for the respective target when using a bundled backend
- [repo] with the upgrade to Inversify 6.0, a few initialization methods were adjusted. See also [this migration guide entry](https://github.com/eclipse-theia/theia/blob/master/doc/Migration.md#inversify-60). Additionally, other changes include: [#12425](https://github.com/eclipse-theia/theia/pull/12425)
  - The type expected by the `PreferenceProxySchema` symbol has been changed from `PromiseLike<PreferenceSchema>` to `() => PromiseLike<PreferenceSchema>`
  - The symbol `OnigasmPromise` has been changed to `OnigasmProvider` and injects a function of type `() => Promise<IOnigLib>`
  - The symbol `PreferenceTransactionPrelude` has been changed to `PreferenceTransactionPreludeProvider ` and injects a function of type `() => Promise<unknown>`

## v1.38.0 - 05/25/2023

- [application-manager] fixed regression preventing browser-only builds from succeeding [#12491](https://github.com/eclipse-theia/theia/pull/12491)
- [application-package] bumped the default supported VS Code API from `1.74.2` to `1.77.0` [#12516](https://github.com/eclipse-theia/theia/pull/12516)
- [core] added `open tabs` dropdown for `workbench.tab.shrinkToFit.enabled` preference [#12411](https://github.com/eclipse-theia/theia/pull/12411)
- [core] added confirmation prompt when executing `Clear Command History` [#12510](https://github.com/eclipse-theia/theia/pull/12510)
- [core] added handling to prevent concurrent access to the disk [#12236](https://github.com/eclipse-theia/theia/pull/12236)
- [core] added handling to properly dismiss quick-open menus without explicit focus [#12446](https://github.com/eclipse-theia/theia/pull/12446)
- [core] added missing theming for `hc-dark` for active borders [#12448](https://github.com/eclipse-theia/theia/pull/12448)
- [core] added support for `enablement` property for command contributions [#12483](https://github.com/eclipse-theia/theia/pull/12483)
- [core] updated JSON schema URL [#12376](https://github.com/eclipse-theia/theia/pull/12376)
- [core] updated `nls.metadata.json` for `1.77.0` [#12555](https://github.com/eclipse-theia/theia/pull/12555)
- [debug] added handling to associate root folder to dynamic debug configurations [#12482](https://github.com/eclipse-theia/theia/pull/12482)
- [debug] fixed behavior for exited threads [#12113](https://github.com/eclipse-theia/theia/pull/12113)
- [debug] fixed focus out for the debug configuration quick-open menu [#12046](https://github.com/eclipse-theia/theia/pull/12046)
- [debug] fixed incorrect debug configuration on startup [#12480](https://github.com/eclipse-theia/theia/pull/12480)
- [documentation] added resolution note for `msgpackr` [#12527](https://github.com/eclipse-theia/theia/pull/12527)
- [editor] added confirmation prompt when executing `Clear Editor History` [#12506](https://github.com/eclipse-theia/theia/pull/12506)
- [markers] improved the performance when rending markers [#12408](https://github.com/eclipse-theia/theia/pull/12408)
- [messages] added handling to properly close the toaster container when empty [#12457](https://github.com/eclipse-theia/theia/pull/12457)
- [monaco] fixed styling for the suggest list highlighting [#12317](https://github.com/eclipse-theia/theia/pull/12317)
- [plugin] added stubbing for the `ProfileContentHandler` VS Code API [#12535](https://github.com/eclipse-theia/theia/pull/12535)
- [plugin] added stubbing for the `TerminalQuickFixProvider` VS Code API [#12532](https://github.com/eclipse-theia/theia/pull/12532)
- [plugin] added stubbing for the `onWillCreateEditSessionIdentity` [#12533](https://github.com/eclipse-theia/theia/pull/12533)
- [plugin] added stubbing for the proposed `DocumentPaste` VS Code API [#12512](https://github.com/eclipse-theia/theia/pull/12512)
- [plugin] added stubbing for the proposed `EditSessionIdentityProvider` VS Code API [#12508](https://github.com/eclipse-theia/theia/pull/12508)
- [plugin] added stubbing for the proposed `ExternalUriOpener` VS Code API [#12539](https://github.com/eclipse-theia/theia/pull/12539)
- [plugin] added support for `collapse all` in tree-view toolbars [#12514](https://github.com/eclipse-theia/theia/pull/12514)
- [plugin] added support for the `TelemetryLogger` VS Code API [#12453](https://github.com/eclipse-theia/theia/pull/12453)
- [plugin] fixed `TreeView#reveal` behavior [#12489](https://github.com/eclipse-theia/theia/pull/12489)
- [plugin] fixed tab indices logic when moving or closing tabs [#12400](https://github.com/eclipse-theia/theia/pull/12400)
- [repo] upgraded `engine.io` to fix a known vulnerability [#12556](https://github.com/eclipse-theia/theia/pull/12556)
- [repo] upgraded `socket.io-parser` to fix a known vulnerability [#12556](https://github.com/eclipse-theia/theia/pull/12556)
- [scripts] improved `dash-licenses` to handle internal errors [#12545](https://github.com/eclipse-theia/theia/pull/12545)
- [search-in-workspace] added multiselect support in the view [#12331](https://github.com/eclipse-theia/theia/pull/12331)
- [task] improved user-experience when configuring and running tasks [#12507](https://github.com/eclipse-theia/theia/pull/12507)
- [workspace] added exception handling for `WorkspaceDeleteHandler` [#12544](https://github.com/eclipse-theia/theia/pull/12544)
- [workspace] improved behavior of `open workspace` and `open folder` [#12537](https://github.com/eclipse-theia/theia/pull/12537)

<a name="breaking_changes_1.38.0">[Breaking Changes:](#breaking_changes_1.38.0)</a>

- [core] moved `ToolbarAwareTabBar.Styles` to `ScrollableTabBar.Styles` [#12411](https://github.com/eclipse-theia/theia/pull/12411/)
- [debug] changed the return type of `DebugConfigurationManager.provideDynamicDebugConfigurations()` to `Promise<Record<string, DynamicDebugConfigurationSessionOptions[]>>` [#12482](https://github.com/eclipse-theia/theia/pull/12482)
- [workspace] removed `WorkspaceFrontendContribution.createOpenWorkspaceOpenFileDialogProps(...)` and `WorkspaceFrontendContribution.preferences` [#12537](https://github.com/eclipse-theia/theia/pull/12537)

## v1.37.0 - 04/27/2023

- [application-package] bumped the default supported VS Code API from `1.72.2` to `1.74.2` [#12468](https://github.com/eclipse-theia/theia/pull/12468)
- [cli] added support for `${targetPlatform}` when declaring URLs for plugins [#12410](https://github.com/eclipse-theia/theia/pull/12410)
- [core] added support for a dynamic tab resizing strategy (controlled by `workbench.tab.shrinkToFit.enabled`) [#12360](https://github.com/eclipse-theia/theia/pull/12360)
- [core] added support for enhanced `tabbar` previews on hover [#12350](https://github.com/eclipse-theia/theia/pull/12350)
- [core] added support for localizations using VS Code's `l10n` [#12192](https://github.com/eclipse-theia/theia/pull/12192)
- [core] added support for pushing a large number of items in tree iterators [#12172](https://github.com/eclipse-theia/theia/pull/12172)
- [core] added theming support for `highlightModifiedTabs` [#12367](https://github.com/eclipse-theia/theia/pull/12367)
- [core] fixed an issue where the `theia-file-icons` theme was not always applied [#12419](https://github.com/eclipse-theia/theia/pull/12419)
- [core] fixed right-click behavior in trees due to padding [#12436](https://github.com/eclipse-theia/theia/pull/12436)
- [core] replaced `request` with `@theia/request` [#12413](https://github.com/eclipse-theia/theia/pull/12413)
- [debug] fixed an issue where `getTrackableWidgets` did not return the right result [#12241](https://github.com/eclipse-theia/theia/pull/12241)
- [electron] upgraded `electron` to `23.2.4` [#12464](https://github.com/eclipse-theia/theia/pull/12464)
- [keymaps] improved search when searching for keybindings [#12312](https://github.com/eclipse-theia/theia/pull/12312)
- [monaco] added missing localizations [#12378](https://github.com/eclipse-theia/theia/pull/12378)
- [monaco] added support for the `inQuickOpen` when-clause context [#12427](https://github.com/eclipse-theia/theia/pull/12427)
- [monaco] fixed `parseSnippets` handling [#12463](https://github.com/eclipse-theia/theia/pull/12463)
- [monaco] fixed `Save As...` limit [#12418](https://github.com/eclipse-theia/theia/pull/12418)
- [playwright] added a page object for terminals [#12381](https://github.com/eclipse-theia/theia/pull/12381)
- [playwright] upgraded `playwright` to latest version [#12384](https://github.com/eclipse-theia/theia/pull/12384)
- [plugin] added error feedback when invoking the `vscode.open` command [#12284](https://github.com/eclipse-theia/theia/pull/12284)
- [plugin] added handling to ensure unique tree-view IDs [#12338](https://github.com/eclipse-theia/theia/pull/12338)
- [plugin] added handling to use `TaskScope.Workspace` as a default when no `scope` is provided [#12431](https://github.com/eclipse-theia/theia/pull/12431)
- [plugin] added stubbing for the `TestRunProfile#supportsContinuousRun` VS Code API [#12456](https://github.com/eclipse-theia/theia/pull/12456)
- [plugin] added support for the `CommentThread#state` VS Code API [#12454](https://github.com/eclipse-theia/theia/pull/12454)
- [plugin] added support for the `onTaskType` when-clause context [#12431](https://github.com/eclipse-theia/theia/pull/12431)
- [plugin] fixed check for presence of files in drag-and-drop [#12409](https://github.com/eclipse-theia/theia/pull/12409)
- [plugin] fixed memory leak in tree-views [#12353](https://github.com/eclipse-theia/theia/pull/12353)
- [plugin] implemented the VS Code `LogOutputChannel` API [#12017](https://github.com/eclipse-theia/theia/pull/12429) - Contributed on behalf of STMicroelectronics
- [preferences] improved localizations for preferences [#12378](https://github.com/eclipse-theia/theia/pull/12378)
- [search-in-workspace] added missing placeholder for glob input fields [#12389](https://github.com/eclipse-theia/theia/pull/12389)
- [search-in-workspace] fixed `patternExcludesInputBoxFocus` when-clause handler [#12385](https://github.com/eclipse-theia/theia/pull/12385)

<a name="breaking_changes_1.37.0">[Breaking Changes:](#breaking_changes_1.37.0)</a>

- [core] injected `CorePreferences` into `DockPanelRenderer` constructor [12360](https://github.com/eclipse-theia/theia/pull/12360)
- [core] introduced `ScrollableTabBar.updateTabs()` to fully render tabs [12360](https://github.com/eclipse-theia/theia/pull/12360)
- [plugin] changed visibility from `private` to `protected` for member `proxy` and function `validate()` in `output-channel-item.ts` [#12017](https://github.com/eclipse-theia/theia/pull/12429)
- [plugin] removed enum `LogLevel` and namespace `env` from `plugin/src/theia-proposed.d.ts` [#12017](https://github.com/eclipse-theia/theia/pull/12429)

## v1.36.0 0 - 03/30/2023

- [application-manager] upgraded `webpack` to `5.76.0` [#12316](https://github.com/eclipse-theia/theia/pull/12316)
- [cli] updated `puppeteer` version [#12222](https://github.com/eclipse-theia/theia/pull/12222)
- [core] added fallback to `applicationName` for the application window [#12265](https://github.com/eclipse-theia/theia/pull/12265)
- [core] added support for `placeholder` in `SingleTextInputDialog` [#12244](https://github.com/eclipse-theia/theia/pull/12244)
- [core] fixed `waitForHidden` method implementation to properly check visibility [#12300](https://github.com/eclipse-theia/theia/pull/12300)
- [core] fixed handling when rendering preferences according to the schema [#12347](https://github.com/eclipse-theia/theia/pull/12347)
- [core] fixed issue with the rendering of toolbar items with when clauses [#12329](https://github.com/eclipse-theia/theia/pull/12329)
- [core] fixed tabbar rendering when items are present [#12307](https://github.com/eclipse-theia/theia/pull/12307)
- [core] fixed the `merge` of debug configurations [#12174](https://github.com/eclipse-theia/theia/pull/12174)
- [core] refined typings for `isObject<T>` [#12259](https://github.com/eclipse-theia/theia/pull/12259)
- [core] updated styling of dialogs [#12254](https://github.com/eclipse-theia/theia/pull/12254)
- [debug] added suppression support for the `DebugSessionOptions` VS Code API [#12220](https://github.com/eclipse-theia/theia/pull/12220)
- [debug] improved breakpoint decoration rendering [#12249](https://github.com/eclipse-theia/theia/pull/12249)
- [file-search] updated handling when a file is not found [#12255](https://github.com/eclipse-theia/theia/pull/12255)
- [monaco] fixed incorrect range in `MonacoOutlineContribution` [#12306](https://github.com/eclipse-theia/theia/pull/12306)
- [monaco] fixed issue preventing the first element in a quick-input from being selected initially [#12208](https://github.com/eclipse-theia/theia/pull/12208)
- [outline-view] added "expand-all" toolbar item [#12188](https://github.com/eclipse-theia/theia/pull/12188)
- [plugin] added handling to ensure uniqueness of tree node ids [#12120](https://github.com/eclipse-theia/theia/pull/12120)
- [plugin] added proper handling for `OnEnterRule` [#12228](https://github.com/eclipse-theia/theia/pull/12228)
- [plugin] added stubbing of the proposed `extensions.allAcrossExtensionHosts` VS Code API [#12277](https://github.com/eclipse-theia/theia/pull/12277)
- [plugin] added support for the `TerminalExitReason` VS Code API [#12293](https://github.com/eclipse-theia/theia/pull/12293)
- [plugin] added support for the `ViewBadge` VS Code API [#12330](https://github.com/eclipse-theia/theia/pull/12330)
- [plugin] bumped the default supported API to `1.72.2` [#12359](https://github.com/eclipse-theia/theia/pull/12359)
- [plugin] fixed issue which caused the loss of file watching events [#12264](https://github.com/eclipse-theia/theia/pull/12264)
- [plugin] fixed issue with `PseudoTerminal` events [#12146](https://github.com/eclipse-theia/theia/pull/12146)
- [plugin] fixed plugin proxy support [#12266](https://github.com/eclipse-theia/theia/pull/12266)
- [plugin] fixed recursion when setting webview title [#12221](https://github.com/eclipse-theia/theia/pull/12221)
- [plugin] reduced plugging logging level to debug [#12224](https://github.com/eclipse-theia/theia/pull/12224)
- [scm] fixed inline toolbar command execution [#12295](https://github.com/eclipse-theia/theia/pull/12295)
- [terminal] added support for context-menus in terminals [#12326](https://github.com/eclipse-theia/theia/pull/12326)
- [terminal] fixed issue causing new terminals to not spawn without a workspace present [#12322](https://github.com/eclipse-theia/theia/pull/12322)
- [terminal] fixed terminal creation when spawning multiple terminals quickly [#12225](https://github.com/eclipse-theia/theia/pull/12225)
- [toolbar] fixed `dragOver` behavior in toolbars [#12257](https://github.com/eclipse-theia/theia/pull/12257)
- [workspace] simplified `add folder` and `remove folder` command implementations [#12242](https://github.com/eclipse-theia/theia/pull/12242)
- [workspace] updated the `rename` command to return the `stat` when successful [#12278](https://github.com/eclipse-theia/theia/pull/12278)

<a name="breaking_changes_1.36.0">[Breaking Changes:](#breaking_changes_1.36.0)</a>

- [core] changed default icon theme from `none` to `theia-file-icons` [#11028](https://github.com/eclipse-theia/theia/pull/12346)
- [plugin] renamed `TreeViewExtImpl#toTreeItem()` to `TreeViewExtImpl#toTreeElement()`
- [scm] fixed `scm` inline toolbar commands, the changes introduces the following breakage: [#12295](https://github.com/eclipse-theia/theia/pull/12295)
    - Interface `ScmInlineAction` removes `commands: CommandRegistry`
    - Interface `ScmInlineActions` removes `commands: CommandRegistry`
    - Interface `ScmTreeWidget.Props` removes `commands: CommandRegistry`
- [terminal] removed `openTerminalFromProfile` method from `TerminalFrontendContribution` [#12322](https://github.com/eclipse-theia/theia/pull/12322)
- [electron] enabled context isolation and disabled node integration in Electron renderer (https://github.com/eclipse-theia/theia/issues/2018)

## v1.35.0 - 02/23/2023

- [application-package] updated default supported VS Code API to `1.70.1` [#12200](https://github.com/eclipse-theia/theia/pull/12200)
- [core] added handling on shutdown when dirty editors are present [#12166](https://github.com/eclipse-theia/theia/pull/12166)
- [core] fixed `ToolbarItem.when` handling [#12067](https://github.com/eclipse-theia/theia/pull/12067)
- [core] fixed styling of view titles with toolbar items [#12077](https://github.com/eclipse-theia/theia/pull/12077)
- [core] implemented `workbench.editor.revealIfOpen` preference [#12145](https://github.com/eclipse-theia/theia/pull/12145)
- [core] improved styling for tree and select component outlines [#12156](https://github.com/eclipse-theia/theia/pull/12156)
- [core] updated localizations to VS Code `1.70.2` [#12205](https://github.com/eclipse-theia/theia/pull/12205)
- [debug] added localizations for the debug level selector [#12033](https://github.com/eclipse-theia/theia/pull/12033)
- [debug] fixed handling of for breakpoint events when metadata is updated [#12183](https://github.com/eclipse-theia/theia/pull/12183)
- [debug] fixed instruction breakpoints in `DebugSession` [#12190](https://github.com/eclipse-theia/theia/pull/12190)
- [debug] removed unnecessary "download debug adapters" script [#12150](https://github.com/eclipse-theia/theia/pull/12150)
- [editor] added handling for closing duplicate editors on the same tabbar [#12147](https://github.com/eclipse-theia/theia/pull/12147)
- [filesystem] added option to toggle hidden files/folders in the file dialog [#12179](https://github.com/eclipse-theia/theia/pull/12179)
- [filesystem] fixed memory leak in `NsfwWatcher` [#12144](https://github.com/eclipse-theia/theia/pull/12144)
- [filesystem] upgrades trash from `6.1.1` to `7.2.0` [#12133](https://github.com/eclipse-theia/theia/pull/12133)
- [navigator] updated restoration handling for open-editors [#12210](https://github.com/eclipse-theia/theia/pull/12210)
- [playwright] upgraded `@playwright/test` dependency to `1.30.0` [#12141](https://github.com/eclipse-theia/theia/pull/12141)
- [plugin] added ability to generate activation events automatically [#12167](https://github.com/eclipse-theia/theia/pull/12167)
- [plugin] added handling for plugins to access language overrides with bracket syntax [#12136](https://github.com/eclipse-theia/theia/pull/12136)
- [plugin] added support for `DocumentDropEditProvider` [#12125](https://github.com/eclipse-theia/theia/pull/12125)
- [plugin] added support for the `activeWebviewPanelId` context when-clause [#12182](https://github.com/eclipse-theia/theia/pull/12182)
- [plugin] exposed terminal commands to plugins [#12134](https://github.com/eclipse-theia/theia/pull/12134)
- [plugin] fixed focus issue for modal notifications [#12206](https://github.com/eclipse-theia/theia/pull/12206)
- [plugin] implemented the VS Code `Tab` API [#12109](https://github.com/eclipse-theia/theia/pull/12109)
- [plugin] implemented the `WorkspaceEditMetadata` VS Code API [#12193](https://github.com/eclipse-theia/theia/pull/12193)
- [plugin] updated restoration handling when a `Webview` does not implement `WebviewPanelSerializer` [#12138](https://github.com/eclipse-theia/theia/pull/12138)
- [repo] fixed API integration test suite [#12117](https://github.com/eclipse-theia/theia/pull/12117)
- [scripts] fixed comparison when compiling package references [#12122](https://github.com/eclipse-theia/theia/pull/12122)
- [terminal] added support for multi-root workspaces in terminal profiles [#12199](https://github.com/eclipse-theia/theia/pull/12199)
- [terminal] fixed issue when no default terminal profile is set on startup [#12191](https://github.com/eclipse-theia/theia/pull/12191)
- [workspace] added handling to ensure uniqueness of roots [#12159](https://github.com/eclipse-theia/theia/pull/12159)
- [workspace] updated styling for input dialogs [#12158](https://github.com/eclipse-theia/theia/pull/12158)

<a name="breaking_changes_1.35.0">[Breaking Changes:](#breaking_changes_1.35.0)</a>

- [repo] drop support for `Node 14` [#12169](https://github.com/eclipse-theia/theia/pull/12169)

## v1.34.0 - 01/26/2023

- [application-package] bumped the default supported API version from `1.55.2` to `1.66.2` [#12104](https://github.com/eclipse-theia/theia/pull/12104)
- [cli] added ability to use client side rate limiting when download plugins [#11962](https://github.com/eclipse-theia/theia/pull/11962)
- [core] improved display of dialogs with a lot of content [#12052](https://github.com/eclipse-theia/theia/pull/12052)
- [core] improved extensibility of the "uncaught error" handler in the `BackendApplication` [#12068](https://github.com/eclipse-theia/theia/pull/12068)
- [core] improved styling of the `select-dropdown` component when content overflows [#12038](https://github.com/eclipse-theia/theia/pull/12038)
- [core] refactored to use `fsPath` for the `COPY_PATH` command [#12002](https://github.com/eclipse-theia/theia/pull/12002)
- [core] updated `nsfw` from `2.1.2` to `2.2.4` [#11975](https://github.com/eclipse-theia/theia/pull/11975)
- [core] updated `vscode-languageserver-protocol` from `3.15.3` to `3.17.2` [#12012](https://github.com/eclipse-theia/theia/pull/12012)
- [debug] fixed numerous issues related to debugging [#11984](https://github.com/eclipse-theia/theia/pull/11984)
- [debug] fixed styling of the hover widget when content overflows [#12058](https://github.com/eclipse-theia/theia/pull/12058)
- [debug] fixed styling of variables in the view [#12089](https://github.com/eclipse-theia/theia/pull/12089)
- [filesystem] added missing localization for the "preparing download" message [#12041](https://github.com/eclipse-theia/theia/pull/12041)
- [filesystem] added missing localization for the deleted tab suffix [#12032](https://github.com/eclipse-theia/theia/pull/12032)
- [filesystem] updated styling for children of root nodes to include additional depth padding [#11967](https://github.com/eclipse-theia/theia/pull/11967)
- [filesystem] updated visibility of the `UPLOAD` command [#11756](https://github.com/eclipse-theia/theia/pull/11756)
- [getting-started] fixed an issue where the getting-started widget did not accept focus [#11807](https://github.com/eclipse-theia/theia/pull/11807)
- [memory-view] updating handling when variable requests fail [#11928](https://github.com/eclipse-theia/theia/pull/11928)
- [monaco] improved the responsiveness of quick-input menus [#12095](https://github.com/eclipse-theia/theia/pull/12095)
- [navigator] added the `OPEN_CONTAINING_FOLDER` command to the tab context-menu [#12076](https://github.com/eclipse-theia/theia/pull/12076)
- [plugin] added full support for the `Diagnostic.code` API [#11765](https://github.com/eclipse-theia/theia/pull/11765)
- [plugin] added handling for top-level preference access [#12056](https://github.com/eclipse-theia/theia/pull/12056)
- [plugin] added partial support for `iconPath` and `color` in the `TerminalOptions` and `ExtensionTerminalOptions` VS Code API [#12060](https://github.com/eclipse-theia/theia/pull/12060)
- [plugin] added stubbing of `tab`-related VS Code APIs [#12031](https://github.com/eclipse-theia/theia/pull/12031)
- [plugin] added support `valueSelection` for the `InputBox` VS Code API [#12050](https://github.com/eclipse-theia/theia/pull/12050)
- [plugin] added support for `RefactorMove` in the `CodeActionKind` VS Code API [#12039](https://github.com/eclipse-theia/theia/pull/12039)
- [plugin] added support for `enabled` in the `SourceControlInputBox` VS Code API [#12069](https://github.com/eclipse-theia/theia/pull/12069)
- [plugin] added support for `isTransient` in the `TerminalOptions` and `ExternalTerminalOptions` VS Code APIs [#12055](https://github.com/eclipse-theia/theia/pull/12055) - Contributed on behalf of STMicroelectronics
- [plugin] added support for `location` in the `TerminalOptions` VS Code API [#12006](https://github.com/eclipse-theia/theia/pull/12006)
- [plugin] added support for `timestamp` in the `Comment` VS Code API [#12007](https://github.com/eclipse-theia/theia/pull/12007)
- [plugin] added support for multi-selection in tree-views [#12088](https://github.com/eclipse-theia/theia/pull/12088)
- [plugin] added support for the `DataTransfer` VS Code API [#12065](https://github.com/eclipse-theia/theia/pull/12065)
- [plugin] added support for the `SnippetTextEdit` VS Code API [#12047](https://github.com/eclipse-theia/theia/pull/12047)
- [plugin] added support for the `TerminalProfile` VS Code API [#12066](https://github.com/eclipse-theia/theia/pull/12066)
- [plugin] added support for the `TreeDragAndDropController` VS Code API [#12065](https://github.com/eclipse-theia/theia/pull/12065)
- [plugin] fixed `WebView` CORS handling for `vscode-resource` [#12070](https://github.com/eclipse-theia/theia/pull/12070)
- [plugin] fixed `WebView` VS Code API inconsistencies [#12091](https://github.com/eclipse-theia/theia/pull/12091) - Contributed on behalf of STMicroelectronics
- [plugin] fixed regression when starting pseudoterminals [#12098](https://github.com/eclipse-theia/theia/pull/12098)
- [repo] added missing localizations in dialogs [#12062](https://github.com/eclipse-theia/theia/pull/12062)
- [repo] added simplified type checking for objects [#11831](https://github.com/eclipse-theia/theia/pull/11831)
- [repo] updated default localizations to `1.68.1` [#12092](https://github.com/eclipse-theia/theia/pull/12092)
- [scm] added support for `strikethrough` decorations contributed by the `SourceControlResourceDecorations` VS Code API [#11999](https://github.com/eclipse-theia/theia/pull/11999)
- [terminal] added support for the preference `terminal.integrated.enablePersistentSessions` to allow disabling restoring terminals on reload [#12055](https://github.com/eclipse-theia/theia/pull/12055) - Contributed on behalf of STMicroelectronics
- [terminal] removed unnecessary use `RPCProtocol` [#11972](https://github.com/eclipse-theia/theia/pull/11972)
- [variable-resolver] fixed evaluations of `pickString` variables [#12100](https://github.com/eclipse-theia/theia/pull/12100) - Contributed on behalf of STMicroelectronics
- [workspace] refactored to use `fsPath` for the `COPY_RELATIVE_PATH` command [#12002](https://github.com/eclipse-theia/theia/pull/12002)

<a name="breaking_changes_1.34.0">[Breaking Changes:](#breaking_changes_1.34.0)</a>

- [plugin-ext] renamed `TreeViewWidgetIdentifier` to `TreeViewWidgetOptions` as there were more fields added to it [12065](https://github.com/eclipse-theia/theia/pull/12065)
