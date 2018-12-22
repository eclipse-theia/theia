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

/* tslint:disable:no-any */

import { createProxyIdentifier, ProxyIdentifier } from './rpc-protocol';
import * as theia from '@theia/plugin';
import { PluginLifecycle, PluginModel, PluginMetadata, PluginPackage } from '../common/plugin-protocol';
import { QueryParameters } from '../common/env';
import { TextEditorCursorStyle } from '../common/editor-options';
import { TextEditorLineNumbersStyle, EndOfLine, OverviewRulerLane, IndentAction, FileOperationOptions } from '../plugin/types-impl';
import { UriComponents } from '../common/uri-components';
import { PreferenceChange } from '@theia/core/lib/browser';
import { ConfigurationTarget } from '../plugin/types-impl';
import {
    SerializedDocumentFilter,
    CompletionContext,
    MarkdownString,
    Range,
    Completion,
    CompletionResultDto,
    MarkerData,
    SignatureHelp,
    Hover,
    DocumentHighlight,
    FormattingOptions,
    SingleEditOperation as ModelSingleEditOperation,
    Definition,
    DefinitionLink,
    DocumentLink,
    CodeLensSymbol,
    Command,
    TextEdit,
    DocumentSymbol,
    ReferenceContext,
    FileWatcherSubscriberOptions,
    FileChangeEvent,
    TextDocumentShowOptions,
    WorkspaceRootsChangeEvent,
    Location,
    Breakpoint
} from './model';
import { ExtPluginApi } from '../common/plugin-ext-api-contribution';
import { CancellationToken, Progress, ProgressOptions } from '@theia/plugin';
import { IJSONSchema, IJSONSchemaSnippet } from '@theia/core/lib/common/json-schema';
import { DebuggerDescription } from '@theia/debug/lib/common/debug-service';
import { DebugProtocol } from 'vscode-debugprotocol';

export interface PluginInitData {
    plugins: PluginMetadata[];
    preferences: { [key: string]: any };
    env: EnvInit;
    extApi?: ExtPluginApi[];
}

export interface Plugin {
    pluginPath: string;
    pluginFolder: string;
    model: PluginModel;
    rawModel: PluginPackage;
    lifecycle: PluginLifecycle;
}

export interface ConfigStorage {
    hostLogPath: string;
    hostStoragePath: string,
}

export interface EnvInit {
    queryParams: QueryParameters;
}

export interface PluginAPI {

}

export interface PluginManager {
    getAllPlugins(): Plugin[];
    getPluginById(pluginId: string): Plugin | undefined;
    getPluginExport(pluginId: string): PluginAPI | undefined;
    isRunning(pluginId: string): boolean;
    activatePlugin(pluginId: string): PromiseLike<void>;
}

export interface PluginAPIFactory {
    (plugin: Plugin): typeof theia;
}

export const emptyPlugin: Plugin = {
    lifecycle: {
        startMethod: 'empty',
        stopMethod: 'empty'
    },
    model: {
        id: 'emptyPlugin',
        name: 'emptyPlugin',
        publisher: 'Theia',
        version: 'empty',
        displayName: 'empty',
        description: 'empty',
        engine: {
            type: 'empty',
            version: 'empty'
        },
        entryPoint: {

        }
    },
    pluginPath: 'empty',
    pluginFolder: 'empty',
    rawModel: {
        name: 'emptyPlugin',
        publisher: 'Theia',
        version: 'empty',
        displayName: 'empty',
        description: 'empty',
        engines: {
            type: 'empty',
            version: 'empty'
        },
        packagePath: 'empty'
    }
};

export interface PluginManagerExt {
    $stopPlugin(contextPath: string): PromiseLike<void>;

    $init(pluginInit: PluginInitData, configStorage: ConfigStorage): PromiseLike<void>;

    $updateStoragePath(path: string): PromiseLike<void>;
}

export interface CommandRegistryMain {
    $registerCommand(command: theia.Command): void;

    $unregisterCommand(id: string): void;
    $executeCommand<T>(id: string, args: any[]): PromiseLike<T | undefined>;
    $getCommands(): PromiseLike<string[]>;
}

export interface CommandRegistryExt {
    $executeCommand<T>(id: string, ...ars: any[]): PromiseLike<T>;
}

export interface TerminalServiceExt {
    $terminalClosed(id: number): void;
}

export interface ConnectionMain {
    $createConnection(id: string): Promise<void>;
    $deleteConnection(id: string): Promise<void>;
    $sendMessage(id: string, message: string): void;
    $createConnection(id: string): Promise<void>;
    $deleteConnection(id: string): Promise<void>;
}

