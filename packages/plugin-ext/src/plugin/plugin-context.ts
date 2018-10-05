/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
import * as theia from '@theia/plugin';
import { CommandRegistryImpl } from './command-registry';
import { Emitter } from '@theia/core/lib/common/event';
import { CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { QuickOpenExtImpl } from './quick-open';
import { MAIN_RPC_CONTEXT, Plugin as InternalPlugin, PluginManager, PluginAPIFactory } from '../api/plugin-api';
import { RPCProtocol } from '../api/rpc-protocol';
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
    MarkdownString,
    ThemeColor,
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
    CompletionTriggerKind,
    Diagnostic,
    DiagnosticRelatedInformation,
    DiagnosticSeverity,
    DiagnosticTag,
    Location,
    ParameterInformation,
    SignatureInformation,
    SignatureHelp,
    Hover,
    DocumentLink,
    CodeLens,
    CodeActionKind,
    CodeActionTrigger,
    TextDocumentSaveReason,
    CodeAction,
} from './types-impl';
import { EditorsAndDocumentsExtImpl } from './editors-and-documents';
import { TextEditorsExtImpl } from './text-editors';
import { DocumentsExtImpl } from './documents';
import Uri from 'vscode-uri';
import { TextEditorCursorStyle } from '../common/editor-options';
import { PreferenceRegistryExtImpl } from './preference-registry';
import { OutputChannelRegistryExt } from './output-channel-registry';
import { TerminalServiceExtImpl } from './terminal-ext';
import { LanguagesExtImpl, score } from './languages';
import { fromDocumentSelector } from './type-converters';
import { DialogsExtImpl } from './dialogs';

