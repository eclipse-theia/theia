/*
 * Copyright (C) 2018 David Craven and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// https://github.com/rust-lang-nursery/rls-vscode/blob/master/language-configuration.json
// https://github.com/rust-lang-nursery/rls-vscode/blob/master/src/extension.ts
export const configuration: monaco.languages.LanguageConfiguration = {
    comments: {
        lineComment: '//',
        blockComment: ['/*', '*/']
    },
    brackets: [['{', '}'], ['[', ']'], ['(', ')'], ['<', '>']],
    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '\"', close: '\"', notIn: ['string'] },
        { open: '/**', close: ' */', notIn: ['string'] },
        { open: '/*!', close: ' */', notIn: ['string'] }
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '<', close: '>' },
        { open: "'", close: "'" },
        { open: '"', close: '"' }
    ],
    onEnterRules: [
        {
            // Doc single-line comment
            // e.g. ///|
            beforeText: /^\s*\/{3}.*$/,
            action: {
                indentAction: monaco.languages.IndentAction.None,
                appendText: '/// '
            },
        },
        {
            // Parent doc single-line comment
            // e.g. //!|
            beforeText: /^\s*\/{2}\!.*$/,
            action: {
                indentAction: monaco.languages.IndentAction.None,
                appendText: '//! '
            },
        },
        {
            // Begins an auto-closed multi-line comment (standard or parent doc)
            // e.g. /** | */ or /*! | */
            beforeText: /^\s*\/\*(\*|\!)(?!\/)([^\*]|\*(?!\/))*$/,
            afterText: /^\s*\*\/$/,
            action: {
                indentAction: monaco.languages.IndentAction.IndentOutdent,
                appendText: ' * '
            }
        },
        {
            // Begins a multi-line comment (standard or parent doc)
            // e.g. /** ...| or /*! ...|
            beforeText: /^\s*\/\*(\*|\!)(?!\/)([^\*]|\*(?!\/))*$/,
            action: {
                indentAction: monaco.languages.IndentAction.None,
                appendText: ' * '
            }
        },
        {
            // Continues a multi-line comment
            // e.g.  * ...|
            beforeText: /^(\ \ )*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
            action: {
                indentAction: monaco.languages.IndentAction.None,
                appendText: '* '
            }
        },
        {
            // Dedents after closing a multi-line comment
            // e.g.  */|
            beforeText: /^(\ \ )*\ \*\/\s*$/,
            action: {
                indentAction: monaco.languages.IndentAction.None,
                removeText: 1
            }
        }
    ]
};

// Waiting on textmate support in theia-ide
// https://github.com/Microsoft/vscode/blob/master/extensions/rust/syntaxes/rust.tmLanguage.json
export const monarchLanguage = <monaco.languages.IMonarchLanguage>{
    defaultToken: '',
    tokenPostfix: '.rust',

    keywords: [
        'as', 'break', 'const', 'continue', 'crate', 'else', 'enum', 'extern',
        'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod',
        'move', 'mut', 'pub', 'ref', 'return', 'Self', 'self', 'static',
        'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where',
        'while',
        // Reserved for future use
        'abstract', 'alignof', 'become', 'box', 'do', 'final', 'macro',
        'offsetof', 'override', 'priv', 'proc', 'pure', 'sizeof', 'typeof',
        'unsized', 'virtual', 'yield'
    ],

    operators: [
        '!', '!=', '%', '%=', '&', '&=', '&&', '*', '*=', '+', '+=', ',',
        '-', '-=', '->', '.', '..', '...', '/', '/=', ':', ';', '<<', '<<=',
        '<', '<=', '==', '=>', '>', '>>', '>>=', '@', '^', '^=', '|', '|=',
        '||', '?'
    ],

    // we include these common regular expressions
    symbols: /[=><!~?:&|+\-*\/\^%@]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    digits: /\d+(_+\d+)*/,
    octaldigits: /[0-7]+(_+[0-7]+)*/,
    binarydigits: /[0-1]+(_+[0-1]+)*/,
    hexdigits: /[[0-9a-fA-F]+(_+[0-9a-fA-F]+)*/,

    // The main tokenizer for our languages
    tokenizer: {
        root: [
            // identifiers and keywords
            [/[a-zA-Z_$][\w$]*/, {
                cases: {
                    '@keywords': { token: 'keyword.$0' },
                    '@default': 'identifier'
                }
            }],

            // whitespace
            { include: '@whitespace' },

            // delimiters and operators
            [/[{}()\[\]]/, '@brackets'],
            [/[<>](?!@symbols)/, '@brackets'],
            [/@symbols/, {
                cases: {
                    '@operators': 'delimiter',
                    '@default': ''
                }
            }],

            // @ annotations.
            [/@\s*[a-zA-Z_\$][\w\$]*/, 'annotation'],

            // numbers
            [/(@digits)[eE]([\-+]?(@digits))?[fFdD]?/, 'number.float'],
            [/(@digits)\.(@digits)([eE][\-+]?(@digits))?[fFdD]?/, 'number.float'],
            [/0[xX](@hexdigits)[Ll]?/, 'number.hex'],
            [/0(@octaldigits)[Ll]?/, 'number.octal'],
            [/0[bB](@binarydigits)[Ll]?/, 'number.binary'],
            [/(@digits)[fFdD]/, 'number.float'],
            [/(@digits)[lL]?/, 'number'],

            // delimiter: after number because of .\d floats
            [/[;,.]/, 'delimiter'],

            // strings
            [/"([^"\\]|\\.)*$/, 'string.invalid'],  // non-teminated string
            [/"/, 'string', '@string'],

            // characters
            [/'[^\\']'/, 'string'],
            [/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
            [/'/, 'string.invalid']
        ],

        whitespace: [
            [/[ \t\r\n]+/, ''],
            [/\/\*/, 'comment', '@comment'],
            [/\/\/.*$/, 'comment'],
        ],
        comment: [
            [/[^\/*]+/, 'comment'],
            [/\*\//, 'comment', '@pop'],
            [/[\/*]/, 'comment']
        ],

        string: [
            [/[^\\"]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/"/, 'string', '@pop']
        ],
    },
};