export interface ConnectionExt {
    $createConnection(id: string): Promise<void>;
    $deleteConnection(id: string): Promise<void>
    $sendMessage(id: string, message: string): void;
}

export interface TerminalServiceMain {
    /**
     * Create new Terminal with Terminal options.
     * @param options - object with parameters to create new terminal.
     */
    $createTerminal(options: theia.TerminalOptions): PromiseLike<number>;

    /**
     * Send text to the terminal by id.
     * @param id - terminal id.
     * @param text - text content.
     * @param addNewLine - in case true - add new line after the text, otherwise - don't apply new line.
     */
    $sendText(id: number, text: string, addNewLine?: boolean): void;

    /**
     * Show terminal on the UI panel.
     * @param id - terminal id.
     * @param preserveFocus - set terminal focus in case true value, and don't set focus otherwise.
     */
    $show(id: number, preserveFocus?: boolean): void;

    /**
     * Hide UI panel where is located terminal widget.
     * @param id - terminal id.
     */
    $hide(id: number): void;

    /**
     * Distroy terminal.
     * @param id - terminal id.
     */
    $dispose(id: number): void;
}

export interface AutoFocus {
    autoFocusFirstEntry?: boolean;
    // TODO
}

export interface PickOptions {
    placeHolder?: string;
    autoFocus?: AutoFocus;
    matchOnDescription?: boolean;
    matchOnDetail?: boolean;
    ignoreFocusLost?: boolean;
    quickNavigationConfiguration?: {}; // TODO
    contextKey?: string;
    canSelectMany?: boolean;
}

export interface PickOpenItem {
    handle: number;
    id?: string;
    label: string;
    description?: string;
    detail?: string;
    picked?: boolean;
}

export interface MessageRegistryMain {
    $showInformationMessage(message: string,
        optionsOrFirstItem: theia.MessageOptions | string | theia.MessageItem,
        items: string[] | theia.MessageItem[]): PromiseLike<string | theia.MessageItem | undefined>;
    $showWarningMessage(message: string,
        optionsOrFirstItem: theia.MessageOptions | string | theia.MessageItem,
        items: string[] | theia.MessageItem[]): PromiseLike<string | theia.MessageItem | undefined>;
    $showErrorMessage(message: string,
        optionsOrFirstItem: theia.MessageOptions | string | theia.MessageItem,
        items: string[] | theia.MessageItem[]): PromiseLike<string | theia.MessageItem | undefined>;
}

export interface StatusBarMessageRegistryMain {
    $setMessage(text: string,
        priority: number,
        alignment: theia.StatusBarAlignment,
        color: string | undefined,
        tooltip: string | undefined,
        command: string | undefined): PromiseLike<string>;
    $update(id: string, message: string): void;
    $dispose(id: string): void;
}

export interface QuickOpenExt {
    $onItemSelected(handle: number): void;
    $validateInput(input: string): PromiseLike<string | undefined> | undefined;
}

/**
 * Options to configure the behaviour of a file open dialog.
 */
export interface OpenDialogOptionsMain {
    /**
     * The resource the dialog shows when opened.
     */
    defaultUri?: string;

    /**
     * A human-readable string for the open button.
     */
    openLabel?: string;

    /**
     * Allow to select files, defaults to `true`.
     */
    canSelectFiles?: boolean;

    /**
     * Allow to select folders, defaults to `false`.
     */
    canSelectFolders?: boolean;

    /**
     * Allow to select many files or folders.
     */
    canSelectMany?: boolean;

    /**
     * A set of file filters that are used by the dialog. Each entry is a human readable label,
     * like "TypeScript", and an array of extensions, e.g.
     * ```ts
     * {
     * 	'Images': ['png', 'jpg']
     * 	'TypeScript': ['ts', 'tsx']
     * }
     * ```
     */
    filters?: { [name: string]: string[] };
}

/**
 * Options to configure the behaviour of a file save dialog.
 */
export interface SaveDialogOptionsMain {
    /**
     * The resource the dialog shows when opened.
     */
    defaultUri?: string;

    /**
     * A human-readable string for the save button.
     */
    saveLabel?: string;

    /**
     * A set of file filters that are used by the dialog. Each entry is a human readable label,
     * like "TypeScript", and an array of extensions, e.g.
     * ```ts
     * {
     * 	'Images': ['png', 'jpg']
     * 	'TypeScript': ['ts', 'tsx']
     * }
     * ```
     */
    filters?: { [name: string]: string[] };
}

/**
 * Options to configure the behaviour of the [workspace folder](#WorkspaceFolder) pick UI.
 */
export interface WorkspaceFolderPickOptionsMain {
    /**
     * An optional string to show as place holder in the input box to guide the user what to pick on.
     */
    placeHolder?: string;

