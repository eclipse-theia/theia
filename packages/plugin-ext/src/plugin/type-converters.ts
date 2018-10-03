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

import { EditorPosition, Selection, Position, DecorationOptions } from '../api/plugin-api';
import {
    Range,
    Hover,
    MarkdownString,
    CompletionType,
    SingleEditOperation,
    MarkerData,
    RelatedInformation,
    Location,
    DefinitionLink,
    DocumentLink
} from '../api/model';
import * as theia from '@theia/plugin';
import * as types from './types-impl';
import { LanguageSelector, LanguageFilter, RelativePattern } from './languages';

export function toViewColumn(ep?: EditorPosition): theia.ViewColumn | undefined {
    if (typeof ep !== 'number') {
        return undefined;
    }

    if (ep === EditorPosition.ONE) {
        return <number>types.ViewColumn.One;
    } else if (ep === EditorPosition.TWO) {
        return <number>types.ViewColumn.Two;
    } else if (ep === EditorPosition.THREE) {
        return <number>types.ViewColumn.Three;
    }

    return undefined;
}

export function toSelection(selection: Selection): types.Selection {
    const { selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn } = selection;
    const start = new types.Position(selectionStartLineNumber - 1, selectionStartColumn - 1);
    const end = new types.Position(positionLineNumber - 1, positionColumn - 1);
    return new types.Selection(start, end);
}

export function fromSelection(selection: types.Selection): Selection {
    const { active, anchor } = selection;
    return {
        selectionStartLineNumber: anchor.line + 1,
        selectionStartColumn: anchor.character + 1,
        positionLineNumber: active.line + 1,
        positionColumn: active.character + 1
    };
}

export function toRange(range: Range): types.Range {
    // if (!range) {
    //     return undefined;
    // }

    const { startLineNumber, startColumn, endLineNumber, endColumn } = range;
    return new types.Range(startLineNumber - 1, startColumn - 1, endLineNumber - 1, endColumn - 1);
}

export function fromRange(range: theia.Range | undefined): Range | undefined {
    if (!range) {
        return undefined;
    }
    const { start, end } = range;
    return {
        startLineNumber: start.line,
        startColumn: start.character + 1,
        endLineNumber: end.line,
        endColumn: end.character + 1
    };
}

// TODO make this primary converter, see https://github.com/theia-ide/theia/issues/2910
export function fromRange_(range: theia.Range | undefined): Range | undefined {
    if (!range) {
        return undefined;
    }
    const { start, end } = range;
    return {
        startLineNumber: start.line + 1,
        startColumn: start.character + 1,
        endLineNumber: end.line + 1,
        endColumn: end.character + 1
    };
}

export function fromPosition(position: types.Position): Position {
    return { lineNumber: position.line + 1, column: position.character + 1 };
}

export function toPosition(position: Position): types.Position {
    return new types.Position(position.lineNumber - 1, position.column - 1);
}

// tslint:disable-next-line:no-any
function isDecorationOptions(something: any): something is theia.DecorationOptions {
    return (typeof something.range !== 'undefined');
}

export function isDecorationOptionsArr(something: theia.Range[] | theia.DecorationOptions[]): something is theia.DecorationOptions[] {
    if (something.length === 0) {
        return true;
    }
    return isDecorationOptions(something[0]) ? true : false;
}

export function fromRangeOrRangeWithMessage(ranges: theia.Range[] | theia.DecorationOptions[]): DecorationOptions[] {

    if (isDecorationOptionsArr(ranges)) {
        return ranges.map(r => {
            let hoverMessage;
            if (Array.isArray(r.hoverMessage)) {
                hoverMessage = fromManyMarkdown(r.hoverMessage);
            } else if (r.hoverMessage) {
                hoverMessage = fromMarkdown(r.hoverMessage);
            } else {
                hoverMessage = undefined;
            }
            return {
                range: fromRange(r.range)!,
                hoverMessage: hoverMessage,
                // tslint:disable-next-line:no-any
                renderOptions: <any> /* URI vs Uri */r.renderOptions
            };
        });
    } else {
        return ranges.map((r): DecorationOptions =>
            ({
                range: fromRange(r)!
            }));
    }
}

export function fromManyMarkdown(markup: (theia.MarkdownString | theia.MarkedString)[]): MarkdownString[] {
    return markup.map(fromMarkdown);
}

interface Codeblock {
    language: string;
    value: string;
}

function isCodeblock(thing: any): thing is Codeblock {
    return thing && typeof thing === 'object'
        && typeof (<Codeblock>thing).language === 'string'
        && typeof (<Codeblock>thing).value === 'string';
}

