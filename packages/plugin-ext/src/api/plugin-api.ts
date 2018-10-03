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

import { createProxyIdentifier, ProxyIdentifier } from './rpc-protocol';
import * as theia from '@theia/plugin';
import { PluginLifecycle, PluginModel, PluginMetadata, PluginPackage } from '../common/plugin-protocol';
import { QueryParameters } from '../common/env';
import { TextEditorCursorStyle } from '../common/editor-options';
import { TextEditorLineNumbersStyle, EndOfLine, OverviewRulerLane, IndentAction } from '../plugin/types-impl';
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
    FormattingOptions,
    SingleEditOperation as ModelSingleEditOperation,
    Definition,
    DefinitionLink,
    DocumentLink
} from './model';

export interface PluginInitData {
    plugins: PluginMetadata[];
}

export interface Plugin {
    pluginPath: string;
    pluginFolder: string;
    model: PluginModel;
    rawModel: PluginPackage;
    lifecycle: PluginLifecycle;
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

    $init(pluginInit: PluginInitData): PromiseLike<void>;
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
}

export interface WorkspaceExt {
    $onWorkspaceFoldersChanged(event: theia.WorkspaceFoldersChangeEvent): void;
}

export interface DialogsMain {
    $showOpenDialog(options: OpenDialogOptionsMain): Promise<string[] | undefined>;
    $showSaveDialog(options: SaveDialogOptionsMain): Promise<string | undefined>;
}

export interface WindowStateExt {
    $onWindowStateChanged(focus: boolean): void;
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
    $tryOpenDocument(uri: UriComponents): Promise<void>;
    $trySaveDocument(uri: UriComponents): Promise<boolean>;
}

export interface EnvMain {
    $getEnvVariable(envVarName: string): Promise<string | undefined>;
}

export interface EnvExt {
    $setQueryParameters(queryParams: QueryParameters): void;
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

export interface LanguagesExt {
    $provideCompletionItems(handle: number, resource: UriComponents, position: Position, context: CompletionContext): Promise<CompletionResultDto | undefined>;
    $resolveCompletionItem(handle: number, resource: UriComponents, position: Position, completion: Completion): Promise<Completion>;
    $releaseCompletionItems(handle: number, id: number): void;
    $provideDefinition(handle: number, resource: UriComponents, position: Position): Promise<Definition | DefinitionLink[] | undefined>;
    $provideSignatureHelp(handle: number, resource: UriComponents, position: Position): Promise<SignatureHelp | undefined>;
    $provideHover(handle: number, resource: UriComponents, position: Position): Promise<Hover | undefined>;
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
}

export interface LanguagesMain {
    $getLanguages(): Promise<string[]>;
    $setLanguageConfiguration(handle: number, languageId: string, configuration: SerializedLanguageConfiguration): void;
    $unregister(handle: number): void;
    $registerCompletionSupport(handle: number, selector: SerializedDocumentFilter[], triggerCharacters: string[], supportsResolveDetails: boolean): void;
    $registerDefinitionProvider(handle: number, selector: SerializedDocumentFilter[]): void;
    $registerSignatureHelpProvider(handle: number, selector: SerializedDocumentFilter[], triggerCharacters: string[]): void;
    $registerHoverProvider(handle: number, selector: SerializedDocumentFilter[]): void;

    $clearDiagnostics(id: string): void;
    $changeDiagnostics(id: string, delta: [UriComponents, MarkerData[]][]): void;
    $registerDocumentFormattingSupport(handle: number, selector: SerializedDocumentFilter[]): void;
    $registerRangeFormattingProvider(handle: number, selector: SerializedDocumentFilter[]): void;
    $registerOnTypeFormattingProvider(handle: number, selector: SerializedDocumentFilter[], autoFormatTriggerCharacters: string[]): void;
    $registerDocumentLinkProvider(handle: number, selector: SerializedDocumentFilter[]): void;
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
    TERMINAL_MAIN: createProxyIdentifier<TerminalServiceMain>('TerminalServiceMain'),
    PREFERENCE_REGISTRY_MAIN: createProxyIdentifier<PreferenceRegistryMain>('PreferenceRegistryMain'),
    OUTPUT_CHANNEL_REGISTRY_MAIN: <ProxyIdentifier<OutputChannelRegistryMain>>createProxyIdentifier<OutputChannelRegistryMain>('OutputChannelRegistryMain'),
    LANGUAGES_MAIN: createProxyIdentifier<LanguagesMain>('LanguagesMain'),
};

export const MAIN_RPC_CONTEXT = {
    HOSTED_PLUGIN_MANAGER_EXT: createProxyIdentifier<PluginManagerExt>('PluginManagerExt'),
    COMMAND_REGISTRY_EXT: createProxyIdentifier<CommandRegistryExt>('CommandRegistryExt'),
    QUICK_OPEN_EXT: createProxyIdentifier<QuickOpenExt>('QuickOpenExt'),
    WINDOW_STATE_EXT: createProxyIdentifier<WindowStateExt>('WindowStateExt'),
    WORKSPACE_EXT: createProxyIdentifier<WorkspaceExt>('WorkspaceExt'),
    TEXT_EDITORS_EXT: createProxyIdentifier<TextEditorsExt>('TextEditorsExt'),
    EDITORS_AND_DOCUMENTS_EXT: createProxyIdentifier<EditorsAndDocumentsExt>('EditorsAndDocumentsExt'),
    DOCUMENTS_EXT: createProxyIdentifier<DocumentsExt>('DocumentsExt'),
    ENV_EXT: createProxyIdentifier<EnvExt>('EnvExt'),
    TERMINAL_EXT: createProxyIdentifier<TerminalServiceExt>('TerminalServiceExt'),
    PREFERENCE_REGISTRY_EXT: createProxyIdentifier<PreferenceRegistryExt>('PreferenceRegistryExt'),
    LANGUAGES_EXT: createProxyIdentifier<LanguagesExt>('LanguagesExt'),
};