    /**
     * Set to `true` to keep the picker open when focus moves to another part of the editor or to another window.
     */
    ignoreFocusOut?: boolean;
}

export interface QuickOpenMain {
    $show(options: PickOptions): Promise<number | number[]>;
    $setItems(items: PickOpenItem[]): Promise<any>;
    $setError(error: Error): Promise<any>;
    $input(options: theia.InputBoxOptions, validateInput: boolean): Promise<string | undefined>;
}

export interface WorkspaceMain {
    $pickWorkspaceFolder(options: WorkspaceFolderPickOptionsMain): Promise<theia.WorkspaceFolder | undefined>;
    $startFileSearch(includePattern: string, excludePatternOrDisregardExcludes: string | false,
        maxResults: number | undefined, token: theia.CancellationToken): PromiseLike<UriComponents[]>;
    $registerTextDocumentContentProvider(scheme: string): Promise<void>;
    $unregisterTextDocumentContentProvider(scheme: string): void;
    $onTextDocumentContentChange(uri: string, content: string): void;
    $registerFileSystemWatcher(options: FileWatcherSubscriberOptions): Promise<string>;
    $unregisterFileSystemWatcher(watcherId: string): Promise<void>;
}

export interface WorkspaceExt {
    $onWorkspaceFoldersChanged(event: WorkspaceRootsChangeEvent): void;
    $provideTextDocumentContent(uri: string): Promise<string | undefined>;
    $fileChanged(event: FileChangeEvent): void;
}

export interface DialogsMain {
    $showOpenDialog(options: OpenDialogOptionsMain): Promise<string[] | undefined>;
    $showSaveDialog(options: SaveDialogOptionsMain): Promise<string | undefined>;
}

export interface TreeViewsMain {
    $registerTreeDataProvider(treeViewId: string): void;
    $refresh(treeViewId: string): void;
    $reveal(treeViewId: string, treeItemId: string): Promise<any>;
}

export interface TreeViewsExt {
    $getChildren(treeViewId: string, treeItemId: string | undefined): Promise<TreeViewItem[] | undefined>;
    $setExpanded(treeViewId: string, treeItemId: string, expanded: boolean): Promise<any>;
    $setSelection(treeViewId: string, treeItemId: string): Promise<any>;
}

export class TreeViewItem {

    id: string;

    label: string;

    icon?: string;

    tooltip?: string;

    collapsibleState?: TreeViewItemCollapsibleState;

}

/**
 * Collapsible state of the tree item
 */
export enum TreeViewItemCollapsibleState {
    /**
     * Determines an item can be neither collapsed nor expanded. Implies it has no children.
     */
    None = 0,
    /**
     * Determines an item is collapsed
     */
    Collapsed = 1,
    /**
     * Determines an item is expanded
     */
    Expanded = 2
}

export interface WindowStateExt {
    $onWindowStateChanged(focus: boolean): void;
}

export interface NotificationExt {
    withProgress<R>(
        options: ProgressOptions,
        task: (progress: Progress<{ message?: string; increment?: number }>, token: CancellationToken) => PromiseLike<R>
    ): PromiseLike<R>;
    $onCancel(id: string): void;
}

export interface NotificationMain {
    $startProgress(message: string): Promise<string | undefined>;
    $stopProgress(id: string): void;
    $updateProgress(message: string, item: { message?: string, increment?: number }): void;
}

export interface StatusBarExt {
    withProgress<R>(
        options: ProgressOptions,
        task: (progress: Progress<{ message?: string; increment?: number }>, token: CancellationToken) => PromiseLike<R>
    ): PromiseLike<R>;
}

export enum EditorPosition {
    ONE = 0,
    TWO = 1,
    THREE = 2
}

export interface Position {
    readonly lineNumber: number;
    readonly column: number;
}

export interface Selection {
    /**
     * The line number on which the selection has started.
     */
    readonly selectionStartLineNumber: number;
    /**
     * The column on `selectionStartLineNumber` where the selection has started.
     */
    readonly selectionStartColumn: number;
    /**
     * The line number on which the selection has ended.
     */
    readonly positionLineNumber: number;
    /**
     * The column on `positionLineNumber` where the selection has ended.
     */
    readonly positionColumn: number;
}

export interface TextEditorConfiguration {
    tabSize: number;
    insertSpaces: boolean;
    cursorStyle: TextEditorCursorStyle;
    lineNumbers: TextEditorLineNumbersStyle;
}

export interface TextEditorConfigurationUpdate {
    tabSize?: number | 'auto';
    insertSpaces?: boolean | 'auto';
    cursorStyle?: TextEditorCursorStyle;
    lineNumbers?: TextEditorLineNumbersStyle;
}

