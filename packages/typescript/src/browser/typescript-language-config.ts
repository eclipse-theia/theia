/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// some parts are copied from https://github.com/Microsoft/monaco-typescript/blob/v2.3.0/src/mode.ts

import { TYPESCRIPT_LANGUAGE_ID, TYPESCRIPT_LANGUAGE_NAME, JAVASCRIPT_LANGUAGE_ID, JAVASCRIPT_LANGUAGE_NAME } from "../common";
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
        aliases: [TYPESCRIPT_LANGUAGE_NAME, 'ts', 'typescript'],
        mimetypes: ['text/typescript']
    });
    monaco.languages.onLanguage(TYPESCRIPT_LANGUAGE_ID, () => {
        monaco.languages.setLanguageConfiguration(TYPESCRIPT_LANGUAGE_ID, genericEditConfiguration);
        monaco.languages.setTokensProvider(TYPESCRIPT_LANGUAGE_ID, createTokenizationSupport(Language.TypeScript));
    });
}

export function registerJavaScript() {
    monaco.languages.register({
        id: JAVASCRIPT_LANGUAGE_ID,
        extensions: ['.js', '.jsx'],
        aliases: [JAVASCRIPT_LANGUAGE_NAME, 'js', 'javascript'],
        mimetypes: ['text/javascript']
    });
    monaco.languages.onLanguage(JAVASCRIPT_LANGUAGE_ID, () => {
        monaco.languages.setLanguageConfiguration(JAVASCRIPT_LANGUAGE_ID, genericEditConfiguration);
        monaco.languages.setTokensProvider(JAVASCRIPT_LANGUAGE_ID, createTokenizationSupport(Language.EcmaScript5));
    });
}
