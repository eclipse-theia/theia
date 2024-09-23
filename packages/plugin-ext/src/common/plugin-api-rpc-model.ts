// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as theia from '@theia/plugin';
import type * as monaco from '@theia/monaco-editor-core';
import { MarkdownString as MarkdownStringDTO } from '@theia/core/lib/common/markdown-rendering';
import { UriComponents } from './uri-components';
import { CompletionItemTag, DocumentPasteEditKind, SnippetString } from '../plugin/types-impl';
import { Event as TheiaEvent } from '@theia/core/lib/common/event';
import { URI } from '@theia/core/shared/vscode-uri';
import { SerializedRegExp } from './plugin-api-rpc';

// Should contains internal Plugin API types

/**
 * Represents options to configure the behavior of showing a document in an editor.
 */
export interface TextDocumentShowOptions {
    /**
     * An optional selection to apply for the document in the editor.
     */
    selection?: Range;

    /**
     * An optional flag that when `true` will stop the editor from taking focus.
     */
    preserveFocus?: boolean;

    /**
     * An optional flag that controls if an editor-tab will be replaced
     * with the next editor or if it will be kept.
     */
    preview?: boolean;

    /**
     * Denotes a location of an editor in the window. Editors can be arranged in a grid
     * and each column represents one editor location in that grid by counting the editors
     * in order of their appearance.
     */
    viewColumn?: theia.ViewColumn;
}

export interface Range {
    /**
     * Line number on which the range starts (starts at 1).
     */
    readonly startLineNumber: number;
    /**
     * Column on which the range starts in line `startLineNumber` (starts at 1).
     */
    readonly startColumn: number;
    /**
     * Line number on which the range ends.
     */
    readonly endLineNumber: number;
    /**
     * Column on which the range ends in line `endLineNumber`.
     */
    readonly endColumn: number;
}

export interface Position {
    /**
     * line number (starts at 1)
     */
    readonly lineNumber: number,
    /**
     * column (starts at 1)
     */
    readonly column: number
}

export { MarkdownStringDTO as MarkdownString };

export interface SerializedDocumentFilter {
    $serialized: true;
    language?: string;
    scheme?: string;
    pattern?: theia.GlobPattern;
    notebookType?: string;
}

export enum CompletionTriggerKind {
    Invoke = 0,
    TriggerCharacter = 1,
    TriggerForIncompleteCompletions = 2
}

export interface CompletionContext {
    triggerKind: CompletionTriggerKind;
    triggerCharacter?: string;
}

export enum CompletionItemInsertTextRule {
    KeepWhitespace = 1,
    InsertAsSnippet = 4
}

export interface Completion {
    label: string | theia.CompletionItemLabel;
    label2?: string;
    kind: CompletionItemKind;
    detail?: string;
    documentation?: string | MarkdownStringDTO;
    sortText?: string;
    filterText?: string;
    preselect?: boolean;
    insertText: string;
    insertTextRules?: CompletionItemInsertTextRule;
    range?: Range | {
        insert: Range;
        replace: Range;
    };
    commitCharacters?: string[];
    additionalTextEdits?: SingleEditOperation[];
    command?: Command;
    tags?: CompletionItemTag[];
    /** @deprecated use tags instead. */
    deprecated?: boolean;
}

export interface SingleEditOperation {
    range: Range;
    text: string | null;
    /**
     * This indicates that this operation has "insert" semantics.
     * i.e. forceMoveMarkers = true => if `range` is collapsed, all markers at the position will be moved.
     */
    forceMoveMarkers?: boolean;
}

export interface Command {
    id: string;
    title: string;
    tooltip?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    arguments?: any[];
}

export enum CompletionItemKind {
    Method = 0,
    Function = 1,
    Constructor = 2,
    Field = 3,
    Variable = 4,
    Class = 5,
    Struct = 6,
    Interface = 7,
    Module = 8,
    Property = 9,
    Event = 10,
    Operator = 11,
    Unit = 12,
    Value = 13,
    Constant = 14,
    Enum = 15,
    EnumMember = 16,
    Keyword = 17,
    Text = 18,
    Color = 19,
    File = 20,
    Reference = 21,
    Customcolor = 22,
    Folder = 23,
    TypeParameter = 24,
    User = 25,
    Issue = 26,
    Snippet = 27
}

export class IdObject {
    id?: number;
}
export interface CompletionDto extends Completion {
    id: number;
    parentId: number;
}

export interface CompletionResultDto extends IdObject {
    id: number;
    defaultRange: {
        insert: Range,
        replace: Range
    }
    completions: CompletionDto[];
    incomplete?: boolean;
}