export enum TextEditorRevealType {
    Default = 0,
    InCenter = 1,
    InCenterIfOutsideViewport = 2,
    AtTop = 3
}

export interface SelectionChangeEvent {
    selections: Selection[];
    source?: string;
}

export interface EditorChangedPropertiesData {
    options?: TextEditorConfiguration;
    selections?: SelectionChangeEvent;
    visibleRanges?: Range[];
}

export interface TextEditorPositionData {
    [id: string]: EditorPosition;
}

export interface TextEditorsExt {
    $acceptEditorPropertiesChanged(id: string, props: EditorChangedPropertiesData): void;
    $acceptEditorPositionData(data: TextEditorPositionData): void;
}

export interface SingleEditOperation {
    range: Range;
    text?: string;
    forceMoveMarkers?: boolean;
}

export interface UndoStopOptions {
    undoStopBefore: boolean;
    undoStopAfter: boolean;
}

export interface ApplyEditsOptions extends UndoStopOptions {
    setEndOfLine: EndOfLine;
}

export interface ThemeColor {
    id: string;
}

/**
 * Describes the behavior of decorations when typing/editing near their edges.
 */
export enum TrackedRangeStickiness {
    AlwaysGrowsWhenTypingAtEdges = 0,
    NeverGrowsWhenTypingAtEdges = 1,
    GrowsOnlyWhenTypingBefore = 2,
    GrowsOnlyWhenTypingAfter = 3,
}
export interface ContentDecorationRenderOptions {
    contentText?: string;
    contentIconPath?: string | UriComponents;

    border?: string;
    borderColor?: string | ThemeColor;
    fontStyle?: string;
    fontWeight?: string;
    textDecoration?: string;
    color?: string | ThemeColor;
    backgroundColor?: string | ThemeColor;

    margin?: string;
    width?: string;
    height?: string;
}

export interface ThemeDecorationRenderOptions {
    backgroundColor?: string | ThemeColor;

    outline?: string;
    outlineColor?: string | ThemeColor;
    outlineStyle?: string;
    outlineWidth?: string;

    border?: string;
    borderColor?: string | ThemeColor;
    borderRadius?: string;
    borderSpacing?: string;
    borderStyle?: string;
    borderWidth?: string;

    fontStyle?: string;
    fontWeight?: string;
    textDecoration?: string;
    cursor?: string;
    color?: string | ThemeColor;
    opacity?: number;
    letterSpacing?: string;

    gutterIconPath?: string | UriComponents;
    gutterIconSize?: string;

    overviewRulerColor?: string | ThemeColor;

    before?: ContentDecorationRenderOptions;
    after?: ContentDecorationRenderOptions;
}

export interface DecorationRenderOptions extends ThemeDecorationRenderOptions {
    isWholeLine?: boolean;
    rangeBehavior?: TrackedRangeStickiness;
    overviewRulerLane?: OverviewRulerLane;

    light?: ThemeDecorationRenderOptions;
    dark?: ThemeDecorationRenderOptions;
}

export interface ThemeDecorationInstanceRenderOptions {
    before?: ContentDecorationRenderOptions;
    after?: ContentDecorationRenderOptions;
}

export interface DecorationInstanceRenderOptions extends ThemeDecorationInstanceRenderOptions {
    light?: ThemeDecorationInstanceRenderOptions;
    dark?: ThemeDecorationInstanceRenderOptions;
}

export interface DecorationOptions {
    range: Range;
    hoverMessage?: MarkdownString | MarkdownString[];
    renderOptions?: DecorationInstanceRenderOptions;
}

export interface TextEditorsMain {
    // $tryShowTextDocument(resource: UriComponents, options: TextDocumentShowOptions): Promise<string>;
    $registerTextEditorDecorationType(key: string, options: DecorationRenderOptions): void;
    $removeTextEditorDecorationType(key: string): void;
    // $tryShowEditor(id: string, position: EditorPosition): Promise<void>;
    // $tryHideEditor(id: string): Promise<void>;
    $trySetOptions(id: string, options: TextEditorConfigurationUpdate): Promise<void>;
    $trySetDecorations(id: string, key: string, ranges: DecorationOptions[]): Promise<void>;
    $trySetDecorationsFast(id: string, key: string, ranges: number[]): Promise<void>;
    $tryRevealRange(id: string, range: Range, revealType: TextEditorRevealType): Promise<void>;
    $trySetSelections(id: string, selections: Selection[]): Promise<void>;
    $tryApplyEdits(id: string, modelVersionId: number, edits: SingleEditOperation[], opts: ApplyEditsOptions): Promise<boolean>;
    // $tryApplyWorkspaceEdit(workspaceEditDto: WorkspaceEditDto): Promise<boolean>;
    $tryInsertSnippet(id: string, template: string, selections: Range[], opts: UndoStopOptions): Promise<boolean>;
    // $getDiffInformation(id: string): Promise<editorCommon.ILineChange[]>;
}

