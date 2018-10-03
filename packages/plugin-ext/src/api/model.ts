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

// Should contains internal Plugin API types

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

export interface DocumentLink {
    range: Range;
    url?: string;
}

export interface DocumentLinkProvider {
    provideLinks(model: monaco.editor.ITextModel, token: monaco.CancellationToken): DocumentLink[] | undefined | PromiseLike<DocumentLink[] | undefined>;
    resolveLink?: (link: DocumentLink, token: monaco.CancellationToken) => DocumentLink | PromiseLike<DocumentLink[]>;
}
