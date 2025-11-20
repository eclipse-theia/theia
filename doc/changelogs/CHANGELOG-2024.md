# Changelog 2024

## 1.57.0 - 12/16/2024

- [ai] added initial support for MCP [#14598](https://github.com/eclipse-theia/theia/pull/14598)
- [ai] added support for Anthropic as an LLM provider [#14614](https://github.com/eclipse-theia/theia/pull/14614)
- [ai] fixed logic to enable chat input on chat widget activate [#14608](https://github.com/eclipse-theia/theia/pull/14608) - Contributed on behalf of STMicroelectronics
- [ai] fixed logic to hide "Generating..." while waiting on input [#14559](https://github.com/eclipse-theia/theia/pull/14559) - Contributed on behalf of STMicroelectronics
- [ai] integrated SCANOSS [#14628](https://github.com/eclipse-theia/theia/pull/14628)
- [ai] updated logic to invoke OpenerService for markdown links in chat UI [#14602](https://github.com/eclipse-theia/theia/pull/14602) - Contributed on behalf of STMicroelectronics
- [application-package] bumped API version to 1.96.0 [#14634](https://github.com/eclipse-theia/theia/pull/14634) - Contributed on behalf of STMicroelectronics
- [core] added logic to cancel pending hover on mouse exit [#14533](https://github.com/eclipse-theia/theia/pull/14533)
- [core] fixed enablement of "Collapse Side Panel" tab bar context menu item [#14616](https://github.com/eclipse-theia/theia/pull/14616)
- [core] fixed window maximization when using splash screen [#14219](https://github.com/eclipse-theia/theia/pull/14219)
- [core] pinned perfect-scrollbar to 1.5.5 [#14592](https://github.com/eclipse-theia/theia/pull/14592) - Contributed on behalf of STMicroelectronics
- [dev-container] added logic to make DevContainer workspaces openable through recent workspaces [#14567](https://github.com/eclipse-theia/theia/pull/14567)
- [dev-container] added support for THEIA_DEFAULT_PLUGINS env variable [#14530](https://github.com/eclipse-theia/theia/pull/14530)
- [dev-container] improved searchForDevontainerJsonFiles to not block server [#14563](https://github.com/eclipse-theia/theia/pull/14563)
- [dev-container] updated logic to ensure that dev container uses the right workspace [#14557](https://github.com/eclipse-theia/theia/pull/14557)
- [dev-container] updated logic to include settings and configuration from the local user dir [#14548](https://github.com/eclipse-theia/theia/pull/14548)
- [dev-container] updated logic to pull amd64 container images on darwin/arm64 [#14552](https://github.com/eclipse-theia/theia/pull/14552)
- [editor] fixed editor preference localizations [#14018](https://github.com/eclipse-theia/theia/pull/14018)
- [notebook] added basics to allow for hidden cells [#14573](https://github.com/eclipse-theia/theia/pull/14573)
- [notebook] added fixes for invisible cells [#14617](https://github.com/eclipse-theia/theia/pull/14617)
- [notebook] fixed cell height when updating output [#14621](https://github.com/eclipse-theia/theia/pull/14621)
- [notebook] fixed rendering of output of cells added with already existing output [#14618](https://github.com/eclipse-theia/theia/pull/14618)
- [plugin] introduced IconPath type [#14590](https://github.com/eclipse-theia/theia/pull/14590) - Contributed on behalf of STMicroelectronics
- [plugin] stubbed TestRunProfile#loadDetailedCoverageForTest [#14599](https://github.com/eclipse-theia/theia/pull/14599) - Contributed on behalf of STMicroelectronics
- [plugin] updated builtins to 1.95.3 [#14606](https://github.com/eclipse-theia/theia/pull/14606)

<a name="breaking_changes_1.57.0">[Breaking Changes:](#breaking_changes_1.57.0)</a>

- [remote] use local settings and configuration while connected to remote (rebinds UserStorageProvider) [#14548]<https://github.com/eclipse-theia/theia/pull/14548/>

## 1.56.0 - 11/28/2024

- [ai] added support for users to specify custom request settings, model, and optionally provider-specific [#14535](https://github.com/eclipse-theia/theia/pull/14535)
- [ai] allowed specifying max lines used for AI code completion context [#14539](https://github.com/eclipse-theia/theia/pull/14539)
- [ai] added hovers for agents and variables [#14498](https://github.com/eclipse-theia/theia/pull/14498)
- [ai] allowed comments in prompt templates [#14470](https://github.com/eclipse-theia/theia/pull/14470)
- [ai] added local models to non-streaming accept list [#14420](https://github.com/eclipse-theia/theia/pull/14420)
- [ai] allowed canceling llama-file requests [#14515](https://github.com/eclipse-theia/theia/pull/14515)
- [ai] showed arguments in tool call response renderer [#14424](https://github.com/eclipse-theia/theia/pull/14424)
- [ai] supported prompt variants [#14487](https://github.com/eclipse-theia/theia/pull/14487)
- [ai] turned automatic inline completion off by default [#14513](https://github.com/eclipse-theia/theia/pull/14513)
- [ai] fixed request settings and stop words in HF provider [#14504](https://github.com/eclipse-theia/theia/pull/14504)
- [ai] added preference to ignore files in workspace functions [#14449](https://github.com/eclipse-theia/theia/pull/14449)
- [ai] fixed prompt template contribution category and template [#14497](https://github.com/eclipse-theia/theia/pull/14497)
- [ai] chore: avoided conflicting keybinding for opening chat window [#14495](https://github.com/eclipse-theia/theia/pull/14495)
- [ai] supported agents asking for input and continuing [#14486](https://github.com/eclipse-theia/theia/pull/14486) - Contributed on behalf of STMicroelectronics
- [ai] showed progress while calculating AI code completion [#14537](https://github.com/eclipse-theia/theia/pull/14537)
- [ai] fixed AI history view crashing on first use [#14443](https://github.com/eclipse-theia/theia/pull/14443)
- [ai] fixed: added React keys in chat views [#14444](https://github.com/eclipse-theia/theia/pull/14444)
- [ai] sorted models in LLM selection dialogue in AI Configuration View [#14442](https://github.com/eclipse-theia/theia/pull/14442)
- [ai] added support for Hugging Face [#14412](https://github.com/eclipse-theia/theia/pull/14412)
- [ai] added manual AI code completion [#14393](https://github.com/eclipse-theia/theia/pull/14393)
- [ai] improved workspace agent functions and prompt [#14426](https://github.com/eclipse-theia/theia/pull/14426)
- [ai] improved agent history recording [#14378](https://github.com/eclipse-theia/theia/pull/14378)
- [ai] allowed reopening AI history widget [#14422](https://github.com/eclipse-theia/theia/pull/14422)
- [ai] avoided prompt template directory error [#14421](https://github.com/eclipse-theia/theia/pull/14421)
- [ai] adjusted chat input height dynamically [#14432](https://github.com/eclipse-theia/theia/pull/14432)
- [ai] fixed: allowed all three brackets for variables [#14465](https://github.com/eclipse-theia/theia/pull/14465)
- [ai] allowed adding variants via prompt template files [#14509](https://github.com/eclipse-theia/theia/pull/14509)
- [application-package] bumped API version to 1.95.3 [#14541](https://github.com/eclipse-theia/theia/pull/14541) - Contributed on behalf of STMicroelectronics
- [browser-only] removed browserfs dependency (replaced by OPFS) [#14263](https://github.com/eclipse-theia/theia/pull/14263)
- [core] updated Inversify to latest [#14435](https://github.com/eclipse-theia/theia/pull/14435)
- [core] updated parcel watcher to 2.5.0 [#14545](https://github.com/eclipse-theia/theia/pull/14545)
- [core] fixed calculation of SelectComponent dropdown bottom [#14381](https://github.com/eclipse-theia/theia/pull/14381)
- [core] fixed electron win background color [#14491](https://github.com/eclipse-theia/theia/pull/14491) - Contributed on behalf of STMicroelectronics
- [core] fixed: kept closable state through pin/unpin [#14377](https://github.com/eclipse-theia/theia/pull/14377) - Contributed on behalf of STMicroelectronics
- [core] fixed alignment of viewWelcome to VS Code [#14391](https://github.com/eclipse-theia/theia/pull/14391)
- [core] fixed uppermost context menu item sometimes not clickable in Electron [#14401](https://github.com/eclipse-theia/theia/pull/14401)
- [debug] disabled editing of read-only variables [#14440](https://github.com/eclipse-theia/theia/pull/14440)
- [dev-container] fixed container stopping on disconnect and application close [#14542](https://github.com/eclipse-theia/theia/pull/14542)
- [electron] pinned Electron version to 30.1.2 [#14407](https://github.com/eclipse-theia/theia/pull/14407) - Contributed on behalf of STMicroelectronics
- [filesystem] added support for files.insertFinalNewline during formatOnSave [#13751](https://github.com/eclipse-theia/theia/pull/13751) - Contributed on behalf of STMicroelectronics
- [plugin] added min height to cell outputs [#14488](https://github.com/eclipse-theia/theia/pull/14488)
- [plugin] fixed selection and improved active text editor behavior [#14480](https://github.com/eclipse-theia/theia/pull/14480)
- [plugin] supported MappedEditProviders proposed API evolution [#14453](https://github.com/eclipse-theia/theia/pull/14453) - Contributed on behalf of STMicroelectronics
- [plugin] added support for ThemeColor property id [#14437](https://github.com/eclipse-theia/theia/pull/14437) - Contributed on behalf of STMicroelectronics
- [plugin] added support for property ThemeColor ID [#14437](https://github.com/eclipse-theia/theia/pull/14437) - Contributed on behalf of STMicroelectronics
- [plugin-ext] fixed overlapping outputs when creating a cell at the top [#14417](https://github.com/eclipse-theia/theia/pull/14417)
- [plugin-ext] fixed active notebook editor staying active as long as the editor is active [#14419](https://github.com/eclipse-theia/theia/pull/14419)
- [metrics] fixed MeasurementNotificationService binding [#14439](https://github.com/eclipse-theia/theia/pull/14439)

<a name="breaking_changes_1.56.0">[Breaking Changes:](#breaking_changes_1.56.0)</a>

- [core] fixed disposing of dialogs on close - [#14456](https://github.com/eclipse-theia/theia/pull/14456) - Contributed on behalf of STMicroelectronics

## 1.55.0 - 10/31/2024

- [ai] added logic to allow to order and clear AI History view [#14233](https://github.com/eclipse-theia/theia/pull/14233)
- [ai] added preference to exclude files from code completion [#14315](https://github.com/eclipse-theia/theia/pull/14315)
- [ai] added support for custom agents [#14301](https://github.com/eclipse-theia/theia/pull/14301)
- [ai] added support for custom keys for custom Open AI models [#14299](https://github.com/eclipse-theia/theia/pull/14299)
- [ai] added support for llamafile as ai model provider [#14281](https://github.com/eclipse-theia/theia/pull/14281)
- [ai] added support for o1-preview [#14356](https://github.com/eclipse-theia/theia/pull/14356)
- [ai] added support to make response parsing extensible [#14196](https://github.com/eclipse-theia/theia/pull/14196) - Contributed on behalf of STMicroelectronics
- [ai] added support to query history by session [#14368](https://github.com/eclipse-theia/theia/pull/14368) - Contributed on behalf of STMicroelectronics
- [ai] fixed markdown request renderer [#14211](https://github.com/eclipse-theia/theia/pull/14211)
- [ai] improved custom OpenAI and llama-file preference description [#14376](https://github.com/eclipse-theia/theia/pull/14376)
- [ai] improved styling of the chat widget [#14278](https://github.com/eclipse-theia/theia/pull/14278) - Contributed on behalf of STMicroelectronics
- [ai] updated list of OpenAI models supporting structured output [#14247](https://github.com/eclipse-theia/theia/pull/14247)
- [ai] updated logic so that orchestrator logs its own requests [#14255](https://github.com/eclipse-theia/theia/pull/14255)
- [ai] updated logic to allow customizing the LLM request settings [#14284](https://github.com/eclipse-theia/theia/pull/14284) - Contributed on behalf of STMicroelectronics
- [ai] updated logic to avoid line wrap in code response parts [#14363](https://github.com/eclipse-theia/theia/pull/14363)
- [ai] updated terminal agent to record its requests [#14246](https://github.com/eclipse-theia/theia/pull/14246)
- [application-package] added an application prop to set the configuration area [#14319](https://github.com/eclipse-theia/theia/pull/14319) - Contributed on behalf of STMicroelectronics
- [application-package] bumped API version to 1.94.2 [#14371](https://github.com/eclipse-theia/theia/pull/14371) - Contributed on behalf of STMicroelectronics
- [cli] upgraded puppeteer to 23.1.0 [#14261](https://github.com/eclipse-theia/theia/pull/14261) - Contributed on behalf of STMicroelectronics
- [core] fixed circular imports when importing ReactDialog [#14352](https://github.com/eclipse-theia/theia/pull/14352)
- [core] fixed css calc expression to have space around operator [#14241](https://github.com/eclipse-theia/theia/pull/14241) - Contributed on behalf of STMicroelectronics
- [core] fixed duplicate text editor entry [#14238](https://github.com/eclipse-theia/theia/pull/14238)
- [core] improved widget specific status bar handling [#14239](https://github.com/eclipse-theia/theia/pull/14239)
- [core] replaced nsfw with @parcel/watcher [#14194](https://github.com/eclipse-theia/theia/pull/14194)
- [core] updated logic to set menu bar less often at startup [#14295](https://github.com/eclipse-theia/theia/pull/14295) - Contributed on behalf of STMicroelectronics
- [core] updated logic to start menu handler ids at one, not zero [#14282](https://github.com/eclipse-theia/theia/pull/14282) - Contributed on behalf of STMicroelectronics
- [core] upgraded express to 4.21.0 [#14283](https://github.com/eclipse-theia/theia/pull/14283) - Contributed on behalf of STMicroelectronics
- [filesystem] added logic to New File dialog to accept Enter for default [#14146](https://github.com/eclipse-theia/theia/pull/14146)
- [filesystem] updated logic to show error message when uploading fails [#14349](https://github.com/eclipse-theia/theia/pull/14349)
- [filesystem] updated rimraf to 5 [#14273](https://github.com/eclipse-theia/theia/pull/14273)
- [notebook] added Cell Tag Support for Notebooks [#14271](https://github.com/eclipse-theia/theia/pull/14271)
- [notebook] added notebook split cell command [#14212](https://github.com/eclipse-theia/theia/pull/14212)
- [notebook] fixed notebook editor focusing [#14229](https://github.com/eclipse-theia/theia/pull/14229)
- [notebook] fixed notebook editor staying current even when selecting sidebar or bottom panel [#14262](https://github.com/eclipse-theia/theia/pull/14262)
- [notebook] optimized notebook webview output [#14234](https://github.com/eclipse-theia/theia/pull/14234)
- [notebook] updated logic to blur cell on shift+enter, only update cell height when changed [#14277](https://github.com/eclipse-theia/theia/pull/14277)
- [notebook] updated logic to ensure notebook document event registration [#14242](https://github.com/eclipse-theia/theia/pull/14242)
- [notebook] updated logic to not disable cell edit mode when escaping code completion in notebooks [#14328](https://github.com/eclipse-theia/theia/pull/14328)
- [playwright] added Playwright API for Notebooks [#14098](https://github.com/eclipse-theia/theia/pull/14098)
- [plugin] added support for proposed signature for workspace.createFileSystemWatcher [#14303](https://github.com/eclipse-theia/theia/pull/14303) - Contributed on behalf of STMicroelectronics
- [plugin] fixed the onDidChangeActiveNotebookEditorEmitter to fire correctly [#14321](https://github.com/eclipse-theia/theia/pull/14321)
- [plugin] supported MappedEditProviders proposed API evolution [#14276](https://github.com/eclipse-theia/theia/pull/14276) - Contributed on behalf of STMicroelectronics
- [plugin] updated logic to accept a string argument in env.openExternal API [#14350](https://github.com/eclipse-theia/theia/pull/14350) - Contributed on behalf of STMicroelectronics
- [plugin] updated logic to properly dispose tab/title-based resources on tab close [#14359](https://github.com/eclipse-theia/theia/pull/14359)
- [plugin] wrapped api objects returned to clients in a proxy [#14213](https://github.com/eclipse-theia/theia/pull/14213) - Contributed on behalf of STMicroelectronics
- [preferences] improved preference renderer linking [#14311](https://github.com/eclipse-theia/theia/pull/14311)
- [workspace] optimized showing recent workspaces [#14260](https://github.com/eclipse-theia/theia/pull/14260)

## 1.54.0 - 09/26/2024

- [ai] add Theia AI LLM Support [Experimental] [#14048](https://github.com/eclipse-theia/theia/pull/14048)
- [ai] adapted default LLM for Theia AI to gpt-4o [#14165](https://github.com/eclipse-theia/theia/pull/14165)
- [ai] add enable state of agent to preferences [#14206](https://github.com/eclipse-theia/theia/pull/14206)
- [ai] chore: polished AI code completion [#14192](https://github.com/eclipse-theia/theia/pull/14192)
- [ai] consistently named agents and added tags [#14182](https://github.com/eclipse-theia/theia/pull/14182)
- [ai] feat: added toolbar actions for chat nodes [#14181](https://github.com/eclipse-theia/theia/pull/14181) - Contributed on behalf of STMicroelectronics
- [ai] feat: show variables and functions on AI agent configuration [#14177](https://github.com/eclipse-theia/theia/pull/14177)
- [ai] feat: supported models served via OpenAI API [#14172](https://github.com/eclipse-theia/theia/pull/14172)
- [ai] fixed ai-settings retrieval [#14221](https://github.com/eclipse-theia/theia/pull/14221)
- [ai] fixed enablement of AI support [#14166](https://github.com/eclipse-theia/theia/pull/14166)
- [ai] improved prompt of workspace agent [#14159](https://github.com/eclipse-theia/theia/pull/14159)
- [ai] refined AI settings [#14202](https://github.com/eclipse-theia/theia/pull/14202)
- [ai] refined experimental message for AI features [#14187](https://github.com/eclipse-theia/theia/pull/14187)
- [ai] removed type duplication for kind property [#14207](https://github.com/eclipse-theia/theia/pull/14207)
- [ai] consistent prompt ids [#14162](https://github.com/eclipse-theia/theia/pull/14162)
- [ai] fix: disabled an agent also disabled its UIContribution [#14184](https://github.com/eclipse-theia/theia/pull/14184)
- [application-package] bumped API version to 1.93.1 [#14224](https://github.com/eclipse-theia/theia/pull/14224) - Contributed on behalf of STMicroelectronics
- [core] fixed selection of contributed menu action argument adapters [#14132](https://github.com/eclipse-theia/theia/pull/14132) - Contributed on behalf of STMicroelectronics
- [core] supported proxy env variable for schema catalog download [#14130](https://github.com/eclipse-theia/theia/pull/14130)
- [core] supported workbench.editorAssociations preference [#14139](https://github.com/eclipse-theia/theia/pull/14139)
- [editor] aligned active text and notebook editor more towards vscode [#14190](https://github.com/eclipse-theia/theia/pull/14190)
- [filesystem] fixed FileResource sometimes sending contents change event during writing [#14043](https://github.com/eclipse-theia/theia/pull/14043) - Contributed on behalf of Toro Cloud
- [notebook] focused notebook cell container correctly [#14175](https://github.com/eclipse-theia/theia/pull/14175)
- [notebook] fixed notebook context selection [#14179](https://github.com/eclipse-theia/theia/pull/14179)
- [notebook] made the cell editor border grey when not focused [#14195](https://github.com/eclipse-theia/theia/pull/14195)
- [plugin] removed stub tag from TerminalOptions#color [#14171](https://github.com/eclipse-theia/theia/pull/14171)
- [plugin] moved stubbed API TerminalShellIntegration into main API [#14168](https://github.com/eclipse-theia/theia/pull/14168) - Contributed on behalf of STMicroelectronics
- [plugin] supported evolution on proposed API extensionAny [#14199](https://github.com/eclipse-theia/theia/pull/14199) - Contributed on behalf of STMicroelectronics
- [plugin] updated TreeView reveal options to be readonly [#14198](https://github.com/eclipse-theia/theia/pull/14198) - Contributed on behalf of STMicroelectronics
- [plugin-ext] properly supported executeDocumentSymbolProvider command [#14173](https://github.com/eclipse-theia/theia/pull/14173)
- [plugin-ext] fixed leak in tabs-main.ts [#14186](https://github.com/eclipse-theia/theia/pull/14186)
- [preferences] expanded plugin preferences on scroll correctly [#14170](https://github.com/eclipse-theia/theia/pull/14170)
- [test] supported TestMessage stack traces [#14154](https://github.com/eclipse-theia/theia/pull/14154) - Contributed on behalf of STMicroelectronics
- [workspace] handled only the user workspace security settings [#14147](https://github.com/eclipse-theia/theia/pull/14147)

<a name="breaking_changes_1.54.0">[Breaking Changes:](#breaking_changes_1.54.0)</a>

- [ai] added toolbar actions on chat nodes [#14181](https://github.com/eclipse-theia/theia/pull/14181) - Contributed on behalf of STMicroelectronics
- [core] updated AuthenticationService to handle multiple accounts per provider [#14149](https://github.com/eclipse-theia/theia/pull/14149) - Contributed on behalf of STMicroelectronics

## 1.53.0 - 08/29/2024

- [application-package] bumpped API version to 1.92.2 [#14076](https://github.com/eclipse-theia/theia/pull/14076) - Contributed on behalf of STMicroelectronics
- [collaboration] added support for collaboration feature [#13309](https://github.com/eclipse-theia/theia/pull/13309)
- [core] added `testing/profiles/context` menu contribution [#14028](https://github.com/eclipse-theia/theia/pull/14028) - Contributed on behalf of STMicroelectronics
- [core] added support for reverting a composite saveable [#14079](https://github.com/eclipse-theia/theia/pull/14079)
- [core] aligned available locales to VS Code [#14039](https://github.com/eclipse-theia/theia/pull/14039)
- [core] dropped support for Node 16.x [#14027](https://github.com/eclipse-theia/theia/pull/14027) - Contributed on behalf of STMicroelectronics
- [core] refactored undo-redo action for editors [#13963](https://github.com/eclipse-theia/theia/pull/13963)
- [core] updated logic to correctly revert saveable on widget close [#14062](https://github.com/eclipse-theia/theia/pull/14062)
- [core] updated logic to download json schema catalog at build-time [#14065](https://github.com/eclipse-theia/theia/pull/14065) - Contributed on behalf of STMicroelectronics
- [electron] updated electron to version 30.1.2 [#14041](https://github.com/eclipse-theia/theia/pull/14041) - Contributed on behalf of STMicroelectronics
- [monaco] updated logic to rely on `IConfigurationService` change event to update model options [#13994](https://github.com/eclipse-theia/theia/pull/13994) - Contributed on behalf of STMicroelectronics
- [notebook] added aliases for `list.focusUp` and `list.focusDown` for notebooks [#14042](https://github.com/eclipse-theia/theia/pull/14042)
- [notebook] added logic to support Alt+Enter in notebooks - run the current cell and insert a new below [#14022](https://github.com/eclipse-theia/theia/pull/14022)
- [notebook] added notebook selected cell status bar item and center selected cell command [#14046](https://github.com/eclipse-theia/theia/pull/14046)
- [notebook] added support to find widget in notebooks [#13982](https://github.com/eclipse-theia/theia/pull/13982)
- [notebook] enhanced notebook cell divider [#14081](https://github.com/eclipse-theia/theia/pull/14081)
- [notebook] fixed notebook output scrolling and text rendering [#14016](https://github.com/eclipse-theia/theia/pull/14016)
- [notebook] fixed vscode api notebook selection property [#14087](https://github.com/eclipse-theia/theia/pull/14087)
- [notebook] updated logic to make sure notebook model created when calling `openNotebookDocument` [#14029](https://github.com/eclipse-theia/theia/pull/14029)
- [notebook] updated logic to use correct cell type for selected language [#13983](https://github.com/eclipse-theia/theia/pull/13983)
- [playwright] fixed flaky playwright Theia Main Menu test [#13951](https://github.com/eclipse-theia/theia/pull/13951) - Contributed on behalf of STMicroelectronics
- [plugin] added `executeFoldingRangeProvider`, `executeCodeActionProvider`, and `executeWorkspaceSymbolProvider` command implementations [#14093](https://github.com/eclipse-theia/theia/pull/14093)
- [plugin] added support for `--headless-hosted-plugin-inspect` cmd argument [#13918](https://github.com/eclipse-theia/theia/pull/13918)
- [plugin] fixed issue when creating new untitled notebook doesn't work [#14031](https://github.com/eclipse-theia/theia/pull/14031)
- [plugin] implemented previously stubbed API `window.registerUriHandler()` [#13306](https://github.com/eclipse-theia/theia/pull/13306) - Contributed on behalf of STMicroelectronics
- [plugin] stubbed Terminal Shell Integration VS Code API [#14058](https://github.com/eclipse-theia/theia/pull/14058)
- [plugin] updated logic to allow opening changes for files associated with custom editors [#13916](https://github.com/eclipse-theia/theia/pull/13916)
- [plugin] upated code to not use `ChannelMultiplexer` in `RPCProtocol` [#13980](https://github.com/eclipse-theia/theia/pull/13980) - Contributed on behalf of STMicroelectronics
- [preferences] fixed preference tree for plugins [#14036](https://github.com/eclipse-theia/theia/pull/14036)
- [vsx-registry] fixed `429` errors on OVSX requests [#14030](https://github.com/eclipse-theia/theia/pull/14030)

<a name="breaking_changes_1.53.0">[Breaking Changes:](#breaking_changes_1.53.0)</a>

- [dependencies] Updated electron to version 30.1.2 - [#14041](https://github.com/eclipse-theia/theia/pull/14041) - Contributed on behalf of STMicroelectronics
- [dependencies] increased minimum node version to 18. [#14027](https://github.com/eclipse-theia/theia/pull/14027) - Contributed on behalf of STMicroelectronics

## 1.52.0 - 07/25/2024

- [application-package] bumped the default supported API from `1.90.2` to `1.91.1` [#13955](https://github.com/eclipse-theia/theia/pull/13955) - Contributed on behalf of STMicroelectronics
- [cli] added logging to download:plugins script [#13905](https://github.com/eclipse-theia/theia/pull/13905) - Contributed on behalf of STMicroelectronics
- [core] bug fix: "core.saveAll" command only saved dirty widgets [#13942](https://github.com/eclipse-theia/theia/pull/13942)
- [core] downgrade jsdom to 22.1.0 [#13944](https://github.com/eclipse-theia/theia/pull/13944)
- [core] fixed reload for remote feature and added option to the electron window to change URL on reload [#13891](https://github.com/eclipse-theia/theia/pull/13891)
- [core] improved implementation around widget management [#13818](https://github.com/eclipse-theia/theia/pull/13818)
- [core] introduced `FRONTEND_CONNECTION_TIMEOUT` environment variable to override application connection settings [#13936](https://github.com/eclipse-theia/theia/pull/13936) - Contributed on behalf of STMicroelectronics
- [core] made sure UI loaded when minimized [#13887](https://github.com/eclipse-theia/theia/pull/13887) - Contributed on behalf of STMicroelectronics
- [core] prevented the rendering of the tab bar tooltip if no caption was provided [#13945](https://github.com/eclipse-theia/theia/pull/13945)
- [core] tab selected should be adjacent when closing the last one [#13912](https://github.com/eclipse-theia/theia/pull/13912) - Contributed on behalf of STMicroelectronics
- [core] upgraded ws to 8.18.0 [#13903](https://github.com/eclipse-theia/theia/pull/13903)
- [debug] added DebugSessionOptions.testRun [#13939](https://github.com/eclipse-theia/theia/pull/13939) - Contributed on behalf of STMicroelectronics
- [debug] implemented activeStackItem and related change event in debug namespace [#13900](https://github.com/eclipse-theia/theia/pull/13900) - Contributed on behalf of STMicroelectronics
- [filesystem] fixed FileResource not adding event listener to the disposable collection [#13880](https://github.com/eclipse-theia/theia/pull/13880)
- [notebook] changed cell type when selecting markdown as a code cell's language [#13933](https://github.com/eclipse-theia/theia/pull/13933)
- [notebook] made Notebook preferences registration substitutable [#13926](https://github.com/eclipse-theia/theia/pull/13926)
- [ovsx-client] fixed plugin version comparison [#13907](https://github.com/eclipse-theia/theia/pull/13907)
- [plugin-ext] codicon color and URI support to TerminalOptions [#13413](https://github.com/eclipse-theia/theia/pull/13413)
- [plugin-ext] used relative paths for ctx.importScripts() [#13854](https://github.com/eclipse-theia/theia/pull/13854)
- [preferences] refactored preference tree layouting [#13819](https://github.com/eclipse-theia/theia/pull/13819)
- [terminal] added support for 256 truecolor [#13853](https://github.com/eclipse-theia/theia/pull/13853)
- [workflows] updated Mac OS version to 14 in CI [#13908](https://github.com/eclipse-theia/theia/pull/13908)

## 1.51.0 - 06/27/2024

- [application-manager] updated logic to load correct messaging module in browser-only mode [#13827](https://github.com/eclipse-theia/theia/pull/13827)
- [application-package] bumped the default supported API from `1.89.1` to `1.90.2` [#13849](https://github.com/eclipse-theia/theia/pull/13849) - Contributed on behalf of STMicroelectronics
- [core] added support for dynamic menu contributions [#13720](https://github.com/eclipse-theia/theia/pull/13720)
- [core] fixed account menu order, icon and badge [#13771](https://github.com/eclipse-theia/theia/pull/13771)
- [core] fixed overflow behavior of sidebars [#13483](https://github.com/eclipse-theia/theia/pull/13483) - Contributed on behalf of STMicroelectronics
- [core] improved shown keybindings in context menu [#13830](https://github.com/eclipse-theia/theia/pull/13830)
- [core] introduced optional serialize method in Saveable [#13833](https://github.com/eclipse-theia/theia/pull/13833)
- [core] updated doc comments on service-connection-provider.ts [#13805](https://github.com/eclipse-theia/theia/pull/13805) - Contributed on behalf of STMicroelectronics
- [core] updated logic of links to block local navigation and open new windows externally in electron [#13782](https://github.com/eclipse-theia/theia/pull/13782) - Contributed on behalf of STMicroelectronics
- [core] updated logic to propagate "Save As" operation to plugin host [#13689](https://github.com/eclipse-theia/theia/pull/13689)
- [core] updated logic to use 'openWithSystemApp' to open uri when 'env.openExternal' requested [#13676](https://github.com/eclipse-theia/theia/pull/13676)
- [electron] switched single instance on per default. [#13831](https://github.com/eclipse-theia/theia/pull/13831) - Contributed on behalf of STMicroelectronics
- [filesystem] improved Upload Command [#13775](https://github.com/eclipse-theia/theia/pull/13775)
- [markers] fixed data race in problem view tree [#13841](https://github.com/eclipse-theia/theia/pull/13841)
- [messages] updated logic to always resolve existing before showing new notification [#13668](https://github.com/eclipse-theia/theia/pull/13668)
- [monaco] fixed editors theme change and widget not attached error [#13757](https://github.com/eclipse-theia/theia/pull/13757)
- [notebook] added an indicator for loading notebooks [#13843](https://github.com/eclipse-theia/theia/pull/13843)
- [notebook] added notebook output options and tag preference search [#13773](https://github.com/eclipse-theia/theia/pull/13773)
- [notebook] disabled cell editor search widget [#13836](https://github.com/eclipse-theia/theia/pull/13836)
- [notebook] improved ability to overwrite notebook services [#13776](https://github.com/eclipse-theia/theia/pull/13776)
- [notebook] improved notebook cell drag images [#13791](https://github.com/eclipse-theia/theia/pull/13791)
- [notebook] improved support for creating new notebooks [#13696](https://github.com/eclipse-theia/theia/pull/13696)
- [notebook] updated logic to set notebook editor as active when opening in foreground [#13828](https://github.com/eclipse-theia/theia/pull/13828)
- [notebook] updated logic to stop moving to next cell when suggestion widget is visible [#13774](https://github.com/eclipse-theia/theia/pull/13774)
- [playwright] fixed type definition of TheiaAppFactory [#13799](https://github.com/eclipse-theia/theia/pull/13799) - Contributed on behalf of STMicroelectronics
- [plugin] added stub for `registerMappedEditProvider` [#13681](https://github.com/eclipse-theia/theia/pull/13681) - Contributed on behalf of STMicroelectronics
- [plugin] added support for PluginExt#extensionKind [#13763](https://github.com/eclipse-theia/theia/pull/13763)
- [plugin] added support for TestRunRequest preserveFocus API [#13839](https://github.com/eclipse-theia/theia/pull/13839) - Contributed on behalf of STMicroelectronics
- [plugin] fixed RPC proxy handler notifications and requests order [#13810](https://github.com/eclipse-theia/theia/pull/13810)
- [plugin] fixed programmatic save for custom text editors [#13684](https://github.com/eclipse-theia/theia/pull/13684)
- [plugin] fixed tab group API event order [#13812](https://github.com/eclipse-theia/theia/pull/13812)
- [plugin] stubbed Chat and Language Model API [#13778](https://github.com/eclipse-theia/theia/pull/13778)
- [plugin] stubbed activeStackItem and related change event in debug namespace [#13847](https://github.com/eclipse-theia/theia/pull/13847) - Contributed on behalf of STMicroelectronics
- [plugin] updated logic to avoid pollution of all toolbars by actions contributed by tree views in extensions [#13768](https://github.com/eclipse-theia/theia/pull/13768) - Contributed on behalf of STMicroelectronics
- [plugin] updated logic to return empty appRoot in web plugin host [#13762](https://github.com/eclipse-theia/theia/pull/13762)
- [scm] updated jsdiff and simplify diff computation [#13787](https://github.com/eclipse-theia/theia/pull/13787) - Contributed on behalf of STMicroelectronics
- [vsx-registry] updated logic to use targetPlatform when installing plugin from open-vsx [#13825](https://github.com/eclipse-theia/theia/pull/13825)

<a name="breaking_changes_1.51.0">[Breaking Changes:](#breaking_changes_1.51.0)</a>

- [electron] switched single instance on per default. [#13831](https://github.com/eclipse-theia/theia/pull/13831) - Contributed on behalf of STMicroelectronics
- [filesystem] adjusted the "Save As" mechanism to assume that `Saveable.getSnapshot()` returns a full snapshot of the editor model [#13689](https://github.com/eclipse-theia/theia/pull/13689).

## 1.50.0 - 06/03/2024

- [application-package] bumped the default supported API from `1.88.1` to `1.89.1` [#13738](https://github.com/eclipse-theia/theia/pull/13738) - contributed on behalf of STMicroelectronics
- [cli] upgrade the Theia build to use Typescript 5.4.5 [#13628](https://github.com/eclipse-theia/theia/pull/13628) - Contributed on behalf of STMicroelectronics
- [core] added logic to delegate showing help to the back end process. [#13729](https://github.com/eclipse-theia/theia/pull/13729) - Contributed on behalf of STMicroelectronics
- [core] added logic to don't reveal the focused element when updating the tree rows [#13703](https://github.com/eclipse-theia/theia/pull/13703) - Contributed on behalf of STMicroelectronics
- [core] added logic to ensure globalSelection is correctly set when opening context menu on a tree widget [#13710](https://github.com/eclipse-theia/theia/pull/13710)
- [core] added to logic to ensure usage of user-defined `THEIA_CONFIG_DIR` [#13708](https://github.com/eclipse-theia/theia/pull/13708) - Contributed on behalf of STMicroelectronics
- [core] fixed hex editor by updating `msgpckr` to 1.10.2 [#13722](https://github.com/eclipse-theia/theia/pull/13722)
- [core] improved `WebSocketConnectionProvider` deprecation message [#13713](https://github.com/eclipse-theia/theia/pull/13713) - Contributed on behalf of STMicroelectronics
- [core] refactored auto save mechanism via a central service [#13683](https://github.com/eclipse-theia/theia/pull/13683)
- [core] updated logic to make browserWindow of splashScreen transparent [#13699](https://github.com/eclipse-theia/theia/pull/13699)
- [dev-container] added support for four previously unsupported dev container properties [#13714](https://github.com/eclipse-theia/theia/pull/13714)
- [dev-container] improved logic to show dev-container label in status bar [#13744](https://github.com/eclipse-theia/theia/pull/13744)
- [electron] updated electron to ^28.2.8 [#13580](https://github.com/eclipse-theia/theia/pull/13580)
- [navigator] added logic to handle `isFileSystemResource` context key [#13664](https://github.com/eclipse-theia/theia/pull/13664)
- [navigator] added logic to not show the new "Open With..." command on folders [#13678](https://github.com/eclipse-theia/theia/pull/13678)
- [notebook] added additional css to notebook output webviews [#13666](https://github.com/eclipse-theia/theia/pull/13666)
- [notebook] added basics for notebook cell drag image renderers [#13698](https://github.com/eclipse-theia/theia/pull/13698)
- [notebook] added logic to select next notebook cell on first or last line of editor [#13656](https://github.com/eclipse-theia/theia/pull/13656)
- [notebook] added logic to select the last cell when deleting selected last cell [#13715](https://github.com/eclipse-theia/theia/pull/13715)
- [notebook] added logic to stop execution when deleting cell [#13701](https://github.com/eclipse-theia/theia/pull/13701)
- [notebook] added responsive design for the main notebook toolbar [#13663](https://github.com/eclipse-theia/theia/pull/13663)
- [notebook] aligned commands with vscode notebook commands [#13645](https://github.com/eclipse-theia/theia/pull/13645)
- [notebook] aligned notebook scroll into view behaviour with vscode [#13742](https://github.com/eclipse-theia/theia/pull/13742)
- [notebook] fixed focus loss of the notebook editor widget when bluring a cell editor [#13741](https://github.com/eclipse-theia/theia/pull/13741)
- [notebook] fixed notebook cell divider size [#13745](https://github.com/eclipse-theia/theia/pull/13745)
- [notebook] fixed storing of the notebook-outlineview state data [#13648](https://github.com/eclipse-theia/theia/pull/13648)
- [notebook] improved notebook cell model lifecycle [#13675](https://github.com/eclipse-theia/theia/pull/13675)
- [notebook] improved support for creating new notebooks [#13696](https://github.com/eclipse-theia/theia/pull/13696)
- [plugin] added stub for `registerMappedEditProvider` [#13681](https://github.com/eclipse-theia/theia/pull/13681) - Contributed on behalf of STMicroelectronics
- [plugin] added support `WindowState` active API [#13718](https://github.com/eclipse-theia/theia/pull/13718) - contributed on behalf of STMicroelectronics
- [plugin] fixed github authentication built-in for electron case [#13611](https://github.com/eclipse-theia/theia/pull/13611) - Contributed on behalof of STMicroelectronics
- [plugin] fixed incorrect URI conversions in custom-editors-main [#13653](https://github.com/eclipse-theia/theia/pull/13653)
- [plugin] fixed quick pick separators from plugins [#13740](https://github.com/eclipse-theia/theia/pull/13740)
- [plugin] improved vscode tab API [#13730](https://github.com/eclipse-theia/theia/pull/13730)
- [plugin] updated `DropMetada` and `documentPaste` proposed API for 1.89 compatibility [#13733](https://github.com/eclipse-theia/theia/pull/13733) - contributed on behalf of STMicroelectronics
- [plugin] updated nls metadata for VSCode API 1.89.0 [#13743](https://github.com/eclipse-theia/theia/pull/13743)
- [remote] added logic to support plugin copying for remote feature [#13369](https://github.com/eclipse-theia/theia/pull/13369)
- [terminal] fixed performance issues in terminal [#13735](https://github.com/eclipse-theia/theia/pull/13735) - Contributed on behalf of STMicroelectronics
- [terminal] updated logic to allow transitive binding for TerminalFrontendContribution [#13667](https://github.com/eclipse-theia/theia/pull/13667)

<a name="breaking_changes_1.50.0">[Breaking Changes:](#breaking_changes_1.50.0)</a>

- [core] Classes implementing the `Saveable` interface no longer need to implement the `autoSave` field. However, a new `onContentChanged` event has been added instead.
- [navigator] The `Open With...` command now uses a dedicated `OpenWithHandler` to populate the quick pick.
  Adopters contributing an open handler need to explicitly add the handler to the `OpenWithHandler` ([#13573](https://github.com/eclipse-theia/theia/pull/13573)).

## v1.49.0 - 04/29/2024

- [application-manager] added logic to generate Extension Info in server application to avoid empty About Dialog [#13590](https://github.com/eclipse-theia/theia/pull/13590) - contributed on behalf of STMicroelectronics
- [application-manager] fixed spawn calls for node LTS versions [#13614](https://github.com/eclipse-theia/theia/pull/13614)
- [application-package] bumped the default supported API from `1.87.2` to `1.88.1` [#13646](https://github.com/eclipse-theia/theia/pull/13646) - contributed on behalf of STMicroelectronics
- [cli] added "patches" folder to package.json "files" field [#13554](https://github.com/eclipse-theia/theia/pull/13554) - contributed on behalf of STMicroelectronics
- [core] added a new built-in handler to open files with system application [#13601](https://github.com/eclipse-theia/theia/pull/13601)
- [core] added logic to always consider the "passthrough" commmand enabled for keybindings [#13564](https://github.com/eclipse-theia/theia/pull/13564) - contributed on behalf of STMicroelectronics
- [core] added Splash Screen Support for Electron [#13505](https://github.com/eclipse-theia/theia/pull/13505) - contributed on behalf of Pragmatiqu IT GmbH
- [core] fixed window revealing when navigating with multiple windows [#13561](https://github.com/eclipse-theia/theia/pull/13561) - contributed on behalf of STMicroelectronics
- [core] improved "Open With..." command UX [#13573](https://github.com/eclipse-theia/theia/pull/13573)
- [filesystem] added logic to open editor on file upload [#13578](https://github.com/eclipse-theia/theia/pull/13578)
- [monaco] added logic to prevent duplicate Clipboard actions in editor context menu [#13626](https://github.com/eclipse-theia/theia/pull/13626)
- [monaco] fixed monaco localization [#13557](https://github.com/eclipse-theia/theia/pull/13557)
- [notebook] added additional keybings to the notebook editor [#13594](https://github.com/eclipse-theia/theia/pull/13594)
- [notebook] added logic to force notebook scrollbar update after content change [#13575](https://github.com/eclipse-theia/theia/pull/13575)
- [notebook] added logic to read execution summary [#13567](https://github.com/eclipse-theia/theia/pull/13567)
- [notebook] added logic to select notebook cell language [#13615](https://github.com/eclipse-theia/theia/pull/13615)
- [notebook] added logic to show short title for notebook toolbar commands [#13586](https://github.com/eclipse-theia/theia/pull/13586)
- [notebook] added logic to use notebook URI as context for toolbar commands [#13585](https://github.com/eclipse-theia/theia/pull/13585)
- [notebook] added shift+enter keybinding for markdown cells [#13563](https://github.com/eclipse-theia/theia/pull/13563)
- [notebook] added support for Outline-View and Breadcrumbs [#13562](https://github.com/eclipse-theia/theia/pull/13562)
- [notebook] added support for truncated notebook output commands [#13555](https://github.com/eclipse-theia/theia/pull/13555)
- [notebook] disabled clear all outputs in notebook main toolbar [#13569](https://github.com/eclipse-theia/theia/pull/13569)
- [notebook] fixed clear cell outputs command [#13640](https://github.com/eclipse-theia/theia/pull/13640)
- [notebook] fixed kernel autobind for on startup opened notebooks [#13598](https://github.com/eclipse-theia/theia/pull/13598)
- [notebook] fixed logic to set context for multiple notebooks [#13566](https://github.com/eclipse-theia/theia/pull/13566)
- [notebook] fixed notebook cell EOL splitting [#13574](https://github.com/eclipse-theia/theia/pull/13574)
- [notebook] fixed notebook model/cell disposal [#13606](https://github.com/eclipse-theia/theia/pull/13606)
- [notebook] fixed notebook widget icon on reload [#13612](https://github.com/eclipse-theia/theia/pull/13612)
- [notebook] improved notebook cell context key handling [#13572](https://github.com/eclipse-theia/theia/pull/13572)
- [notebook] improved notebook markdown cell rendering [#13577](https://github.com/eclipse-theia/theia/pull/13577)
- [plugin] added logic to hide empty plugin view containers from user [#13581](https://github.com/eclipse-theia/theia/pull/13581)
- [plugin] added logic to ignore vsix files in local-plugins dir [#13435](https://github.com/eclipse-theia/theia/pull/13435) - contributed on behalf of STMicroelectronics
- [plugin] fixed `onLanguage` activation event [#13630](https://github.com/eclipse-theia/theia/pull/13630)
- [plugin] fixed issue with webview communication for Safari [#13587](https://github.com/eclipse-theia/theia/pull/13587)
- [plugin] updated `DropMetada` and `documentPaste` proposed API for 1.88 compatibility [#13632](https://github.com/eclipse-theia/theia/pull/13632)
- [plugin] updated back-end plugin deployment logic [#13643](https://github.com/eclipse-theia/theia/pull/13643) - contributed on behalf of STMicroelectronics
- [process] fixed spawn calls for node LTS versions [#13614](https://github.com/eclipse-theia/theia/pull/13614)
- [remote] fixed remote support in packaged apps [#13584](https://github.com/eclipse-theia/theia/pull/13584)
- [scm] added support for dirty diff peek view [#13104](https://github.com/eclipse-theia/theia/pull/13104)
- [terminal] fixed spawn calls for node LTS versions [#13614](https://github.com/eclipse-theia/theia/pull/13614)
- [test] stubbed VS Code `Test Coverage` API [#13631](https://github.com/eclipse-theia/theia/pull/13631) - contributed on behalf of STMicroelectronics
- [vsx-registry] fixed logic to bind Extension search bar within view container [#13623](https://github.com/eclipse-theia/theia/pull/13623)

<a name="breaking_changes_1.49.0">[Breaking Changes:](#breaking_changes_1.49.0)</a>

- [scm] revised some of the dirty diff related types [#13104](https://github.com/eclipse-theia/theia/pull/13104)
  - replaced `DirtyDiff.added/removed/modified` with `changes`, which provides more detailed information about the changes
  - changed the semantics of `LineRange` to represent a range that spans up to but not including the `end` line (previously, it included the `end` line)
  - changed the signature of `DirtyDiffDecorator.toDeltaDecoration(LineRange | number, EditorDecorationOptions)` to `toDeltaDecoration(Change)`

## v1.48.0 - 03/28/2024

- [application-package] bumped the default supported API from `1.86.2` to `1.87.2` [#13514](https://github.com/eclipse-theia/theia/pull/13514) - contributed on behalf of STMicroelectronics
- [core] added "New File" default implementation [#13344](https://github.com/eclipse-theia/theia/pull/13344)
- [core] added logic to check for disposed before sending update message in toolbars [#13454](https://github.com/eclipse-theia/theia/pull/13454) - contributed on behalf of STMicroelectronics
- [core] fixed default translation of Close Editor command [#13412](https://github.com/eclipse-theia/theia/pull/13412)
- [core] fixed logic to allow reopening secondary windows [#13509](https://github.com/eclipse-theia/theia/pull/13509) - contributed on behalf of STMicroelectronics
- [core] fixed rending of quickpick buttons [#13342](https://github.com/eclipse-theia/theia/pull/13342) - contributed on behalf of STMicroelectronics
- [core] updated logic to remove unneeded URI conversion [#13415](https://github.com/eclipse-theia/theia/pull/13415)
- [dev-container] added first version of dev-container support [#13372](https://github.com/eclipse-theia/theia/pull/13372)
- [editor] added secondary window support for text editors [#13493](https://github.com/eclipse-theia/theia/pull/13493) - contributed on behalf of STMicroelectronics
- [git] fixed detecting changes after git init [#13487](https://github.com/eclipse-theia/theia/pull/13487)
- [metrics] allowed accessing the metrics endpoint for performance analysis in electron [#13380](https://github.com/eclipse-theia/theia/pull/13380) - contributed on behalf of STMicroelectronics
- [monaco] fixed monaco quickpick [#13451](https://github.com/eclipse-theia/theia/pull/13451) - contributed on behalf of STMicroelectronics
- [monaco] fixed rending of quickpick buttons [#13342](https://github.com/eclipse-theia/theia/pull/13342) - contributed on behalf of STMicroelectronics
- [notebook] added execute cells above/below commands [#13528](https://github.com/eclipse-theia/theia/pull/13528)
- [notebook] added execution order display to code cells [#13502](https://github.com/eclipse-theia/theia/pull/13502)
- [notebook] added keybindings to notebook editor [#13497](https://github.com/eclipse-theia/theia/pull/13497)
- [notebook] added support for custom widget types for notebook outputs [#13517](https://github.com/eclipse-theia/theia/pull/13517)
- [notebook] fixed cell execution height styling [#13515](https://github.com/eclipse-theia/theia/pull/13515)
- [notebook] fixed context keys for notebook editor context [#13448](https://github.com/eclipse-theia/theia/pull/13448)
- [notebook] fixed keybindings triggers when cell editor is focused [#13500](https://github.com/eclipse-theia/theia/pull/13500)
- [notebook] fixed notebook document metadata edit [#13528](https://github.com/eclipse-theia/theia/pull/13528)
- [notebook] fixed renaming and moving of open notebooks [#13467](https://github.com/eclipse-theia/theia/pull/13467)
- [notebook] fixed undo redo keybindings for notebook editor [#13518](https://github.com/eclipse-theia/theia/pull/13518)
- [notebook] improved focusing of the notebook cell editors [#13516](https://github.com/eclipse-theia/theia/pull/13516)
- [notebook] improved performance when opening notebooks [#13488](https://github.com/eclipse-theia/theia/pull/13488)
- [notebook] updated logic to only initialize notebook cell editor when in viewport [#13476](https://github.com/eclipse-theia/theia/pull/13476)
- [plugin] added `Interval` `TextEditorLineNumbersStyle` [#13458](https://github.com/eclipse-theia/theia/pull/13458) - contributed on behalf of STMicroelectronics
- [plugin] added terminal observer API [#13402](https://github.com/eclipse-theia/theia/pull/13402)
- [plugin] changed logic to ensure that showOpenDialog returns correct file URI [#13208](https://github.com/eclipse-theia/theia/pull/13208) - contributed on behalf of STMicroelectronics
- [plugin] fixed quickpick [#13451](https://github.com/eclipse-theia/theia/pull/13451) - contributed on behalf of STMicroelectronics
- [plugin] made `acquireVsCodeApi` function available on global objects [#13411](https://github.com/eclipse-theia/theia/pull/13411)
- [plugin] updated logic to avoid disposal of `QuickInputExt` on hide [#13485](https://github.com/eclipse-theia/theia/pull/13485) - contributed on behalf of STMicroelectronics
- [remote] added logic to support remote port forwarding [#13439](https://github.com/eclipse-theia/theia/pull/13439)
- [terminal] added logic to resolve links to workspace files in terminal [#13498](https://github.com/eclipse-theia/theia/pull/13498) - contributed on behalf of STMicroelectronics
- [terminal] added terminal observer API [#13402](https://github.com/eclipse-theia/theia/pull/13402)

<a name="breaking_changes_1.48.0">[Breaking Changes:](#breaking_changes_1.48.0)</a>

- [core] Add secondary windows support for text editors. [#13493](https://github.com/eclipse-theia/theia/pull/13493 ). The changes in require more extensive patches for our dependencies than before. For this purpose, we are using the `patch-package` library. However, this change requires adopters to add the line  `"postinstall": "theia-patch"` to the `package.json` at the root of their monorepo (where the `node_modules` folder is located). - contributed on behalf of STMicroelectronics

## v1.47.0 - 02/29/2024

- [application-package] bumped the default supported API from `1.85.1` to `1.86.2` [#13429](https://github.com/eclipse-theia/theia/pull/13429) - contributed on behalf of STMicroelectronics
- [core] added logic to show decorations in the editor tabs [#13371](https://github.com/eclipse-theia/theia/pull/13371)
- [core] added ts-docs for several key utility classes [#13324](https://github.com/eclipse-theia/theia/pull/13324)
- [core] fixed core localizations for electron [#13331](https://github.com/eclipse-theia/theia/pull/13331)
- [core] fixed memory leak in `DockPanelRenderer` and `ToolbarAwareTabBar` [#13327](https://github.com/eclipse-theia/theia/pull/13327)
- [core] fixed update of CompositeMenuNode properties [#13425](https://github.com/eclipse-theia/theia/pull/13425)
- [core] improved title rendering on menu bar change [#13317](https://github.com/eclipse-theia/theia/pull/13317)
- [core] updated code to use common uuid generator everywhere [#13255](https://github.com/eclipse-theia/theia/pull/13255)
- [core] updated logic to use `tslib` in order to reduce bundle size [#13350](https://github.com/eclipse-theia/theia/pull/13350)
- [core] upgraded msgpackr to 1.10.1 [#13365](https://github.com/eclipse-theia/theia/pull/13365) - contributed on behalf of STMicroelectronics
- [debug] fixed issue with unexpected breakpoint in python [#12543](https://github.com/eclipse-theia/theia/pull/12543)
- [documentation] extended custom plugin API documentation [#13358](https://github.com/eclipse-theia/theia/pull/13358)
- [editor] improved readonly editor behaviour [#13403](https://github.com/eclipse-theia/theia/pull/13403)
- [filesystem] fixed issue with non recursive folder deletion [#13361](https://github.com/eclipse-theia/theia/pull/13361)
- [filesystem] implemented readonly markdown message for file system providers [#13414](https://github.com/eclipse-theia/theia/pull/13414) - contributed on behalf of STMicroelectronics
- [monaco] upgraded Monaco to 1.83.1 [#13217](https://github.com/eclipse-theia/theia/pull/13217)
- [notebook] added support for proposed notebook kernel messaging and preload contribution point [#13401](https://github.com/eclipse-theia/theia/pull/13401)
- [notebook] fixed notebook renderer messaging [#13401](https://github.com/eclipse-theia/theia/pull/13401)
- [notebook] fixed race condition in notebook kernel association [#13364](https://github.com/eclipse-theia/theia/pull/13364)
- [notebook] improved logic to update notebook execution timer [#13366](https://github.com/eclipse-theia/theia/pull/13366)
- [notebook] improved notebook scrolling behaviour [#13338](https://github.com/eclipse-theia/theia/pull/13338)
- [notebook] improved styling for notebook toolbar items [#13334](https://github.com/eclipse-theia/theia/pull/13334)
- [notebook] fixed scroll behaviour of Notebooks [#13430](https://github.com/eclipse-theia/theia/pull/13430)
- [plugin] added command to install plugins from the command line [#13406](https://github.com/eclipse-theia/theia/issues/13406) - contributed on behalf of STMicroelectronics
- [plugin] added logic to support `workspace.save(URI)` and `workspace.saveAs(URI)` [#13393](https://github.com/eclipse-theia/theia/pull/13393) - contributed on behalf of STMicroelectronics
- [plugin] added support for `extension/context`, `terminal/context`, and `terminal/title/context` menu contribution points [#13226](https://github.com/eclipse-theia/theia/pull/13226)
- [plugin] fixed custom editors asset loading [#13382](https://github.com/eclipse-theia/theia/pull/13382)
- [plugin] fixed logic to use correct path for hosted plugin deployer handler [#13427](https://github.com/eclipse-theia/theia/pull/13427) - contributed on behalf of STMicroelectronics
- [plugin] fixed regressions from headless plugins introduction [#13337](https://github.com/eclipse-theia/theia/pull/13337) - contributed on behalf of STMicroelectronics
- [plugin] support TestRunProfile onDidChangeDefault introduced in VS Code 1.86.0 [#13388](https://github.com/eclipse-theia/theia/pull/13388) - contributed on behalf of STMicroelectronics
- [plugin] updated `WorkspaceEdit` metadata typing [#13395](https://github.com/eclipse-theia/theia/pull/13395) - contributed on behalf of STMicroelectronics
- [search-in-workspace] added logic to focus on next and previous search results [#12703](https://github.com/eclipse-theia/theia/pull/12703)
- [task] fixed logic to configure tasks [#13367](https://github.com/eclipse-theia/theia/pull/13367) - contributed on behalf of STMicroelectronics
- [terminal] updated to latest xterm version [#12691](https://github.com/eclipse-theia/theia/pull/12691)
- [vsx-registry] added `--install-plugin` cli command [#13421](https://github.com/eclipse-theia/theia/pull/13421) - contributed on behalf of STMicroelectronics
- [vsx-registry] added possibility to install vsix files from the explorer view [#13291](https://github.com/eclipse-theia/theia/pull/13291)

<a name="breaking_changes_1.47.0">[Breaking Changes:](#breaking_changes_1.47.0)</a>

- [monaco] Upgrade Monaco dependency to 1.83.1 [#13217](https://github.com/eclipse-theia/theia/pull/13217)- contributed on behalf of STMicroelectronics\
  There are a couple of breaking changes that come with this monaco update
  - Moved `ThemaIcon` and `ThemeColor` to the common folder
  - Minor typing adjustments in QuickPickService: in parti
  - FileUploadService: moved id field from data transfer item to the corresponding file info
  - The way we instantiate monaco services has changed completely: if you touch monaco services in your code, please read the description in the
    file comment in `monaco-init.ts`.

## v1.46.0 - 01/25/2024

- [plugin] Add prefix to contributed view container ids [#13362](https://github.com/eclipse-theia/theia/pull/13362) - contributed on behalf of STMicroelectronics
- [application-manager] updated message for missing Electron main entries [#13242](https://github.com/eclipse-theia/theia/pull/13242)
- [application-package] bumped the default supported API from `1.84.2` to `1.85.1` [#13276](https://github.com/eclipse-theia/theia/pull/13276) - contributed on behalf of STMicroelectronics
- [browser-only] added support for 'browser-only' Theia [#12853](https://github.com/eclipse-theia/theia/pull/12853)
- [builtins] update built-ins to version 1.83.1 [#13298](https://github.com/eclipse-theia/theia/pull/13298) - contributed on behalf of STMicroelectronics
- [core] added keybindings to toggle the tree checkbox [#13271](https://github.com/eclipse-theia/theia/pull/13271)
- [core] added logic to dispose cancellation event listeners [#13254](https://github.com/eclipse-theia/theia/pull/13254)
- [core] added preference 'workbench.tree.indent' to control the indentation in the tree widget [#13179](https://github.com/eclipse-theia/theia/pull/13179) - contributed on behalf of STMicroelectronics
- [core] fixed copy/paste from a menu in electron [#13220](https://github.com/eclipse-theia/theia/pull/13220) - contributed on behalf of STMicroelectronics
- [core] fixed file explorer progress bar issue [#13268](https://github.com/eclipse-theia/theia/pull/13268)
- [core] fixed issue with cyclic menu contributions [#13264](https://github.com/eclipse-theia/theia/pull/13264)
- [core] fixed leak when reconnecting to back end without reload [#13250](https://github.com/eclipse-theia/theia/pull/13250) - contributed on behalf of STMicroelectronics
- [core] fixed SelectComponent to render dropdown correctly in dialog [#13261](https://github.com/eclipse-theia/theia/pull/13261)
- [core] removed error logs from RpcProxyFactory [#13191](https://github.com/eclipse-theia/theia/pull/13191)
- [documentation] improved documentation about 'ContributionProvider' use [#13278](https://github.com/eclipse-theia/theia/pull/13278)
- [docuemtnation] improved documentation on passing objects across RPC [#13238](https://github.com/eclipse-theia/theia/pull/13238)
- [documentation] updated plugin API docs for headless plugins and Inversify DI [#13299](https://github.com/eclipse-theia/theia/pull/13299)
- [filesystem] updated logic to only read unbuffered when we read the whole file [#13197](https://github.com/eclipse-theia/theia/pull/13197)
- [headless-plugin] added support for "headless plugins" in a new plugin host [#13138](https://github.com/eclipse-theia/theia/pull/13138)
- [monaco] updated logic to add document URI as context to getDefaultFormatter [#13280](https://github.com/eclipse-theia/theia/pull/13280) - contributed on behalf of STMicroelectronics
- [notebook] fixed dynamic notebook widgets resizing [#13289](https://github.com/eclipse-theia/theia/pull/13289)
- [notebook] fixed multiple problems with the notebook output rendering [#13239](https://github.com/eclipse-theia/theia/pull/13239)
- [notebook] improved notebook error logging [#13256](https://github.com/eclipse-theia/theia/pull/13256)
- [plugin] added logic to synchronize messages sent via different proxies [#13180](https://github.com/eclipse-theia/theia/pull/13180)
- [remote] added support for specifying the port of a remote SSH connection [#13296](https://github.com/eclipse-theia/theia/pull/13296) - contributed on behalf of STMicroelectronics
- [plugin] fixed inputbox onTriggerButton() event [#13207](https://github.com/eclipse-theia/theia/pull/13207) - contributed on behalf of STMicroelectronics
- [plugin] fixed localization for the removeSession method [#13257](https://github.com/eclipse-theia/theia/pull/13257)
- [plugin] fixed `vscode.env.appRoot` path [#13285](https://github.com/eclipse-theia/theia/pull/13285)
- [plugin] stubbed multiDocumentHighlightProvider proposed API [#13248](https://github.com/eclipse-theia/theia/pull/13248) - contributed on behalf of STMicroelectronics
- [plugin] updated logic to handle activeCustomEditorId [#13267](https://github.com/eclipse-theia/theia/pull/13267)
- [plugin] updated logic to pass context to webview context menu action [#13228](https://github.com/eclipse-theia/theia/pull/13228)
- [plugin] updated logic to use more stable hostname for webviews [#13092](https://github.com/eclipse-theia/theia/pull/13225) [#13258](https://github.com/eclipse-theia/theia/pull/13265)
- [terminal] fixed wording in error message [#13245](https://github.com/eclipse-theia/theia/pull/13245) - contributed on behalf of STMicroelectronics
- [terminal] renamed terminal.sendText() parameter from addNewLine to shouldExecute [#13236](https://github.com/eclipse-theia/theia/pull/13236) - contributed on behalf of STMicroelectronics
- [terminal] updated logic to resize terminal [#13281](https://github.com/eclipse-theia/theia/pull/13281)
- [terminal] updated terminalQuickFixProvider proposed API according to vscode 1.85 version [#13240](https://github.com/eclipse-theia/theia/pull/13240) - contributed on behalf of STMicroelectronics
- [vsx-registry] implemented verified extension filtering [#12995](https://github.com/eclipse-theia/theia/pull/12995)

<a name="breaking_changes_1.46.0">[Breaking Changes:](#breaking_changes_1.46.0)</a>

- [core] moved `FileUri` from `node` package to `common` [#12853](https://github.com/eclipse-theia/theia/pull/12853)
- [plugin] introduced new common interfaces/classes for reuse by different plugin hosts [#13138](https://github.com/eclipse-theia/theia/pull/13138)
