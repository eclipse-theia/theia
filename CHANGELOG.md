# Changelog

## History

- [Previous Changelogs](https://github.com/eclipse-theia/theia/tree/master/doc/changelogs/)

## 1.60.0 - not yet released

<a name="breaking_changes_1.60.0">[Breaking Changes:](#breaking_changes_1.60.0)</a>

- [core] fixed version `@types/express` to `^4.17.21` and `@types/express-serve-static-core` to `5.0.4`. This might be required for adopters as well if they run into typing issues. [#15147](https://github.com/eclipse-theia/theia/pull/15147)
- [core] migration from deprecated `phosphorJs` to actively maintained fork `Lumino` [#14320](https://github.com/eclipse-theia/theia/pull/14320) - Contributed on behalf of STMicroelectronics
  Adopters importing `@phosphor` packages now need to import from `@lumino`. CSS selectors refering to `.p-` classes now need to refer to `.lm-` classes. There are also minor code adaptations, for example now using `iconClass` instead of `icon` in Lumino commands.
- [core] typing of `addKeyListener` and `Widget.addKeyListener` corrected to reflect events for `additionalEventTypes`. Adopters declaring handlers explicitly expecting `KeyboardEvent` together with `additionalEventTypes` may need to update type declarations. [#15210]
- [ai] the format for `ai-features.modelSettings.requestSettings` settings has changed. Furthermore the request object for LLMs slightly changed as the message types where improved. [#15092]
- [ai-chat] `ParsedChatRequest.variables` is now `ResolvedAIVariable[]` instead of a `Map<string, AIVariable>` [#15196](https://github.com/eclipse-theia/theia/pull/15196)
- [ai-chat] `ChatRequestParser.parseChatRequest` is now asynchronous and expects an additional `ChatContext` parameter [#15196](https://github.com/eclipse-theia/theia/pull/15196)

## 1.59.0 - 02/27/2025

- [ai] added claude sonnet 3.7 to default models [#15023](https://github.com/eclipse-theia/theia/pull/15023)
- [ai] added contextsummary variable to ai system [#14971](https://github.com/eclipse-theia/theia/pull/14971)
- [ai] aligned ai chat toggle keybinding with vs code on macos [#14850](https://github.com/eclipse-theia/theia/pull/14850)
- [ai] allowed multiple replacements in coder function [#14934](https://github.com/eclipse-theia/theia/pull/14934)
- [ai] allowed to close chats again [#14992](https://github.com/eclipse-theia/theia/pull/14992)
- [ai] chore: used fileservice.exist instead of trying to read the file [#14849](https://github.com/eclipse-theia/theia/pull/14849)
- [ai] chore(chat): moved chat window to the right by default [#14970](https://github.com/eclipse-theia/theia/pull/14970)
- [ai] consolidated the variables we provided in the chat [#15021](https://github.com/eclipse-theia/theia/pull/15021)
- [ai] corrected description in workspace agent functions [#14898](https://github.com/eclipse-theia/theia/pull/14898)
- [ai] correctly set the systempromptid in custom agents [#14988](https://github.com/eclipse-theia/theia/pull/14988)
- [ai] feat(ai): enabled context variables for chat requests [#14787](https://github.com/eclipse-theia/theia/pull/14787)
- [ai] fixed autocompletion for functions in chat input [#14838](https://github.com/eclipse-theia/theia/pull/14838)
- [ai] fixed: provided open handler for quick file open [#15003](https://github.com/eclipse-theia/theia/pull/15003)
- [ai] fixed(chat): avoided file suggestions on colons [#14965](https://github.com/eclipse-theia/theia/pull/14965)
- [ai] fixed(chat): improved variable autocompletion [#15018](https://github.com/eclipse-theia/theia/pull/15018)
- [ai] fixed(chat): prevented duplicate context element entries [#14979](https://github.com/eclipse-theia/theia/pull/14979)
- [ai] fixed(chat): prevented focus outline color of ai chat [#15020](https://github.com/eclipse-theia/theia/pull/15020)
- [ai] fixed closing changesets [#14994](https://github.com/eclipse-theia/theia/pull/14994)
- [ai] fixed structured output dispatch and settings [#14811](https://github.com/eclipse-theia/theia/pull/14811)
- [ai] fixed tool call prompt text replacement [#14830](https://github.com/eclipse-theia/theia/pull/14830)
- [ai] fixed tool calling string in messages [#14906](https://github.com/eclipse-theia/theia/pull/14906)
- [ai] fixed: quick input hover initialization [#15064](https://github.com/eclipse-theia/theia/pull/15064)
- [ai] instructed coder to use replace when search and replace failed [#15061](https://github.com/eclipse-theia/theia/pull/15061)
- [ai] implemented asynch iterator for open ai stream [#14920](https://github.com/eclipse-theia/theia/pull/14920)
- [ai] improved integration between variableregistry and ai variableservice [#14827](https://github.com/eclipse-theia/theia/pull/14827)
- [ai] introduced ai-ide package and moved ai configuration view [#14948](https://github.com/eclipse-theia/theia/pull/14948)
- [ai] labeled ai as alpha [#14968](https://github.com/eclipse-theia/theia/pull/14968)
- [ai] localized theia ai strings [#14857](https://github.com/eclipse-theia/theia/pull/14857)
- [ai] made dependency on monaco explicit [#14907](https://github.com/eclipse-theia/theia/pull/14907)
- [ai] made universal default prompt plain [#15007](https://github.com/eclipse-theia/theia/pull/15007)
- [ai] made new code completion prompt default and turned on inline by default [#14822](https://github.com/eclipse-theia/theia/pull/14822)
- [ai] pinned chat agent [#14716](https://github.com/eclipse-theia/theia/pull/14716)
- [ai] refined coder prompt [#14887](https://github.com/eclipse-theia/theia/pull/14887)
- [ai] refined search-replace prompt default of coder and made it default [#14870](https://github.com/eclipse-theia/theia/pull/14870)
- [ai] refined system message settings [#14877](https://github.com/eclipse-theia/theia/pull/14877)
- [ai] refactored chat agents into separate ide package [#14852](https://github.com/eclipse-theia/theia/pull/14852)
- [ai] removed aieditormanager [#14912](https://github.com/eclipse-theia/theia/pull/14912)
- [ai] renamed workspace agent to architect [#14963](https://github.com/eclipse-theia/theia/pull/14963)
- [ai] set o1 to stream by default [#14947](https://github.com/eclipse-theia/theia/pull/14947)
- [ai] streamlined the agent code [#14859](https://github.com/eclipse-theia/theia/pull/14859)
- [ai] supported anyof in function parameters [#15012](https://github.com/eclipse-theia/theia/pull/15012)
- [ai] updated chatmodel naming [#14913](https://github.com/eclipse-theia/theia/pull/14913)
- [ai] updated default openai models [#14808](https://github.com/eclipse-theia/theia/pull/14808)
- [ai] used content from monacoworkspaceservice for ai getfilecontent [#14885](https://github.com/eclipse-theia/theia/pull/14885)
- [application-manager] used default import of fix-path package [#14812](https://github.com/eclipse-theia/theia/pull/14812)
- [ci] fixed next build [#14981](https://github.com/eclipse-theia/theia/pull/14981)
- [console] fixed: console text model used the language id [#14854](https://github.com/eclipse-theia/theia/pull/14854)
- [core] added commands to toggle left and right panel [#15041](https://github.com/eclipse-theia/theia/pull/15041)
- [core] fixed: removed files in editor tab when deleted [#14990](https://github.com/eclipse-theia/theia/pull/14990)
- [core] fixed problems related with menu bar updates on focus change [#14959](https://github.com/eclipse-theia/theia/pull/14959) - Contributed on behalf of STMicroelectronics
- [core] made context element mandatory when showing a context menu [#14982](https://github.com/eclipse-theia/theia/pull/14982) - Contributed on behalf of STMicroelectronics
- [core] only sent visibility change notification when the visibility actually changed [#15040](https://github.com/eclipse-theia/theia/pull/15040) - Contributed by STMicroelectronics
- [core] streamlined logging api [#14861](https://github.com/eclipse-theia/theia/pull/14861)
- [core] supported manual override of text blocks [#14712](https://github.com/eclipse-theia/theia/pull/14712)
- [debug] fixed: handled the breakpoint update event for id:0 [#14866](https://github.com/eclipse-theia/theia/pull/14866)
- [debug] fixed: no watch evaluation if no current stack frame [#14874](https://github.com/eclipse-theia/theia/pull/14874)
- [debug] fixed: warned user before starting the same debug session multiple times [#14862](https://github.com/eclipse-theia/theia/pull/14862)
- [debug] handled the case where the editor model was set to null [#15013](https://github.com/eclipse-theia/theia/pull/15013) - Contributed on behalf of STMicroelectronics
- [dev-container] devcontainer: added ability to use localenv for containerenv property [#14821](https://github.com/eclipse-theia/theia/pull/14821)
- [dev-container] devcontainer: added simple containerenv contribution [#14816](https://github.com/eclipse-theia/theia/pull/14816)
- [dev-container] fixed recent workspace tracking for devcontainer workspaces [#14925](https://github.com/eclipse-theia/theia/pull/14925)
- [dev-packages] fixed webpack watching [#14844](https://github.com/eclipse-theia/theia/pull/14844)
- [doc] updated build command in publishing.md [#14798](https://github.com/eclipse-theia/theia/pull/14798)
- [doc] updated mcp readme with autostart option [#15046](https://github.com/eclipse-theia/theia/pull/15046)
- [filesystem] deprioritized file resource resolver to avoid resolution delays [#14917](https://github.com/eclipse-theia/theia/pull/14917)
- [monaco] chore: updated vscode-oniguruma+vscode-textmate [#14848](https://github.com/eclipse-theia/theia/pull/14848)
- [monaco] did not create a model reference for inline editors [#14942](https://github.com/eclipse-theia/theia/pull/14942) - Contributed on behalf of STMicroelectronics
- [monaco] emptied hidden editors [#14909](https://github.com/eclipse-theia/theia/pull/14909) - Contributed on behalf of STMicroelectronics
- [monaco] fixed: contenthoverwidget respected theia styles [#14836](https://github.com/eclipse-theia/theia/pull/14836)
- [monaco] fixed monaco editor localization [#15016](https://github.com/eclipse-theia/theia/pull/15016)
- [monaco] fixed monaco model reference creation [#14957](https://github.com/eclipse-theia/theia/pull/14957)
- [notebook] added an error for when a notebook editor was opened with a non existing file [#14891](https://github.com/eclipse-theia/theia/pull/14891)
- [notebook] fixed new notebook cell editor outline and width with open right sidebar [#14800](https://github.com/eclipse-theia/theia/pull/14800)
- [notebook] fixed notebook widget disposal [#14964](https://github.com/eclipse-theia/theia/pull/14964)
- [plugin] added missing vs code json schemas [#14864](https://github.com/eclipse-theia/theia/pull/14864)
- [plugin] passed code action provider metadata to editor [#14991](https://github.com/eclipse-theia/theia/pull/14991) - Contributed on behalf of STMicroelectronics
- [plugin] refreshed root when change notification had no items [#14868](https://github.com/eclipse-theia/theia/pull/14868)
- [plugin] sent plugin logs to the frontend [#14908](https://github.com/eclipse-theia/theia/pull/14908)
- [plugin] supported snippet file edits [#15066](https://github.com/eclipse-theia/theia/pull/15066)
- [scm] used diffeditor diffnavigator to navigate diffs [#14889](https://github.com/eclipse-theia/theia/pull/14889)
- [terminal] fixed: exited shell process on terminal close [#14823](https://github.com/eclipse-theia/theia/pull/14823)
- [vscode] bumped vs code api version [#15069](https://github.com/eclipse-theia/theia/pull/15069) - Contributed on behalf of STMicroelectronics
- [vscode] introduced the commentingrange type [#15015](https://github.com/eclipse-theia/theia/pull/15015) - Contributed on behalf of STMicroelectronics
- [vscode] made public the documentpaste proposed api [#14953](https://github.com/eclipse-theia/theia/pull/14953) - Contributed on behalf of STMicroelectronics
- [vscode] shellexecution updated with undefined command [#15047](https://github.com/eclipse-theia/theia/pull/15047) - Contributed on behalf of STMicroelectronics

<a name="breaking_changes_1.59.0">[Breaking Changes:](#breaking_changes_1.59.0)</a>

- [ai] refined system message settings [#14877](https://github.com/eclipse-theia/theia/pull/14877)
- [ai-chat] changed chat api by removing chatsetchangedeleteevent, updating changeset interface with added ondidchange event and dispose method (renamed accept to apply and discard to revert), modified changesetelement and changesetimpl accordingly [#14910](https://github.com/eclipse-theia/theia/pull/14910)  
- [ai-chat] abstractchatagent updated getsystemmessagedescription to require a context parameter [#14930](https://github.com/eclipse-theia/theia/pull/14930)
- [ai-core] chatmodel interface was updated to include context and promptservice was updated with an optional context argument in getprompt [#14930](https://github.com/eclipse-theia/theia/pull/14930)  
- [ai-ide] content-replacer.ts moved from ai-ide/src/browser/ to core/src/common/ [#14930](https://github.com/eclipse-theia/theia/pull/14930)  
- [ai-scanoss] scanossdialog constructor accepted an array of results instead of a single result [#14930](https://github.com/eclipse-theia/theia/pull/14930)  
- [core] a context html element became mandatory when showing a context menu [#14982](https://github.com/eclipse-theia/theia/pull/14982) - Contributed on behalf of STMicroelectronics  
- [core] adjusted binding of named ilogger injections and instructed removal of duplicate ilogger bindings on ambiguous match errors  
- [core] streamlined logging api [#14861](https://github.com/eclipse-theia/theia/pull/14861)
- [core] made context element mandatory when showing a context menu [#14982](https://github.com/eclipse-theia/theia/pull/14982) - Contributed on behalf of STMicroelectronics
- [debug] fixed: handled the breakpoint update event for id:0 [#14866](https://github.com/eclipse-theia/theia/pull/14866)

## 1.58.0 - 01/30/2025

- [ai] added 'required' property to tool call parameters [#14673](https://github.com/eclipse-theia/theia/pull/14673)
- [ai] added change set support in chat input and chat model [#14750](https://github.com/eclipse-theia/theia/pull/14750)
- [ai] added logic to allow passing context to tool calls [#14751](https://github.com/eclipse-theia/theia/pull/14751)
- [ai] added logic to allow to auto-start MCP servers on frontend start-up [#14736](https://github.com/eclipse-theia/theia/pull/14736)
- [ai] added logic to override change elements on additional changes [#14792](https://github.com/eclipse-theia/theia/pull/14792)
- [ai] added Ollama LLM provider tools support [#14623](https://github.com/eclipse-theia/theia/pull/14623)
- [ai] added search and replace function to coder [#14774](https://github.com/eclipse-theia/theia/pull/14774)
- [ai] added support for Azure OpenAI [#14722](https://github.com/eclipse-theia/theia/pull/14722)
- [ai] added support for change sets via tool functions [#14715](https://github.com/eclipse-theia/theia/pull/14715)
- [ai] added tool support for anthropic streaming [#14758](https://github.com/eclipse-theia/theia/pull/14758)
- [ai] changed trigger of inline suggestion keybinding to Ctrl+Alt+Space [#14669](https://github.com/eclipse-theia/theia/pull/14669)
- [ai] improved behavior of AI Changeset diff editor [#14786](https://github.com/eclipse-theia/theia/pull/14786) - Contributed on behalf of STMicroelectronics
- [ai] improved cancel logic in openAi model [#14713](https://github.com/eclipse-theia/theia/pull/14713)
- [ai] improved cancellation token handling in chat model [#14644](https://github.com/eclipse-theia/theia/pull/14644)
- [ai] improved performance in AI request logging [#14769](https://github.com/eclipse-theia/theia/pull/14769)
- [ai] updated logic to allow filerting backticks in AI code completion [#14777](https://github.com/eclipse-theia/theia/pull/14777)
- [ai] updated logic to consistently handle OpenAI models not supporting system messages instead of using dedicated O1 chat agent [#14681](https://github.com/eclipse-theia/theia/pull/14681)
- [ai] updated logic to manage AI bindings separately per connection [#14760](https://github.com/eclipse-theia/theia/pull/14760)
- [ai] updated logic to not let ai chat submit empty messages [#14771](https://github.com/eclipse-theia/theia/pull/14771)
- [ai] updated logic to register tool functions of mcp servers again after restart of the frontend [#14723](https://github.com/eclipse-theia/theia/pull/14723)
- [ai] updated logic to show diff on click in ChangeSets [#14784](https://github.com/eclipse-theia/theia/pull/14784)
- [application-manager] fixed error caused by bundling scanoss [#14650](https://github.com/eclipse-theia/theia/pull/14650)
- [application-manager] improved bundling for hoisted dependencies [#14708](https://github.com/eclipse-theia/theia/pull/14708)
- [console] fixed console scrolling [#14748](https://github.com/eclipse-theia/theia/pull/14748)
- [core] added support for dragging files in browser [#14756](https://github.com/eclipse-theia/theia/pull/14756)
- [core] fixed dragging file from outside the workspace [#14746](https://github.com/eclipse-theia/theia/pull/14746)
- [core] fixed override of default key bindings [#14668](https://github.com/eclipse-theia/theia/pull/14668)
- [core] fixed `workbench.action.files.newUntitledFile` command [#14754](https://github.com/eclipse-theia/theia/pull/14754)
- [core] fixed z-index overlay issue in dock panels [#14695](https://github.com/eclipse-theia/theia/pull/14695)
- [core] updated build scripts to use npm instead of yarn to build Theia [#14481](https://github.com/eclipse-theia/theia/pull/14481) - Contributed on behalf of STMicroelectronics
- [core] updated keytar and drivelist [#14306](https://github.com/eclipse-theia/theia/pull/14306)
- [core] updated logic to prevent tabbing outside of dialog overlay [#14647](https://github.com/eclipse-theia/theia/pull/14647)
- [debug] added jump to cursor option to context menu [#14594](https://github.com/eclipse-theia/theia/pull/14594) - Contributed by MVTec Software GmbH
- [debug] fixed updating breakpoints when debugging starts [#14645](https://github.com/eclipse-theia/theia/pull/14645) - Contributed by MVTec Software GmbH
- [dev-container] updated logic to show more dev container info in title bar [#14571](https://github.com/eclipse-theia/theia/pull/14571)
- [electron] bumped fix-path to ^4.0.0 to avoid cross-env <6.0.6 [#14781](https://github.com/eclipse-theia/theia/pull/14781) - Contributed on behalf of STMicroelectronics
- [filesystem] added support for vscode file system provider scheme [#14778](https://github.com/eclipse-theia/theia/pull/14778)
- [filesystem] fixed error handling in OPFSFileSystemProvider [#14790](https://github.com/eclipse-theia/theia/pull/14790)
- [filesystem] fixed file data streaming for http polling [#14659](https://github.com/eclipse-theia/theia/pull/14659)
- [getting-started] updated labels to mark DevContainers in recent workspaces [#14595](https://github.com/eclipse-theia/theia/pull/14595)
- [git] added deprecation warning to theia/git readme [#14646](https://github.com/eclipse-theia/theia/pull/14646)
- [monaco] updated monaco-editor-core to 1.96.3 [#14737](https://github.com/eclipse-theia/theia/pull/14737) - Contributed on behalf of STMicroelectronics
- [notebook] fixed execute cell and below for last cell [#14795](https://github.com/eclipse-theia/theia/pull/14795)
- [notebook] fixed issue with deleted cells when talking to output webview [#14649](https://github.com/eclipse-theia/theia/pull/14649)
- [notebook] fixed race condition for outputs [#14789](https://github.com/eclipse-theia/theia/pull/14789)
- [plugin] added support for property Text in DocumentDropOrPasteEditKind [#14605](https://github.com/eclipse-theia/theia/pull/14605) - Contributed on behalf of STMicroelectronics
- [plugin] stubbed TerminalCompletionProvider proposed API [#14719](https://github.com/eclipse-theia/theia/pull/14719) - Contributed on behalf of STMicroelectronics
- [plugin] updated code to properly mark chat and language model APIs as stubbed [#14734](https://github.com/eclipse-theia/theia/pull/14734) - Contributed on behalf of STMicroelectronics
- [plugin] updated code to provide node-pty package for plugins [#14720](https://github.com/eclipse-theia/theia/pull/14720)
- [plugin] updated logic to include ignored files in vscode.workspace.findFiles [#14365](https://github.com/eclipse-theia/theia/pull/14365)
- [plugin] updated logic to only call refresh on given elements given by plugin [#14697](https://github.com/eclipse-theia/theia/pull/14697) - Contributed on behalf of STMicroelectronics
- [process] updated node-pty to 1.1.0-beta27 [#14677](https://github.com/eclipse-theia/theia/pull/14677) - Contributed on behalf of STMicroelectronics
- [scanoss] fixed scanoss error on Windows [#14653](https://github.com/eclipse-theia/theia/pull/14653)
- [secondary-window] improved README of secondary window package [#14691](https://github.com/eclipse-theia/theia/pull/14691) - Contributed on behalf of STMicroelectronics
- [task] added task related context keys [#14757](https://github.com/eclipse-theia/theia/pull/14757)
- [vsx-registry] added logic to load plugin readme from file system [#14699](https://github.com/eclipse-theia/theia/pull/14699)