export interface ModelAddedData {
    uri: UriComponents;
    versionId: number;
    lines: string[];
    EOL: string;
    modeId: string;
    isDirty: boolean;
}

export interface TextEditorAddData {
    id: string;
    documentUri: UriComponents;
    options: TextEditorConfiguration;
    selections: Selection[];
    visibleRanges: Range[];
    editorPosition?: EditorPosition;
}

export interface EditorsAndDocumentsDelta {
    removedDocuments?: UriComponents[];
    addedDocuments?: ModelAddedData[];
    removedEditors?: string[];
    addedEditors?: TextEditorAddData[];
    newActiveEditor?: string;
}

export interface EditorsAndDocumentsExt {
    $acceptEditorsAndDocumentsDelta(delta: EditorsAndDocumentsDelta): void;
}

export interface ModelContentChange {
    readonly range: Range;
    readonly rangeOffset: number;
    readonly rangeLength: number;
    readonly text: string;
}
export interface ModelChangedEvent {
    readonly changes: ModelContentChange[];

    readonly eol: string;

    readonly versionId: number;
}

export interface DocumentsExt {
    $acceptModelModeChanged(startUrl: UriComponents, oldModeId: string, newModeId: string): void;
    $acceptModelSaved(strUrl: UriComponents): void;
    $acceptDirtyStateChanged(strUrl: UriComponents, isDirty: boolean): void;
    $acceptModelChanged(strUrl: UriComponents, e: ModelChangedEvent, isDirty: boolean): void;
}

export interface DocumentsMain {
    $tryCreateDocument(options?: { language?: string; content?: string; }): Promise<UriComponents>;
    $tryOpenDocument(uri: UriComponents, options?: TextDocumentShowOptions): Promise<void>;
    $trySaveDocument(uri: UriComponents): Promise<boolean>;
}

export interface EnvMain {
    $getEnvVariable(envVarName: string): Promise<string | undefined>;
}

export interface PreferenceRegistryMain {
    $updateConfigurationOption(
        target: boolean | ConfigurationTarget | undefined,
        key: string,
        value: any,
        resource: any | undefined
    ): PromiseLike<void>;
    $removeConfigurationOption(
        target: boolean | ConfigurationTarget | undefined,
        key: string,
        resource: any | undefined
    ): PromiseLike<void>;
}
export interface PreferenceRegistryExt {
    $acceptConfigurationChanged(data: { [key: string]: any }, eventData: PreferenceChange): void;
}

export interface OutputChannelRegistryMain {
    $append(channelName: string, value: string): PromiseLike<void>;
    $clear(channelName: string): PromiseLike<void>;
    $dispose(channelName: string): PromiseLike<void>;
    $reveal(channelName: string, preserveFocus: boolean): PromiseLike<void>;
    $close(channelName: string): PromiseLike<void>;
}

export type CharacterPair = [string, string];

export interface CommentRule {
    lineComment?: string;
    blockComment?: CharacterPair;
}

export interface SerializedRegExp {
    pattern: string;
    flags?: string;
}

export interface SerializedIndentationRule {
    decreaseIndentPattern?: SerializedRegExp;
    increaseIndentPattern?: SerializedRegExp;
    indentNextLinePattern?: SerializedRegExp;
    unIndentedLinePattern?: SerializedRegExp;
}

export interface EnterAction {
    indentAction: IndentAction;
    outdentCurrentLine?: boolean;
    appendText?: string;
    removeText?: number;
}

export interface SerializedOnEnterRule {
    beforeText: SerializedRegExp;
    afterText?: SerializedRegExp;
    action: EnterAction;
}

export interface SerializedLanguageConfiguration {
    comments?: CommentRule;
    brackets?: CharacterPair[];
    wordPattern?: SerializedRegExp;
    indentationRules?: SerializedIndentationRule;
    onEnterRules?: SerializedOnEnterRule[];
}

export interface CodeActionDto {
    title: string;
    edit?: WorkspaceEditDto;
    diagnostics?: MarkerData[];
    command?: Command;
    kind?: string;
}

export interface ResourceFileEditDto {
    oldUri: UriComponents;
    newUri: UriComponents;
    options: FileOperationOptions;
}

export interface ResourceTextEditDto {
    resource: UriComponents;
    modelVersionId?: number;
    edits: TextEdit[];
}

export interface WorkspaceEditDto {
    edits: (ResourceFileEditDto | ResourceTextEditDto)[];
    rejectReason?: string;
}

