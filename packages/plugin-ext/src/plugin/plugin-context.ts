// *****************************************************************************
// Copyright (C) 2018-2022 Red Hat, Inc. and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */
/* tslint:disable:typedef */

import type * as theia from '@theia/plugin';
import { CommandRegistryImpl } from './command-registry';
import { Emitter } from '@theia/core/lib/common/event';
import { CancellationError, CancellationToken, CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { QuickOpenExtImpl } from './quick-open';
import {
    MAIN_RPC_CONTEXT,
    Plugin as InternalPlugin,
    PluginManager,
    PluginAPIFactory,
    MainMessageType,
    DebugConfigurationProviderTriggerKind,
    PLUGIN_RPC_CONTEXT
} from '../common/plugin-api-rpc';
import { RPCProtocol } from '../common/rpc-protocol';
import { MessageRegistryExt } from './message-registry';
import { StatusBarMessageRegistryExt } from './status-bar-message-registry';
import { WindowStateExtImpl } from './window-state';
import { WorkspaceExtImpl } from './workspace';
import { EnvExtImpl } from './env';
import { QueryParameters } from '../common/env';
import {
    ConfigurationTarget,
    Disposable,
    Position,
    Range,
    Selection,
    ViewColumn,
    TextEditorSelectionChangeKind,
    EndOfLine,
    SnippetString,
    ThemeColor,
    ThemeIcon,
    TextEditorRevealType,
    TextEditorLineNumbersStyle,
    DecorationRangeBehavior,
    OverviewRulerLane,
    StatusBarAlignment,
    RelativePattern,
    IndentAction,
    CompletionItem,
    CompletionItemKind,
    CompletionList,
    TextEdit,
    SnippetTextEdit,
    CompletionTriggerKind,
    Diagnostic,
    DiagnosticRelatedInformation,
    DebugConsoleMode,
    DiagnosticSeverity,
    DiagnosticTag,
    CompletionItemTag,
    Location,
    LogLevel,
    Progress,
    ProgressOptions,
    ProgressLocation,
    ParameterInformation,
    SignatureInformation,
    SignatureHelp,
    SignatureHelpTriggerKind,
    Hover,
    EvaluatableExpression,
    InlineValueEvaluatableExpression,
    InlineValueText,
    InlineValueVariableLookup,
    InlineValueContext,
    DocumentHighlightKind,
    DocumentHighlight,
    DocumentLink,
    DocumentDropEdit,
    CodeLens,
    CodeActionKind,
    CodeActionTrigger,
    CodeActionTriggerKind,
    TextDocumentSaveReason,
    CodeAction,
    DataTransferItem,
    DataTransfer,
    TreeItem,
    TreeItemCollapsibleState,
    DocumentSymbol,
    SymbolTag,
    WorkspaceEdit,
    SymbolInformation,
    FileType,
    FileChangeType,
    ShellQuoting,
    ShellExecution,
    ProcessExecution,
    CustomExecution,
    TaskScope,
    TaskPanelKind,
    TaskRevealKind,
    TaskGroup,
    Task,
    Task2,
    DebugAdapterExecutable,
    DebugAdapterServer,
    DebugAdapterNamedPipeServer,
    DebugAdapterInlineImplementation,
    Breakpoint,
    SourceBreakpoint,
    FunctionBreakpoint,
    FoldingRange,
    FoldingRangeKind,
    SelectionRange,
    Color,
    ColorInformation,
    ColorPresentation,
    OperatingSystem,
    WebviewPanelTargetArea,
    UIKind,
    FileSystemError,
    CommentThreadState,
    CommentThreadCollapsibleState,
    QuickInputButtons,
    QuickPickItemKind,
    CommentMode,
    CallHierarchyItem,
    CallHierarchyIncomingCall,
    CallHierarchyOutgoingCall,
    TypeHierarchyItem,
    TimelineItem,
    EnvironmentVariableMutatorType,
    SemanticTokensLegend,
    SemanticTokensBuilder,
    SemanticTokens,
    SemanticTokensEdits,
    SemanticTokensEdit,
    ColorThemeKind,
    SourceControlInputBoxValidationType,
    URI,
    FileDecoration,
    ExtensionMode,
    LinkedEditingRanges,
    LanguageStatusSeverity,
    TextDocumentChangeReason,
    InputBoxValidationSeverity,
    TerminalLink,
    TerminalLocation,
    TerminalExitReason,
    TerminalProfile,
    TerminalQuickFixType,
    InlayHint,
    InlayHintKind,
    InlayHintLabelPart,
    TelemetryTrustedValue,
    NotebookCell,
    NotebookCellKind,
    NotebookCellStatusBarAlignment,
    NotebookEditorRevealType,
    NotebookControllerAffinity,
    NotebookCellData,
    NotebookCellOutput,
    NotebookCellOutputItem,
    NotebookData,
    NotebookDocument,
    NotebookRange,
    NotebookCellStatusBarItem,
    NotebookEdit,
    TestRunProfileKind,
    TestTag,
    TestRunRequest,
    TestMessage,
    ExtensionKind,
    InlineCompletionItem,
    InlineCompletionList,
    InlineCompletionTriggerKind,
    TextTabInput,
    CustomEditorTabInput,
    NotebookDiffEditorTabInput,
    NotebookEditorTabInput,
    TerminalEditorTabInput,
    TextDiffTabInput,
    TextMergeTabInput,
    WebviewEditorTabInput,
    DocumentPasteEdit,
    ExternalUriOpenerPriority,
    EditSessionIdentityMatch
} from './types-impl';
import { AuthenticationExtImpl } from './authentication-ext';
import { SymbolKind } from '../common/plugin-api-rpc-model';
import { EditorsAndDocumentsExtImpl } from './editors-and-documents';
import { TextEditorsExtImpl } from './text-editors';
import { DocumentsExtImpl } from './documents';
import { TextEditorCursorStyle } from '../common/editor-options';
import { PreferenceRegistryExtImpl } from './preference-registry';
import { OutputChannelRegistryExtImpl } from './output-channel-registry';
import { TerminalServiceExtImpl, TerminalExtImpl } from './terminal-ext';
import { LanguagesExtImpl } from './languages';
import { fromDocumentSelector, pluginToPluginInfo, fromGlobPattern } from './type-converters';
import { DialogsExtImpl } from './dialogs';
import { NotificationExtImpl } from './notification';
import { score } from '@theia/editor/lib/common/language-selector';
import { MarkdownString } from './markdown-string';
import { TreeViewsExtImpl } from './tree/tree-views';
import { ConnectionImpl } from '../common/connection';
import { TasksExtImpl } from './tasks/tasks';
import { DebugExtImpl } from './debug/debug-ext';
import { FileSystemExtImpl } from './file-system-ext-impl';
import { ScmExtImpl } from './scm';
import { DecorationsExtImpl } from './decorations';
import { TextEditorExt } from './text-editor';
import { ClipboardExt } from './clipboard-ext';
import { WebviewsExtImpl } from './webviews';
import { ExtHostFileSystemEventService } from './file-system-event-service-ext-impl';
import { LabelServiceExtImpl } from '../plugin/label-service';
import {
    createRunProfile,
    createTestRun,
    testItemCollection,
    createTestItem
} from './stubs/tests-api';
import { TimelineExtImpl } from './timeline';
import { ThemingExtImpl } from './theming';
import { CommentsExtImpl } from './comments';
import { CustomEditorsExtImpl } from './custom-editors';
import { WebviewViewsExtImpl } from './webview-views';
import { PluginPackage } from '../common';
import { Endpoint } from '@theia/core/lib/browser/endpoint';
import { FilePermission } from '@theia/filesystem/lib/common/files';
import { TabsExtImpl } from './tabs';
import { LocalizationExtImpl } from './localization-ext';
import { TelemetryExtImpl } from './telemetry-ext';

export function createAPIFactory(
    rpc: RPCProtocol,
    pluginManager: PluginManager,
    envExt: EnvExtImpl,
    debugExt: DebugExtImpl,
    preferenceRegistryExt: PreferenceRegistryExtImpl,
    editorsAndDocumentsExt: EditorsAndDocumentsExtImpl,
    workspaceExt: WorkspaceExtImpl,
    messageRegistryExt: MessageRegistryExt,
    clipboard: ClipboardExt,
    webviewExt: WebviewsExtImpl,
    localizationExt: LocalizationExtImpl
): PluginAPIFactory {

    const authenticationExt = rpc.set(MAIN_RPC_CONTEXT.AUTHENTICATION_EXT, new AuthenticationExtImpl(rpc));
    const commandRegistry = rpc.set(MAIN_RPC_CONTEXT.COMMAND_REGISTRY_EXT, new CommandRegistryImpl(rpc));
    const quickOpenExt = rpc.set(MAIN_RPC_CONTEXT.QUICK_OPEN_EXT, new QuickOpenExtImpl(rpc));
    const dialogsExt = new DialogsExtImpl(rpc);
    const windowStateExt = rpc.set(MAIN_RPC_CONTEXT.WINDOW_STATE_EXT, new WindowStateExtImpl(rpc));
    const notificationExt = rpc.set(MAIN_RPC_CONTEXT.NOTIFICATION_EXT, new NotificationExtImpl(rpc));
    const editors = rpc.set(MAIN_RPC_CONTEXT.TEXT_EDITORS_EXT, new TextEditorsExtImpl(rpc, editorsAndDocumentsExt));
    const documents = rpc.set(MAIN_RPC_CONTEXT.DOCUMENTS_EXT, new DocumentsExtImpl(rpc, editorsAndDocumentsExt));
    const statusBarMessageRegistryExt = new StatusBarMessageRegistryExt(rpc);
    const terminalExt = rpc.set(MAIN_RPC_CONTEXT.TERMINAL_EXT, new TerminalServiceExtImpl(rpc));
    const outputChannelRegistryExt = rpc.set(MAIN_RPC_CONTEXT.OUTPUT_CHANNEL_REGISTRY_EXT, new OutputChannelRegistryExtImpl(rpc));
    const treeViewsExt = rpc.set(MAIN_RPC_CONTEXT.TREE_VIEWS_EXT, new TreeViewsExtImpl(rpc, commandRegistry));
    const tasksExt = rpc.set(MAIN_RPC_CONTEXT.TASKS_EXT, new TasksExtImpl(rpc, terminalExt));
    const connectionExt = rpc.set(MAIN_RPC_CONTEXT.CONNECTION_EXT, new ConnectionImpl(rpc.getProxy(PLUGIN_RPC_CONTEXT.CONNECTION_MAIN)));
    const fileSystemExt = rpc.set(MAIN_RPC_CONTEXT.FILE_SYSTEM_EXT, new FileSystemExtImpl(rpc));
    const languagesExt = rpc.set(MAIN_RPC_CONTEXT.LANGUAGES_EXT, new LanguagesExtImpl(rpc, documents, commandRegistry, fileSystemExt));
    const extHostFileSystemEvent = rpc.set(MAIN_RPC_CONTEXT.ExtHostFileSystemEventService, new ExtHostFileSystemEventService(rpc, editorsAndDocumentsExt));
    const scmExt = rpc.set(MAIN_RPC_CONTEXT.SCM_EXT, new ScmExtImpl(rpc, commandRegistry));
    const decorationsExt = rpc.set(MAIN_RPC_CONTEXT.DECORATIONS_EXT, new DecorationsExtImpl(rpc));
    const labelServiceExt = rpc.set(MAIN_RPC_CONTEXT.LABEL_SERVICE_EXT, new LabelServiceExtImpl(rpc));
    const timelineExt = rpc.set(MAIN_RPC_CONTEXT.TIMELINE_EXT, new TimelineExtImpl(rpc, commandRegistry));
    const themingExt = rpc.set(MAIN_RPC_CONTEXT.THEMING_EXT, new ThemingExtImpl(rpc));
    const commentsExt = rpc.set(MAIN_RPC_CONTEXT.COMMENTS_EXT, new CommentsExtImpl(rpc, commandRegistry, documents));
    const tabsExt = rpc.set(MAIN_RPC_CONTEXT.TABS_EXT, new TabsExtImpl(rpc));
    const customEditorExt = rpc.set(MAIN_RPC_CONTEXT.CUSTOM_EDITORS_EXT, new CustomEditorsExtImpl(rpc, documents, webviewExt, workspaceExt));
    const webviewViewsExt = rpc.set(MAIN_RPC_CONTEXT.WEBVIEW_VIEWS_EXT, new WebviewViewsExtImpl(rpc, webviewExt));
    const telemetryExt = rpc.set(MAIN_RPC_CONTEXT.TELEMETRY_EXT, new TelemetryExtImpl());
    rpc.set(MAIN_RPC_CONTEXT.DEBUG_EXT, debugExt);

    return function (plugin: InternalPlugin): typeof theia {
        const authentication: typeof theia.authentication = {
            registerAuthenticationProvider(id: string, label: string, provider: theia.AuthenticationProvider, options?: theia.AuthenticationProviderOptions): theia.Disposable {
                return authenticationExt.registerAuthenticationProvider(id, label, provider, options);
            },
            getSession(providerId: string, scopes: string[], options: theia.AuthenticationGetSessionOptions) {
                return authenticationExt.getSession(plugin, providerId, scopes, options as any);
            },
            get onDidChangeSessions(): theia.Event<theia.AuthenticationSessionsChangeEvent> {
                return authenticationExt.onDidChangeSessions;
            }
        };
        function commandIsDeclaredInPackage(id: string, model: PluginPackage): boolean {
            const rawCommands = model.contributes?.commands;
            if (!rawCommands) { return false; }
            return Array.isArray(rawCommands) ? rawCommands.some(candidate => candidate.command === id) : rawCommands.command === id;
        }
        const commands: typeof theia.commands = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            registerCommand(command: theia.CommandDescription | string, handler?: <T>(...args: any[]) => T | Thenable<T | undefined>, thisArg?: any): Disposable {
                // use of the ID when registering commands
                if (typeof command === 'string') {
                    if (handler && commandIsDeclaredInPackage(command, plugin.rawModel)) {
                        return commandRegistry.registerHandler(command, handler, thisArg);
                    }
                    return commandRegistry.registerCommand({ id: command }, handler, thisArg);
                }
                return commandRegistry.registerCommand(command, handler, thisArg);
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            executeCommand<T>(commandId: string, ...args: any[]): PromiseLike<T | undefined> {
                return commandRegistry.executeCommand<T>(commandId, ...args);
            },
            registerTextEditorCommand(command: string, handler: (textEditor: theia.TextEditor, edit: theia.TextEditorEdit, ...arg: any[]) => void, thisArg?: any): Disposable {
                const internalHandler = (...args: any[]): any => {
                    const activeTextEditor = editors.getActiveEditor();
                    if (!activeTextEditor) {
                        console.warn('Cannot execute ' + command + ' because there is no active text editor.');
                        return undefined;
                    }

                    return activeTextEditor.edit((edit: theia.TextEditorEdit) => {
                        args.unshift(activeTextEditor, edit);
                        handler.apply(thisArg, args);
                    }).then(result => {
                        if (!result) {
                            console.warn('Edits from command ' + command + ' were not applied.');
                        }
                    }, err => {
                        console.warn('An error occurred while running command ' + command, err);
                    });
                };
                return commandIsDeclaredInPackage(command, plugin.rawModel)
                    ? commandRegistry.registerHandler(command, internalHandler)
                    : commandRegistry.registerCommand({ id: command }, internalHandler);
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            registerHandler(commandId: string, handler: (...args: any[]) => any, thisArg?: any): Disposable {
                return commandRegistry.registerHandler(commandId, handler, thisArg);
            },
            getKeyBinding(commandId: string): PromiseLike<theia.CommandKeyBinding[] | undefined> {
                return commandRegistry.getKeyBinding(commandId);
            },
            getCommands(filterInternal: boolean = false): PromiseLike<string[]> {
                return commandRegistry.getCommands(filterInternal);
            },
            registerDiffInformationCommand(command: string, callback: (diff: theia.LineChange[], ...args: any[]) => any, thisArg?: any): Disposable {
                // Dummy implementation.
                return new Disposable(() => { });
            }
        };

        const { onDidChangeActiveTerminal, onDidChangeTerminalState, onDidCloseTerminal, onDidOpenTerminal } = terminalExt;
        const showInformationMessage = messageRegistryExt.showMessage.bind(messageRegistryExt, MainMessageType.Info);
        const showWarningMessage = messageRegistryExt.showMessage.bind(messageRegistryExt, MainMessageType.Warning);
        const showErrorMessage = messageRegistryExt.showMessage.bind(messageRegistryExt, MainMessageType.Error);
        const window: typeof theia.window = {

            get activeTerminal(): TerminalExtImpl | undefined {
                return terminalExt.activeTerminal;
            },
            get activeTextEditor(): TextEditorExt | undefined {
                return editors.getActiveEditor();
            },
            get visibleTextEditors(): theia.TextEditor[] {
                return editors.getVisibleTextEditors();
            },
            get terminals(): TerminalExtImpl[] {
                return terminalExt.terminals;
            },
            onDidChangeActiveTerminal,
            onDidChangeActiveTextEditor(listener, thisArg?, disposables?) {
                return editors.onDidChangeActiveTextEditor(listener, thisArg, disposables);
            },
            onDidChangeVisibleTextEditors(listener, thisArg?, disposables?) {
                return editors.onDidChangeVisibleTextEditors(listener, thisArg, disposables);
            },
            onDidChangeTextEditorSelection(listener, thisArg?, disposables?) {
                return editors.onDidChangeTextEditorSelection(listener, thisArg, disposables);
            },
            onDidChangeTextEditorOptions(listener, thisArg?, disposables?) {
                return editors.onDidChangeTextEditorOptions(listener, thisArg, disposables);
            },
            onDidChangeTextEditorViewColumn(listener, thisArg?, disposables?) {
                return editors.onDidChangeTextEditorViewColumn(listener, thisArg, disposables);
            },
            onDidChangeTextEditorVisibleRanges(listener, thisArg?, disposables?) {
                return editors.onDidChangeTextEditorVisibleRanges(listener, thisArg, disposables);
            },
            async showTextDocument(documentArg: theia.TextDocument | URI,
                columnOrOptions?: theia.TextDocumentShowOptions | theia.ViewColumn,
                preserveFocus?: boolean
            ): Promise<theia.TextEditor> {
                let documentOptions: theia.TextDocumentShowOptions | undefined;
                const uri: URI = documentArg instanceof URI ? documentArg : documentArg.uri;
                if (typeof columnOrOptions === 'number') {
                    documentOptions = {
                        viewColumn: columnOrOptions
                    };
                } else if (columnOrOptions && (columnOrOptions.preserveFocus || columnOrOptions.preview || columnOrOptions.selection || columnOrOptions.viewColumn)) {
                    documentOptions = {
                        ...columnOrOptions
                    };
                }
                if (preserveFocus) {
                    if (documentOptions) {
                        documentOptions.preserveFocus = preserveFocus;
                    } else {
                        documentOptions = { preserveFocus };
                    }
                }
                await documents.showDocument(uri, documentOptions);
                const textEditor = editors.getVisibleTextEditors().find(editor => editor.document.uri.toString() === uri.toString());
                if (textEditor) {
                    return Promise.resolve(textEditor);
                } else {
                    throw new Error(`Failed to show text document ${documentArg.toString()}`);
                }
            },
            get visibleNotebookEditors(): theia.NotebookEditor[] {
                return [] as theia.NotebookEditor[];
            },
            onDidChangeVisibleNotebookEditors(listener, thisArg?, disposables?) {
                return Disposable.NULL;
            },
            get activeNotebookEditor(): theia.NotebookEditor | undefined {
                return undefined;
            }, onDidChangeActiveNotebookEditor(listener, thisArg?, disposables?) {
                return Disposable.NULL;
            },
            onDidChangeNotebookEditorSelection(listener, thisArg?, disposables?) {
                return Disposable.NULL;
            },
            onDidChangeNotebookEditorVisibleRanges(listener, thisArg?, disposables?) {
                return Disposable.NULL;
            },
            showNotebookDocument(document: NotebookDocument, options?: theia.NotebookDocumentShowOptions) {
                return Promise.resolve({} as theia.NotebookEditor);
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            showQuickPick(items: any, options?: theia.QuickPickOptions, token?: theia.CancellationToken): any {
                return quickOpenExt.showQuickPick(items, options, token);
            },
            createQuickPick<T extends theia.QuickPickItem>(): theia.QuickPick<T> {
                return quickOpenExt.createQuickPick(plugin);
            },
            showWorkspaceFolderPick(options?: theia.WorkspaceFolderPickOptions): PromiseLike<theia.WorkspaceFolder | undefined> {
                return workspaceExt.pickWorkspaceFolder(options);
            },
            showInformationMessage,
            showWarningMessage,
            showErrorMessage,
            showOpenDialog(options: theia.OpenDialogOptions): PromiseLike<URI[] | undefined> {
                return dialogsExt.showOpenDialog(options);
            },
            showSaveDialog(options: theia.SaveDialogOptions): PromiseLike<URI | undefined> {
                return dialogsExt.showSaveDialog(options);
            },
            showUploadDialog(options: theia.UploadDialogOptions): PromiseLike<URI[] | undefined> {
                return dialogsExt.showUploadDialog(options);
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setStatusBarMessage(text: string, arg?: number | PromiseLike<any>): Disposable {
                return statusBarMessageRegistryExt.setStatusBarMessage(text, arg);
            },
            showInputBox(options?: theia.InputBoxOptions, token?: theia.CancellationToken): PromiseLike<string | undefined> {
                return quickOpenExt.showInput(options, token);
            },
            createStatusBarItem(alignmentOrId?: theia.StatusBarAlignment | string, priorityOrAlignment?: number | theia.StatusBarAlignment,
                priorityArg?: number): theia.StatusBarItem {
                let id: string | undefined;
                let alignment: number | undefined;
                let priority: number | undefined;

                if (typeof alignmentOrId === 'string') {
                    id = alignmentOrId;
                    alignment = priorityOrAlignment;
                    priority = priorityArg;
                } else {
                    alignment = alignmentOrId;
                    priority = priorityOrAlignment;
                }

                return statusBarMessageRegistryExt.createStatusBarItem(alignment, priority, id);
            },
            createOutputChannel(name: string, options?: { log: true }): any {
                return !options
                    ? outputChannelRegistryExt.createOutputChannel(name, pluginToPluginInfo(plugin))
                    : outputChannelRegistryExt.createOutputChannel(name, pluginToPluginInfo(plugin), options);
            },
            createWebviewPanel(viewType: string,
                title: string,
                showOptions: theia.ViewColumn | theia.WebviewPanelShowOptions,
                options: theia.WebviewPanelOptions & theia.WebviewOptions = {}): theia.WebviewPanel {
                return webviewExt.createWebview(viewType, title, showOptions, options, plugin);
            },
            registerWebviewPanelSerializer(viewType: string, serializer: theia.WebviewPanelSerializer): theia.Disposable {
                return webviewExt.registerWebviewPanelSerializer(viewType, serializer, plugin);
            },
            registerCustomEditorProvider(viewType: string,
                provider: theia.CustomTextEditorProvider | theia.CustomReadonlyEditorProvider,
                options: { webviewOptions?: theia.WebviewPanelOptions, supportsMultipleEditorsPerDocument?: boolean } = {}): theia.Disposable {
                return customEditorExt.registerCustomEditorProvider(viewType, provider, options, plugin);
            },
            registerWebviewViewProvider(viewType: string,
                provider: theia.WebviewViewProvider,
                options?: {
                    webviewOptions?: {
                        retainContextWhenHidden?: boolean
                    }
                }): theia.Disposable {
                return webviewViewsExt.registerWebviewViewProvider(viewType, provider, plugin, options?.webviewOptions);
            },
            get state(): theia.WindowState {
                return windowStateExt.getWindowState();
            },
            onDidChangeWindowState(listener, thisArg?, disposables?): theia.Disposable {
                return windowStateExt.onDidChangeWindowState(listener, thisArg, disposables);
            },
            createTerminal(nameOrOptions: theia.TerminalOptions | theia.ExtensionTerminalOptions | theia.ExtensionTerminalOptions | (string | undefined),
                shellPath?: string,
                shellArgs?: string[] | string): theia.Terminal {
                return terminalExt.createTerminal(nameOrOptions, shellPath, shellArgs);
            },
            onDidChangeTerminalState,
            onDidCloseTerminal,
            onDidOpenTerminal,
            createTextEditorDecorationType(options: theia.DecorationRenderOptions): theia.TextEditorDecorationType {
                return editors.createTextEditorDecorationType(options);
            },
            registerTreeDataProvider<T>(viewId: string, treeDataProvider: theia.TreeDataProvider<T>): Disposable {
                return treeViewsExt.registerTreeDataProvider(plugin, viewId, treeDataProvider);
            },
            createTreeView<T>(viewId: string, options: theia.TreeViewOptions<T>): theia.TreeView<T> {
                return treeViewsExt.createTreeView(plugin, viewId, options);
            },
            withScmProgress<R>(task: (progress: theia.Progress<number>) => Thenable<R>) {
                const options: ProgressOptions = { location: ProgressLocation.SourceControl };
                return notificationExt.withProgress(options, () => task({ report() { /* noop */ } }));
            },
            withProgress<R>(
                options: ProgressOptions,
                task: (progress: Progress<{ message?: string; increment?: number }>, token: theia.CancellationToken) => PromiseLike<R>
            ): PromiseLike<R> {
                return notificationExt.withProgress(options, task);
            },
            registerFileDecorationProvider(provider: theia.FileDecorationProvider): theia.Disposable {
                return decorationsExt.registerFileDecorationProvider(provider, pluginToPluginInfo(plugin));
            },
            registerUriHandler(handler: theia.UriHandler): theia.Disposable {
                // TODO ?
                return new Disposable(() => { });
            },
            createInputBox(): theia.InputBox {
                return quickOpenExt.createInputBox(plugin);
            },
            registerTerminalLinkProvider(provider: theia.TerminalLinkProvider): theia.Disposable {
                return terminalExt.registerTerminalLinkProvider(provider);
            },
            registerTerminalProfileProvider(id: string, provider: theia.TerminalProfileProvider): theia.Disposable {
                return terminalExt.registerTerminalProfileProvider(id, provider);
            },
            get activeColorTheme(): theia.ColorTheme {
                return themingExt.activeColorTheme;
            },
            onDidChangeActiveColorTheme(listener, thisArg?, disposables?) {
                return themingExt.onDidChangeActiveColorTheme(listener, thisArg, disposables);
            },
            get tabGroups(): theia.TabGroups {
                return tabsExt.tabGroups;
            },
            /** @stubbed ExternalUriOpener */
            registerExternalUriOpener(id: string, opener: theia.ExternalUriOpener, metadata: theia.ExternalUriOpenerMetadata): theia.Disposable {
                return Disposable.NULL;
            },
            /** @stubbed ProfileContentHandler */
            registerProfileContentHandler(id: string, profileContentHandler: theia.ProfileContentHandler): theia.Disposable {
                return Disposable.NULL;
            },
            /** @stubbed TerminalQuickFixProvider */
            registerTerminalQuickFixProvider(id: string, provider: theia.TerminalQuickFixProvider): theia.Disposable {
                return terminalExt.registerTerminalQuickFixProvider(id, provider);
            }
        };

        const workspace: typeof theia.workspace = {

            get fs(): theia.FileSystem {
                return fileSystemExt.fileSystem;
            },

            get rootPath(): string | undefined {
                return workspaceExt.rootPath;
            },
            get workspaceFolders(): theia.WorkspaceFolder[] | undefined {
                return workspaceExt.workspaceFolders;
            },
            get workspaceFile(): URI | undefined {
                return workspaceExt.workspaceFile;
            },
            get name(): string | undefined {
                return workspaceExt.name;
            },
            onDidChangeWorkspaceFolders(listener, thisArg?, disposables?): theia.Disposable {
                return workspaceExt.onDidChangeWorkspaceFolders(listener, thisArg, disposables);
            },
            get notebookDocuments(): theia.NotebookDocument[] {
                return [] as theia.NotebookDocument[];
            },
            get textDocuments(): theia.TextDocument[] {
                return documents.getAllDocumentData().map(data => data.document);
            },
            onDidChangeTextDocument(listener, thisArg?, disposables?) {
                return documents.onDidChangeDocument(listener, thisArg, disposables);
            },
            onDidCloseTextDocument(listener, thisArg?, disposables?) {
                return documents.onDidRemoveDocument(listener, thisArg, disposables);
            },
            onDidOpenNotebookDocument(listener, thisArg?, disposables?) {
                return Disposable.NULL;
            },
            onDidCloseNotebookDocument(listener, thisArg?, disposables?) {
                return Disposable.NULL;
            },
            onDidChangeNotebookDocument(listener, thisArg?, disposables?) {
                return Disposable.NULL;
            },
            onDidSaveNotebookDocument(listener, thisArg?, disposables?) {
                return Disposable.NULL;
            },
            onDidOpenTextDocument(listener, thisArg?, disposables?) {
                return documents.onDidAddDocument(listener, thisArg, disposables);
            },
            onWillSaveTextDocument(listener, thisArg?, disposables?) {
                return documents.onWillSaveTextDocument(listener, thisArg, disposables);
            },
            onDidSaveTextDocument(listener, thisArg?, disposables?) {
                return documents.onDidSaveTextDocument(listener, thisArg, disposables);
            },
            onDidCreateFiles: (listener, thisArg, disposables) => extHostFileSystemEvent.onDidCreateFile(listener, thisArg, disposables),
            onDidDeleteFiles: (listener, thisArg, disposables) => extHostFileSystemEvent.onDidDeleteFile(listener, thisArg, disposables),
            onDidRenameFiles: (listener, thisArg, disposables) => extHostFileSystemEvent.onDidRenameFile(listener, thisArg, disposables),
            onWillCreateFiles: (listener: (e: theia.FileWillCreateEvent) => any, thisArg?: any, disposables?: theia.Disposable[]) =>
                extHostFileSystemEvent.getOnWillCreateFileEvent(plugin)(listener, thisArg, disposables),
            onWillDeleteFiles: (listener: (e: theia.FileWillDeleteEvent) => any, thisArg?: any, disposables?: theia.Disposable[]) =>
                extHostFileSystemEvent.getOnWillDeleteFileEvent(plugin)(listener, thisArg, disposables),
            onWillRenameFiles: (listener: (e: theia.FileWillRenameEvent) => any, thisArg?: any, disposables?: theia.Disposable[]) =>
                extHostFileSystemEvent.getOnWillRenameFileEvent(plugin)(listener, thisArg, disposables),
            getConfiguration(section, resource): theia.WorkspaceConfiguration {
                return preferenceRegistryExt.getConfiguration(section, resource);
            },
            onDidChangeConfiguration(listener, thisArgs?, disposables?): theia.Disposable {
                return preferenceRegistryExt.onDidChangeConfiguration(listener, thisArgs, disposables);
            },
            async openTextDocument(uriOrFileNameOrOptions?: theia.Uri | string | { language?: string; content?: string; }): Promise<theia.TextDocument | undefined> {
                const options = uriOrFileNameOrOptions as { language?: string; content?: string; };

                let uri: URI;
                if (typeof uriOrFileNameOrOptions === 'string') {
                    uri = URI.file(uriOrFileNameOrOptions);

                } else if (uriOrFileNameOrOptions instanceof URI) {
                    uri = uriOrFileNameOrOptions;

                } else if (!options || typeof options === 'object') {
                    uri = await documents.createDocumentData(options);

                } else {
                    return Promise.reject(new Error('illegal argument - uriOrFileNameOrOptions'));
                }

                const data = await documents.openDocument(uri);
                return data && data.document;
            },
            openNotebookDocument(uriOrString: theia.Uri | string, content?: NotebookData): Promise<theia.NotebookDocument | undefined> {
                return Promise.reject(new Error('Notebook API is stubbed'));
            },
            createFileSystemWatcher: (pattern, ignoreCreate, ignoreChange, ignoreDelete): theia.FileSystemWatcher =>
                extHostFileSystemEvent.createFileSystemWatcher(fromGlobPattern(pattern), ignoreCreate, ignoreChange, ignoreDelete),
            findFiles(include: theia.GlobPattern, exclude?: theia.GlobPattern | null, maxResults?: number, token?: CancellationToken): PromiseLike<URI[]> {
                return workspaceExt.findFiles(include, exclude, maxResults, token);
            },
            findTextInFiles(query: theia.TextSearchQuery, optionsOrCallback: theia.FindTextInFilesOptions | ((result: theia.TextSearchResult) => void),
                callbackOrToken?: CancellationToken | ((result: theia.TextSearchResult) => void), token?: CancellationToken): Promise<theia.TextSearchComplete> {
                return workspaceExt.findTextInFiles(query, optionsOrCallback, callbackOrToken, token);
            },
            saveAll(includeUntitled?: boolean): PromiseLike<boolean> {
                return editors.saveAll(includeUntitled);
            },
            applyEdit(edit: theia.WorkspaceEdit, metadata?: theia.WorkspaceEditMetadata): PromiseLike<boolean> {
                return editors.applyWorkspaceEdit(edit, metadata);
            },
            registerTextDocumentContentProvider(scheme: string, provider: theia.TextDocumentContentProvider): theia.Disposable {
                return workspaceExt.registerTextDocumentContentProvider(scheme, provider);
            },
            registerFileSystemProvider(scheme: string, provider: theia.FileSystemProvider, options?: { isCaseSensitive?: boolean, isReadonly?: boolean }): theia.Disposable {
                return fileSystemExt.registerFileSystemProvider(scheme, provider, options);
            },
            getWorkspaceFolder(uri: theia.Uri): theia.WorkspaceFolder | undefined {
                return workspaceExt.getWorkspaceFolder(uri);
            },
            asRelativePath(pathOrUri: theia.Uri | string, includeWorkspace?: boolean): string | undefined {
                return workspaceExt.getRelativePath(pathOrUri, includeWorkspace);
            },
            updateWorkspaceFolders: (index, deleteCount, ...workspaceFoldersToAdd) =>
                workspaceExt.updateWorkspaceFolders(index, deleteCount || 0, ...workspaceFoldersToAdd)
            ,
            registerTaskProvider(type: string, provider: theia.TaskProvider): theia.Disposable {
                return tasks.registerTaskProvider(type, provider);
            },
            registerResourceLabelFormatter(formatter: theia.ResourceLabelFormatter): theia.Disposable {
                return labelServiceExt.$registerResourceLabelFormatter(formatter);
            },
            registerTimelineProvider(scheme: string | string[], provider: theia.TimelineProvider): theia.Disposable {
                return timelineExt.registerTimelineProvider(plugin, scheme, provider);
            },
            registerNotebookSerializer(notebookType: string, serializer: theia.NotebookSerializer, options?: theia.NotebookDocumentContentOptions): theia.Disposable {
                return Disposable.NULL;
            },
            get isTrusted(): boolean {
                return workspaceExt.trusted;
            },
            async requestWorkspaceTrust(options?: theia.WorkspaceTrustRequestOptions): Promise<boolean | undefined> {
                return workspaceExt.requestWorkspaceTrust(options);
            },
            get onDidGrantWorkspaceTrust(): theia.Event<void> {
                return workspaceExt.onDidGrantWorkspaceTrust;
            },
            registerEditSessionIdentityProvider(scheme: string, provider: theia.EditSessionIdentityProvider) {
                return workspaceExt.$registerEditSessionIdentityProvider(scheme, provider);
            },
            /**
             * @stubbed
             * This is a stub implementation, that should minimally satisfy vscode built-in extensions
             * that currently use this proposed API.
             */
            onWillCreateEditSessionIdentity: () => Disposable.NULL,
        };

        const onDidChangeLogLevel = new Emitter<theia.LogLevel>();
        const env: typeof theia.env = Object.freeze({
            get appName(): string { return envExt.appName; },
            get appRoot(): string { return envExt.appRoot; },
            get appHost(): string { return envExt.appHost; },
            get language(): string { return envExt.language; },
            get isNewAppInstall(): boolean { return envExt.isNewAppInstall; },
            get isTelemetryEnabled(): boolean { return telemetryExt.isTelemetryEnabled; },
            get onDidChangeTelemetryEnabled(): theia.Event<boolean> {
                return telemetryExt.onDidChangeTelemetryEnabled;
            },
            createTelemetryLogger(sender: theia.TelemetrySender, options?: theia.TelemetryLoggerOptions): theia.TelemetryLogger {
                return telemetryExt.createTelemetryLogger(sender, options);
            },
            get remoteName(): string | undefined { return envExt.remoteName; },
            get machineId(): string { return envExt.machineId; },
            get sessionId(): string { return envExt.sessionId; },
            get uriScheme(): string { return envExt.uriScheme; },
            get shell(): string { return envExt.shell; },
            get uiKind(): theia.UIKind { return envExt.uiKind; },
            clipboard,
            getEnvVariable(envVarName: string): PromiseLike<string | undefined> {
                return envExt.getEnvVariable(envVarName);
            },
            getQueryParameter(queryParamName: string): string | string[] | undefined {
                return envExt.getQueryParameter(queryParamName);
            },
            getQueryParameters(): QueryParameters {
                return envExt.getQueryParameters();
            },
            getClientOperatingSystem(): PromiseLike<theia.OperatingSystem> {
                return envExt.getClientOperatingSystem();
            },
            openExternal(uri: theia.Uri): PromiseLike<boolean> {
                return windowStateExt.openUri(uri);
            },
            asExternalUri(target: theia.Uri): PromiseLike<theia.Uri> {
                return windowStateExt.asExternalUri(target);
            },
            get logLevel(): theia.LogLevel { return LogLevel.Info; },
            get onDidChangeLogLevel(): theia.Event<theia.LogLevel> { return onDidChangeLogLevel.event; }
        });

        const extensions: typeof theia.extensions = Object.freeze({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getExtension<T = any>(extensionId: string, includeFromDifferentExtensionHosts: boolean = false): theia.Extension<T> | undefined {
                includeFromDifferentExtensionHosts = false;
                const plg = pluginManager.getPluginById(extensionId.toLowerCase());
                if (plg) {
                    return new PluginExt(pluginManager, plg);
                }
                return undefined;
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            get all(): readonly theia.Extension<any>[] {
                return pluginManager.getAllPlugins().map(plg => new PluginExt(pluginManager, plg));
            },
            get allAcrossExtensionHosts(): readonly theia.Extension<any>[] {
                // we only support one extension host ATM so equivalent to calling "all()"
                return this.all;
            },
            get onDidChange(): theia.Event<void> {
                return pluginManager.onDidChange;
            }
        });

        const languages: typeof theia.languages = {
            getLanguages(): PromiseLike<string[]> {
                return languagesExt.getLanguages();
            },
            setTextDocumentLanguage(document: theia.TextDocument, languageId: string): PromiseLike<theia.TextDocument> {
                return languagesExt.changeLanguage(document.uri, languageId);
            },
            match(selector: theia.DocumentSelector, document: theia.TextDocument): number {
                return score(fromDocumentSelector(selector), document.uri.scheme, document.uri.path, document.languageId, true);
            },
            get onDidChangeDiagnostics(): theia.Event<theia.DiagnosticChangeEvent> {
                return languagesExt.onDidChangeDiagnostics;
            },
            getDiagnostics(resource?: URI) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return <any>languagesExt.getDiagnostics(resource);
            },
            createDiagnosticCollection(name?: string): theia.DiagnosticCollection {
                return languagesExt.createDiagnosticCollection(name);
            },
            setLanguageConfiguration(language: string, configuration: theia.LanguageConfiguration): theia.Disposable {
                return languagesExt.setLanguageConfiguration(language, configuration);
            },
            registerCompletionItemProvider(selector: theia.DocumentSelector, provider: theia.CompletionItemProvider, ...triggerCharacters: string[]): theia.Disposable {
                return languagesExt.registerCompletionItemProvider(selector, provider, triggerCharacters, pluginToPluginInfo(plugin));
            },
            registerInlineCompletionItemProvider(selector: theia.DocumentSelector, provider: theia.InlineCompletionItemProvider): theia.Disposable {
                return languagesExt.registerInlineCompletionsProvider(selector, provider);
            },
            registerDefinitionProvider(selector: theia.DocumentSelector, provider: theia.DefinitionProvider): theia.Disposable {
                return languagesExt.registerDefinitionProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerDeclarationProvider(selector: theia.DocumentSelector, provider: theia.DeclarationProvider): theia.Disposable {
                return languagesExt.registerDeclarationProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerSignatureHelpProvider(
                selector: theia.DocumentSelector, provider: theia.SignatureHelpProvider, first?: string | theia.SignatureHelpProviderMetadata, ...remaining: string[]
            ): theia.Disposable {
                let metadata: theia.SignatureHelpProviderMetadata;
                if (typeof first === 'object') {
                    metadata = first;
                } else {
                    const triggerCharacters: string[] = [];
                    metadata = { triggerCharacters, retriggerCharacters: [] };
                    if (first) {
                        triggerCharacters.push(first, ...remaining);
                    }
                }
                return languagesExt.registerSignatureHelpProvider(selector, provider, metadata, pluginToPluginInfo(plugin));
            },
            registerTypeDefinitionProvider(selector: theia.DocumentSelector, provider: theia.TypeDefinitionProvider): theia.Disposable {
                return languagesExt.registerTypeDefinitionProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerImplementationProvider(selector: theia.DocumentSelector, provider: theia.ImplementationProvider): theia.Disposable {
                return languagesExt.registerImplementationProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerHoverProvider(selector: theia.DocumentSelector, provider: theia.HoverProvider): theia.Disposable {
                return languagesExt.registerHoverProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerEvaluatableExpressionProvider(selector: theia.DocumentSelector, provider: theia.EvaluatableExpressionProvider): theia.Disposable {
                return languagesExt.registerEvaluatableExpressionProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerInlineValuesProvider(selector: theia.DocumentSelector, provider: theia.InlineValuesProvider): theia.Disposable {
                return languagesExt.registerInlineValuesProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerDocumentHighlightProvider(selector: theia.DocumentSelector, provider: theia.DocumentHighlightProvider): theia.Disposable {
                return languagesExt.registerDocumentHighlightProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerWorkspaceSymbolProvider(provider: theia.WorkspaceSymbolProvider): theia.Disposable {
                return languagesExt.registerWorkspaceSymbolProvider(provider, pluginToPluginInfo(plugin));
            },
            registerDocumentFormattingEditProvider(selector: theia.DocumentSelector, provider: theia.DocumentFormattingEditProvider): theia.Disposable {
                return languagesExt.registerDocumentFormattingEditProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerDocumentRangeFormattingEditProvider(selector: theia.DocumentSelector, provider: theia.DocumentRangeFormattingEditProvider): theia.Disposable {
                return languagesExt.registerDocumentRangeFormattingEditProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerOnTypeFormattingEditProvider(
                selector: theia.DocumentSelector,
                provider: theia.OnTypeFormattingEditProvider,
                firstTriggerCharacter: string,
                ...moreTriggerCharacters: string[]
            ): theia.Disposable {
                return languagesExt.registerOnTypeFormattingEditProvider(selector, provider, [firstTriggerCharacter].concat(moreTriggerCharacters), pluginToPluginInfo(plugin));
            },
            registerDocumentDropEditProvider(selector: theia.DocumentSelector, provider: theia.DocumentDropEditProvider) {
                return languagesExt.registerDocumentDropEditProvider(selector, provider);
            },
            registerDocumentLinkProvider(selector: theia.DocumentSelector, provider: theia.DocumentLinkProvider): theia.Disposable {
                return languagesExt.registerDocumentLinkProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerCodeActionsProvider(selector: theia.DocumentSelector, provider: theia.CodeActionProvider, metadata?: theia.CodeActionProviderMetadata): theia.Disposable {
                return languagesExt.registerCodeActionsProvider(selector, provider, plugin.model, pluginToPluginInfo(plugin), metadata);
            },
            registerCodeLensProvider(selector: theia.DocumentSelector, provider: theia.CodeLensProvider): theia.Disposable {
                return languagesExt.registerCodeLensProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerReferenceProvider(selector: theia.DocumentSelector, provider: theia.ReferenceProvider): theia.Disposable {
                return languagesExt.registerReferenceProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerDocumentSymbolProvider(selector: theia.DocumentSelector, provider: theia.DocumentSymbolProvider,
                metadata?: theia.DocumentSymbolProviderMetadata): theia.Disposable {
                return languagesExt.registerDocumentSymbolProvider(selector, provider, pluginToPluginInfo(plugin), metadata);
            },
            registerColorProvider(selector: theia.DocumentSelector, provider: theia.DocumentColorProvider): theia.Disposable {
                return languagesExt.registerColorProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerInlayHintsProvider(selector: theia.DocumentSelector, provider: theia.InlayHintsProvider): theia.Disposable {
                return languagesExt.registerInlayHintsProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerFoldingRangeProvider(selector: theia.DocumentSelector, provider: theia.FoldingRangeProvider): theia.Disposable {
                return languagesExt.registerFoldingRangeProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerSelectionRangeProvider(selector: theia.DocumentSelector, provider: theia.SelectionRangeProvider): theia.Disposable {
                return languagesExt.registerSelectionRangeProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerRenameProvider(selector: theia.DocumentSelector, provider: theia.RenameProvider): theia.Disposable {
                return languagesExt.registerRenameProvider(selector, provider, pluginToPluginInfo(plugin));
            },
            registerDocumentSemanticTokensProvider(selector: theia.DocumentSelector, provider: theia.DocumentSemanticTokensProvider, legend: theia.SemanticTokensLegend):
                theia.Disposable {
                return languagesExt.registerDocumentSemanticTokensProvider(selector, provider, legend, pluginToPluginInfo(plugin));
            },
            registerDocumentRangeSemanticTokensProvider(selector: theia.DocumentSelector, provider: theia.DocumentRangeSemanticTokensProvider, legend: theia.SemanticTokensLegend):
                theia.Disposable {
                return languagesExt.registerDocumentRangeSemanticTokensProvider(selector, provider, legend, pluginToPluginInfo(plugin));
            },
            registerCallHierarchyProvider(selector: theia.DocumentSelector, provider: theia.CallHierarchyProvider): theia.Disposable {
                return languagesExt.registerCallHierarchyProvider(selector, provider);
            },
            registerTypeHierarchyProvider(selector: theia.DocumentSelector, provider: theia.TypeHierarchyProvider): theia.Disposable {
                return languagesExt.registerTypeHierarchyProvider(selector, provider);
            },
            registerLinkedEditingRangeProvider(selector: theia.DocumentSelector, provider: theia.LinkedEditingRangeProvider): theia.Disposable {
                return languagesExt.registerLinkedEditingRangeProvider(selector, provider);
            },
            createLanguageStatusItem(id: string, selector: theia.DocumentSelector): theia.LanguageStatusItem {
                return languagesExt.createLanguageStatusItem(plugin, id, selector);
            },
            registerDocumentPasteEditProvider(
                selector: theia.DocumentSelector, provider: theia.DocumentPasteEditProvider, metadata: theia.DocumentPasteProviderMetadata
            ): theia.Disposable {
                return languagesExt.registerDocumentPasteEditProvider(plugin, selector, provider, metadata);
            }
        };

        // Tests API (@stubbed)
        // The following implementation is temporarily `@stubbed` and marked as such under `theia.d.ts`
        const tests: typeof theia.tests = {
            createTestController(
                provider,
                controllerLabel: string,
                refreshHandler?: (
                    token: theia.CancellationToken
                ) => Thenable<void> | void
            ) {
                return {
                    id: provider,
                    label: controllerLabel,
                    items: testItemCollection,
                    refreshHandler,
                    createRunProfile,
                    createTestRun,
                    createTestItem,
                    dispose: () => undefined,
                };
            },
        };
        /* End of Tests API */

        const plugins: typeof theia.plugins = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            get all(): theia.Plugin<any>[] {
                return pluginManager.getAllPlugins().map(plg => new PluginExt(pluginManager, plg));
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getPlugin(pluginId: string): theia.Plugin<any> | undefined {
                const plg = pluginManager.getPluginById(pluginId.toLowerCase());
                if (plg) {
                    return new PluginExt(pluginManager, plg);
                }
                return undefined;
            },
            get onDidChange(): theia.Event<void> {
                return pluginManager.onDidChange;
            }
        };

        const debuggersContributions = plugin.rawModel.contributes && plugin.rawModel.contributes.debuggers || [];
        debugExt.assistedInject(connectionExt, commandRegistry);
        debugExt.registerDebuggersContributions(plugin.pluginFolder, plugin.model.entryPoint.frontend ? 'frontend' : 'backend', debuggersContributions);
        const debug: typeof theia.debug = {
            get activeDebugSession(): theia.DebugSession | undefined {
                return debugExt.activeDebugSession;
            },
            get activeDebugConsole(): theia.DebugConsole {
                return debugExt.activeDebugConsole;
            },
            get breakpoints(): theia.Breakpoint[] {
                return debugExt.breakpoints;
            },
            get onDidChangeActiveDebugSession(): theia.Event<theia.DebugSession | undefined> {
                return debugExt.onDidChangeActiveDebugSession;
            },
            get onDidStartDebugSession(): theia.Event<theia.DebugSession> {
                return debugExt.onDidStartDebugSession;
            },
            get onDidReceiveDebugSessionCustomEvent(): theia.Event<theia.DebugSessionCustomEvent> {
                return debugExt.onDidReceiveDebugSessionCustomEvent;
            },
            get onDidTerminateDebugSession(): theia.Event<theia.DebugSession> {
                return debugExt.onDidTerminateDebugSession;
            },
            get onDidChangeBreakpoints(): theia.Event<theia.BreakpointsChangeEvent> {
                return debugExt.onDidChangeBreakpoints;
            },
            registerDebugAdapterDescriptorFactory(debugType: string, factory: theia.DebugAdapterDescriptorFactory): Disposable {
                return debugExt.registerDebugAdapterDescriptorFactory(debugType, factory);
            },
            registerDebugConfigurationProvider(
                debugType: string,
                provider: theia.DebugConfigurationProvider,
                triggerKind?: theia.DebugConfigurationProviderTriggerKind
            ): Disposable {
                return debugExt.registerDebugConfigurationProvider(debugType, provider, triggerKind || DebugConfigurationProviderTriggerKind.Initial);
            },
            registerDebugAdapterTrackerFactory(debugType: string, factory: theia.DebugAdapterTrackerFactory): Disposable {
                return debugExt.registerDebugAdapterTrackerFactory(debugType, factory);
            },
            startDebugging(
                folder: theia.WorkspaceFolder | undefined,
                nameOrConfiguration: string | theia.DebugConfiguration,
                parentSessionOrOptions?: theia.DebugSession | theia.DebugSessionOptions
            ): Thenable<boolean> {
                if (!parentSessionOrOptions || (typeof parentSessionOrOptions === 'object' && 'configuration' in parentSessionOrOptions)) {
                    return debugExt.startDebugging(folder, nameOrConfiguration, { parentSession: parentSessionOrOptions });
                }
                return debugExt.startDebugging(folder, nameOrConfiguration, parentSessionOrOptions || {});
            },
            stopDebugging(session?: theia.DebugSession): Thenable<void> {
                return debugExt.stopDebugging(session);
            },
            addBreakpoints(breakpoints: readonly theia.Breakpoint[]): void {
                debugExt.addBreakpoints(breakpoints);
            },
            removeBreakpoints(breakpoints: readonly theia.Breakpoint[]): void {
                debugExt.removeBreakpoints(breakpoints);
            },
            asDebugSourceUri(source: theia.DebugProtocolSource, session?: theia.DebugSession): theia.Uri {
                return debugExt.asDebugSourceUri(source, session);
            }
        };

        const tasks: typeof theia.tasks = {
            registerTaskProvider(type: string, provider: theia.TaskProvider): theia.Disposable {
                return tasksExt.registerTaskProvider(type, provider);
            },

            fetchTasks(filter?: theia.TaskFilter): Thenable<theia.Task[]> {
                return tasksExt.fetchTasks(filter);
            },

            executeTask(task: theia.Task): Thenable<theia.TaskExecution> {
                return tasksExt.executeTask(task);
            },

            get taskExecutions(): ReadonlyArray<theia.TaskExecution> {
                return tasksExt.taskExecutions;
            },
            onDidStartTask(listener, thisArg?, disposables?) {
                return tasksExt.onDidStartTask(listener, thisArg, disposables);
            },
            onDidEndTask(listener, thisArg?, disposables?) {
                return tasksExt.onDidEndTask(listener, thisArg, disposables);
            },
            onDidStartTaskProcess(listener, thisArg?, disposables?) {
                return tasksExt.onDidStartTaskProcess(listener, thisArg, disposables);
            },
            onDidEndTaskProcess(listener, thisArg?, disposables?) {
                return tasksExt.onDidEndTaskProcess(listener, thisArg, disposables);
            }
        };

        const scm: typeof theia.scm = {
            get inputBox(): theia.SourceControlInputBox {
                const inputBox = scmExt.getLastInputBox(plugin);
                if (inputBox) {
                    return inputBox;
                } else {
                    throw new Error('Input box not found!');
                }
            },
            createSourceControl(id: string, label: string, rootUri?: URI): theia.SourceControl {
                return scmExt.createSourceControl(plugin, id, label, rootUri);
            }
        };

        const comments: typeof theia.comments = {
            createCommentController(id: string, label: string): theia.CommentController {
                return commentsExt.createCommentController(plugin, id, label);
            }
        };

        const l10n: typeof theia.l10n = {
            // eslint-disable-next-line max-len
            t(...params: [message: string, ...args: Array<string | number | boolean>] | [message: string, args: Record<string, any>] | [{ message: string; args?: Array<string | number | boolean> | Record<string, any>; comment: string | string[] }]): string {
                if (typeof params[0] === 'string') {
                    const key = params.shift() as string;

                    // We have either rest args which are Array<string | number | boolean> or an array with a single Record<string, any>.
                    // This ensures we get a Record<string | number, any> which will be formatted correctly.
                    const argsFormatted = !params || typeof params[0] !== 'object' ? params : params[0];
                    return localizationExt.translateMessage(plugin.model.id, { message: key, args: argsFormatted as Record<string | number, any> | undefined });
                }
                return localizationExt.translateMessage(plugin.model.id, params[0]);
            },
            get bundle() {
                return localizationExt.getBundle(plugin.model.id);
            },
            get uri() {
                return localizationExt.getBundleUri(plugin.model.id);
            }
        };

        // notebooks API (@stubbed)
        // The following implementation is temporarily `@stubbed` and marked as such under `theia.d.ts`
        const notebooks: typeof theia.notebooks = {
            createNotebookController(
                id,
                notebookType,
                label,
                handler?: (cells: theia.NotebookCell[],
                    notebook: theia.NotebookDocument,
                    controller: theia.NotebookController) => void | Thenable<void>
            ) {
                return {
                    id,
                    notebookType,
                    label,
                    handler,
                    createNotebookCellExecution: (cell: NotebookCell) => ({
                        cell,
                        token: CancellationToken.None,
                        executionOrder: undefined,
                        start: () => undefined,
                        end: () => undefined,
                        clearOutput: () => ({} as Thenable<void>),
                        replaceOutput: () => ({} as Thenable<void>),
                        appendOutput: () => ({} as Thenable<void>),
                        replaceOutputItems: () => ({} as Thenable<void>),
                        appendOutputItems: () => ({} as Thenable<void>)
                    }),
                    executeHandler(
                        cells: theia.NotebookCell[],
                        notebook: theia.NotebookDocument,
                        controller: theia.NotebookController
                    ): (void | Thenable<void>) { },
                    onDidChangeSelectedNotebooks: () => Disposable.create(() => { }),
                    updateNotebookAffinity: (notebook: theia.NotebookDocument, affinity: theia.NotebookControllerAffinity) => undefined,
                    dispose: () => undefined,
                };

            },
            createRendererMessaging(
                rendererId
            ) {
                return {
                    rendererId,
                    onDidReceiveMessage: () => Disposable.create(() => { }),
                    postMessage: () => Promise.resolve({}),
                };
            },
            registerNotebookCellStatusBarItemProvider(
                notebookType,
                provider
            ) {
                return {
                    notebookType,
                    provider,
                    dispose: () => undefined,
                };
            }
        };

        return <typeof theia>{
            version: require('../../package.json').version,
            authentication,
            commands,
            comments,
            window,
            workspace,
            env,
            extensions,
            languages,
            plugins,
            debug,
            tasks,
            scm,
            notebooks,
            l10n,
            tests,
            // Types
            StatusBarAlignment: StatusBarAlignment,
            Disposable: Disposable,
            EventEmitter: Emitter,
            CancellationTokenSource: CancellationTokenSource,
            MarkdownString,
            Position: Position,
            Range: Range,
            Selection: Selection,
            ViewColumn: ViewColumn,
            TextEditorSelectionChangeKind: TextEditorSelectionChangeKind,
            Uri: URI,
            EndOfLine,
            TextEditorRevealType,
            TextEditorCursorStyle,
            TextEditorLineNumbersStyle,
            ThemeColor,
            ThemeIcon,
            SnippetString,
            DecorationRangeBehavior,
            OverviewRulerLane,
            ConfigurationTarget,
            RelativePattern,
            IndentAction,
            CompletionItem,
            CompletionItemKind,
            CompletionList,
            DebugConsoleMode,
            DiagnosticSeverity,
            DiagnosticRelatedInformation,
            LanguageStatusSeverity,
            Location,
            LogLevel,
            DiagnosticTag,
            CompletionItemTag,
            Diagnostic,
            CompletionTriggerKind,
            TextEdit,
            SnippetTextEdit,
            ProgressLocation,
            ProgressOptions,
            Progress,
            ParameterInformation,
            QuickPickItemKind,
            SignatureInformation,
            SignatureHelp,
            SignatureHelpTriggerKind,
            Hover,
            EvaluatableExpression,
            InlineValueEvaluatableExpression,
            InlineValueText,
            InlineValueVariableLookup,
            InlineValueContext,
            DocumentHighlightKind,
            DocumentHighlight,
            DocumentLink,
            DocumentDropEdit,
            CodeLens,
            CodeActionKind,
            CodeActionTrigger,
            CodeActionTriggerKind,
            TextDocumentSaveReason,
            CodeAction,
            DataTransferItem,
            DataTransfer,
            TreeItem,
            TreeItemCollapsibleState,
            SymbolKind,
            SymbolTag,
            DocumentSymbol,
            WorkspaceEdit,
            SymbolInformation,
            FileType,
            FilePermission,
            FileChangeType,
            ShellQuoting,
            ShellExecution,
            ProcessExecution,
            CustomExecution,
            TaskScope,
            TaskRevealKind,
            TaskPanelKind,
            TaskGroup,
            Task,
            Task2,
            DebugAdapterExecutable,
            DebugAdapterServer,
            DebugAdapterNamedPipeServer,
            DebugAdapterInlineImplementation,
            DebugConfigurationProviderTriggerKind,
            Breakpoint,
            SourceBreakpoint,
            FunctionBreakpoint,
            Color,
            ColorInformation,
            ColorPresentation,
            FoldingRange,
            SelectionRange,
            FoldingRangeKind,
            OperatingSystem,
            WebviewPanelTargetArea,
            UIKind,
            FileSystemError,
            CommentThreadState,
            CommentThreadCollapsibleState,
            QuickInputButtons,
            CommentMode,
            CallHierarchyItem,
            CallHierarchyIncomingCall,
            CallHierarchyOutgoingCall,
            TypeHierarchyItem,
            TimelineItem,
            EnvironmentVariableMutatorType,
            SemanticTokensLegend,
            SemanticTokensBuilder,
            SemanticTokens,
            SemanticTokensEdits,
            SemanticTokensEdit,
            TextDocumentChangeReason,
            ColorThemeKind,
            SourceControlInputBoxValidationType,
            FileDecoration,
            TerminalLink,
            TerminalProfile,
            CancellationError,
            ExtensionMode,
            LinkedEditingRanges,
            InputBoxValidationSeverity,
            InlayHint,
            InlayHintKind,
            InlayHintLabelPart,
            TelemetryTrustedValue,
            NotebookCellData,
            NotebookCellKind,
            NotebookCellOutput,
            NotebookCellOutputItem,
            NotebookCellStatusBarAlignment,
            NotebookCellStatusBarItem,
            NotebookControllerAffinity,
            NotebookData,
            NotebookEditorRevealType,
            NotebookDocument,
            NotebookRange,
            NotebookEdit,
            TestRunProfileKind,
            TestTag,
            TestRunRequest,
            TestMessage,
            ExtensionKind,
            InlineCompletionItem,
            InlineCompletionList,
            InlineCompletionTriggerKind,
            TabInputText: TextTabInput,
            TabInputTextDiff: TextDiffTabInput,
            TabInputTextMerge: TextMergeTabInput,
            TabInputCustom: CustomEditorTabInput,
            TabInputNotebook: NotebookEditorTabInput,
            TabInputNotebookDiff: NotebookDiffEditorTabInput,
            TabInputWebview: WebviewEditorTabInput,
            TabInputTerminal: TerminalEditorTabInput,
            TerminalLocation,
            TerminalExitReason,
            DocumentPasteEdit,
            ExternalUriOpenerPriority,
            TerminalQuickFixType,
            EditSessionIdentityMatch
        };
    };
}

/**
 * Represents a Theia plugin as well as a VSCode extension.
 */
export interface ExtensionPlugin<T> extends theia.Plugin<T> {
    /**
     * The uri of the directory containing the extension. Same as {@linkcode theia.Plugin.pluginUri}.
     */
    readonly extensionUri: theia.Uri;

    /**
     * The absolute file path of the directory containing this extension.
     * Same as {@linkcode theia.Plugin.pluginPath}.
     */
    readonly extensionPath: string;

    /**
     * The extension kind describes if an extension runs where the UI runs
     * or if an extension runs where the remote extension host runs. The extension kind
     * is defined in the `package.json`-file of extensions. When no remote extension host exists,
     * the value is {@linkcode ExtensionKind.UI}.
     */
    extensionKind: theia.ExtensionKind;
}

export class Plugin<T> implements theia.Plugin<T> {
    id: string;
    pluginPath: string;
    pluginUri: theia.Uri;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    packageJSON: any;
    pluginType: theia.PluginType;

    constructor(protected readonly pluginManager: PluginManager, plugin: InternalPlugin) {
        this.id = plugin.model.id;
        this.pluginPath = plugin.pluginFolder;
        this.packageJSON = plugin.rawModel;
        this.pluginType = plugin.model.entryPoint.frontend ? 'frontend' : 'backend';

        if (this.pluginType === 'frontend') {
            const { origin } = new Endpoint();
            this.pluginUri = URI.parse(origin + '/' + PluginPackage.toPluginUrl(plugin.model, ''));
        } else {
            this.pluginUri = URI.parse(plugin.pluginUri);
        }
    }

    get isActive(): boolean {
        return this.pluginManager.isActive(this.id);
    }

    get exports(): T {
        return <T>this.pluginManager.getPluginExport(this.id);
    }

    activate(): PromiseLike<T> {
        return this.pluginManager.activatePlugin(this.id).then(() => this.exports);
    }
}

export class PluginExt<T> extends Plugin<T> implements ExtensionPlugin<T> {
    extensionPath: string;
    extensionUri: theia.Uri;
    extensionKind: ExtensionKind;
    isFromDifferentExtensionHost: boolean;

    constructor(protected override readonly pluginManager: PluginManager, plugin: InternalPlugin, isFromDifferentExtensionHost = false) {
        super(pluginManager, plugin);

        this.extensionPath = this.pluginPath;
        this.extensionUri = this.pluginUri;
        this.extensionKind = ExtensionKind.UI; // stub as a local extension (not running on a remote workspace)
        this.isFromDifferentExtensionHost = isFromDifferentExtensionHost;
    }

    override get isActive(): boolean {
        return this.pluginManager.isActive(this.id);
    }

    override get exports(): T {
        return <T>this.pluginManager.getPluginExport(this.id);
    }

    override activate(): PromiseLike<T> {
        return this.pluginManager.activatePlugin(this.id).then(() => this.exports);
    }
}