export interface MarkerData {
    code?: string;
    severity: MarkerSeverity;
    message: string;
    source?: string;
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
    relatedInformation?: RelatedInformation[];
    tags?: MarkerTag[];
}

export interface RelatedInformation {
    resource: string;
    message: string;
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
}

export enum MarkerSeverity {
    Hint = 1,
    Info = 2,
    Warning = 4,
    Error = 8,
}

export enum MarkerTag {
    Unnecessary = 1,
    Deprecated = 2,
}

export interface ParameterInformation {
    label: string | [number, number];
    documentation?: string | MarkdownStringDTO;
}

export interface SignatureInformation {
    label: string;
    documentation?: string | MarkdownStringDTO;
    parameters: ParameterInformation[];
    activeParameter?: number;
}

export interface SignatureHelp extends IdObject {
    signatures: SignatureInformation[];
    activeSignature: number;
    activeParameter: number;
}

export interface SignatureHelpContext {
    triggerKind: theia.SignatureHelpTriggerKind;
    triggerCharacter?: string;
    isRetrigger: boolean;
    activeSignatureHelp?: SignatureHelp;
}

export interface Hover {
    contents: MarkdownStringDTO[];
    range?: Range;
}

export interface HoverProvider {
    provideHover(model: monaco.editor.ITextModel, position: monaco.Position, token: monaco.CancellationToken): Hover | undefined | Thenable<Hover | undefined>;
}

export interface EvaluatableExpression {
    range: Range;
    expression?: string;
}

export interface EvaluatableExpressionProvider {
    provideEvaluatableExpression(model: monaco.editor.ITextModel, position: monaco.Position,
        token: monaco.CancellationToken): EvaluatableExpression | undefined | Thenable<EvaluatableExpression | undefined>;
}

export interface InlineValueContext {
    frameId: number;
    stoppedLocation: Range;
}

export interface InlineValueText {
    type: 'text';
    range: Range;
    text: string;
}

export interface InlineValueVariableLookup {
    type: 'variable';
    range: Range;
    variableName?: string;
    caseSensitiveLookup: boolean;
}

export interface InlineValueEvaluatableExpression {
    type: 'expression';
    range: Range;
    expression?: string;
}

export type InlineValue = InlineValueText | InlineValueVariableLookup | InlineValueEvaluatableExpression;

export interface InlineValuesProvider {
    onDidChangeInlineValues?: TheiaEvent<void> | undefined;
    provideInlineValues(model: monaco.editor.ITextModel, viewPort: Range, context: InlineValueContext, token: monaco.CancellationToken):
        InlineValue[] | undefined | Thenable<InlineValue[] | undefined>;
}

export enum DocumentHighlightKind {
    Text = 0,
    Read = 1,
    Write = 2
}

export interface DocumentHighlight {
    range: Range;
    kind?: DocumentHighlightKind;
}

export interface DocumentHighlightProvider {
    provideDocumentHighlights(model: monaco.editor.ITextModel, position: monaco.Position, token: monaco.CancellationToken): DocumentHighlight[] | undefined;
}

export interface FormattingOptions {
    tabSize: number;
    insertSpaces: boolean;
}

export interface TextEdit {
    range: Range;
    text: string;
    eol?: monaco.editor.EndOfLineSequence;
}

export interface DocumentDropEdit {
    insertText: string | SnippetString;
    additionalEdit?: WorkspaceEdit;
}

export interface DocumentDropEditProviderMetadata {
    readonly providedDropEditKinds?: readonly DocumentPasteEditKind[];
    readonly dropMimeTypes: readonly string[];
}

export interface DataTransferFileDTO {
    readonly id: string;
    readonly name: string;
    readonly uri?: UriComponents;
}

export interface DataTransferItemDTO {
    readonly asString: string;
    readonly fileData: DataTransferFileDTO | undefined;
    readonly uriListData?: ReadonlyArray<string | UriComponents>;
}

export interface DataTransferDTO {
    readonly items: Array<[/* type */string, DataTransferItemDTO]>;
}

export interface Location {
    uri: UriComponents;
    range: Range;
}

export type Definition = Location | Location[] | LocationLink[];

export interface LocationLink {
    uri: UriComponents;
    range: Range;
    originSelectionRange?: Range;
    targetSelectionRange?: Range;
}

export interface DefinitionProvider {
    provideDefinition(model: monaco.editor.ITextModel, position: monaco.Position, token: monaco.CancellationToken): Definition | undefined;
}