// tslint:disable-next-line:no-any
export function isMarkdownString(thing: any): thing is MarkdownString {
    if (thing instanceof types.MarkdownString) {
        return true;
    } else if (thing && typeof thing === 'object') {
        return typeof (<MarkdownString>thing).value === 'string'
            && (typeof (<MarkdownString>thing).isTrusted === 'boolean' || (<MarkdownString>thing).isTrusted === void 0);
    }
    return false;
}

export function fromMarkdown(markup: theia.MarkdownString | theia.MarkedString): MarkdownString {
    if (isCodeblock(markup)) {
        const { language, value } = markup;
        return { value: '```' + language + '\n' + value + '\n```\n' };
    } else if (isMarkdownString(markup)) {
        return markup;
    } else if (typeof markup === 'string') {
        return { value: <string>markup };
    } else {
        return { value: '' };
    }
}

export function fromDocumentSelector(selector: theia.DocumentSelector | undefined): LanguageSelector | undefined {
    if (!selector) {
        return undefined;
    } else if (Array.isArray(selector)) {
        return <LanguageSelector>selector.map(fromDocumentSelector);
    } else if (typeof selector === 'string') {
        return selector;
    } else {
        return {
            language: selector.language,
            scheme: selector.scheme,
            pattern: fromGlobPattern(selector.pattern!)
        } as LanguageFilter;
    }

}

export function fromGlobPattern(pattern: theia.GlobPattern): string | RelativePattern {
    if (typeof pattern === 'string') {
        return pattern;
    }

    if (isRelativePattern(pattern)) {
        return new types.RelativePattern(pattern.base, pattern.pattern);
    }

    return pattern;
}

function isRelativePattern(obj: {}): obj is theia.RelativePattern {
    const rp = obj as theia.RelativePattern;
    return rp && typeof rp.base === 'string' && typeof rp.pattern === 'string';
}

export function fromCompletionItemKind(kind?: types.CompletionItemKind): CompletionType {
    switch (kind) {
        case types.CompletionItemKind.Method: return 'method';
        case types.CompletionItemKind.Function: return 'function';
        case types.CompletionItemKind.Constructor: return 'constructor';
        case types.CompletionItemKind.Field: return 'field';
        case types.CompletionItemKind.Variable: return 'variable';
        case types.CompletionItemKind.Class: return 'class';
        case types.CompletionItemKind.Interface: return 'interface';
        case types.CompletionItemKind.Struct: return 'struct';
        case types.CompletionItemKind.Module: return 'module';
        case types.CompletionItemKind.Property: return 'property';
        case types.CompletionItemKind.Unit: return 'unit';
        case types.CompletionItemKind.Value: return 'value';
        case types.CompletionItemKind.Constant: return 'constant';
        case types.CompletionItemKind.Enum: return 'enum';
        case types.CompletionItemKind.EnumMember: return 'enum-member';
        case types.CompletionItemKind.Keyword: return 'keyword';
        case types.CompletionItemKind.Snippet: return 'snippet';
        case types.CompletionItemKind.Text: return 'text';
        case types.CompletionItemKind.Color: return 'color';
        case types.CompletionItemKind.File: return 'file';
        case types.CompletionItemKind.Reference: return 'reference';
        case types.CompletionItemKind.Folder: return 'folder';
        case types.CompletionItemKind.Event: return 'event';
        case types.CompletionItemKind.Operator: return 'operator';
        case types.CompletionItemKind.TypeParameter: return 'type-parameter';
    }
    return 'property';
}

export function toCompletionItemKind(type?: CompletionType): types.CompletionItemKind {
    if (type) {
        switch (type) {
            case 'method': return types.CompletionItemKind.Method;
            case 'function': return types.CompletionItemKind.Function;
            case 'constructor': return types.CompletionItemKind.Constructor;
            case 'field': return types.CompletionItemKind.Field;
            case 'variable': return types.CompletionItemKind.Variable;
            case 'class': return types.CompletionItemKind.Class;
            case 'interface': return types.CompletionItemKind.Interface;
            case 'struct': return types.CompletionItemKind.Struct;
            case 'module': return types.CompletionItemKind.Module;
            case 'property': return types.CompletionItemKind.Property;
            case 'unit': return types.CompletionItemKind.Unit;
            case 'value': return types.CompletionItemKind.Value;
            case 'constant': return types.CompletionItemKind.Constant;
            case 'enum': return types.CompletionItemKind.Enum;
            case 'enum-member': return types.CompletionItemKind.EnumMember;
            case 'keyword': return types.CompletionItemKind.Keyword;
            case 'snippet': return types.CompletionItemKind.Snippet;
            case 'text': return types.CompletionItemKind.Text;
            case 'color': return types.CompletionItemKind.Color;
            case 'file': return types.CompletionItemKind.File;
            case 'reference': return types.CompletionItemKind.Reference;
            case 'folder': return types.CompletionItemKind.Folder;
            case 'event': return types.CompletionItemKind.Event;
            case 'operator': return types.CompletionItemKind.Operator;
            case 'type-parameter': return types.CompletionItemKind.TypeParameter;
        }
    }
    return types.CompletionItemKind.Property;
}

