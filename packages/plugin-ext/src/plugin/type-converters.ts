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

import { EditorPosition, Selection, Range, Position, DecorationOptions, MarkdownString } from "../api/plugin-api";
import * as theia from '@theia/plugin';
import * as types from './types-impl';

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

export function fromRange(range: theia.Range): Range | undefined {
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