export interface DeclarationProvider {
    provideDeclaration(model: monaco.editor.ITextModel, position: monaco.Position, token: monaco.CancellationToken): Definition | undefined;
}

/**
 * Value-object that contains additional information when
 * requesting references.
 */
export interface ReferenceContext {

    /**
     * Include the declaration of the current symbol.
     */
    includeDeclaration: boolean;
}

export type CacheId = number;
export type ChainedCacheId = [CacheId, CacheId];

export type CachedSessionItem<T> = T & { cacheId?: ChainedCacheId };
export type CachedSession<T> = T & { cacheId?: CacheId };

export interface DocumentLink {
    cacheId?: ChainedCacheId,
    range: Range;
    url?: UriComponents | string;
    tooltip?: string;
}

export interface DocumentLinkProvider {
    provideLinks(model: monaco.editor.ITextModel, token: monaco.CancellationToken): DocumentLink[] | undefined | PromiseLike<DocumentLink[] | undefined>;
    resolveLink?: (link: DocumentLink, token: monaco.CancellationToken) => DocumentLink | PromiseLike<DocumentLink[]>;
}

export interface CodeLensSymbol {
    range: Range;
    command?: Command;
}

export interface CodeAction {
    cacheId: number;
    title: string;
    command?: Command;
    edit?: WorkspaceEdit;
    diagnostics?: MarkerData[];
    kind?: string;
    disabled?: { reason: string };
    isPreferred?: boolean;
}

export enum CodeActionTriggerKind {
    Invoke = 1,
    Automatic = 2,
}

export interface CodeActionContext {
    only?: string;
    trigger: CodeActionTriggerKind
}

export type CodeActionProviderDocumentation = ReadonlyArray<{ command: Command, kind: string }>;

export interface CodeActionProvider {
    provideCodeActions(
        model: monaco.editor.ITextModel,
        range: Range | Selection,
        context: monaco.languages.CodeActionContext,
        token: monaco.CancellationToken
    ): CodeAction[] | PromiseLike<CodeAction[]>;

    providedCodeActionKinds?: string[];
}

// copied from https://github.com/microsoft/vscode/blob/b165e20587dd0797f37251515bc9e4dbe513ede8/src/vs/editor/common/modes.ts
export interface WorkspaceEditMetadata {
    needsConfirmation: boolean;
    label: string;
    description?: string;
    iconPath?: {
        id: string;
    } | {
        light: UriComponents;
        dark: UriComponents;
    };
}

export interface WorkspaceFileEdit {
    newResource?: UriComponents;
    oldResource?: UriComponents;
    options?: { overwrite?: boolean, ignoreIfNotExists?: boolean, ignoreIfExists?: boolean, recursive?: boolean };
    metadata?: WorkspaceEditMetadata;
}

export interface WorkspaceTextEdit {
    resource: UriComponents;
    modelVersionId?: number;
    textEdit: TextEdit;
    metadata?: WorkspaceEditMetadata;
}

export interface WorkspaceEdit {
    edits: Array<WorkspaceTextEdit | WorkspaceFileEdit>;
}

export enum SymbolKind {
    File = 0,
    Module = 1,
    Namespace = 2,
    Package = 3,
    Class = 4,
    Method = 5,
    Property = 6,
    Field = 7,
    Constructor = 8,
    Enum = 9,
    Interface = 10,
    Function = 11,
    Variable = 12,
    Constant = 13,
    String = 14,
    Number = 15,
    Boolean = 16,
    Array = 17,
    Object = 18,
    Key = 19,
    Null = 20,
    EnumMember = 21,
    Struct = 22,
    Event = 23,
    Operator = 24,
    TypeParameter = 25
}

export enum SymbolTag {
    Deprecated = 1
}

export interface DocumentSymbol {
    name: string;
    detail: string;
    kind: SymbolKind;
    tags: ReadonlyArray<SymbolTag>;
    containerName?: string;
    range: Range;
    selectionRange: Range;
    children?: DocumentSymbol[];
}

export interface WorkspaceRootsChangeEvent {
    roots: string[];
}

export interface WorkspaceFolder {
    uri: UriComponents;
    name: string;
    index: number;
}

export interface Breakpoint {
    readonly id: string;
    readonly enabled: boolean;
    readonly condition?: string;
    readonly hitCondition?: string;
    readonly logMessage?: string;
    readonly location?: Location;
    readonly functionName?: string;
}

export interface WorkspaceSymbolParams {
    query: string
}

export interface FoldingContext {
}

export interface FoldingRange {
    start: number;
    end: number;
    kind?: FoldingRangeKind;
}