export function fromTextEdit(edit: theia.TextEdit): SingleEditOperation {
    return <SingleEditOperation>{
        text: edit.newText,
        range: fromRange_(edit.range)
    };
}

export function fromLanguageSelector(selector: theia.DocumentSelector): LanguageSelector | undefined {
    if (!selector) {
        return undefined;
    } else if (Array.isArray(selector)) {
        return <LanguageSelector>selector.map(fromLanguageSelector);
    } else if (typeof selector === 'string') {
        return selector;
    } else {
        return <LanguageFilter>{
            language: selector.language,
            scheme: selector.scheme,
            pattern: fromGlobPattern(selector.pattern!)
        };
    }
}

export function convertDiagnosticToMarkerData(diagnostic: theia.Diagnostic): MarkerData {
    return {
        code: convertCode(diagnostic.code),
        severity: convertSeverity(diagnostic.severity),
        message: diagnostic.message,
        source: diagnostic.source,
        startLineNumber: diagnostic.range.start.line + 1,
        startColumn: diagnostic.range.start.character + 1,
        endLineNumber: diagnostic.range.end.line + 1,
        endColumn: diagnostic.range.end.character + 1,
        relatedInformation: convertRelatedInformation(diagnostic.relatedInformation),
        tags: convertTags(diagnostic.tags)
    };
}

function convertCode(code: string | number | undefined): string | undefined {
    if (typeof code === 'number') {
        return String(code);
    } else {
        return code;
    }
}

function convertSeverity(severity: types.DiagnosticSeverity): types.MarkerSeverity {
    switch (severity) {
        case types.DiagnosticSeverity.Error: return types.MarkerSeverity.Error;
        case types.DiagnosticSeverity.Warning: return types.MarkerSeverity.Warning;
        case types.DiagnosticSeverity.Information: return types.MarkerSeverity.Info;
        case types.DiagnosticSeverity.Hint: return types.MarkerSeverity.Hint;
    }
}

function convertRelatedInformation(diagnosticsRelatedInformation: theia.DiagnosticRelatedInformation[] | undefined): RelatedInformation[] | undefined {
    if (!diagnosticsRelatedInformation) {
        return undefined;
    }

    const relatedInformation: RelatedInformation[] = [];
    for (const item of diagnosticsRelatedInformation) {
        relatedInformation.push({
            resource: item.location.uri,
            message: item.message,
            startLineNumber: item.location.range.start.line + 1,
            startColumn: item.location.range.start.character + 1,
            endLineNumber: item.location.range.end.line + 1,
            endColumn: item.location.range.end.character + 1
        });
    }
    return relatedInformation;
}

function convertTags(tags: types.DiagnosticTag[] | undefined): types.MarkerTag[] | undefined {
    if (!tags) {
        return undefined;
    }

    const markerTags: types.MarkerTag[] = [];
    for (const tag of tags) {
        switch (tag) {
            case types.DiagnosticTag.Unnecessary: markerTags.push(types.MarkerTag.Unnecessary);
        }
    }
    return markerTags;
}

export function fromHover(hover: theia.Hover): Hover {
    return <Hover>{
        range: fromRange(hover.range),
        contents: fromManyMarkdown(hover.contents)
    };
}

export function fromLocation(location: theia.Location): Location {
    return <Location>{
        uri: location.uri,
        range: fromRange_(location.range)
    };
}

export function fromDefinitionLink(definitionLink: theia.DefinitionLink): DefinitionLink {
    return <DefinitionLink>{
        uri: definitionLink.targetUri,
        range: fromRange_(definitionLink.targetRange),
        origin: definitionLink.originSelectionRange ? fromRange_(definitionLink.originSelectionRange) : undefined,
        selectionRange: definitionLink.targetSelectionRange ? fromRange_(definitionLink.targetSelectionRange) : undefined
    };
}

export function fromDocumentLink(definitionLink: theia.DocumentLink): DocumentLink {
    return <DocumentLink>{
        range: fromRange_(definitionLink.range),
        url: definitionLink.target && definitionLink.target.toString()
    };
}
