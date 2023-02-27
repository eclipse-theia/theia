# Changelog

## History

- [Previous Changelogs](https://github.com/eclipse-theia/theia/tree/master/doc/changelogs/)

## v1.34.2

<a name="breaking_changes_1.34.2">[Breaking Changes:](#breaking_changes_1.34.2)</a>

- [plugin] renamed `TreeViewExtImpl#toTreeItem()` to `TreeViewExtImpl#toTreeElement()`

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
