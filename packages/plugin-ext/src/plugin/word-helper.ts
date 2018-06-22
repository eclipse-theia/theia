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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Word inside a model.
 */
export interface WordAtPosition {
    /**
     * The word.
     */
    readonly word: string;
    /**
     * The column where the word starts.
     */
    readonly startColumn: number;
    /**
     * The column where the word ends.
     */
    readonly endColumn: number;
}

export const USUAL_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?';

/**
 * Create a word definition regular expression based on default word separators.
 * Optionally provide allowed separators that should be included in words.
 *
 * The default would look like this:
 * /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
 */
function createWordRegExp(allowInWords: string = ''): RegExp {
    let source = '(-?\\d*\\.\\d\\w*)|([^';
    for (let i = 0; i < USUAL_WORD_SEPARATORS.length; i++) {
        if (allowInWords.indexOf(USUAL_WORD_SEPARATORS[i]) >= 0) {
            continue;
        }
        source += '\\' + USUAL_WORD_SEPARATORS[i];
    }
    source += '\\s]+)';
    return new RegExp(source, 'g');
}

// catches numbers (including floating numbers) in the first group, and alphanum in the second
export const DEFAULT_WORD_REGEXP = createWordRegExp();

export function ensureValidWordDefinition(wordDefinition?: RegExp): RegExp {
    let result: RegExp = DEFAULT_WORD_REGEXP;

    if (wordDefinition && (wordDefinition instanceof RegExp)) {
        if (!wordDefinition.global) {
            let flags = 'g';
            if (wordDefinition.ignoreCase) {
                flags += 'i';
            }
            if (wordDefinition.multiline) {
                flags += 'm';
            }
            result = new RegExp(wordDefinition.source, flags);
        } else {
            result = wordDefinition;
        }
    }

    result.lastIndex = 0;

    return result;
}

function getWordAtPosFast(column: number, wordDefinition: RegExp, text: string, textOffset: number): WordAtPosition | undefined {
    // find whitespace enclosed text around column and match from there

    const pos = column - 1 - textOffset;
    const start = text.lastIndexOf(' ', pos - 1) + 1;
    let end = text.indexOf(' ', pos);
    if (end === -1) {
        end = text.length;
    }

    wordDefinition.lastIndex = start;
    let match: RegExpMatchArray | null;
    while (match = wordDefinition.exec(text)) {
        if (match.index! <= pos && wordDefinition.lastIndex >= pos) {
            return {
                word: match[0],
                startColumn: textOffset + 1 + match.index!,
                endColumn: textOffset + 1 + wordDefinition.lastIndex
            };
        }
    }

    return undefined;
}

function getWordAtPosSlow(column: number, wordDefinition: RegExp, text: string, textOffset: number): WordAtPosition | undefined {
    // matches all words starting at the beginning
    // of the input until it finds a match that encloses
    // the desired column. slow but correct

    const pos = column - 1 - textOffset;
    wordDefinition.lastIndex = 0;

    let match: RegExpMatchArray | null;
    while (match = wordDefinition.exec(text)) {

        if (match.index! > pos) {
            // |nW -> matched only after the pos
            return undefined;

        } else if (wordDefinition.lastIndex >= pos) {
            // W|W -> match encloses pos
            return {
                word: match[0],
                startColumn: textOffset + 1 + match.index!,
                endColumn: textOffset + 1 + wordDefinition.lastIndex
            };
        }
    }

    return undefined;
}

export function getWordAtText(column: number, wordDefinition: RegExp, text: string, textOffset: number): WordAtPosition | undefined {

    // if `words` can contain whitespace character we have to use the slow variant
    // otherwise we use the fast variant of finding a word
    wordDefinition.lastIndex = 0;
    const match = wordDefinition.exec(text);
    if (!match) {
        return undefined;
    }
    // todo@joh the `match` could already be the (first) word
    const ret = match[0].indexOf(' ') >= 0
        // did match a word which contains a space character -> use slow word find
        ? getWordAtPosSlow(column, wordDefinition, text, textOffset)
        // sane word definition -> use fast word find
        : getWordAtPosFast(column, wordDefinition, text, textOffset);

    // both (getWordAtPosFast and getWordAtPosSlow) leave the wordDefinition-RegExp
    // in an undefined state and to not confuse other users of the wordDefinition
    // we reset the lastIndex
    wordDefinition.lastIndex = 0;

    return ret;
}