export class FoldingRangeKind {
    static readonly Comment = new FoldingRangeKind('comment');
    static readonly Imports = new FoldingRangeKind('imports');
    static readonly Region = new FoldingRangeKind('region');
    public constructor(public value: string) { }
}

export interface SelectionRange {
    range: Range;
}

export interface Color {
    readonly red: number;
    readonly green: number;
    readonly blue: number;
    readonly alpha: number;
}

export interface ColorPresentation {
    label: string;
    textEdit?: TextEdit;
    additionalTextEdits?: TextEdit[];
}

export interface ColorInformation {
    range: Range;
    color: Color;
}

export interface DocumentColorProvider {
    provideDocumentColors(model: monaco.editor.ITextModel): PromiseLike<ColorInformation[]>;
    provideColorPresentations(model: monaco.editor.ITextModel, colorInfo: ColorInformation): PromiseLike<ColorPresentation[]>;
}

export interface Rejection {
    rejectReason?: string;
}

export interface RenameLocation {
    range: Range;
    text: string;
}

export class HierarchyItem {
    _sessionId?: string;
    _itemId?: string;

    kind: SymbolKind;
    tags?: readonly SymbolTag[];
    name: string;
    detail?: string;
    uri: UriComponents;
    range: Range;
    selectionRange: Range;
}

export class TypeHierarchyItem extends HierarchyItem { }

export interface CallHierarchyItem extends HierarchyItem {
    data?: unknown;
}

export interface CallHierarchyIncomingCall {
    from: CallHierarchyItem;
    fromRanges: Range[];
}

export interface CallHierarchyOutgoingCall {
    to: CallHierarchyItem;
    fromRanges: Range[];
}

export interface LinkedEditingRanges {
    ranges: Range[];
    wordPattern?: SerializedRegExp;
}

export interface SearchInWorkspaceResult {
    root: string;
    fileUri: string;
    matches: SearchMatch[];
}

export interface SearchMatch {
    line: number;
    character: number;
    length: number;
    lineText: string | LinePreview;

}
export interface LinePreview {
    text: string;
    character: number;
}

/**
 * @deprecated Use {@link theia.AuthenticationSession} instead.
 */
export interface AuthenticationSession extends theia.AuthenticationSession {
}

/**
 * @deprecated Use {@link theia.AuthenticationProviderAuthenticationSessionsChangeEvent} instead.
 */
export interface AuthenticationSessionsChangeEvent extends theia.AuthenticationProviderAuthenticationSessionsChangeEvent {
}

/**
 * @deprecated Use {@link theia.AuthenticationProviderInformation} instead.
 */
export interface AuthenticationProviderInformation extends theia.AuthenticationProviderInformation {
}

export interface CommentOptions {
    /**
     * An optional string to show on the comment input box when it's collapsed.
     */
    prompt?: string;

    /**
     * An optional string to show as placeholder in the comment input box when it's focused.
     */
    placeHolder?: string;
}

export enum CommentMode {
    Editing = 0,
    Preview = 1
}

export interface Comment {
    readonly uniqueIdInThread: number;
    readonly body: MarkdownStringDTO;
    readonly userName: string;
    readonly userIconPath?: string;
    readonly contextValue?: string;
    readonly label?: string;
    readonly mode?: CommentMode;
    /** Timestamp serialized as ISO date string via Date.prototype.toISOString */
    readonly timestamp?: string;
}

export enum CommentThreadState {
    Unresolved = 0,
    Resolved = 1
}

export enum CommentThreadCollapsibleState {
    /**
     * Determines an item is collapsed
     */
    Collapsed = 0,
    /**
     * Determines an item is expanded
     */
    Expanded = 1
}

export interface CommentInput {
    value: string;
    uri: URI;
}

export interface CommentThread {
    commentThreadHandle: number;
    controllerHandle: number;
    extensionId?: string;
    threadId: string;
    resource: string | null;
    range: Range;
    label: string | undefined;
    contextValue: string | undefined;
    comments: Comment[] | undefined;
    onDidChangeComments: TheiaEvent<Comment[] | undefined>;
    collapsibleState?: CommentThreadCollapsibleState;
    state?: CommentThreadState;
    input?: CommentInput;
    onDidChangeInput: TheiaEvent<CommentInput | undefined>;
    onDidChangeRange: TheiaEvent<Range>;
    onDidChangeLabel: TheiaEvent<string | undefined>;
    onDidChangeState: TheiaEvent<CommentThreadState | undefined>;
    onDidChangeCollapsibleState: TheiaEvent<CommentThreadCollapsibleState | undefined>;
    isDisposed: boolean;
    canReply: boolean;
    onDidChangeCanReply: TheiaEvent<boolean>;
}

