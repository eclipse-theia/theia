# Changelog 2020

## v1.9.0 - 16/12/2020

- [cli] updated error reporting for the `download-plugins` script [#8798](https://github.com/eclipse-theia/theia/pull/8798)
- [cli] updated the `download-plugins` script to report errors in case of unsupported file types [#8797](https://github.com/eclipse-theia/theia/pull/8797)
- [core] added support for the `workbench.editor.closeOnFileDelete` preference [#8731](https://github.com/eclipse-theia/theia/pull/8731)
- [core] fixed issue when attempting to kill the electron backend [#8809](https://github.com/eclipse-theia/theia/pull/8809)
- [core] updated tree expansion busy indicators [#8582](https://github.com/eclipse-theia/theia/pull/8582)
- [filesystem] fixed issue with pasting files/folders with the same name [#8778](https://github.com/eclipse-theia/theia/pull/8778)
- [filesystem] updated `upload` to return `FileUploadResult` [#8766](https://github.com/eclipse-theia/theia/pull/8766)
- [mini-browser] fixed issue when serving `{{hostname}}` as a pattern for `THEIA_MINI_BROWSER_HOST_PATTERN` [#8865](https://github.com/eclipse-theia/theia/pull/8865)
- [mini-browser] fixed missing resource response [#8866](https://github.com/eclipse-theia/theia/pull/8866)
- [plugin] added support for the command `workbench.extensions.installExtension` [#8745](https://github.com/eclipse-theia/theia/pull/8745)
- [plugin] corrected identification of uri schemes according to `rfc3986` [#8832](https://github.com/eclipse-theia/theia/pull/8832)
- [plugin] fixed the `reveal()` method for tree-views [#8783](https://github.com/eclipse-theia/theia/pull/8783)
- [plugin] removed unnecessary `plugin-ext` dependencies [#8831](https://github.com/eclipse-theia/theia/pull/8831)
- [plugin] updated `set html` to pass the object field instead of method argument [#8833](https://github.com/eclipse-theia/theia/pull/8833)
- [siw] added support for the `search.searchOnEditorModification` preference [#8765](https://github.com/eclipse-theia/theia/pull/8765)
- [siw] added support for the `search.searchOnType` preference [#8773](https://github.com/eclipse-theia/theia/pull/8773)

<a name="breaking_changes_1.9.0">[Breaking Changes:](#breaking_changes_1.9.0)</a>

- [core] `FrontendApplicationContribution.onWillStop` is now called for every contribution and will not bail early [#8863](https://github.com/eclipse-theia/theia/pull/8863)
  - It will also be called when `application.confirmExit` is set to `never`.
- [`download:plugins`] errors when downloading plugins now result in build failures, unless the `--ignore-errors` flag is passed [#8788](https://github.com/eclipse-theia/theia/pull/8788)
- [plugin] `LocalDirectoryPluginDeployerResolver` has moved from `packages/plugin-ext/src/main/node/resolvers/plugin-local-dir-resolver.ts` to `packages/plugin-ext/src/main/node/resolvers/local-file-plugin-deployer-resolver.ts` and now derives from `LocalPluginDeployerResolver` [#8745](https://github.com/eclipse-theia/theia/pull/8745)
- [plugin] updated the `TreeViewsMain.$reveal` second parameter from string element id to string array element parent chain [#8783](https://github.com/eclipse-theia/theia/pull/8783)
- [plugin] removed the unused `/plugin/:path(*)` endpoint [#8831](https://github.com/eclipse-theia/theia/pull/8831)
- [task] remove bash login shell when run from task to align with vscode [#8834](https://github.com/eclipse-theia/theia/pull/8834)

## v1.8.1 - 08/12/2020

- [core] added `THEIA_HOSTS` environment variable (browser applications only) [#8759](https://github.com/eclipse-theia/theia/pull/8759)
  - Used to filter incoming WebSocket connections: if `Origin` header does not match the list of hosts it will be refused.
  - Value is a comma-separated list of domain names including the port if not `80` nor `443`.
  - Example: `app.some.domain.com,app.other.domain:12345`.

<a name="breaking_changes_1.8.1">[Breaking Changes:](#breaking_changes_1.8.1)</a>

- [core] deprecated `ElectronMessagingContribution`, token validation is now done in `ElectronTokenValidator` as a `WsRequestValidatorContribution` [#8759](https://github.com/eclipse-theia/theia/pull/8759)
- [mini-browser] added new unique endpoint [#8759](https://github.com/eclipse-theia/theia/pull/8759)
  - `{{uuid}}.mini-browser.{{hostname}}` by default.
  - Can be configured via `THEIA_MINI_BROWSER_HOST_PATTERN` environment variable.
  - Clients must setup this new hostname in their DNS resolvers.

## v1.8.0 - 26/11/2020

- [api-tests] fixed issue with `saveable` test suite [#8736](https://github.com/eclipse-theia/theia/pull/8736)
- [application-manager] enabled `monaco-editor.*` sourcemaps when debugging [#8744](https://github.com/eclipse-theia/theia/pull/8744)
- [console] updated the `anser` import workaround [#8741](https://github.com/eclipse-theia/theia/pull/8741)
- [core] added ability to filter tree nodes [#8540](https://github.com/eclipse-theia/theia/pull/8540)
- [debug] fixed issue where the debug-view is not properly updated when hidden [#8645](https://github.com/eclipse-theia/theia/pull/8645)
- [documentation] improved documentation for `@theia/cli` electron configurations [#8699](https://github.com/eclipse-theia/theia/pull/8699)
- [documentation] improved documentation for `BackendApplicationContribution` [#8686](https://github.com/eclipse-theia/theia/pull/8686)
- [documentation] improved documentation for `MenuContribution` [#8715](https://github.com/eclipse-theia/theia/pull/8715)
- [documentation] improved documentation for `MessageService` [#8688](https://github.com/eclipse-theia/theia/pull/8688)
- [documentation] improved documentation for `PreferenceContribution` [#8677](https://github.com/eclipse-theia/theia/pull/8677)
- [documentation] improved documentation for `Task` API [#8695](https://github.com/eclipse-theia/theia/pull/8695)
- [documentation] improved documentation for `TreeDecorator` and `TreeDecoratorService` [#8698](https://github.com/eclipse-theia/theia/pull/8698)
- [documentation] updated publishing documentation for the repository [#8719](https://github.com/eclipse-theia/theia/pull/8719)
- [editor] enabled `editor.semanticHighlighting.enabled` by default [#8593](https://github.com/eclipse-theia/theia/pull/8593)
- [electron] fixed issue with `application.confirmExit` preventing the app from closing [#8732](https://github.com/eclipse-theia/theia/pull/8732)
- [file-search] fixed issue where file-search did not properly ignore the `.git` folder [#8721](https://github.com/eclipse-theia/theia/pull/8721)
- [monaco] added ability to compare quick-open entries [#8185](https://github.com/eclipse-theia/theia/pull/8185)
- [output] improved extensibility of output channel commands [#8733](https://github.com/eclipse-theia/theia/pull/8733)
- [plugin] added ability to use `viewId` as a progress location [#8700](https://github.com/eclipse-theia/theia/pull/8700)
- [plugin] added logic to only store webviews when they have a corresponding serializer [#8680](https://github.com/eclipse-theia/theia/pull/8680)
- [plugin] added support for `activeColorTheme` and `onDidChangeActiveColorTheme` API [#8710](https://github.com/eclipse-theia/theia/pull/8710)
- [plugin] added support for semantic highlighting [#8593](https://github.com/eclipse-theia/theia/pull/8593)
- [plugin] fixed issue where problem matchers specified by task providers are not respected [#8756](https://github.com/eclipse-theia/theia/pull/8756)
- [plugin] fixed issues with the `Authentication` API [#8725](https://github.com/eclipse-theia/theia/pull/8725)
- [plugin] fixed terminating hosted instance issue [#8674](https://github.com/eclipse-theia/theia/pull/8674)
- [preview] fixed issue where empty document content was not properly rendered [#8729](https://github.com/eclipse-theia/theia/pull/8729)
- [repo] updated `eslint` and peer-dependencies to latest versions [#8770](https://github.com/eclipse-theia/theia/pull/8770)
- [search-in-workspace] added ability to perform searches in dirty editors [#8579](https://github.com/eclipse-theia/theia/pull/8579)
- [search-in-workspace] added ability to search opened editors outside the workspace [#8646](https://github.com/eclipse-theia/theia/pull/8646)
- [security] updated `yargs` dependency [#8711](https://github.com/eclipse-theia/theia/pull/8711)
- [workspace] fixed missing binding of `WorkspaceFrontendContribution` [#8734](https://github.com/eclipse-theia/theia/pull/8734)

<a name="breaking_changes_1.8.0">[Breaking Changes:](#breaking_changes_1.8.0)</a>

- [electron] removed `attachWillPreventUnload` method from the Electron main application. The `confirmExit` logic is handled on the frontend [#8732](https://github.com/eclipse-theia/theia/pull/8732)
- [file-search] deprecated dependency on `@theia/process` and replaced its usage by node's `child_process` API [#8721](https://github.com/eclipse-theia/theia/pull/8721)


## v1.7.0 - 29/10/2020

<a name="release_milestone_1.7.0">[1.7.0 Release Milestone](https://github.com/eclipse-theia/theia/milestone/12?closed=1)</a>

- [core] added `Save without Formatting` command [#8543](https://github.com/eclipse-theia/theia/pull/8543)
- [core] added ability to customize `CommandQuickOpenItem` [#8648](https://github.com/eclipse-theia/theia/pull/8648)
- [core] added support for `isWeb` context when clause [#8530](https://github.com/eclipse-theia/theia/pull/8530)
- [core] added support for the `keyboard.dispatch` preference [#8609](https://github.com/eclipse-theia/theia/pull/8609)
- [core] fixed the `UriAwareCommandHandler` preventing the duplication of passed arguments [#8592](https://github.com/eclipse-theia/theia/pull/8592)
- [core] fixed transparent widget backgrounds breaking branding [#8448](https://github.com/eclipse-theia/theia/pull/8448)
- [core] improved extensibility of view containers for downstream extenders [#8619](https://github.com/eclipse-theia/theia/pull/8619)
- [core] updated `Save All` to only format dirty editors [#8554](https://github.com/eclipse-theia/theia/pull/8544)
- [debug] improved extensibility of debug event handlers [#8616](https://github.com/eclipse-theia/theia/pull/8616)
- [debug] renamed the `Debug` main menu item to `Run` [#8653](https://github.com/eclipse-theia/theia/pull/8653)
- [documentation] improved documentation for `FileService` and `FileSystemProvider` [#8596](https://github.com/eclipse-theia/theia/pull/8596)
- [documentation] improved documentation for `Keybinding` and `KeybindingContribution` [#8637](https://github.com/eclipse-theia/theia/pull/8637)
- [documentation] improved documentation for `LabelProvider` and `LabelProviderContribution` [#8569](https://github.com/eclipse-theia/theia/pull/8569)
- [documentation] improved documentation for `PreferenceService` [#8612](https://github.com/eclipse-theia/theia/pull/8612)
- [documentation] improved documentation for `WidgetManager` and `WidgetOpenHandler` [#8644](https://github.com/eclipse-theia/theia/pull/8644)
- [documentation] improved documentation for the `@theia/preview` extension [#8625](https://github.com/eclipse-theia/theia/pull/8625)
- [editor] fixed inconsistent `showTextDocument` behavior [#8588](https://github.com/eclipse-theia/theia/pull/8588)
- [electron] added handling for `SIGPIPE` errors [#8661](https://github.com/eclipse-theia/theia/pull/8661)
- [filesystem] refactored file watchers: [#8546](https://github.com/eclipse-theia/theia/pull/8546)
  - Added `FileSystemWatcherService` component that should be a singleton centralizing watch requests for all clients.
  - Added `FileSystemWatcherServiceDispatcher` to register yourself and listen to file change events.
- [git] updated `commit details` and `diff view` rendering to respect `list` and `tree` modes [#8084] (https://github.com/eclipse-theia/theia/pull/8084)
- [markers] updated and enhanced the 'problem-manager' tests [#8604](https://github.com/eclipse-theia/theia/pull/8604)
- [mini-browser] updated deprecated `scrElement` usage to `target` [#8663](https://github.com/eclipse-theia/theia/pull/8663)
- [monaco] fixed race condition on monaco editor initialization [#8563](https://github.com/eclipse-theia/theia/pull/8563)
- [monaco] updated `Save All` command to format all open editors [#8551](https://github.com/eclipse-theia/theia/pull/8551)
- [navigator] added additional handling for empty multi-root workspaces [#8608](https://github.com/eclipse-theia/theia/pull/8608)
- [navigator] fixed the `doOpenNode` implementation for hidden nodes [#8659](https://github.com/eclipse-theia/theia/pull/8659)
- [plugin] added `environmentVariableCollection` to `PluginContext` [#8523](https://github.com/eclipse-theia/theia/pull/8523)
- [plugin] added `onStartupFinished` plugin activation event [#8525](https://github.com/eclipse-theia/theia/pull/8525)
- [plugin] added logic to load plugin manifests on activation [#8485](https://github.com/eclipse-theia/theia/pull/8485)
- [plugin] added support for `deprecated` strikethrough for completion items [#8553](https://github.com/eclipse-theia/theia/pull/8553)
- [plugin] bumped the default supported VS Code version to `1.50.0` [#8617](https://github.com/eclipse-theia/theia/pull/8617)
- [plugin] fixed XSS sink by sanitizing dialog `innerHTML` [#8388](https://github.com/eclipse-theia/theia/pull/8388)
- [plugin] fixed constrain types of providers [#8617](https://github.com/eclipse-theia/theia/pull/8617)
- [plugin] fixed issue related to calling the activation of an extension through another extension [#8542](https://github.com/eclipse-theia/theia/pull/8542)
- [plugin] fixed prototype pollution vulnerability [#8675](https://github.com/eclipse-theia/theia/pull/8675)
- [plugin] fixed the dismissal of menus when clicking within webviews [#8633](https://github.com/eclipse-theia/theia/pull/8633)
- [plugin] improved extensibility of `CodeEditorWidget` [#8672](https://github.com/eclipse-theia/theia/pull/8672)
- [plugin] updated `Comments` API to align with VS Code [#8539](https://github.com/eclipse-theia/theia/pull/8539)
- [plugin] updated `workspaceFolders` API to return `undefined` when no folders are opened [#8641](https://github.com/eclipse-theia/theia/pull/8641)
- [repo] added `no-tabs` rule [#8630](https://github.com/eclipse-theia/theia/pull/8630)
- [repo] reduced verbosity during build [#8642](https://github.com/eclipse-theia/theia/pull/8642)
- [repo] reduced verbosity when building individual extensions [#8642](https://github.com/eclipse-theia/theia/pull/8642)
- [repo] updated use of deprecated APIs in unit tests [#8642](https://github.com/eclipse-theia/theia/pull/8642)
- [repo] upgraded to `@types/node@12` typings [#8556](https://github.com/eclipse-theia/theia/pull/8556)
- [scm] fixed 'circular structure to JSON' error for the accept input command [#8606](https://github.com/eclipse-theia/theia/pull/8606)
- [scm] updated the commit textarea placeholder to include the current branch name [#6156](https://github.com/eclipse-theia/theia/pull/6156)
- [vsx-registry] added support for the search parameter `includeAllVersions` [#8607](https://github.com/eclipse-theia/theia/pull/8607)
- [vsx-registry] added support for the search parameter `sortBy` [#8607](https://github.com/eclipse-theia/theia/pull/8607)
- [vsx-registry] added support for the search parameter `sortOrder` [#8607](https://github.com/eclipse-theia/theia/pull/8607)
- [vsx-registry] fixed the `search` query when multiple search parameters are used [#8607](https://github.com/eclipse-theia/theia/pull/8607)
- [vsx-registry] updated the `query` API endpoint [#8570](https://github.com/eclipse-theia/theia/pull/8570)

<a name="breaking_changes_1.7.0">[Breaking Changes:](#breaking_changes_1.7.0)</a>

- [core] change progress notification cancelable property default from `true` to `false` [#8479](https://github.com/eclipse-theia/theia/pull/8479)
- [filesystem] `NsfwFileSystemWatcherServer` is deprecated and no longer used [#8546](https://github.com/eclipse-theia/theia/pull/8546)
- [messages] updated handling of empty notifications and progress notifications so they will not be shown [#8479](https://github.com/eclipse-theia/theia/pull/8479)
- [plugin-metrics] renamed `AnalyticsFromRequests.succesfulResponses` to `AnalyticsFromRequests.successfulResponses` [#8560](https://github.com/eclipse-theia/theia/pull/8560)
- [plugin] `CodeEditorWidgetUti.getResourceUri` is no longer exportable [#8672](https://github.com/eclipse-theia/theia/pull/8672)


## v1.6.0 - 24/09/2020

- [core] added ability to un-register keybindings for a given command [#8269](https://github.com/eclipse-theia/theia/pull/8269)
- [core] added handling to only execute command via keybinding if it has an active handler [#8420](https://github.com/eclipse-theia/theia/pull/8420)
- [core] updated the triggering of `tab-bar` context-menus to open without the need to be activated beforehand [#6965](https://github.com/eclipse-theia/theia/pull/6965)
- [editor] added ability to set the default formatter [#8446](https://github.com/eclipse-theia/theia/pull/8446)
- [electron] fixed the `rebuild:electron` command for the `drivelist` native module [#8454](https://github.com/eclipse-theia/theia/pull/8454)
- [filesystem] added handling to warn Linux users when they have exhausted `Inotify` handles, along with instructions on how to fix it [#8458](https://github.com/eclipse-theia/theia/pull/8458)
- [filesystem] fixed the deprecated `FileSystem` binding to return an instantiated instance rather than the class [#8507](https://github.com/eclipse-theia/theia/pull/8507)
- [keymaps] added handling to prevent URL hash changes when editing keybindings [#8502](https://github.com/eclipse-theia/theia/pull/8502)
- [lint] added XSS sink detection eslint rules [#8481](https://github.com/eclipse-theia/theia/pull/8481)
- [output] renamed `output-widget.tsx` to `output-widget.ts` [#8499](https://github.com/eclipse-theia/theia/pull/8499)
- [output] updated logic to allow clients to customize channel creation [#8476](https://github.com/eclipse-theia/theia/pull/8476)
- [plugin] added `CompletionItemTag` enum [#8517](https://github.com/eclipse-theia/theia/pull/8517)
- [plugin] added `DebugConsoleMode` enum [#8513](https://github.com/eclipse-theia/theia/pull/8513)
- [plugin] added `authentication` plugin API [#8402](https://github.com/eclipse-theia/theia/pull/8402)
- [plugin] added `revealInExplorer` command [#8496](https://github.com/eclipse-theia/theia/pull/8496)
- [plugin] fixed issue related to getting the default value from `globalState`/`workspaceState` [#8424](https://github.com/eclipse-theia/theia/pull/8424)
- [plugin] removed superfluous channel caching for extensions [#8476](https://github.com/eclipse-theia/theia/pull/8476)
- [plugin] updated `vscode.findFiles` API to handle ignored files [#8452](https://github.com/eclipse-theia/theia/pull/8452)
- [plugin] updated plugin storage path to be FIPS-compliant [#8379](https://github.com/eclipse-theia/theia/pull/8379)
- [plugin] updated task ID generation logic [#8379](https://github.com/eclipse-theia/theia/pull/8379)
- [preferences] updated the rendering of preference category headers and leaves [#8512](https://github.com/eclipse-theia/theia/pull/8512)
- [scm] fixed activation request of the scm-widget [#8508](https://github.com/eclipse-theia/theia/pull/8508)
- [search-in-workspace] added handling to respect the `files.exclude` preference when searching [#8433](https://github.com/eclipse-theia/theia/pull/8433)
- [timeline] added the `@theia/timeline` extension [#7997](https://github.com/eclipse-theia/theia/pull/7997)

<a name="breaking_changes_1.6.0">[Breaking Changes:](#breaking_changes_1.6.0)</a>

- [core] context-menus for `tab-bars` now require an `Event` to be passed to execute commands without activating the shell `tab-bar` [#6965](https://github.com/eclipse-theia/theia/pull/6965)
  - Removed logic from `TabBarRenderer.handleContextMenuEvent()` to support triggering context-menus without the need to activate the widget.
  - When registering a command, `Event` should be passed, else commands will not work correctly as they do no longer rely on the activation of `tab-bars`.
- [core] refactored `findTitle()` and `findTabBar()` moving them from `common-frontend-contribution.ts` to `application-shell.ts` [#6965](https://github.com/eclipse-theia/theia/pull/6965)

## v1.5.0 - 27/08/2020

- [application-manager] fixed issue regarding reloading electron windows [#8345](https://github.com/eclipse-theia/theia/pull/8345)
- [application-package] fixed incorrect app config defaults [#8355](https://github.com/eclipse-theia/theia/pull/8355)
- [cli] updated `download:plugins` script to use `decompress` [#8315](https://github.com/eclipse-theia/theia/pull/8315)
- [core] added `badge` count for the `problems-view` [#8156](https://github.com/eclipse-theia/theia/pull/8156)
- [core] added setting menu items to the sidebar bottom menus [#8372](https://github.com/eclipse-theia/theia/pull/8372)
- [core] added support for `badge` count tab decorations [#8156](https://github.com/eclipse-theia/theia/pull/8156)
- [core] added support for registering custom menu nodes [#8404](https://github.com/eclipse-theia/theia/pull/8404)
- [core] added support for sidebar bottom menus [#8372](https://github.com/eclipse-theia/theia/pull/8372)
- [core] added support for tree indent guidelines [#8298](https://github.com/eclipse-theia/theia/pull/8298)
- [core] fixed submenu ordering [#8377](https://github.com/eclipse-theia/theia/pull/8377)
- [core] fixed the menu widget layout [#8419](https://github.com/eclipse-theia/theia/pull/8419)
- [core] updated extensibility of `DefaultUriLabelProviderContribution` [#8281](https://github.com/eclipse-theia/theia/pull/8281)
- [debug] added `badge` count for active debug sessions [#8342](https://github.com/eclipse-theia/theia/pull/8342)
- [debug] fixed debug exception height computation [#8382](https://github.com/eclipse-theia/theia/pull/8382)
- [dependencies] updated `node-gyp` to `7.0.0` [#8216](https://github.com/eclipse-theia/theia/pull/8216)
- [documentation] updated extension documentation [#8279](https://github.com/eclipse-theia/theia/pull/8279)
- [filesystem] added handling to prevent opening files which are too large [#8152](https://github.com/eclipse-theia/theia/pull/8152)
- [filesystem] added handling to prompt end-users before opening binary files [#8152](https://github.com/eclipse-theia/theia/pull/8152)
- [keymaps] updated keymaps to use monaco models [#8313](https://github.com/eclipse-theia/theia/pull/8313)
- [monaco] added handling to prevent opening dirty editors if `autoSave` is enabled [#8329](https://github.com/eclipse-theia/theia/pull/8329)
- [monaco] updated grammar collision logging [#8418](https://github.com/eclipse-theia/theia/pull/8418)
- [monaco] upgraded to monaco `0.20.0` [#8010](https://github.com/eclipse-theia/theia/pull/8010)
- [navigator] added `badge` count for dirty editors in the `explorer` [#8316](https://github.com/eclipse-theia/theia/pull/8316)
- [navigator] updated `open` command to only be enabled for files [#8228](https://github.com/eclipse-theia/theia/pull/8228)
- [navigator] updated duplicate keybinding for opening the preferences widget [#8256](https://github.com/eclipse-theia/theia/pull/8256)
- [output] exposed `preserveFocus` to `OutputChannel#show` to reveal but not activate the widget [#8243](https://github.com/eclipse-theia/theia/pull/8243)
- [output] fixed editor resizing issue [#8362](https://github.com/eclipse-theia/theia/pull/8362)
- [plugin] added handling to prevent activating plugins eagerly on unsupported events [#8396](https://github.com/eclipse-theia/theia/pull/8396)
- [plugin] added support for `ResourceLabelFormatter` API [#8187](https://github.com/eclipse-theia/theia/pull/8187)
- [plugin] added support for `vscode.workspace.fs` API [#7908](https://github.com/eclipse-theia/theia/pull/7908)
- [plugin] fixed `local-dir` path resolution [#8385](https://github.com/eclipse-theia/theia/pull/8385)
- [plugin] marked `onFileSystem` event as supported [#8320](https://github.com/eclipse-theia/theia/pull/8320)
- [preferences] added input field validation for numbers [#8264](https://github.com/eclipse-theia/theia/pull/8264)
- [preferences] removed hardcoded constants [#8313](https://github.com/eclipse-theia/theia/pull/8313)
- [scm] added `collapse-all` command and toolbar item [#8247](https://github.com/eclipse-theia/theia/pull/8247)
- [scm] added `badge` count for the `scm-view` [#8156](https://github.com/eclipse-theia/theia/pull/8156)
- [security] fixed usage of `stylesheet.innerHTML` [#8397](https://github.com/eclipse-theia/theia/pull/8397)
- [security] updated version range of `decompress` to fix the known [security vulnerability](https://snyk.io/vuln/SNYK-JS-DECOMPRESS-557358) [#8924](https://github.com/eclipse-theia/theia/pull/8294)
  - Note: the updated dependency may have a [performance impact](https://github.com/eclipse-theia/theia/pull/7715#issuecomment-667434288) on the deployment of plugins.
- [task] removed superfluous notifications when tasks are started / ended [#8331](https://github.com/eclipse-theia/theia/pull/8331)
- [tests] added api integration tests for `scm` [#8231](https://github.com/eclipse-theia/theia/pull/8231)
<a name="1_5_0_electron_main_extension"></a>
- [[electron]](#1_5_0_electron_main_extension) Electron applications can now be configured/extended through `inversify`. Added new `electronMain` extension points to provide inversify container modules. [#8076](https://github.com/eclipse-theia/theia/pull/8076)

<a name="breaking_changes_1.5.0">[Breaking Changes:](#breaking_changes_1.5.0)</a>

- [core] removed `KeybindingRegistry#getScopedKeybindingsForCommand` [#8283](https://github.com/eclipse-theia/theia/pull/8283)
- [application-package] removed `isOutdated` from `ExtensionPackage` [#8295](https://github.com/eclipse-theia/theia/pull/8295)
- [application-package] removed `getLatestVersion` from `ExtensionPackage` [#8295](https://github.com/eclipse-theia/theia/pull/8295)
- [application-package] removed `getVersionRange` from `ExtensionPackage` [#8295](https://github.com/eclipse-theia/theia/pull/8295)
- [application-package] removed `resolveVersionRange` from `ExtensionPackage` [#8295](https://github.com/eclipse-theia/theia/pull/8295)
- [output] `OutputWidget#setInput` has been removed. The _Output_ view automatically shows the channel when calling `OutputChannel#show`. Moved the `OutputCommands` namespace from the `output-contribution` to its dedicated `output-commands` module to overcome a DI cycle. [#8243](https://github.com/eclipse-theia/theia/pull/8243)
- [example-app] updated `yarn.lock` so that the latest version of `vscode-ripgrep` is used (`v1.8.0`). This way we can benefit from the recently added support for it using proxy settings when fetching the platform-specific `ripgrep` executable, after npm package install. This should make it a lot easier to build our example application in corporate settings, behind a firewall. [#8280](https://github.com/eclipse-theia/theia/pull/8280)
  - Note to downstream IDE designers: this change will not have an effect beyond the example application of the repository. If it's desirable for your product to have the latest `vscode-ripgrep`, you should do similarly in your own `yarn.lock`.
<a name="1.5.0_deprecate_file_system"></a>
- [[filesystem]](#1.5.0_deprecate_file_system) `FileSystem` and `FileSystemWatcher` services are deprecated [#7908](https://github.com/eclipse-theia/theia/pull/7908)
  - On the backend there is no more `FileSystem` implementation. One has to use Node.js APIs instead.
  - On the frontend, the `FileService` should be used instead. It was ported from VS Code for compatibility with VS Code extensions.
  - On the frontend, the `EnvVariableServer` should be used instead to access the current user home and available drives.
<a name="1.5.0_userstorage_as_fs_provider"></a>
- [[userstorage]](#1.5.0_userstorage_as_fs_provider) `UserStorageService` was replaced by the user data fs provider [#7908](https://github.com/eclipse-theia/theia/pull/7908)
<a name="1.5.0_webview_resource_streaming"></a>
- [[webview]](#1.5.0_webview_resource_streaming) webview resources are streamed instead of loading one by one the entire content and blocking the web socket [#8359](https://github.com/eclipse-theia/theia/pull/8359)
  - Consequently, `WebviewResourceLoader` is removed. One should change `DiskFileSystemProvider` to customize resource loading instead.
<a name="1.5.0_root_user_storage_uri"></a>
- [[user-storage]](#1.5.0_root_user_storage_uri) settings URI must start with `/user` root to satisfy expectations of `FileService` [#8313](https://github.com/eclipse-theia/theia/pull/8313)
  - If you implement a custom user storage make sure to check old relative locations, otherwise it can cause user data loss.
<a name="1_5_0_electron_window_options_ipc"></a>
- [[electron]](#1_5_0_electron_window_options_ipc) Removed the `set-window-options` and `get-persisted-window-options-additions` Electron IPC handlers from the Electron Main process.
<a name="1.5.0_non_blocking_bulk_edit"></a>
- [[monaco]](#1.5.0_non_blocking_bulk_edit) `MonacoWorkspace.applyBulkEdit` does not open any editors anymore to avoid blocking [#8329](https://github.com/eclipse-theia/theia/pull/8329)
  - Consequently, it does not accept editor opener options, and `MonacoWorkspace.openEditors` and `MonacoWorkspace.toTextEditWithEditor` are removed.
<a name="1.5.0_declarative_default_themes"></a>
- [[theming]](#1.5.0_declarative_default_themes) Default color and icon themes should be declared in the application `package.json`. [#8381](https://github.com/eclipse-theia/theia/pull/8381)

  ```json
  "theia": {
    "frontend": {
      "config": {
        "defaultTheme": "light",
        "defaultIconTheme": "vs-seti"
      }
    }
  },
  ```
  - Consequently, `ThemeService` and `IconThemeService` don't allow to change the default color or icon theme anymore.
<a name="1_5_0_drop_node_10_support"></a>
- [[repo]](#1_5_0_drop_node_10_support) support for `Node 10` is dropped. [#8290](https://github.com/eclipse-theia/theia/pull/8290)
  - From now on, Node.js `12.x` is required when building.\
   The recommended minimum version is aligned with `electron` (Node.js `12.14.1`).

## v1.4.0 - 30/07/2020

- [core] added support for Node.js `12.x` [#7968](https://github.com/eclipse-theia/theia/pull/7968)
  - From now on, you can use Node.js `12.x` to build Theia from sources. The recommended minimum version is aligned with `electron` (Node.js `12.14.1`).
  - Support for Node.js `10.x` will be dropped in one of the forthcoming releases.
- [core] fixed handling of environment variables on Windows [#7973](https://github.com/eclipse-theia/theia/pull/7973)
- [core] fixed issue when selecting a tree node after performing a manual scroll [#8154](https://github.com/eclipse-theia/theia/pull/8154)
- [debug] added a `select and run` debug statusbar item [#8134](https://github.com/eclipse-theia/theia/pull/8134)
- [debug] added handling to perform `save` when starting a debug session [#8115](https://github.com/eclipse-theia/theia/pull/8115)
- [debug] addressed an issue not awaiting the result of the debug handler [#8117](https://github.com/eclipse-theia/theia/pull/8117)
- [editor] added handling to perform a `save all` when turning `auto-save` on [#8163](https://github.com/eclipse-theia/theia/pull/8163)
- [editor] improved extensibility of menu and keybinding contributions [#8188](https://github.com/eclipse-theia/theia/pull/8188)
- [git] fixed the opening of deleted files [#8107](https://github.com/eclipse-theia/theia/pull/8107)
- [markers] added `problems.autoReveal` preference to control sync between editors and the problem-view [#8172](https://github.com/eclipse-theia/theia/pull/8172)
- [monaco] improved extensibility of menu and keybinding contributions [#8188](https://github.com/eclipse-theia/theia/pull/8188)
- [monaco] normalized base pattern path to support different operating systems [#8268](https://github.com/eclipse-theia/theia/pull/8268)
- [monaco] removed unused dependencies [#8109](https://github.com/eclipse-theia/theia/pull/8109)
- [navigator] added `copy relative path` to the explorer context-menu and command palette [#8092](https://github.com/eclipse-theia/theia/pull/8092)
- [output] added `copy all` context-menu item for the output-view [#8057](https://github.com/eclipse-theia/theia/pull/8057)
- [plugin] added command `copyRelativeFilePath` [#8092](https://github.com/eclipse-theia/theia/pull/8092)
- [plugin] added support for `resolveDebugConfigurationWithSubstitutedVariables` API [#8253](https://github.com/eclipse-theia/theia/pull/8253)
- [plugin] added support for `vscode.workspace.findTextInFiles` API [#7868](https://github.com/eclipse-theia/theia/pull/7868)
- [plugin] added support for theme icons [#8267](https://github.com/eclipse-theia/theia/pull/8267)
- [plugin] fixed focused handling of webviews when dismissing the quick-open widget [#8137](https://github.com/eclipse-theia/theia/pull/8137)
- [plugin] fixed the display of file-icons with a dot in the name [#7680](https://github.com/eclipse-theia/theia/pull/7680)
- [plugin] fixed the modal dialog max size and text-wrapping [#8080](https://github.com/eclipse-theia/theia/pull/8080)
- [plugin] improved handling of the plugin host activation exceptions [#8103](https://github.com/eclipse-theia/theia/pull/8103)
- [plugin] removed unnecessary slash at the end of the `pluginPath` [#8045](https://github.com/eclipse-theia/theia/pull/8045)
- [plugin] updated logic to allow `Command` type in statusbar items [#8253](https://github.com/eclipse-theia/theia/pull/8253)
- [plugin] updated logic to allow `vsix` without publishers to be loaded [#8196](https://github.com/eclipse-theia/theia/pull/8196)
- [repo] removed unused resolution for `vscode-json-languageserver` [#8132](https://github.com/eclipse-theia/theia/pull/8132)
- [search-in-workspace] improved search behavior to only trigger search on input change or <kbd>ENTER</kbd> [#8229](https://github.com/eclipse-theia/theia/pull/8229)
- [task] fixed an issue where `onDidEndTaskProcess` was not fired for plugins when task ended [#8141](https://github.com/eclipse-theia/theia/pull/8141)
- [task] introduced a token to scope contributed tasks [#7996](https://github.com/eclipse-theia/theia/pull/7996)
- [terminal] fixed xterm issue causing an extraneous 'cursor-like' overlay element [#8204](https://github.com/eclipse-theia/theia/pull/8204)
- [test] improved api-tests by increasing timeout so plugin views can be properly prepared [#8151](https://github.com/eclipse-theia/theia/pull/8151)
- [test] updated api-tests to use tmp directory for user data [#8151](https://github.com/eclipse-theia/theia/pull/8151)
- [vsx-registry] fixed the `licenseUrl` link for builtin and installed extensions [#8095](https://github.com/eclipse-theia/theia/pull/8095)
- [vsx-registry] improved styling of the detailed extension view [#8086](https://github.com/eclipse-theia/theia/pull/8086)
- [workspace] improved extensibility of menu and keybinding contributions [#8188](https://github.com/eclipse-theia/theia/pull/8188)

<a name="breaking_changes_1.4.0">[Breaking Changes:](#breaking_changes_1.4.0)</a>

- [core] fixed typo (`matchKeybiding` to `matchKeybinding`) in `KeybindingRegistry` [#8193](https://github.com/eclipse-theia/theia/pull/8193)
- [preferences] removed unused variable `PreferencesWidget.COMMAND_LABEL` [#8249](https://github.com/eclipse-theia/theia/pull/8249)
- [preferences] renamed file `preference-contribution.ts` to `preferences-contribution.ts` [#8237](https://github.com/eclipse-theia/theia/pull/8237)
- [terminal] fixed typo (`rezize` to `resize`) in `TerminalWidget` [#8193](https://github.com/eclipse-theia/theia/pull/8193)
<a name="1_4_0_replace_json"></a>
- [[json]](#1_4_0_replace_json) replaced `@theia/json` Theia extension with `vscode.json-language-features` VS Code extension [#8112](https://github.com/eclipse-theia/theia/pull/8112)
  - You can register JSON validations at application startup by implementing `JsonSchemaContribution` Theia contribution point.
  - Alternatively you can provide JSON validations using VS Code [contributes.jsonValidation](https://code.visualstudio.com/api/references/contribution-points#contributes.jsonValidation) contribution point.
<a name="1_4_0_absolute_user_storage_uri"></a>
- [[user-storage]](#1_4_0_absolute_user_storage_uri) settings URI must be an absolute to satisfy expectations of `vscode.json-language-features` [#8112](https://github.com/eclipse-theia/theia/pull/8112)
  - If you implement a custom user storage make sure to check old relative locations, otherwise it can cause user data loss.
<a name="1_4_0_deprecate_languages"></a>
- [[languages]](#1_4_0_deprecate_languages) `@theia/languages` extension is deprecated, use VS Code extensions to provide language smartness:
  https://code.visualstudio.com/api/language-extensions/language-server-extension-guide [#8112](https://github.com/eclipse-theia/theia/pull/8112)

## v1.3.0 - 25/06/2020

- [cli] updated the download script to warn about mandatory `theiaPlugins` field [#8058](https://github.com/eclipse-theia/theia/pull/8058)
- [core] added `copy path` command [#7934](https://github.com/eclipse-theia/theia/pull/7934)
- [core] added missing `vscode-languageserver-protocol` dependency [#8036](https://github.com/eclipse-theia/theia/pull/8036)
- [core] adds support for ordering submenus [#7963](https://github.com/eclipse-theia/theia/pull/7963)
- [core] implemented a context-menu for `input` and `textArea` fields [#7943](https://github.com/eclipse-theia/theia/pull/7943)
- [core] improved sub-classing of `messaging` [#8008](https://github.com/eclipse-theia/theia/pull/8008)
- [core] updated `react` and `react-dom` to v16.8 [#7883](https://github.com/eclipse-theia/theia/pull/7883)
- [debug] added support for inline variable values [#7921](https://github.com/eclipse-theia/theia/pull/7921)
- [editor] updated the default tokenization length [#8027](https://github.com/eclipse-theia/theia/pull/8027)
- [filesystem] exposed `nsfw` to downstream `NsfwFilesystemWatcher` [#7465](https://github.com/eclipse-theia/theia/pull/7465)
- [filesystem] fixed file filter issue in the `FileDialog` [#8073](https://github.com/eclipse-theia/theia/pull/8073)
- [filesystem] improved `isInSync` method [#8044](https://github.com/eclipse-theia/theia/pull/8044)
- [filesystem] updated minimatch when ignoring to include folders starting with a dot [#8074](https://github.com/eclipse-theia/theia/pull/8074)
- [markers] added the `clear-all` command for the problems-view [#8002](https://github.com/eclipse-theia/theia/pull/8002)
- [monaco] added support for `vscode-builtin-css-language-features` [#7972](https://github.com/eclipse-theia/theia/pull/7972)
- [monaco] added support for `vscode-builtin-html-language-features` [#7972](https://github.com/eclipse-theia/theia/pull/7972)
- [monaco] exposed `toOpenModel` method [#8024](https://github.com/eclipse-theia/theia/pull/8024)
- [output] added scroll-lock to the output view [#7570](https://github.com/eclipse-theia/theia/pull/7570)
- [output] added support for special output URI characters [#8046](https://github.com/eclipse-theia/theia/pull/8046)
- [plugin] added command `copyFilePath` [#7934](https://github.com/eclipse-theia/theia/pull/7934)
- [plugin] added support for `env.uiKind` API [#8038](https://github.com/eclipse-theia/theia/pull/8038)
- [plugin] added support for `workbench.view.explorer` command [#7965](https://github.com/eclipse-theia/theia/pull/7965)
- [plugin] added support for the `Task2` class [#8000](https://github.com/eclipse-theia/theia/pull/8000)
- [plugin] added the registration of view-containers in the `open view` menu [#8034](https://github.com/eclipse-theia/theia/pull/8034)
- [plugin] fixed handling to not fail if a command returns a non-serializable result or error [#7957](https://github.com/eclipse-theia/theia/pull/7957)
- [plugin] implemented the pseudo terminal plugin API [#7925](https://github.com/eclipse-theia/theia/pull/7925)
- [plugin] improved activation of views to ensure they are ready before activated [#7957](https://github.com/eclipse-theia/theia/pull/7957)
- [preferences] fixed modified scope label for updated preferences [#8025](https://github.com/eclipse-theia/theia/pull/8025)
- [preferences] improved the statefulness of the preferences when switching scopes [#7936](https://github.com/eclipse-theia/theia/pull/7936)
- [preview] added sanitization of the markdown text for security purposes [#7971](https://github.com/eclipse-theia/theia/pull/7971)
- [scm] added multi-select support for the 'source control manager' view [#7900](https://github.com/eclipse-theia/theia/pull/7900)
- [scm] fixed the `scm` tree to sort results correctly [#8048](https://github.com/eclipse-theia/theia/pull/8048)
- [search-in-workspace] fixed incorrect or duplicate search results [#7990](https://github.com/eclipse-theia/theia/pull/7990)
- [task] added `detail` property to the task configuration schema [#8000](https://github.com/eclipse-theia/theia/pull/8000)
- [task] added support to update user-level tasks [#7928](https://github.com/eclipse-theia/theia/pull/7928)
- [task] fixed error due to incorrect `RevealKind` and `PanelKind` enums [#7982](https://github.com/eclipse-theia/theia/pull/7982)
- [task] included global tasks in the 'configure tasks' menu [#7929](https://github.com/eclipse-theia/theia/pull/7929)
- [vsx-registry] adjusted the width of the search input [#7984](https://github.com/eclipse-theia/theia/pull/7984)
- [vsx-registry] included 'extensions-view' in the default layout [#7944](https://github.com/eclipse-theia/theia/pull/7944)
- [workspace] added logic preventing arbitrary files from being opened as a workspace [#7922](https://github.com/eclipse-theia/theia/pull/7922)

Breaking Changes:

- [task] Widened the scope of some methods in TaskManager and TaskConfigurations from string to TaskConfigurationScope. This is only breaking for extenders, not callers. [#7928](https://github.com/eclipse-theia/theia/pull/7928)
- [shell] updated `ApplicationShell.TrackableWidgetProvider.getTrackableWidgets` to be synchronous in order to register child widgets in the same tick [#7957](https://github.com/eclipse-theia/theia/pull/7957)
  - use `ApplicationShell.TrackableWidgetProvider.onDidChangeTrackableWidgets` if child widgets are added asynchronously

## v1.2.0 - 28/05/2020

- [application-manager] added ability for clients to add `windowOptions` using an IPC-Event [#7803](https://github.com/eclipse-theia/theia/pull/7803)
- [application-package] added ability for clients to change the default `windowOptions` [#7803](https://github.com/eclipse-theia/theia/pull/7803)
- [cli] improved the handling of the `download:plugins` script [#7747](https://github.com/eclipse-theia/theia/pull/7747)
- [cli] support proxy settings in the `download:plugins` script [#7747](https://github.com/eclipse-theia/theia/pull/7747)
- [cli] updated the `download:plugins` script to display errors at the end of the script [#7881](https://github.com/eclipse-theia/theia/pull/7881)
- [core] added handling of nested default values in preference proxies [#6921](https://github.com/eclipse-theia/theia/pull/6921)
- [core] added handling to properly cleanup `toDisposeOnActiveChanged` [#7894](https://github.com/eclipse-theia/theia/pull/7894)
- [core] added handling to respect the keybinding scope and registration order during evaluation [#7839](https://github.com/eclipse-theia/theia/pull/7839)
- [core] added support for `next/previous` tab group commands [#7707](https://github.com/eclipse-theia/theia/pull/7707)
- [core] added support for `next/previous` tab in group commands [#7707](https://github.com/eclipse-theia/theia/pull/7707)
- [core] fixed collapsed state when restoring view-container parts [#7893](https://github.com/eclipse-theia/theia/pull/7893)
- [dependency] fixed issue with `momentjs` dependency [#7727](https://github.com/eclipse-theia/theia/pull/7727)
- [dependency] upgraded `decompress` to `4.2.0` [#7715](https://github.com/eclipse-theia/theia/pull/7715)
- [dependency] upgraded `uuid` to `8.0.0` [#7749](https://github.com/eclipse-theia/theia/pull/7749)
- [dependency] upgraded to TypeScript `3.9.2` [#7807](https://github.com/eclipse-theia/theia/pull/7807)
- [editor-preview] improved the editor-preview height [#6921](https://github.com/eclipse-theia/theia/pull/6921)
- [editor] improved focus handling of editors to default to the last visible editor [#7707](https://github.com/eclipse-theia/theia/pull/7707)
- [electron] fixed rendering of the electron context-menu [#7735](https://github.com/eclipse-theia/theia/pull/7735)
- [electron] fixed resolution of hostname placeholder [#7823](https://github.com/eclipse-theia/theia/pull/7823)
- [electron] fixed the rendering of webviews on electron [#7847](https://github.com/eclipse-theia/theia/pull/7847)
- [electron] improved rendering of electron context-menus to hide disabled menu items [#7869](https://github.com/eclipse-theia/theia/pull/7869)
- [electron] removed global shortcuts if the electron window is not focused [#7817](https://github.com/eclipse-theia/theia/pull/7817)
- [file-search] improved the handling of the quick-file open [#7846](https://github.com/eclipse-theia/theia/pull/7846)
- [filesystem] fixed issue where file-icons were not properly aligned when the file name is truncated [#7730](https://github.com/eclipse-theia/theia/pull/7730)
- [getting-started] updated the documentation urls [#7855](https://github.com/eclipse-theia/theia/pull/7855)
- [git] added handling to set upstream remote branch when pushing [#7866](https://github.com/eclipse-theia/theia/pull/7866)
- [git] fixed issue causing no repositories to be found [#7870](https://github.com/eclipse-theia/theia/pull/7870)
- [monaco] added handling of internal open calls with the `OpenerService` [#6921](https://github.com/eclipse-theia/theia/pull/6921)
- [monaco] added handling to only focus the editor if it is revealed [#7903](https://github.com/eclipse-theia/theia/pull/7903)
- [monaco] fixed issue to detect languages on mime association changes [#7805](https://github.com/eclipse-theia/theia/pull/7805)
- [monaco] fixed the border color for the find widget [#7835](https://github.com/eclipse-theia/theia/pull/7835)
- [navigator] added handling to select newly created files/folders in the explorer [#7762](https://github.com/eclipse-theia/theia/pull/7762)
- [output] improved the output-view display [#7827](https://github.com/eclipse-theia/theia/pull/7827)
- [plugin] added handling of quick pick/input cancellations [#6921](https://github.com/eclipse-theia/theia/pull/6921)
- [plugin] added support for `CompletionItem.range` shape [#7820](https://github.com/eclipse-theia/theia/pull/7820)
- [plugin] added support for `explorer.newFolder` command [#7843](https://github.com/eclipse-theia/theia/pull/7843)
- [plugin] added support for `workbench.action.revertAndCloseActiveEditor` API [#7702](https://github.com/eclipse-theia/theia/pull/7702)
- [plugin] added support for the `vscode.workspace.fs` APIs for registered filesystem providers only (not yet real file system) [#7824](https://github.com/eclipse-theia/theia/pull/7824)
- [plugin] added support for the `workbench.action.openRecent` command [#7812](https://github.com/eclipse-theia/theia/pull/7812)
- [plugin] added support for the `workspace` API `onDidCreateFiles` [#7718](https://github.com/eclipse-theia/theia/pull/7718)
- [plugin] added support for the `workspace` API `onDidDeleteFiles` [#7718](https://github.com/eclipse-theia/theia/pull/7718)
- [plugin] added support for the `workspace` API `onDidRenameFiles` [#7718](https://github.com/eclipse-theia/theia/pull/7718)
- [plugin] added support for the `workspace` API `onWillCreateFiles` [#7718](https://github.com/eclipse-theia/theia/pull/7718)
- [plugin] added support for the `workspace` API `onWillDeleteFiles` [#7718](https://github.com/eclipse-theia/theia/pull/7718)
- [plugin] added support for the `workspace` API `onWillRenameFiles` [#7718](https://github.com/eclipse-theia/theia/pull/7718)
- [plugin] added support for the command `terminal.kill` [#7906](https://github.com/eclipse-theia/theia/pull/7906)
- [plugin] added support for the command `terminalSendSequence` [#7906](https://github.com/eclipse-theia/theia/pull/7906)
- [plugin] added support for when-closures for the quick-view palette [#6921](https://github.com/eclipse-theia/theia/pull/6921)
- [plugin] fixed `registerCommand` API incompatibilities [#7296](https://github.com/eclipse-theia/theia/pull/7296)
- [plugin] fixed issue where contributed views had blank square icons on reload [#7756](https://github.com/eclipse-theia/theia/pull/7756)
- [plugin] fixed leaking filesystem resource [#6921](https://github.com/eclipse-theia/theia/pull/6921)
- [plugin] fixed potential activation deadlock [#6921](https://github.com/eclipse-theia/theia/pull/6921)
- [plugin] fixed synching of visible and active editors [#6921](https://github.com/eclipse-theia/theia/pull/6921)
- [plugin] fixed the computing of external icon urls [#6921](https://github.com/eclipse-theia/theia/pull/6921)
- [plugin] fixed the tree-view reveal [#6921](https://github.com/eclipse-theia/theia/pull/6921)
- [plugin] fixed the update of quick-pick items [#6921](https://github.com/eclipse-theia/theia/pull/6921)
- [plugin] updated handling of plugin folder paths [#7799](https://github.com/eclipse-theia/theia/pull/7799)
- [plugin] updated handling to not require non-existing plugin main [#7852](https://github.com/eclipse-theia/theia/pull/7852)
- [preferences] improved the `preferences` widget user-interface [#7105](https://github.com/eclipse-theia/theia/pull/7105)
- [scm] added `scm.defaultViewMode` preference to control the display of the `scm` widget [#7717](https://github.com/eclipse-theia/theia/pull/7717)
- [scm] added handling to refresh widget on activation [#7880](https://github.com/eclipse-theia/theia/pull/7880)
- [scm] added support for displaying the `scm` view as a tree [#7505](https://github.com/eclipse-theia/theia/pull/7505)
- [scm] fixed missing commit and amend functionality when opening a new workspace [#7769](https://github.com/eclipse-theia/theia/pull/7769)
- [scm] fixed restoring last commit message [#7818](https://github.com/eclipse-theia/theia/pull/7818)
- [task] added support for user-level task configurations [#7620](https://github.com/eclipse-theia/theia/pull/7620)
- [task] fixed task execution on macOS with `zsh` [#7889](https://github.com/eclipse-theia/theia/pull/7889)
- [task] improved order of task configurations [#7696](https://github.com/eclipse-theia/theia/pull/7696)
- [task] updated the when-closure when executing `Run Last Task` [#7890](https://github.com/eclipse-theia/theia/pull/7890)
- [terminal] added handling to detach the `TerminalSearchWidget` before disposing the `TerminalWidget` [#7882](https://github.com/eclipse-theia/theia/pull/7882)
- [workspace] added the `workspaceState` when-closure context [#7846](https://github.com/eclipse-theia/theia/pull/7846)

Breaking changes:

- [application-package] moved `disallowReloadKeybinding` under the `electron` subsection [#7803](https://github.com/eclipse-theia/theia/pull/7803)
- [core] `KeybindingRegistry` registers a new keybinding with a higher priority than previously in the same scope [#7839](https://github.com/eclipse-theia/theia/pull/7839)
- [scm] added support for `tree view mode` in the `scm` view [#7505](https://github.com/eclipse-theia/theia/pull/7505)
  - classes that currently extend `ScmWidget` will likely require changes.
- [task] removed `taskId` from `TaskTerminalWidgetOpenerOptions` [#7765](https://github.com/eclipse-theia/theia/pull/7765)

## v1.1.0 - 30/04/2020

- [application-manager] added meta tag to enable fullscreen on iOS devices [#7663](https://github.com/eclipse-theia/theia/pull/7663)
- [application-package] added warning if an unknown target is provided [#7578](https://github.com/eclipse-theia/theia/pull/7578)
- [application-package] updated default application name from 'Theia' to 'Eclipse Theia' [#7656](https://github.com/eclipse-theia/theia/pull/7656)
- [cli] improved the `download:plugins` script including performance and error handling [#7677](https://github.com/eclipse-theia/theia/pull/7677)
- [cli] updated the `download:plugins` script to include colors for better visibility [#7648](https://github.com/eclipse-theia/theia/pull/7648)
- [core] added functionality to prevent pasting into the active editor when closing a tab with a middle mouse click [#7565](https://github.com/eclipse-theia/theia/pull/7565)
- [core] added support to allow providing a custom node for ReactWidget [#7422](https://github.com/eclipse-theia/theia/pull/7422)
- [core] aligned max listeners check with VS Code expectations [#7508](https://github.com/eclipse-theia/theia/pull/7508)
- [core] fixed 'recently used commands' to be only added when triggered by the quick-command palette [#7552](https://github.com/eclipse-theia/theia/pull/7552)
- [core] fixed 'recently used commands': [#7562](https://github.com/eclipse-theia/theia/pull/7562)
  - added sorting of commands based on their human-readable label
  - fixed issue where recently used commands where not correctly separated by a border and groupName
- [core] fixed issue where menu args where unnecessarily wrapped into another array [#7622](https://github.com/eclipse-theia/theia/pull/7622)
- [core] fixed leaking `DisposableCollection.onDispose` event [#7508](https://github.com/eclipse-theia/theia/pull/7508)
- [core] fixed release of leaking editor from quick-open and goto references [#7508](https://github.com/eclipse-theia/theia/pull/7508)
- [core] improved display for the 'Remove Folder from Workspace` dialog [#7449](https://github.com/eclipse-theia/theia/pull/7449)
- [core] upgraded `nsfw` to 1.2.9 [#7535](https://github.com/eclipse-theia/theia/pull/7535)
- [core] upgraded `vscode-uri` to version ^2.1.1 [#7506](https://github.com/eclipse-theia/theia/pull/7506)
- [core] upgraded to LSP 6.0.0 [#7149](https://github.com/eclipse-theia/theia/pull/7149)
- [documentation] updated developing documentation for Windows [#7640](https://github.com/eclipse-theia/theia/pull/7640)
- [editor] updated binding of `EditorCommandContribution` and `EditorMenuContribution` [#7569](https://github.com/eclipse-theia/theia/pull/7569)
- [electron] added functionality to fork the backend unless `--no-cluster` flag is specified [#7386](https://github.com/eclipse-theia/theia/pull/7386)
- [electron] added functionality to pass arguments to the backend process [#7386](https://github.com/eclipse-theia/theia/pull/7386)
- [electron] fixed setting `process.versions.electron` for sub-processes [#7386](https://github.com/eclipse-theia/theia/pull/7386)
- [git] disabled the 'Git Initialize Repository' action when no workspace is opened [#7492](https://github.com/eclipse-theia/theia/pull/7492)
- [git] updated `successExitCodes` and `expectedErrors` to arrays to fix serialization [#7627](https://github.com/eclipse-theia/theia/pull/7627)
- [keymaps] updated the keybindings-widget sorting, and added category as part of the label if applicable [#7532](https://github.com/eclipse-theia/theia/pull/7532)
- [monaco] added handling to respect `editor.maxTokenizationLineLength` preference [#7618](https://github.com/eclipse-theia/theia/pull/7618)
- [monaco] fixed incorrect `isChord` call [#7468](https://github.com/eclipse-theia/theia/pull/7468)
- [monaco] reworked Monaco commands to align with VS Code [#7539](https://github.com/eclipse-theia/theia/pull/7539)
- [monaco] upgraded `onigasm` to version ^2.2.0 fixing syntax-highlighting [#7610](https://github.com/eclipse-theia/theia/pull/7610)
- [monaco] upgraded to Monaco version 0.19.3 [#7149](https://github.com/eclipse-theia/theia/pull/7149)
- [outline-view] fixed keybinding collision between toggling the outline-view and performing 'format document' on Linux [#7694](https://github.com/eclipse-theia/theia/pull/7694)
- [output] added `Select All` in the output-view [#7523](https://github.com/eclipse-theia/theia/pull/7523)
- [output] added optional argument `severity` to `OutputChannel.appendLine` method for coloring [#7549](https://github.com/eclipse-theia/theia/pull/7549)
- [plugin-ext] fixed custom icon themes and icons for Electron [#7583](https://github.com/eclipse-theia/theia/pull/7583)
- [plugin] added ability to override built-in commands [#7592](https://github.com/eclipse-theia/theia/pull/7592)
- [plugin] added additional `vscode.execute...` commands [#7563](https://github.com/eclipse-theia/theia/pull/7563)
- [plugin] added functionality preventing <kbd>F1</kbd> and <kbd>ctrlcmd</kbd>+<kbd>p</kbd> hotkeys in a webview iframe [#7496](https://github.com/eclipse-theia/theia/pull/7496)
- [plugin] added functionality which makes `env.appName` reuse the value of `applicationName` (as defined in the `package.json`) [#7642](https://github.com/eclipse-theia/theia/pull/7642)
- [plugin] added sorting of plugin in the plugins-view [#7601](https://github.com/eclipse-theia/theia/pull/7601)
- [plugin] added support for `SelectionRange` and `SelectionRangeProvider` VS Code API [#7534](https://github.com/eclipse-theia/theia/pull/7534)
- [plugin] aligned message-service behavior with VS Code [#7500](https://github.com/eclipse-theia/theia/pull/7500)
- [plugin] fixed error handling when selecting an invalid node for hosted-plugins [#7636](https://github.com/eclipse-theia/theia/pull/7636)
- [plugin] fixed incompatibility issues with `SaveFileDialog` [#7461](https://github.com/eclipse-theia/theia/pull/7461)
- [plugin] fixed late textmate-grammar activation [#7544](https://github.com/eclipse-theia/theia/pull/7544)
- [plugin] fixed overriding of built-in Monaco commands [#7539](https://github.com/eclipse-theia/theia/pull/7539)
- [plugin] fixed parsing of DAP messages to match VS Code API [#7517](https://github.com/eclipse-theia/theia/pull/7517)
- [plugin] removed filtering of duplicate tasks [#7676](https://github.com/eclipse-theia/theia/pull/7676)
- [plugin] removed registration of commands provided by Monaco [#7592](https://github.com/eclipse-theia/theia/pull/7592)
- [plugin] removed unused injections of `ResourceProvider` [#7595](https://github.com/eclipse-theia/theia/pull/7595)
- [plugin] updated the VS Code API version to 1.44.0 [#7564](https://github.com/eclipse-theia/theia/pull/7564)
- [preferences] added functionality which defers change events in the same tick [#7676](https://github.com/eclipse-theia/theia/pull/7676)
- [scm] fixed `overviewRuler` and `minimap` theming for SCM decorations [#7330](https://github.com/eclipse-theia/theia/pull/7330)
- [task] added functionality which saves the scope as part of the `TaskService.lastTask` [#7553](https://github.com/eclipse-theia/theia/pull/7553)
- [task] added functionality which sets focus to the terminal that the attached task is running from [#7452](https://github.com/eclipse-theia/theia/pull/7452)
- [task] added support for `presentation.clear` in the task configuration schema [#7454](https://github.com/eclipse-theia/theia/pull/7454)
- [task] added support for `presentation.echo` in the task configuration schema [#7503](https://github.com/eclipse-theia/theia/pull/7503)
- [task] added support for `presentation.panel` in the task configuration schema [#7260](https://github.com/eclipse-theia/theia/pull/7260)
- [task] added support for `presentation.showReuseMessage` in the task configuration schema [#7454](https://github.com/eclipse-theia/theia/pull/7454)
- [task] added support for modifying existing problem matchers [#7455](https://github.com/eclipse-theia/theia/pull/7455)
- [task] added support for user-defined labels for detected tasks [#7574](https://github.com/eclipse-theia/theia/pull/7574)
- [task] fixed `presentation.reveal` and `presentation.focus` for detected tasks [#7548](https://github.com/eclipse-theia/theia/pull/7548)
- [task] fixed issue to only allow running selected texts in a user terminal [#7453](https://github.com/eclipse-theia/theia/pull/7453)
- [terminal] added new terminal preferences [#7660](https://github.com/eclipse-theia/theia/pull/7660)
  - `terminal.integrated.shell.linux`
  - `terminal.integrated.shell.osx`
  - `terminal.integrated.shell.windows`
  - `terminal.integrated.shellArgs.linux`
  - `terminal.integrated.shellArgs.osx`
  - `terminal.integrated.shellArgs.windows`
- [test] added API tests for the TypeScript language [#7265](https://github.com/eclipse-theia/theia/pull/7265)
- [test] fixed API tests on Windows [#7655](https://github.com/eclipse-theia/theia/pull/7655)
- [vsx-registry] fixed minor font-family inconsistency with the download count [#7380](https://github.com/eclipse-theia/theia/pull/7380)
- [vsx-registry] fixed rendering of rating and downloads if they have no value [#7380](https://github.com/eclipse-theia/theia/pull/7380)
- [vsx-registry] updated styling of extension information [#7439](https://github.com/eclipse-theia/theia/pull/7439)
- [workspace] added normalization of workspace root paths [#7598](https://github.com/eclipse-theia/theia/pull/7598)
- [workspace] fixed incorrect statusbar color when in a multi-root workspace without any root folders [#7688](https://github.com/eclipse-theia/theia/pull/7688)

Breaking changes:

- [core] `CommandRegistry.registerHandler` registers a new handler with a higher priority than previously [#7539](https://github.com/eclipse-theia/theia/pull/7539)
- [plugin] deprecated is now `PluginModel.packagePath` and `PluginModel.packageUri` should be used instead [#7583](https://github.com/eclipse-theia/theia/pull/7583)
- [plugin] removed `configStorage` argument from `PluginManager.registerPlugin` [#7265](https://github.com/eclipse-theia/theia/pull/7265)
  - use `PluginManager.configStorage` property instead. [#7265](https://github.com/eclipse-theia/theia/pull/7265)
- [process] `TerminalProcess` doesn't handle shell quoting, the shell process arguments must be prepared from the caller [#6836](https://github.com/eclipse-theia/theia/pull/6836)
  - Removed all methods related to shell escaping inside this class. You should use functions located in `@theia/process/lib/common/shell-quoting.ts`
  in order to process arguments for shells.
- [process/terminal] moved shell escaping utilities into `@theia/process/lib/common/shell-quoting` and `@theia/process/lib/common/shell-command-builder` for creating shell inputs [#6836](https://github.com/eclipse-theia/theia/pull/6836)

## v1.0.0 - 26/03/2020

- [core] added functionality to ensure that nodes are refreshed properly on tree expansion [#7400](https://github.com/eclipse-theia/theia/pull/7400)
- [core] added loading state for trees [#7249](https://github.com/eclipse-theia/theia/pull/7249)
- [core] added the ability to customize the layout of view-containers [#6655](https://github.com/eclipse-theia/theia/pull/6655)
- [core] added the ability to customize the stored state of view-containers [#6655](https://github.com/eclipse-theia/theia/pull/6655)
- [core] fixed keybindings for special numpad keys in editors [#7329](https://github.com/eclipse-theia/theia/pull/7329)
- [core] fixed missing progress events [#7314](https://github.com/eclipse-theia/theia/pull/7314)
- [core] updated 'close' commands to respect `widget.closable` property [#7278](https://github.com/eclipse-theia/theia/pull/7278)
- [core] updated `inputValidation` theming [#7351](https://github.com/eclipse-theia/theia/pull/7351)
- [core] updated command execution to always use `CommandService.execute` [#7326](https://github.com/eclipse-theia/theia/pull/7326)
- [debug] added functionality to lazily update of stack frames of all threads in all-stop mode [#7281](https://github.com/eclipse-theia/theia/pull/7281)
- [documentation] updated prerequisites to include `build-essential` [#7256](https://github.com/eclipse-theia/theia/pull/7256)
- [documentation] updated the readme of individual extensions to include additional information, and links to generated API docs [#7254](https://github.com/eclipse-theia/theia/pull/7254)
- [electron] updated token check to use `timingSafeEqual` [#7308](https://github.com/eclipse-theia/theia/pull/7308)
- [file-search] updated `ripgrep` to search files in hidden folders [#7333](https://github.com/eclipse-theia/theia/pull/7333)
- [git] fixed duplicate entries for 'Git History' on merge operations [#7188](https://github.com/eclipse-theia/theia/pull/7188)
- [markers] added foreground coloring of nodes in the `explorer` to reflect problem markers [#6863](https://github.com/eclipse-theia/theia/pull/6863)
- [markers] added sorting of diagnostic markers for a given resource [#7313](https://github.com/eclipse-theia/theia/pull/7313)
- [markers] updated format of diagnostic markers in the `problems-view` [#7344](https://github.com/eclipse-theia/theia/pull/7344)
- [messages] updated to disallow arbitrary HTML in message content [#7289](https://github.com/eclipse-theia/theia/pull/7289)
- [mini-browser] updated `MiniBrowserEndpoint.defaultHandler()` response for non mime-db files [#7356](https://github.com/eclipse-theia/theia/pull/7356)
- [navigator] added busy progress for the explorer [#7249](https://github.com/eclipse-theia/theia/pull/7249)
- [plugin] added `workbench.action.addRootFolder` command [#7350](https://github.com/eclipse-theia/theia/pull/7350)
- [plugin] added `workbench.action.openSettings` command [#7320](https://github.com/eclipse-theia/theia/pull/7320)
- [plugin] added frontend APIs to listen when plugins are initially loaded [#6655](https://github.com/eclipse-theia/theia/pull/6655)
- [plugin] added functionality to ensure that node-based debug adapters spawn the same node version as the framework [#7294](https://github.com/eclipse-theia/theia/pull/7294)
- [plugin] added support for User-defined plugins [#6655](https://github.com/eclipse-theia/theia/pull/6655)
- [plugin] added support for killing sub-threads run by shell scripts [#7391](https://github.com/eclipse-theia/theia/pull/7391)
- [plugin] added support for loading plugins from symbolic links [#7242](https://github.com/eclipse-theia/theia/pull/7242)
- [plugin] exposed frontend API to access loaded plugins metadata [#6655](https://github.com/eclipse-theia/theia/pull/6655)
- [plugin] fixed 'find all references' for the typescript built-in plugin [#7055](https://github.com/eclipse-theia/theia/pull/7055)
- [plugin] fixed `storagePath` to return `undefined` when necessary [#7394](https://github.com/eclipse-theia/theia/pull/7394)
- [plugin] fixed leaking plugins (codelens) [#7238](https://github.com/eclipse-theia/theia/pull/7238)
- [preferences] added a new preference to silence notifications [#7195](https://github.com/eclipse-theia/theia/pull/7195)
- [scm] fixed focus border for commit message textarea [#7340](https://github.com/eclipse-theia/theia/pull/7340)
- [terminal] added new `terminal.integrated.cursorBlinking` preference [#7284](https://github.com/eclipse-theia/theia/pull/7284)
- [terminal] added new `terminal.integrated.cursorStyle` preference [#7284](https://github.com/eclipse-theia/theia/pull/7284)
- [terminal] added new `terminal.integrated.cursorWidth` preference [#7284](https://github.com/eclipse-theia/theia/pull/7284)
- [terminal] added new `terminal.integrated.drawBoldTextInBrightColors` preference [#7284](https://github.com/eclipse-theia/theia/pull/7284)
- [terminal] added new `terminal.integrated.fastScrollSensitivity` preference [#7284](https://github.com/eclipse-theia/theia/pull/7284)
- [terminal] fixed `home`, `page-up`, `page-down` shortcuts [#7305](https://github.com/eclipse-theia/theia/pull/7305)
- [terminal] fixed color theming [#7325](https://github.com/eclipse-theia/theia/pull/7325)
- [terminal] upgraded `xterm` dependency [#7121](https://github.com/eclipse-theia/theia/pull/7121)
- [vsx-registry] added a new `vsx-registry` extension to manage plugins [#6655](https://github.com/eclipse-theia/theia/pull/6655)
- [workspace] fixed issue where `NEW_FILE` and `NEW_FOLDER` could not be triggered under certain conditions [#7302](https://github.com/eclipse-theia/theia/pull/7302)

Breaking changes:

- [debug] renamed `debuggingStaturBar` to `debuggingStatusBar` [#7409](https://github.com/eclipse-theia/theia/pull/7409)
- [plugin] renamed `CancelationTokenImpl` to `CancellationTokenImpl` [#7409](https://github.com/eclipse-theia/theia/pull/7409)
- [plugin] renamed `VIEW_ITEM_INLINE_MNUE` to `VIEW_ITEM_INLINE_MENU` [#7409](https://github.com/eclipse-theia/theia/pull/7409)
- [scm | git] moved the `GitHistoryWidget` (History View), and `GitNavigableListWidget` to a new packaged named `scm-extra` [#6381](https://github.com/eclipse-theia/theia/pull/6381)
  - Renamed `GitHistoryWidget` to `ScmHistoryWidget`
  - CSS classes have been also been moved, and renamed accordingly
- [task] removed `TaskAttachQuickOpenItem` [#7392](https://github.com/eclipse-theia/theia/pull/7392)
- [task] removed `TaskService.taskProviderRegistry` [#7418](https://github.com/eclipse-theia/theia/pull/7418)
- [task] renamed `TaskRestartRunningQuickOpenItem` to `RunningTaskQuickOpenItem` [#7392](https://github.com/eclipse-theia/theia/pull/7392)
- [terminal] renamed `handleWroleWordOptionClicked` to `handleWholeWordOptionClicked` [#7409](https://github.com/eclipse-theia/theia/pull/7409)
- [workspace] renamed `toDiposeOnUpdateCurrentWidget` to `toDisposeOnUpdateCurrentWidget` [#7409](https://github.com/eclipse-theia/theia/pull/7409)

## v0.16.0 - 27/02/2020

- [cli] added an additional flag to the `download:plugins` script [#7123](https://github.com/eclipse-theia/theia/pull/7123)
  - `p=true`: plugins should be preserved as they are (compressed).
  - `p=false` (default): plugins should be uncompressed.
- [cli] added API to create integration test pages [#7029](https://github.com/eclipse-theia/theia/pull/7029)
- [core] added a new React-based dialog type `ReactDialog` [#6855](https://github.com/eclipse-theia/theia/pull/6855)
- [core] added ability to make the application data folder configurable [#7214](https://github.com/eclipse-theia/theia/pull/7214)
- [core] added additional commands to close main area widgets [#7101](https://github.com/eclipse-theia/theia/pull/7101)
- [core] added handling to dismiss any active menu when the quick palette is opened [#7136](https://github.com/eclipse-theia/theia/pull/7136)
- [core] added handling to ensure that disabled keybindings do not shadow enabled ones [#7022](https://github.com/eclipse-theia/theia/pull/7022)
- [core] added support for icons in a submenu [#7091](https://github.com/eclipse-theia/theia/pull/7091)
- [core] fixed 'out of sync' error [#7139](https://github.com/eclipse-theia/theia/pull/7139)
- [core] fixed import in `lsp-types.ts` [#7075](https://github.com/eclipse-theia/theia/pull/7075)
- [core] fixed set selection on right-click [#7147](https://github.com/eclipse-theia/theia/pull/7147)
- [core] fixed the `TOGGLE_MAXIMIZED` command [#7012](https://github.com/eclipse-theia/theia/pull/7012)
- [core] fixed the search-box for trees [#7089](https://github.com/eclipse-theia/theia/pull/7089)
- [core] fixed tree highlighting foreground color [#7025](https://github.com/eclipse-theia/theia/pull/7025)
- [core] updated `RecursivePartial` to allow arrays [#7201](https://github.com/eclipse-theia/theia/pull/7201)
- [core] updated the `AboutDialog` to include the `applicationName` [#7135](https://github.com/eclipse-theia/theia/pull/7135)
- [core] updated the `DialogProps` to include: [#7080](https://github.com/eclipse-theia/theia/pull/7080)
  - `maxWidth`: control the maximum width allowed for a dialog.
  - `wordWrap`: control the word wrapping behavior for content in the dialog.
- [core] updated the `THEIA_ENV_REGEXP_EXCLUSION` [#7085](https://github.com/eclipse-theia/theia/pull/7085)
- [debug] added ability to lazily update frames of all threads in all-stop mode [#6869](https://github.com/eclipse-theia/theia/pull/6869)
- [debug] fixed issue where breakpoints were incorrectly rendered on column 1 [#7211](https://github.com/eclipse-theia/theia/pull/7211)
- [documentation] updated code of conduct [#7161](https://github.com/eclipse-theia/theia/pull/7161)
- [editor] updated the log level for the `NavigationLocationService` [#7042](https://github.com/eclipse-theia/theia/pull/7042)
- [electron] added default properties for `OpenDialog` [#7208](https://github.com/eclipse-theia/theia/pull/7208)
- [electron] added handling so only the `BrowserWindow` can access backend HTTP services [#7205](https://github.com/eclipse-theia/theia/pull/7205)
- [electron] updated stat check handling for the save dialog [#7197](https://github.com/eclipse-theia/theia/pull/7197)
- [filesystem] updated the handling of deletions triggered by a user [#7139](https://github.com/eclipse-theia/theia/pull/7139)
- [git] added additional handling when a user attempts to amend without a previous commit [#7033](https://github.com/eclipse-theia/theia/pull/7033)
- [keymaps] updated the keyboard shortcuts widget font-size [#7060](https://github.com/eclipse-theia/theia/pull/7060)
- [markers] improved marker node descriptions [#7209](https://github.com/eclipse-theia/theia/pull/7209)
- [markers] updated marker tooltips to display full path to resource [#7207](https://github.com/eclipse-theia/theia/pull/7207)
- [mini-browser] added additional `HtmlHandler` support [#6969](https://github.com/eclipse-theia/theia/pull/6969)
- [monaco] added handling to activate a grammar only for languages with a registered grammar [#7110](https://github.com/eclipse-theia/theia/pull/7110)
- [monaco] added support for array snippet prefixes [#7177](https://github.com/eclipse-theia/theia/pull/7177)
- [monaco] close an active menubar dropdown when the quick palette is launched [#7136](https://github.com/eclipse-theia/theia/pull/7136)
- [monaco] implemented support for multiple workspace folders in `MonacoWorkspace` [#7182](https://github.com/eclipse-theia/theia/pull/7182)
- [plugin] added ability to customize the plugin host process [#7181](https://github.com/eclipse-theia/theia/pull/7181)
- [plugin] added functionality to expose the metadata scanner to the API [#7134](https://github.com/eclipse-theia/theia/pull/7134)
- [plugin] added functionality to show progress on plugin activation [#7017](https://github.com/eclipse-theia/theia/pull/7017)
- [plugin] added handling to activate a language based on created mode [#7110](https://github.com/eclipse-theia/theia/pull/7110)
- [plugin] added handling to gracefully terminate plugin host processes without an rpc connection [#7192](https://github.com/eclipse-theia/theia/pull/7192)
- [plugin] added handling to prevent error on disabled performance API [#7175](https://github.com/eclipse-theia/theia/pull/7175)
- [plugin] fixed `window.showTextDocument` to allow opening resources with `untitled` schema [#6803](https://github.com/eclipse-theia/theia/pull/6803)
- [plugin] implemented `readFile` for workspace filesystem [#6980](https://github.com/eclipse-theia/theia/pull/6980)
- [plugin] implemented `writeFile` for workspace filesystem [#6980](https://github.com/eclipse-theia/theia/pull/6980)
- [preferences] added functionality to use text models to update content [#7110](https://github.com/eclipse-theia/theia/pull/7110)
- [preferences] fixed display of file icons [#7011](https://github.com/eclipse-theia/theia/pull/7011)
- [preview] added ability to render `.markdown` files [#7234](https://github.com/eclipse-theia/theia/pull/7234)
- [repo] added two new npm scripts: [#7096](https://github.com/eclipse-theia/theia/pull/7096)
  - `test:references`: fails if typescript references are out of sync.
  - `prepare:references`: updates typescript references, if required.
- [repo] the `prepare` script now updates typescript references.
- [repo] updated the `prepare` script so it now updates typescript references [#7096](https://github.com/eclipse-theia/theia/pull/7096)
- [scm] fixed alignment of file icons [#7041](https://github.com/eclipse-theia/theia/pull/7041)
- [scm] fixed incorrect icon colors on hover [#7044](https://github.com/eclipse-theia/theia/pull/7044)
- [terminal] added a search widget to terminals [#5471](https://github.com/eclipse-theia/theia/pull/5471)
- [core] from now on, downstream projects can refine where the configuration files (such as `settings.json`, `keymaps.json`, `recentworkspace.json`, etc.) will be stored by Theia. [#4488](https://github.com/eclipse-theia/theia/pull/4488)\
The default location remains the same: `~/.theia`, however it can be customized by overriding the `#getConfigDirUri` method of the `EnvVariablesServer` API. The easiest way is to subclass the `EnvVariablesServerImpl` and rebind it in your backend module:
  ```ts
  // your-env-variables-server.ts:

  import { injectable } from 'inversify';
  import { EnvVariablesServerImpl } from '@theia/core/lib/node/env-variables';

  @injectable()
  export class YourEnvVariableServer extends EnvVariablesServerImpl {

      async getConfigDirUri(): Promise<string> {
          return 'file:///path/to/your/desired/config/dir';
      }

  }

  // your-backend-application-module.ts:

  import { ContainerModule } from 'inversify';
  import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
  import { YourEnvVariableServer } from './your-env-variables-server';

  export default new ContainerModule((bind, unbind, isBound, rebind) => {
      rebind(EnvVariablesServer).to(YourEnvVariableServer).inSingletonScope();
  });
  ```

Breaking changes:

- [core] fixed typo (highligh -> highlight) in caption highlight fragment [#7050](https://github.com/eclipse-theia/theia/pull/7050)
- [terminal] added new abstract methods to the TerminalWidget[#7179]: `scrollLineUp`, `scrollLineDown`, `scrollToTop`, `scrollPageUp`, `scrollPageDown`
- The release includes the removal of language-specific Theia extensions and other Theia extensions that are or can be replaced by equivalent VS Code extensions.
  - Migration steps are available at the following wiki page [`Consuming Builtin and External VS Code Extensions`](https://github.com/eclipse-theia/theia/wiki/Consuming-Builtin-and-External-VS-Code-Extensions).
  - [debug-nodejs] removed the `@theia/debug-nodejs` extension [#6933](https://github.com/eclipse-theia/theia/pull/6933)
      - The extension will no longer be maintained by the project and remains in the Git history for anyone who would like to reference it or maintain it.
  - [editorconfig] removed the `@theia/editorconfig` extension [#6933](https://github.com/eclipse-theia/theia/pull/6933)
      - The extension will no longer be maintained by the project and remains in the Git history for anyone who would like to reference it or maintain it.
  - [java] removed the `@theia/java` extension [#6933](https://github.com/eclipse-theia/theia/pull/6933)
      - The extension will no longer be maintained by the project and remains in the Git history for anyone who would like to reference it or maintain it.
      - Please view the `theia-apps` [theia-java](https://github.com/theia-ide/theia-apps/tree/master/theia-java-docker) image for an example application which has been updated to
      use VS Code extensions instead of `@theia/java`.
  - [java-debug] removed the `@theia/java-debug` extension [#6933](https://github.com/eclipse-theia/theia/pull/6933)
      - The extension will no longer be maintained by the project and remains in the Git history for anyone who would like to reference it or maintain it.
      - Please view the `theia-apps` [theia-java](https://github.com/theia-ide/theia-apps/tree/master/theia-java-docker) image for an example application which has been updated to
      use VS Code extensions instead of `@theia/java-debug`.
  - [merge-conflicts] removed the `@theia/merge-conflicts` extension [#6933](https://github.com/eclipse-theia/theia/pull/6933)
      - The extension will no longer be maintained by the project and remains in the Git history for anyone who would like to reference it or maintain it.
  - [python] removed the `@theia/python` extension [#6933](https://github.com/eclipse-theia/theia/pull/6933)
      - The extension will no longer be maintained by the project and remains in the Git history for anyone who would like to reference it or maintain it.
      - Please view the `theia-apps` [theia-python](https://github.com/theia-ide/theia-apps/tree/master/theia-python-docker) image for an example application which has been updated to
      use VS Code extensions instead of `@theia/python`.
  - [textmate-grammars] removed the `@theia/textmate-grammars` extension [#6933](https://github.com/eclipse-theia/theia/pull/6933)
      - The extension will no longer be maintained by the project and remains in the Git history for anyone who would like to reference it or maintain it.
  - [tslint] removed the `@theia/tslint` extension [#6933](https://github.com/eclipse-theia/theia/pull/6933)
      - The extension will no longer be maintained by the project and remains in the Git history for anyone who would like to reference it or maintain it.
  - [typescript] removed the `@theia/typescript` extension [#6933](https://github.com/eclipse-theia/theia/pull/6933)
      - The extension will no longer be maintained by the project and remains in the Git history for anyone who would like to reference it or maintain it.
      - Please view the `theia-apps` [theia-typescript](https://github.com/theia-ide/theia-apps/tree/master/theia-docker) image for an example application which has been updated to
      use VS Code extensions instead of `@theia/typescript`.

## v0.15.0 - 30/01/2020

- [application-manager] added config to disable reloading windows [#6981](https://github.com/eclipse-theia/theia/pull/6981)
- [application-manager] added meta viewport tag [#6967](https://github.com/eclipse-theia/theia/pull/6967)
- [application-manager] fixed the circular dependency exclude path on Windows [#6893](https://github.com/eclipse-theia/theia/pull/6893)
- [console] fixed the debug console user input alignment [#6958](https://github.com/eclipse-theia/theia/pull/6958)
- [core] fixed XSS vulnerability in the browser sidebar [#6988](https://github.com/eclipse-theia/theia/pull/6988)
- [core] fixed issue to close the websocket channel when a language server connection is closed [#6854](https://github.com/eclipse-theia/theia/pull/6854)
- [core] fixed issue to exclude numpad keys from the keyboard mapping [#6881](https://github.com/eclipse-theia/theia/pull/6881)
- [core] improved formatting of performance values in the logs [#6858](https://github.com/eclipse-theia/theia/pull/6858)
- [core] updated handling of `ApplicationShell.getAreaFor` for tabbars [#6994](https://github.com/eclipse-theia/theia/pull/6994)
- [core] updated keybinding check in case full and partial bindings are registered [#6934](https://github.com/eclipse-theia/theia/pull/6934)
- [core] updated logic to collapse panels on toggle view [#6963](https://github.com/eclipse-theia/theia/pull/6963)
- [debug] added exception breakpoints support [#5774](https://github.com/eclipse-theia/theia/pull/5774)
- [debug] added function breakpoints support [#5774](https://github.com/eclipse-theia/theia/pull/5774)
- [debug] added inline breakpoints support [#5774](https://github.com/eclipse-theia/theia/pull/5774)
- [debug] added watch expression support [#5774](https://github.com/eclipse-theia/theia/pull/5774)
- [debug] fixed styling issues with the debug hover [#6887](https://github.com/eclipse-theia/theia/pull/6887)
- [documentation] updated developing documentation for Windows [#6893](https://github.com/eclipse-theia/theia/pull/6893)
- [editor] added `toggle minimap` command and menu item [#6843](https://github.com/eclipse-theia/theia/pull/6843)
- [editor] added `toggle render whitespace` command and menu item [#6843](https://github.com/eclipse-theia/theia/pull/6843)
- [editor] added `toggle word wrap` command and menu item [#6843](https://github.com/eclipse-theia/theia/pull/6843)
- [editor] added missing statusbar tooltip for `go to line` [#6770](https://github.com/eclipse-theia/theia/pull/6770)
- [editor] added missing statusbar tooltip for `select encoding` [#6770](https://github.com/eclipse-theia/theia/pull/6770)
- [editor] added missing statusbar tooltip for `select end of line sequence` [#6770](https://github.com/eclipse-theia/theia/pull/6770)
- [editor] added missing statusbar tooltip for `select indentation` [#6770](https://github.com/eclipse-theia/theia/pull/6770)
- [editor] added missing statusbar tooltip for `select language mode` [#6770](https://github.com/eclipse-theia/theia/pull/6770)
- [editor] updated the `go to line` statusbar item to trigger the `go to line` command directly [#6770](https://github.com/eclipse-theia/theia/pull/6770)
- [file-search] improved the results obtained when performing a file search [#6642](https://github.com/eclipse-theia/theia/pull/6642)
- [filesystem] fixed icon and file name alignment [#6973](https://github.com/eclipse-theia/theia/pull/6973)
- [filesystem] improved the 'file has changed' dialog [#6873](https://github.com/eclipse-theia/theia/pull/6873)
- [git] updated the `git checkout` statusbar tooltip similarly to VS Code [#6779](https://github.com/eclipse-theia/theia/pull/6779)
- [git] updated the version of `find-git-repositories` [#6850](https://github.com/eclipse-theia/theia/pull/6850)
- [keybindings] fixed an issue allowing users to change default keybindings [#6880](https://github.com/eclipse-theia/theia/pull/6880)
- [keymaps] fixed column spacing for the keybindings-widget [#6989](https://github.com/eclipse-theia/theia/pull/6989)
- [markers] added statusbar tooltip displaying the number of current problem markers by severity [#6771](https://github.com/eclipse-theia/theia/pull/6771)
- [merge-conflicts] fixed the typo present in the `merge-conflicts` command category [#6790](https://github.com/eclipse-theia/theia/pull/6790)
- [monaco] added normalization of textmate colors [#6966](https://github.com/eclipse-theia/theia/pull/6966)
- [monaco] fixed issue with the quick-pick when there are no items [#6870](https://github.com/eclipse-theia/theia/pull/6870)
- [monaco] fixed missing `await` on workspace edits file creation [#6851](https://github.com/eclipse-theia/theia/pull/6851)
- [monaco] fixed the `inspect developer token` command [#6966](https://github.com/eclipse-theia/theia/pull/6966)
- [navigator] fixed race condition on contribution initialization [#6817](https://github.com/eclipse-theia/theia/pull/6817)
- [plugin] added ability to handle `vscode.openFolder` command [#6928](https://github.com/eclipse-theia/theia/pull/6928)
- [plugin] added parallel resolution of plugin entries [#6972](https://github.com/eclipse-theia/theia/pull/6972)
- [plugin] added the automatic removal of old session logs [#6956](https://github.com/eclipse-theia/theia/pull/6956)
  - By default only the last 10 (configurable using `--plugin-max-session-logs-folders=N`) session folders are retained.
- [plugin] fixed `workbench.action.closeActiveEditor` command [#6978](https://github.com/eclipse-theia/theia/pull/6978)
- [plugin] fixed header container alignment in the plugins-view [#6983](https://github.com/eclipse-theia/theia/pull/6983)
- [plugin] fixed implementation of `showTextDocument` API [#6824](https://github.com/eclipse-theia/theia/pull/6824)
- [plugin] fixed issue where tree-views were not properly displayed [#6939](https://github.com/eclipse-theia/theia/pull/6939)
- [plugin] fixed issue with `DocumentsMainImpl.toEditorOpenerOptions` [#6824](https://github.com/eclipse-theia/theia/pull/6824)
- [plugin] fixed self-hosting on Windows [#6316](https://github.com/eclipse-theia/theia/pull/6316)
- [preferences] fixed an indentation issue when using the preferences tree widget to add new preferences [#6736](https://github.com/eclipse-theia/theia/pull/6736)
- [scripts] added the ability to perform parallel lerna execution on Windows [#6893](https://github.com/eclipse-theia/theia/pull/6893)
- [search-in-workspace] improved the overall search performance [#6789](https://github.com/eclipse-theia/theia/pull/6798)
- [task] added `processId` and `terminalId` to the `TaskExitedEvent` [#6825](https://github.com/eclipse-theia/theia/pull/6825)
- [task] added a new command to `restart running task` [#6811](https://github.com/eclipse-theia/theia/pull/6811)
- [task] added support for `presentation.reveal` and `presentation.focus` [#6814](https://github.com/eclipse-theia/theia/pull/6814)
- [task] updated private accessibility of `restartTask` so it can be called by others [#6811](https://github.com/eclipse-theia/theia/pull/6811)
- [task] updated private accessibility of `terminateTask` so it can be called by others [#6811](https://github.com/eclipse-theia/theia/pull/6811)
- [terminal] added handling to always open terminal links on touchevents (e.g. when tapping a link on iPad) [#6875](https://github.com/eclipse-theia/theia/pull/6875)
- [terminal] fixed an issue regarding the `onDidChangeCurrentTerminal` event [#6799](https://github.com/eclipse-theia/theia/pull/6799)
- [terminal] fixed an issue which prevents re-using integrated terminals which have child processes spawned [#6769](https://github.com/eclipse-theia/theia/pull/6769)
- [terminal] improved the display of `new terminal` in a multi-root workspace [#6876](https://github.com/eclipse-theia/theia/pull/6876)
- [testing] added `API Integration` testing framework [#6852](https://github.com/eclipse-theia/theia/pull/6852)
- [workspace] fixed XSS vulnerability in the `new file` dialog [#6977](https://github.com/eclipse-theia/theia/pull/6977)

Breaking changes:

- [application-manager] updated `ApplicationPackageManager.start*` to return an instance of a server child process instead of promise [#6852](https://github.com/eclipse-theia/theia/pull/6852).
- [callhierarchy] updated CallHierarchyService to align with VS Code API [#6924](https://github.com/eclipse-theia/theia/pull/6924):
  - Use LanguageSelector instead of language id.
  - Use position instead of range for lookup of root symbol.
  - Changed data structures to be like VS Code API.
- [cli] renamed generated webpack config to `gen-webpack.config.js` [#6852](https://github.com/eclipse-theia/theia/pull/6852).
  `webpack.config.js` is generated only once. It can be edited by users to customize bundling,
  but should be based on `gen-webpack.config.js` to pick any changes in the generated config.
  If it does not have a reference to `gen-webpack.config.js` then it will be regenerated.
- [core] removed `virtual-renderer`. `react-renderer` should be used instead [#6885](https://github.com/eclipse-theia/theia/pull/6885)
- [core] removed `virtual-widget`. `react-widget` should be used instead [#6885](https://github.com/eclipse-theia/theia/pull/6885)
- [core] renamed method `registerComositionEventListeners()` to `registerCompositionEventListeners()` [#6961](https://github.com/eclipse-theia/theia/pull/6961)
- [debug] removed `@theia/json` dependency. Applications should explicitly depend on `@theia/json` instead [#6647](https://github.com/eclipse-theia/theia/pull/6647)
- [plugin] renamed `gererateTimeFolderName` to `generateTimeFolderName` [#6956](https://github.com/eclipse-theia/theia/pull/6956)
- [preferences] removed `@theia/json` dependency. Applications should explicitly depend on `@theia/json` instead [#6647](https://github.com/eclipse-theia/theia/pull/6647)
- [task] renamed method `getStrigifiedTaskSchema()` has been renamed to `getStringifiedTaskSchema()` [#6780](https://github.com/eclipse-theia/theia/pull/6780)
- [task] renamed method `reorgnizeTasks()` has been renamed to `reorganizeTasks()` [#6780](https://github.com/eclipse-theia/theia/pull/6780)
- Support VS Code icon and color theming. [#6475](https://github.com/eclipse-theia/theia/pull/6475)
  - Theming: Before `input`, `textarea`, `select` and `button` elements were styled in an ad-hoc manner, i.e.
  some were styled globally for a tag, other per a component and third with a dedicated css class name.
  Now Theia does not style these elements by default, but an extension developer should decide.
  Theia comes though with predefined css class names: `theia-input`, `theia-select` and `theia-button`
  to style input/textarea, select and button elements correspondingly. Existing components were refactored to use them.
  - Theming: Theia css colors are replaced with [VS Code colors](https://code.visualstudio.com/api/references/theme-color).
    - One can reference VS Code color in css by prefixing them with `--theia` and replacing all dots with dashes.
    For example `widget.shadow` color can be referenced in css with `var(--theia-widget-shadow)`.
    - One can resolve a current color value programmatically with `ColorRegistry.getCurrentColor`.
    - One can load a new color theme:
      - in the frontend module to enable it on startup

        ```ts
            MonacoThemingService.register({
                id: 'myDarkTheme',
                label: 'My Dark Theme',
                uiTheme: 'vs-dark',
                json: require('./relative/path/to/my_theme.json'),
                includes: {
                    './included_theme.json': require('./relative/path/to/included_theme.json')
                }
            });
        ```

      - later from a file:

        ```ts
            @inject(MonacoThemingService)
            protected readonly monacoThemeService: MonacoThemingService;

            this.monacoThemeService.register({
                id: 'myDarkTheme',
                label: 'My Dark Theme',
                uiTheme: 'vs-dark',
                uri: 'file:///absolute/path/to/my_theme.json'
            });
        ```

      - or install from a VS Code extension.
    - One should not introduce css color variables anymore or hardcode colors in css.
    - One can contribute new colors by implementing `ColorContribution` contribution point and calling `ColorRegistry.register`.
    It's important that new colors are derived from existing VS Code colors if one plans to allow installation of VS Code extension contributing color themes.
    Otherwise, there is no guarantee that new colors don't look alien for a random VS Code color theme.
    One can derive from an existing color, just by plainly referencing it, e.g. `dark: 'widget.shadow'`,
    or applying transformations, e.g. `dark: Color.lighten('widget.shadow', 0.4)`.
    - One can though specify values, without deriving from VS Code colors, for new colors in their own theme.
    See for example, how [Light (Theia)](packages/monaco/data/monaco-themes/vscode/light_theia.json) theme overrides colors for the activity bar.
  - Labeling: `LabelProvider.getIcon` should be sync and fast to avoid blocking rendering and icon caching.
  One has to pass more specific elements to get a more specific icon. For example, one cannot answer precisely from a URI
  whether a folder or a file icon should be used. If a client wants to get a proper result then it should pass `FileStat` for example or
  provide own `LabelProviderContribution` which derives `FileStat` from a custom data structure and then calls  `LabelProvider.getIcon` again.
  - Labeling: `LabelProviderContribution` methods can return `undefined` meaning that the next contribution should be tried.
  - Tree: `TreeNode.name`, `TreeNode.description` and `TreeNode.icon` are deprecated and will be removed later.
  One has to provide `LabelProviderContribution` implementation for a custom tree node structure.
  Before these attributes have to be computed for all nodes and stored as a part of the layout.
  From now on they will be computed only on demand for visible nodes.
  It decreases requirements to the local storage and allows to invalidate node appearance by simply re-rendering a tree.
- Updated `example-browser` and `example-electron` applications to remove extensions which are instead contributed by VS Code builtin extensions [#6883](https://github.com/eclipse-theia/theia/pull/6883)
  - Extensions removed from the example applications are deprecated and will be removed in the future. If adopters/extenders would like to continue
  using the deprecated extensions, they must be self-maintained and can be accessed through the repository's Git history.
  - In order to fetch plugins remotely, the `@theia/cli` script `download:plugins` can be used:
    - In your `package.json` you can define:
      - `theiaPluginDir`: to specify the folder in which to download plugins, in respect to your `package.json`
      - `theiaPlugins`: to specify the list of plugins in the form of `"id": "url"`