export interface LanguagesContributionExt {
    $start(languageServerInfo: theia.LanguageServerInfo): void;
}

export interface LanguagesContributionMain {
    $registerLanguageServerProvider(languageServerInfo: theia.LanguageServerInfo): void
    $stop(id: string): void
}

export interface CommandProperties {
    command: string;
    args?: string[];
    options?: object;
}
export interface TaskDto {
    type: string;
    label: string;
    // tslint:disable-next-line:no-any
    [key: string]: any;
}

export interface ProcessTaskDto extends TaskDto, CommandProperties {
    windows?: CommandProperties;
    cwd?: string;
}

export interface LanguagesExt {
    $provideCompletionItems(handle: number, resource: UriComponents, position: Position, context: CompletionContext): Promise<CompletionResultDto | undefined>;
    $resolveCompletionItem(handle: number, resource: UriComponents, position: Position, completion: Completion): Promise<Completion>;
    $releaseCompletionItems(handle: number, id: number): void;
    $provideImplementation(handle: number, resource: UriComponents, position: Position): Promise<Definition | DefinitionLink[] | undefined>;
    $provideTypeDefinition(handle: number, resource: UriComponents, position: Position): Promise<Definition | DefinitionLink[] | undefined>;
    $provideDefinition(handle: number, resource: UriComponents, position: Position): Promise<Definition | DefinitionLink[] | undefined>;
    $provideReferences(handle: number, resource: UriComponents, position: Position, context: ReferenceContext): Promise<Location[] | undefined>;
    $provideSignatureHelp(handle: number, resource: UriComponents, position: Position): Promise<SignatureHelp | undefined>;
    $provideHover(handle: number, resource: UriComponents, position: Position): Promise<Hover | undefined>;
    $provideDocumentHighlights(handle: number, resource: UriComponents, position: Position): Promise<DocumentHighlight[] | undefined>;
    $provideDocumentFormattingEdits(handle: number, resource: UriComponents, options: FormattingOptions): Promise<ModelSingleEditOperation[] | undefined>;
    $provideDocumentRangeFormattingEdits(handle: number, resource: UriComponents, range: Range, options: FormattingOptions): Promise<ModelSingleEditOperation[] | undefined>;
    $provideOnTypeFormattingEdits(
        handle: number,
        resource: UriComponents,
        position: Position,
        ch: string,
        options: FormattingOptions
    ): Promise<ModelSingleEditOperation[] | undefined>;
    $provideDocumentLinks(handle: number, resource: UriComponents): Promise<DocumentLink[] | undefined>;
    $resolveDocumentLink(handle: number, link: DocumentLink): Promise<DocumentLink | undefined>;
    $provideCodeLenses(handle: number, resource: UriComponents): Promise<CodeLensSymbol[] | undefined>;
    $resolveCodeLens(handle: number, resource: UriComponents, symbol: CodeLensSymbol): Promise<CodeLensSymbol | undefined>;
    $provideCodeActions(
        handle: number,
        resource: UriComponents,
        rangeOrSelection: Range | Selection,
        context: monaco.languages.CodeActionContext
    ): Promise<monaco.languages.CodeAction[]>;
    $provideDocumentSymbols(handle: number, resource: UriComponents): Promise<DocumentSymbol[] | undefined>;
}

export interface LanguagesMain {
    $getLanguages(): Promise<string[]>;
    $setLanguageConfiguration(handle: number, languageId: string, configuration: SerializedLanguageConfiguration): void;
    $unregister(handle: number): void;
    $registerCompletionSupport(handle: number, selector: SerializedDocumentFilter[], triggerCharacters: string[], supportsResolveDetails: boolean): void;
    $registerImplementationProvider(handle: number, selector: SerializedDocumentFilter[]): void;
    $registerTypeDefinitionProvider(handle: number, selector: SerializedDocumentFilter[]): void;
    $registerDefinitionProvider(handle: number, selector: SerializedDocumentFilter[]): void;
    $registeReferenceProvider(handle: number, selector: SerializedDocumentFilter[]): void;
    $registerSignatureHelpProvider(handle: number, selector: SerializedDocumentFilter[], triggerCharacters: string[]): void;
    $registerHoverProvider(handle: number, selector: SerializedDocumentFilter[]): void;
    $registerDocumentHighlightProvider(handle: number, selector: SerializedDocumentFilter[]): void;
    $registerQuickFixProvider(handle: number, selector: SerializedDocumentFilter[], codeActionKinds?: string[]): void;
    $clearDiagnostics(id: string): void;
    $changeDiagnostics(id: string, delta: [UriComponents, MarkerData[]][]): void;
    $registerDocumentFormattingSupport(handle: number, selector: SerializedDocumentFilter[]): void;
    $registerRangeFormattingProvider(handle: number, selector: SerializedDocumentFilter[]): void;
    $registerOnTypeFormattingProvider(handle: number, selector: SerializedDocumentFilter[], autoFormatTriggerCharacters: string[]): void;
    $registerDocumentLinkProvider(handle: number, selector: SerializedDocumentFilter[]): void;
    $registerCodeLensSupport(handle: number, selector: SerializedDocumentFilter[], eventHandle?: number): void;
    $emitCodeLensEvent(eventHandle: number, event?: any): void;
    $registerOutlineSupport(handle: number, selector: SerializedDocumentFilter[]): void;
}