export function createAPIFactory(rpc: RPCProtocol, pluginManager: PluginManager): PluginAPIFactory {
    const commandRegistryExt = rpc.set(MAIN_RPC_CONTEXT.COMMAND_REGISTRY_EXT, new CommandRegistryImpl(rpc));
    const quickOpenExt = rpc.set(MAIN_RPC_CONTEXT.QUICK_OPEN_EXT, new QuickOpenExtImpl(rpc));
    const dialogsExt = new DialogsExtImpl(rpc);
    const messageRegistryExt = new MessageRegistryExt(rpc);
    const windowStateExt = rpc.set(MAIN_RPC_CONTEXT.WINDOW_STATE_EXT, new WindowStateExtImpl());
    const editorsAndDocuments = rpc.set(MAIN_RPC_CONTEXT.EDITORS_AND_DOCUMENTS_EXT, new EditorsAndDocumentsExtImpl(rpc));
    const editors = rpc.set(MAIN_RPC_CONTEXT.TEXT_EDITORS_EXT, new TextEditorsExtImpl(rpc, editorsAndDocuments));
    const documents = rpc.set(MAIN_RPC_CONTEXT.DOCUMENTS_EXT, new DocumentsExtImpl(rpc, editorsAndDocuments));
    const workspaceExt = rpc.set(MAIN_RPC_CONTEXT.WORKSPACE_EXT, new WorkspaceExtImpl(rpc));
    const statusBarMessageRegistryExt = new StatusBarMessageRegistryExt(rpc);
    const terminalExt = rpc.set(MAIN_RPC_CONTEXT.TERMINAL_EXT, new TerminalServiceExtImpl(rpc));
    const envExt = rpc.set(MAIN_RPC_CONTEXT.ENV_EXT, new EnvExtImpl(rpc));
    const preferenceRegistryExt = rpc.set(MAIN_RPC_CONTEXT.PREFERENCE_REGISTRY_EXT, new PreferenceRegistryExtImpl(rpc));
    const outputChannelRegistryExt = new OutputChannelRegistryExt(rpc);
    const languagesExt = rpc.set(MAIN_RPC_CONTEXT.LANGUAGES_EXT, new LanguagesExtImpl(rpc, documents));

    return function (plugin: InternalPlugin): typeof theia {
        const commands: typeof theia.commands = {
            // tslint:disable-next-line:no-any
            registerCommand(command: theia.Command, handler?: <T>(...args: any[]) => T | Thenable<T>): Disposable {
                return commandRegistryExt.registerCommand(command, handler);
            },
            // tslint:disable-next-line:no-any
            executeCommand<T>(commandId: string, ...args: any[]): PromiseLike<T | undefined> {
                return commandRegistryExt.executeCommand<T>(commandId, args);
            },
            // tslint:disable-next-line:no-any
            registerTextEditorCommand(command: theia.Command, callback: (textEditor: theia.TextEditor, edit: theia.TextEditorEdit, ...arg: any[]) => void): Disposable {
                throw new Error('Function registerTextEditorCommand is not implemented');
            },
            // tslint:disable-next-line:no-any
            registerHandler(commandId: string, handler: (...args: any[]) => any): Disposable {
                return commandRegistryExt.registerHandler(commandId, handler);
            }
        };

        const window: typeof theia.window = {
            get activeTextEditor() {
                return editors.getActiveEditor();
            },
            get visibleTextEditors() {
                return editors.getVisibleTextEditors();
            },
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
            // tslint:disable-next-line:no-any
            showQuickPick(items: any, options: theia.QuickPickOptions, token?: theia.CancellationToken): any {
                if (token) {
                    const coreEvent = Object.assign(token.onCancellationRequested, { maxListeners: 0 });
                    const coreCancellationToken = { isCancellationRequested: token.isCancellationRequested, onCancellationRequested: coreEvent };
                    return quickOpenExt.showQuickPick(items, options, coreCancellationToken);
                } else {
                    return quickOpenExt.showQuickPick(items, options);
                }
            },
            showWorkspaceFolderPick(options?: theia.WorkspaceFolderPickOptions) {
                return workspaceExt.pickWorkspaceFolder(options);
            },
            showInformationMessage(message: string,
                optionsOrFirstItem: theia.MessageOptions | string | theia.MessageItem,
                // tslint:disable-next-line:no-any
                ...items: any[]): PromiseLike<any> {
                return messageRegistryExt.showInformationMessage(message, optionsOrFirstItem, items);
            },
            showWarningMessage(message: string,
                optionsOrFirstItem: theia.MessageOptions | string | theia.MessageItem,
                // tslint:disable-next-line:no-any
                ...items: any[]): PromiseLike<any> {
                return messageRegistryExt.showWarningMessage(message, optionsOrFirstItem, items);
            },
            showErrorMessage(message: string,
                optionsOrFirstItem: theia.MessageOptions | string | theia.MessageItem,
                // tslint:disable-next-line:no-any
                ...items: any[]): PromiseLike<any> {
                return messageRegistryExt.showErrorMessage(message, optionsOrFirstItem, items);
            },
            showOpenDialog(options: theia.OpenDialogOptions): PromiseLike<Uri[] | undefined> {
                return dialogsExt.showOpenDialog(options);
            },
            showSaveDialog(options: theia.SaveDialogOptions): PromiseLike<Uri | undefined> {
                return dialogsExt.showSaveDialog(options);
            },
            // tslint:disable-next-line:no-any
            setStatusBarMessage(text: string, arg?: number | PromiseLike<any>): Disposable {
                return statusBarMessageRegistryExt.setStatusBarMessage(text, arg);
            },
            showInputBox(options?: theia.InputBoxOptions, token?: theia.CancellationToken) {
                if (token) {
                    const coreEvent = Object.assign(token.onCancellationRequested, { maxListeners: 0 });
                    const coreCancellationToken = { isCancellationRequested: token.isCancellationRequested, onCancellationRequested: coreEvent };
                    return quickOpenExt.showInput(options, coreCancellationToken);
                } else {
                    return quickOpenExt.showInput(options);
                }
            },
            createStatusBarItem(alignment?: theia.StatusBarAlignment, priority?: number): theia.StatusBarItem {
                return statusBarMessageRegistryExt.createStatusBarItem(alignment, priority);
            },
            createOutputChannel(name: string): theia.OutputChannel {
                return outputChannelRegistryExt.createOutputChannel(name);
            },

            get state(): theia.WindowState {
                return windowStateExt.getWindowState();
            },
            onDidChangeWindowState(listener, thisArg?, disposables?): theia.Disposable {
                return windowStateExt.onDidChangeWindowState(listener, thisArg, disposables);
            },

            createTerminal(nameOrOptions: theia.TerminalOptions | (string | undefined), shellPath?: string, shellArgs?: string[]): theia.Terminal {
                return terminalExt.createTerminal(nameOrOptions, shellPath, shellArgs);
            },
            get onDidCloseTerminal(): theia.Event<theia.Terminal> {
                return terminalExt.onDidCloseTerminal;
            },
            set onDidCloseTerminal(event: theia.Event<theia.Terminal>) {
                terminalExt.onDidCloseTerminal = event;
            },

            createTextEditorDecorationType(options: theia.DecorationRenderOptions): theia.TextEditorDecorationType {
                return editors.createTextEditorDecorationType(options);
            }
        };

        const workspace: typeof theia.workspace = {
            get workspaceFolders(): theia.WorkspaceFolder[] | undefined {
                return workspaceExt.workspaceFolders;
            },
            get name(): string | undefined {
                return workspaceExt.name;
            },
            onDidChangeWorkspaceFolders(listener, thisArg?, disposables?): theia.Disposable {
                return workspaceExt.onDidChangeWorkspaceFolders(listener, thisArg, disposables);
            },
            get textDocuments() {
                return documents.getAllDocumentData().map(data => data.document);
            },
            onDidChangeTextDocument(listener, thisArg?, disposables?) {
                return documents.onDidChangeDocument(listener, thisArg, disposables);
            },
            onDidCloseTextDocument(listener, thisArg?, disposables?) {
                return documents.onDidRemoveDocument(listener, thisArg, disposables);
            },
            onDidOpenTextDocument(listener, thisArg?, disposables?) {
                return documents.onDidAddDocument(listener, thisArg, disposables);
            },

            onDidSaveTextDocument(listener, thisArg?, disposables?) {
                return documents.onDidSaveTextDocument(listener, thisArg, disposables);
            },

            getConfiguration(section?, resource?): theia.WorkspaceConfiguration {
                return preferenceRegistryExt.getConfiguration(section, resource);
            },
            onDidChangeConfiguration(listener, thisArgs?, disposables?): theia.Disposable {
                return preferenceRegistryExt.onDidChangeConfiguration(listener, thisArgs, disposables);
            },
            openTextDocument(uriOrFileNameOrOptions?: theia.Uri | string | { language?: string; content?: string; }) {
                let uriPromise: Promise<Uri>;

                const options = uriOrFileNameOrOptions as { language?: string; content?: string; };
                if (typeof uriOrFileNameOrOptions === 'string') {
                    uriPromise = Promise.resolve(Uri.file(uriOrFileNameOrOptions));
                } else if (uriOrFileNameOrOptions instanceof Uri) {
                    uriPromise = Promise.resolve(uriOrFileNameOrOptions);
                } else if (!options || typeof options === 'object') {
                    uriPromise = documents.createDocumentData(options);
                } else {
                    throw new Error('illegal argument - uriOrFileNameOrOptions');
                }

                return uriPromise.then(uri =>
                    documents.ensureDocumentData(uri).then(() => {
                        const data = documents.getDocumentData(uri);
                        return data && data.document;
                    }));
            },
            createFileSystemWatcher(globPattern: theia.GlobPattern,
                ignoreCreateEvents?: boolean,
                ignoreChangeEvents?: boolean,
                ignoreDeleteEvents?: boolean): theia.FileSystemWatcher {
                return workspaceExt.createFileSystemWatcher(globPattern, ignoreCreateEvents, ignoreChangeEvents, ignoreDeleteEvents);
            }
        };

        const env: typeof theia.env = {
            getEnvVariable(envVarName: string): PromiseLike<string | undefined> {
                return envExt.getEnvVariable(envVarName);
            },
            getQueryParameter(queryParamName: string): string | string[] | undefined {
                return envExt.getQueryParameter(queryParamName);
            },
            getQueryParameters(): QueryParameters {
                return envExt.getQueryParameters();
            }
        };

        const languages: typeof theia.languages = {
            getLanguages(): PromiseLike<string[]> {
                return languagesExt.getLanguages();
            },
            match(selector: theia.DocumentSelector, document: theia.TextDocument): number {
                return score(fromDocumentSelector(selector), document.uri, document.languageId, true);
            },
            get onDidChangeDiagnostics(): theia.Event<theia.DiagnosticChangeEvent> {
                return languagesExt.onDidChangeDiagnostics;
            },
            getDiagnostics(resource?: Uri) {
                // tslint:disable-next-line:no-any
                return <any>languagesExt.getDiagnostics(resource);
            },
            createDiagnosticCollection(name?: string): theia.DiagnosticCollection {
                return languagesExt.createDiagnosticCollection(name);
            },
            setLanguageConfiguration(language: string, configuration: theia.LanguageConfiguration): theia.Disposable {
                return languagesExt.setLanguageConfiguration(language, configuration);
            },
            registerCompletionItemProvider(selector: theia.DocumentSelector, provider: theia.CompletionItemProvider, ...triggerCharacters: string[]): theia.Disposable {
                return languagesExt.registerCompletionItemProvider(selector, provider, triggerCharacters);
            },
            registerDefinitionProvider(selector: theia.DocumentSelector, provider: theia.DefinitionProvider): theia.Disposable {
                return languagesExt.registerDefinitionProvider(selector, provider);
            },
            registerSignatureHelpProvider(selector: theia.DocumentSelector, provider: theia.SignatureHelpProvider, ...triggerCharacters: string[]): theia.Disposable {
                return languagesExt.registerSignatureHelpProvider(selector, provider, ...triggerCharacters);
            },
            registerHoverProvider(selector: theia.DocumentSelector, provider: theia.HoverProvider): theia.Disposable {
                return languagesExt.registerHoverProvider(selector, provider);
            },
            registerDocumentFormattingEditProvider(selector: theia.DocumentSelector, provider: theia.DocumentFormattingEditProvider): theia.Disposable {
                return languagesExt.registerDocumentFormattingEditProvider(selector, provider);
            },
            registerDocumentRangeFormattingEditProvider(selector: theia.DocumentSelector, provider: theia.DocumentRangeFormattingEditProvider): theia.Disposable {
                return languagesExt.registerDocumentRangeFormattingEditProvider(selector, provider);
            },
            registerOnTypeFormattingEditProvider(
                selector: theia.DocumentSelector,
                provider: theia.OnTypeFormattingEditProvider,
                firstTriggerCharacter: string,
                ...moreTriggerCharacters: string[]
            ): theia.Disposable {
                return languagesExt.registerOnTypeFormattingEditProvider(selector, provider, [firstTriggerCharacter].concat(moreTriggerCharacters));
            },
            registerDocumentLinkProvider(selector: theia.DocumentSelector, provider: theia.DocumentLinkProvider): theia.Disposable {
                return languagesExt.registerLinkProvider(selector, provider);
            },
            registerCodeActionsProvider(selector: theia.DocumentSelector, provider: theia.CodeActionProvider, metadata?: theia.CodeActionProviderMetadata): theia.Disposable {
                return languagesExt.registerCodeActionsProvider(selector, provider, metadata);
            }

        };

        const plugins: typeof theia.plugins = {
            get all(): theia.Plugin<any>[] {
                return pluginManager.getAllPlugins().map(plg => new Plugin(pluginManager, plg));
            },
            getPlugin(pluginId: string): theia.Plugin<any> | undefined {
                const plg = pluginManager.getPluginById(pluginId);
                if (plg) {
                    return new Plugin(pluginManager, plg);
                }
                return undefined;
            }
        };

        return <typeof theia>{
            version: require('../../package.json').version,
            commands,
            window,
            workspace,
            env,
            languages,
            plugins,
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
            Uri: Uri,
            EndOfLine,
            TextEditorRevealType,
            TextEditorCursorStyle,
            TextEditorLineNumbersStyle,
            ThemeColor,
            SnippetString,
            DecorationRangeBehavior,
            OverviewRulerLane,
            ConfigurationTarget,
            RelativePattern,
            IndentAction,
            CompletionItem,
            CompletionItemKind,
            CompletionList,
            DiagnosticSeverity,
            DiagnosticRelatedInformation,
            Location,
            DiagnosticTag,
            Diagnostic,
            CompletionTriggerKind,
            TextEdit,
            ParameterInformation,
            SignatureInformation,
            SignatureHelp,
            Hover,
            DocumentLink,
            CodeLens,
            CodeActionKind,
            CodeActionTrigger,
            TextDocumentSaveReason,
            CodeAction,
        };
    };
}

class Plugin<T> implements theia.Plugin<T> {
    id: string;
    pluginPath: string;
    isActive: boolean;
    packageJSON: any;
    pluginType: theia.PluginType;
    constructor(private readonly pluginManager: PluginManager, plugin: InternalPlugin) {
        this.id = plugin.model.id;
        this.pluginPath = plugin.pluginFolder;
        this.packageJSON = plugin.rawModel;
        this.isActive = true;
        this.pluginType = plugin.model.entryPoint.frontend ? 'frontend' : 'backend';
    }

    get exports(): T {
        return <T>this.pluginManager.getPluginExport(this.id);
    }

    activate(): PromiseLike<T> {
        return this.pluginManager.activatePlugin(this.id).then(() => this.exports);
    }
}
