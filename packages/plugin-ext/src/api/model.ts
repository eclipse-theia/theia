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
import { UriComponents } from '../common/uri-components';
import { FileStat } from '@theia/filesystem/lib/common';

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

export interface MarkdownString {
    value: string;
    isTrusted?: boolean;
}

export interface SerializedDocumentFilter {
    $serialized: true;
    language?: string;
    scheme?: string;
    pattern?: theia.GlobPattern;
}

export interface FileWatcherSubscriberOptions {
    globPattern: theia.GlobPattern;
    ignoreCreateEvents?: boolean;
    ignoreChangeEvents?: boolean;
    ignoreDeleteEvents?: boolean;
}

export interface FileChangeEvent {
    subscriberId: string,
    uri: UriComponents,
    type: FileChangeEventType
}

export type FileChangeEventType = 'created' | 'updated' | 'deleted';

export enum CompletionTriggerKind {
    Invoke = 0,
    TriggerCharacter = 1,
    TriggerForIncompleteCompletions = 2
}

export interface CompletionContext {
    triggerKind: CompletionTriggerKind;
    triggerCharacter?: string;
}

export interface Completion {
    label: string;
    insertText: string;
    type: CompletionType;
    detail?: string;
    documentation?: string | MarkdownString;
    filterText?: string;
    sortText?: string;
    preselect?: boolean;
    noAutoAccept?: boolean;
    commitCharacters?: string[];
    overwriteBefore?: number;
    overwriteAfter?: number;
    additionalTextEdits?: SingleEditOperation[];
    command?: Command;
    snippetType?: SnippetType;
}
export interface SingleEditOperation {
    range: Range;
    text: string;
    /**
     * This indicates that this operation has "insert" semantics.
     * i.e. forceMoveMarkers = true => if `range` is collapsed, all markers at the position will be moved.
     */
    forceMoveMarkers?: boolean;
}

export type SnippetType = 'internal' | 'textmate';

export interface Command {
    id: string;
    title: string;
    tooltip?: string;
    // tslint:disable-next-line:no-any
    arguments?: any[];
}

export type CompletionType = 'method'
    | 'function'
    | 'constructor'
    | 'field'
    | 'variable'
    | 'class'
    | 'struct'
    | 'interface'
    | 'module'
    | 'property'
    | 'event'
    | 'operator'
    | 'unit'
    | 'value'
    | 'constant'
    | 'enum'
    | 'enum-member'
    | 'keyword'
    | 'snippet'
    | 'text'
    | 'color'
    | 'file'
    | 'reference'
    | 'customcolor'
    | 'folder'
    | 'type-parameter';

export class IdObject {
    id?: number;
}
export interface CompletionDto extends Completion {
    id: number;
    parentId: number;
}

export interface CompletionResultDto extends IdObject {
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
    resource: UriComponents;
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
}

export interface ParameterInformation {
    label: string;
    documentation?: string | MarkdownString;
}

export interface SignatureInformation {
    label: string;
    documentation?: string | MarkdownString;
    parameters: ParameterInformation[];
}

export interface SignatureHelp {
    signatures: SignatureInformation[];
    activeSignature: number;
    activeParameter: number;
}

export interface Hover {
    contents: MarkdownString[];
    range?: Range;
}

export interface HoverProvider {
    provideHover(model: monaco.editor.ITextModel, position: monaco.Position, token: monaco.CancellationToken): Hover | undefined | Thenable<Hover | undefined>;
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
    text?: string;
    eol?: monaco.editor.EndOfLineSequence;
}

export interface Location {
    uri: UriComponents;
    range: Range;
}

export type Definition = Location | Location[];

export interface DefinitionLink {
    uri: UriComponents;
    range: Range;
    origin?: Range;
    selectionRange?: Range;
}

export interface DefinitionProvider {
    provideDefinition(model: monaco.editor.ITextModel, position: monaco.Position, token: monaco.CancellationToken): Definition | DefinitionLink[] | undefined;
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

export interface DocumentLink {
    range: Range;
    url?: string;
}

export interface DocumentLinkProvider {
    provideLinks(model: monaco.editor.ITextModel, token: monaco.CancellationToken): DocumentLink[] | undefined | PromiseLike<DocumentLink[] | undefined>;
    resolveLink?: (link: DocumentLink, token: monaco.CancellationToken) => DocumentLink | PromiseLike<DocumentLink[]>;
}

export interface CodeLensSymbol {
    range: Range;
    id?: string;
    command?: Command;
}

export interface CodeAction {
    title: string;
    command?: Command;
    edit?: WorkspaceEdit;
    diagnostics?: MarkerData[];
    kind?: string;
}

export enum CodeActionTrigger {
    Automatic = 1,
    Manual = 2,
}

export interface CodeActionContext {
    only?: string;
    trigger: CodeActionTrigger;
}

export interface CodeActionProvider {
    provideCodeActions(
        model: monaco.editor.ITextModel,
        range: Range | Selection,
        context: monaco.languages.CodeActionContext,
        token: monaco.CancellationToken
    ): CodeAction[] | PromiseLike<CodeAction[]>;

    providedCodeActionKinds?: string[];
}

export interface ResourceFileEdit {
    oldUri: UriComponents;
    newUri: UriComponents;
    options: { overwrite?: boolean, ignoreIfNotExists?: boolean, ignoreIfExists?: boolean, recursive?: boolean };
}

export interface ResourceTextEdit {
    resource: UriComponents;
    modelVersionId?: number;
    edits: TextEdit[];
}

export interface WorkspaceEdit {
    edits: Array<ResourceTextEdit | ResourceFileEdit>;
    rejectReason?: string;
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

export interface DocumentSymbol {
    name: string;
    detail: string;
    kind: SymbolKind;
    containerName?: string;
    range: Range;
    selectionRange: Range;
    children?: DocumentSymbol[];
}

export interface WorkspaceRootsChangeEvent {
    roots: FileStat[];
}

export interface WorkspaceFolder {
    uri: UriComponents;
    name: string;
    index: number;
}

export interface Breakpoint {
    readonly enabled: boolean;
    readonly condition?: string;
    readonly hitCondition?: string;
    readonly logMessage?: string;
    readonly location?: Location;
    readonly functionName?: string;
}
