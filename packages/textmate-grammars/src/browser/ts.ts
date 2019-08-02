/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { LanguageGrammarDefinitionContribution, TextmateRegistry, GrammarDefinition } from '@theia/monaco/lib/browser/textmate';
import { MonacoSnippetSuggestProvider } from '@theia/monaco/lib/browser/monaco-snippet-suggest-provider';

@injectable()
export class TypescriptContribution implements LanguageGrammarDefinitionContribution {
    private readonly ts_id = 'typescript';
    private readonly ts_react_id = 'typescriptreact';

    @inject(MonacoSnippetSuggestProvider)
    protected readonly snippetSuggestProvider: MonacoSnippetSuggestProvider;

    registerTextmateLanguage(registry: TextmateRegistry): void {
        this.registerTypeScript();
        this.registerSnippets();
        const grammar = require('../../data/typescript.tmlanguage.json');
        registry.registerTextmateGrammarScope('source.ts', {
            async getGrammarDefinition(): Promise<GrammarDefinition> {
                return {
                    format: 'json',
                    content: grammar,
                };
            }
        });

        registry.mapLanguageIdToTextmateGrammar(this.ts_id, 'source.ts');
        registry.registerGrammarConfiguration(this.ts_id, {
            tokenTypes: {
                'entity.name.type.instance.jsdoc': 0,
                'entity.name.function.tagged-template': 0,
                'meta.import string.quoted': 0,
                'variable.other.jsdoc': 0
            }
        });

        const jsxGrammar = require('../../data/typescript.tsx.tmlanguage.json');
        registry.registerTextmateGrammarScope('source.tsx', {
            async getGrammarDefinition(): Promise<GrammarDefinition> {
                return {
                    format: 'json',
                    content: jsxGrammar,
                };
            }
        });

        registry.mapLanguageIdToTextmateGrammar(this.ts_react_id, 'source.tsx');
    }

    protected registerSnippets(): void {
        const snippets = require('../../data/snippets/typescript.json');
        this.snippetSuggestProvider.fromJSON(snippets, {
            language: [this.ts_id, this.ts_react_id],
            source: 'TypeScript Language'
        });
    }

    protected registerTypeScript(): void {
        monaco.languages.register({
            id: this.ts_id,
            aliases: [
                'TypeScript',
                'typescript',
                'ts'
            ],
            extensions: [
                '.ts'
            ],
            mimetypes: [
                'text/typescript'
            ]
        });

        monaco.languages.onLanguage(this.ts_id, () => {
            monaco.languages.setLanguageConfiguration(this.ts_id, this.configuration);
        });

        monaco.languages.register({
            id: this.ts_react_id,
            aliases: [
                'TypeScript React',
                'tsx'
            ],
            extensions: [
                '.tsx'
            ]
        });
        monaco.languages.onLanguage(this.ts_react_id, () => {
            monaco.languages.setLanguageConfiguration(this.ts_react_id, this.configuration);
        });
    }

    protected configuration: monaco.languages.LanguageConfiguration = {
        'comments': {
            'lineComment': '//',
            'blockComment': ['/*', '*/']
        },
        'brackets': [
            ['{', '}'],
            ['[', ']'],
            ['(', ')']
        ],
        'autoClosingPairs': [
            { 'open': '{', 'close': '}' },
            { 'open': '[', 'close': ']' },
            { 'open': '(', 'close': ')' },
            { 'open': "'", 'close': "'", 'notIn': ['string', 'comment'] },
            { 'open': '"', 'close': '"', 'notIn': ['string'] },
            { 'open': '`', 'close': '`', 'notIn': ['string', 'comment'] },
            { 'open': '/**', 'close': ' */', 'notIn': ['string'] }
        ],
        'surroundingPairs': [
            { 'open': '{', 'close': '}' },
            { 'open': '[', 'close': ']' },
            { 'open': '(', 'close': ')' },
            { 'open': "'", 'close': "'" },
            { 'open': '"', 'close': '"' },
            { 'open': '`', 'close': '`' }
        ],
        'folding': {
            'markers': {
                'start': new RegExp('^\\s*//\\s*#?region\\b'),
                'end': new RegExp('^\\s*//\\s*#?endregion\\b')
            }
        }
    };
}