export interface WebviewPanelViewState {
    readonly active: boolean;
    readonly visible: boolean;
    readonly position: number;
}

export interface WebviewPanelShowOptions {
    readonly viewColumn?: number;
    readonly preserveFocus?: boolean;
}

export interface WebviewsExt {
    $onMessage(handle: string, message: any): void;
    $onDidChangeWebviewPanelViewState(handle: string, newState: WebviewPanelViewState): void;
    $onDidDisposeWebviewPanel(handle: string): PromiseLike<void>;
    $deserializeWebviewPanel(newWebviewHandle: string,
        viewType: string,
        title: string,
        state: any,
        position: number,
        options: theia.WebviewOptions & theia.WebviewPanelOptions): PromiseLike<void>;
}

export interface WebviewsMain {
    $createWebviewPanel(handle: string,
        viewType: string,
        title: string,
        showOptions: WebviewPanelShowOptions,
        options: theia.WebviewPanelOptions & theia.WebviewOptions | undefined,
        pluginLocation: UriComponents): void;
    $disposeWebview(handle: string): void;
    $reveal(handle: string, showOptions: WebviewPanelShowOptions): void;
    $setTitle(handle: string, value: string): void;
    $setIconPath(handle: string, value: { light: string, dark: string } | string | undefined): void;
    $setHtml(handle: string, value: string): void;
    $setOptions(handle: string, options: theia.WebviewOptions): void;
    $postMessage(handle: string, value: any): Thenable<boolean>;

    $registerSerializer(viewType: string): void;
    $unregisterSerializer(viewType: string): void;
}

export interface DebugExt {
    $onSessionCustomEvent(sessionId: string, event: string, body?: any): void;
    $breakpointsDidChange(all: Breakpoint[], added: Breakpoint[], removed: Breakpoint[], changed: Breakpoint[]): void;
    $sessionDidCreate(sessionId: string): void;
    $sessionDidDestroy(sessionId: string): void;
    $sessionDidChange(sessionId: string | undefined): void;
    $provideDebugConfigurations(contributionId: string, folder: string | undefined): Promise<theia.DebugConfiguration[]>;
    $resolveDebugConfigurations(contributionId: string, debugConfiguration: theia.DebugConfiguration, folder: string | undefined): Promise<theia.DebugConfiguration | undefined>;
    $getSupportedLanguages(contributionId: string): Promise<string[]>;
    $getSchemaAttributes(contributionId: string): Promise<IJSONSchema[]>;
    $getConfigurationSnippets(contributionId: string): Promise<IJSONSchemaSnippet[]>;
    $createDebugSession(contributionId: string, debugConfiguration: theia.DebugConfiguration): Promise<string>;
    $terminateDebugSession(sessionId: string): Promise<void>;
}

export interface DebugMain {
    $appendToDebugConsole(value: string): Promise<void>;
    $appendLineToDebugConsole(value: string): Promise<void>;
    $registerDebugConfigurationProvider(contributorId: string, description: DebuggerDescription): Promise<void>;
    $unregisterDebugConfigurationProvider(contributorId: string): Promise<void>;
    $addBreakpoints(breakpoints: Breakpoint[]): Promise<void>;
    $removeBreakpoints(breakpoints: Breakpoint[]): Promise<void>;
    $startDebugging(folder: theia.WorkspaceFolder | undefined, nameOrConfiguration: string | theia.DebugConfiguration): Promise<boolean>;
    $customRequest(command: string, args?: any): Promise<DebugProtocol.Response>;
}