export interface CommentThreadChangedEventMain extends CommentThreadChangedEvent {
    owner: string;
}

export interface CommentThreadChangedEvent {
    /**
     * Added comment threads.
     */
    readonly added: CommentThread[];

    /**
     * Removed comment threads.
     */
    readonly removed: CommentThread[];

    /**
     * Changed comment threads.
     */
    readonly changed: CommentThread[];
}

export interface CommentingRanges {
    readonly resource: URI;
    ranges: Range[];
}

export interface CommentInfo {
    extensionId?: string;
    threads: CommentThread[];
    commentingRanges: CommentingRanges;
}

export interface ProvidedTerminalLink extends theia.TerminalLink {
    providerId: string
}

export interface InlayHintLabelPart {
    label: string;
    tooltip?: string | MarkdownStringDTO;
    location?: Location;
    command?: Command;
}

export interface InlayHint {
    position: { lineNumber: number, column: number };
    label: string | InlayHintLabelPart[];
    tooltip?: string | MarkdownStringDTO | undefined;
    kind?: InlayHintKind;
    textEdits?: TextEdit[];
    paddingLeft?: boolean;
    paddingRight?: boolean;
}

export enum InlayHintKind {
    Type = 1,
    Parameter = 2,
}

export interface InlayHintsProvider {
    onDidChangeInlayHints?: TheiaEvent<void> | undefined;
    provideInlayHints(model: monaco.editor.ITextModel, range: Range, token: monaco.CancellationToken): InlayHint[] | undefined | Thenable<InlayHint[] | undefined>;
    resolveInlayHint?(hint: InlayHint, token: monaco.CancellationToken): InlayHint[] | undefined | Thenable<InlayHint[] | undefined>;
}

/**
 * How an {@link InlineCompletionsProvider inline completion provider} was triggered.
 */
export enum InlineCompletionTriggerKind {
    /**
     * Completion was triggered automatically while editing.
     * It is sufficient to return a single completion item in this case.
     */
    Automatic = 0,

    /**
     * Completion was triggered explicitly by a user gesture.
     * Return multiple completion items to enable cycling through them.
     */
    Explicit = 1,
}

export interface InlineCompletionContext {
    /**
     * How the completion was triggered.
     */
    readonly triggerKind: InlineCompletionTriggerKind;

    readonly selectedSuggestionInfo: SelectedSuggestionInfo | undefined;
}

export interface SelectedSuggestionInfo {
    range: Range;
    text: string;
    isSnippetText: boolean;
    completionKind: CompletionItemKind;
}

export interface InlineCompletion {
    /**
     * The text to insert.
     * If the text contains a line break, the range must end at the end of a line.
     * If existing text should be replaced, the existing text must be a prefix of the text to insert.
     *
     * The text can also be a snippet. In that case, a preview with default parameters is shown.
     * When accepting the suggestion, the full snippet is inserted.
     */
    readonly insertText: string | { snippet: string };

    /**
     * A text that is used to decide if this inline completion should be shown.
     * An inline completion is shown if the text to replace is a subword of the filter text.
     */
    readonly filterText?: string;

    /**
     * An optional array of additional text edits that are applied when
     * selecting this completion. Edits must not overlap with the main edit
     * nor with themselves.
     */
    readonly additionalTextEdits?: SingleEditOperation[];

    /**
     * The range to replace.
     * Must begin and end on the same line.
     */
    readonly range?: Range;

    readonly command?: Command;

    /**
     * If set to `true`, unopened closing brackets are removed and unclosed opening brackets are closed.
     * Defaults to `false`.
     */
    readonly completeBracketPairs?: boolean;
}

export interface InlineCompletions<TItem extends InlineCompletion = InlineCompletion> {
    readonly items: readonly TItem[];
}

export interface InlineCompletionsProvider<T extends InlineCompletions = InlineCompletions> {
    provideInlineCompletions(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        context: InlineCompletionContext,
        token: monaco.CancellationToken
    ): T[] | undefined | Thenable<T[] | undefined>;

    /**
     * Will be called when an item is shown.
     */
    handleItemDidShow?(completions: T, item: T['items'][number]): void;

    /**
     * Will be called when a completions list is no longer in use and can be garbage-collected.
     */
    freeInlineCompletions(completions: T): void;
}

export interface DebugStackFrameDTO {
    readonly sessionId: string,
    readonly frameId: number,
    readonly threadId: number
}

export interface DebugThreadDTO {
    readonly sessionId: string,
    readonly threadId: number
}
