/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// some parts are copied from https://github.com/Microsoft/monaco-typescript/blob/v2.3.0/src/mode.ts


import { TYPESCRIPT_LANGUAGE_ID } from "../common";
import { createTokenizationSupport, Language } from "./monaco-tokenization/tokenization";

const genericEditConfiguration: monaco.languages.LanguageConfiguration = {
    wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
    comments: {
        lineComment: '//',
        blockComment: ['/*', '*/']
    },

    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')']
    ],

    onEnterRules: [
        {
            // e.g. /** | */
            beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
            afterText: /^\s*\*\/$/,
            action: { indentAction: monaco.languages.IndentAction.IndentOutdent, appendText: ' * ' }
        },
        {
            // e.g. /** ...|
            beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
            action: { indentAction: monaco.languages.IndentAction.None, appendText: ' * ' }
        },
        {
            // e.g.  * ...|
            beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
            action: { indentAction: monaco.languages.IndentAction.None, appendText: '* ' }
        },
        {
            // e.g.  */|
            beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
            action: { indentAction: monaco.languages.IndentAction.None, removeText: 1 }
        }
    ],

    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"', notIn: ['string'] },
        { open: '\'', close: '\'', notIn: ['string', 'comment'] },
        { open: '`', close: '`', notIn: ['string', 'comment'] },
        { open: "/**", close: " */", notIn: ["string"] }
    ]
};

export function registerTypeScript() {
    monaco.languages.register({
        id: TYPESCRIPT_LANGUAGE_ID,
        extensions: ['.ts', '.tsx'],
        aliases: ['TypeScript', 'ts', 'typescript'],
        mimetypes: ['text/typescript']
    });

    monaco.languages.setLanguageConfiguration(TYPESCRIPT_LANGUAGE_ID, genericEditConfiguration);
    monaco.languages.setTokensProvider(TYPESCRIPT_LANGUAGE_ID, createTokenizationSupport(Language.TypeScript));
}