export const PLUGIN_RPC_CONTEXT = {
    COMMAND_REGISTRY_MAIN: <ProxyIdentifier<CommandRegistryMain>>createProxyIdentifier<CommandRegistryMain>('CommandRegistryMain'),
    QUICK_OPEN_MAIN: createProxyIdentifier<QuickOpenMain>('QuickOpenMain'),
    DIALOGS_MAIN: createProxyIdentifier<DialogsMain>('DialogsMain'),
    WORKSPACE_MAIN: createProxyIdentifier<WorkspaceMain>('WorkspaceMain'),
    MESSAGE_REGISTRY_MAIN: <ProxyIdentifier<MessageRegistryMain>>createProxyIdentifier<MessageRegistryMain>('MessageRegistryMain'),
    TEXT_EDITORS_MAIN: createProxyIdentifier<TextEditorsMain>('TextEditorsMain'),
    DOCUMENTS_MAIN: createProxyIdentifier<DocumentsMain>('DocumentsMain'),
    STATUS_BAR_MESSAGE_REGISTRY_MAIN: <ProxyIdentifier<StatusBarMessageRegistryMain>>createProxyIdentifier<StatusBarMessageRegistryMain>('StatusBarMessageRegistryMain'),
    ENV_MAIN: createProxyIdentifier<EnvMain>('EnvMain'),
    NOTIFICATION_MAIN: createProxyIdentifier<NotificationMain>('NotificationMain'),
    TERMINAL_MAIN: createProxyIdentifier<TerminalServiceMain>('TerminalServiceMain'),
    TREE_VIEWS_MAIN: createProxyIdentifier<TreeViewsMain>('TreeViewsMain'),
    PREFERENCE_REGISTRY_MAIN: createProxyIdentifier<PreferenceRegistryMain>('PreferenceRegistryMain'),
    OUTPUT_CHANNEL_REGISTRY_MAIN: <ProxyIdentifier<OutputChannelRegistryMain>>createProxyIdentifier<OutputChannelRegistryMain>('OutputChannelRegistryMain'),
    LANGUAGES_MAIN: createProxyIdentifier<LanguagesMain>('LanguagesMain'),
    CONNECTION_MAIN: createProxyIdentifier<ConnectionMain>('ConnectionMain'),
    WEBVIEWS_MAIN: createProxyIdentifier<WebviewsMain>('WebviewsMain'),
    TASKS_MAIN: createProxyIdentifier<TasksMain>('TasksMain'),
    LANGUAGES_CONTRIBUTION_MAIN: createProxyIdentifier<LanguagesContributionMain>('LanguagesContributionMain'),
    DEBUG_MAIN: createProxyIdentifier<DebugMain>('DebugMain')
};

export const MAIN_RPC_CONTEXT = {
    HOSTED_PLUGIN_MANAGER_EXT: createProxyIdentifier<PluginManagerExt>('PluginManagerExt'),
    COMMAND_REGISTRY_EXT: createProxyIdentifier<CommandRegistryExt>('CommandRegistryExt'),
    QUICK_OPEN_EXT: createProxyIdentifier<QuickOpenExt>('QuickOpenExt'),
    WINDOW_STATE_EXT: createProxyIdentifier<WindowStateExt>('WindowStateExt'),
    NOTIFICATION_EXT: createProxyIdentifier<NotificationExt>('NotificationExt'),
    WORKSPACE_EXT: createProxyIdentifier<WorkspaceExt>('WorkspaceExt'),
    TEXT_EDITORS_EXT: createProxyIdentifier<TextEditorsExt>('TextEditorsExt'),
    EDITORS_AND_DOCUMENTS_EXT: createProxyIdentifier<EditorsAndDocumentsExt>('EditorsAndDocumentsExt'),
    DOCUMENTS_EXT: createProxyIdentifier<DocumentsExt>('DocumentsExt'),
    TERMINAL_EXT: createProxyIdentifier<TerminalServiceExt>('TerminalServiceExt'),
    TREE_VIEWS_EXT: createProxyIdentifier<TreeViewsExt>('TreeViewsExt'),
    PREFERENCE_REGISTRY_EXT: createProxyIdentifier<PreferenceRegistryExt>('PreferenceRegistryExt'),
    LANGUAGES_EXT: createProxyIdentifier<LanguagesExt>('LanguagesExt'),
    CONNECTION_EXT: createProxyIdentifier<ConnectionExt>('ConnectionExt'),
    WEBVIEWS_EXT: createProxyIdentifier<WebviewsExt>('WebviewsExt'),
    TASKS_EXT: createProxyIdentifier<TasksExt>('TasksExt'),
    LANGUAGES_CONTRIBUTION_EXT: createProxyIdentifier<LanguagesContributionExt>('LanguagesContributionExt'),
    DEBUG_EXT: createProxyIdentifier<DebugExt>('DebugExt')
};

export interface TasksExt {
    $provideTasks(handle: number): Promise<TaskDto[] | undefined>;
    $resolveTask(handle: number, task: TaskDto): Promise<TaskDto | undefined>;
}

export interface TasksMain {
    $registerTaskProvider(handle: number, type: string): void;
    $unregister(handle: number): void;
}
