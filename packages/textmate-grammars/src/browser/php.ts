/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { LanguageGrammarDefinitionContribution, TextmateRegistry, GrammarDefinition } from '@theia/monaco/lib/browser/textmate';
import { injectable, inject } from 'inversify';
import { MonacoSnippetSuggestProvider } from '@theia/monaco/lib/browser/monaco-snippet-suggest-provider';

@injectable()
export class PhpGrammarContribution implements LanguageGrammarDefinitionContribution {
    readonly id = 'php';
    readonly scopeName = 'source.php';

    @inject(MonacoSnippetSuggestProvider)
    protected readonly snippetSuggestProvider: MonacoSnippetSuggestProvider;

    readonly config: monaco.languages.LanguageConfiguration = {
        comments: {
            lineComment: '//', // '#'
            blockComment: ['/*', '*/']
        },
        brackets: [
            ['{', '}'],
            ['[', ']'],
            ['(', ')']
        ],
        autoClosingPairs: [
            { open: '{', close: '}', notIn: ['string'] },
            { open: '[', close: ']', notIn: ['string'] },
            { open: '(', close: ')', notIn: ['string'] },
            { open: '\'', close: '\'', notIn: ['string', 'comment'] },
            { open: '"', close: '"', notIn: ['string', 'comment'] },
            { open: '/**', close: ' */', notIn: ['string'] }
        ],
        surroundingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '\'', close: '\'' },
            { open: '"', close: '"' },
            { open: '`', close: '`' }

        ],
        indentationRules: {
            increaseIndentPattern: new RegExp('({(?!.+}).*|\\(|\\[|((else(\\s)?)?if|else|for(each)?|while|switch).*:)\\s*(/[/*].*)?$'),
            decreaseIndentPattern: new RegExp('^(.*\\*\\/)?\\s*((\\})|(\\)+[;,])|(\\][;,])|\\b(else:)|\\b((end(if|for(each)?|while|switch));))')
        },
        folding: {
            markers: {
                start: /\\s*(#|\/\/)region\\b/,
                end: /^\\s*(#|\/\/)endregion\\b/
            }
        }
    };

    registerTextmateLanguage(registry: TextmateRegistry): void {
        monaco.languages.register({
            id: this.id,
            'extensions': [
                '.php',
                '.php4',
                '.php5',
                '.phtml',
                '.ctp'
            ],
            'aliases': [
                'PHP',
                'php'
            ],
            'firstLine': '^#!\\s*/.*\\bphp\\b',
            'mimetypes': [
                'application/x-php'
            ]
        });

        monaco.languages.setLanguageConfiguration(this.id, this.config);

        const snippets = require('../../data/snippets/php.snippets.json');
        this.snippetSuggestProvider.fromJSON(snippets, {
            language: [this.id],
            source: 'PHP Language'
        });

        const phpGrammar = require('../../data/php.tmLanguage.json');
        registry.registerTextmateGrammarScope(this.scopeName, {
            async getGrammarDefinition(): Promise<GrammarDefinition> {
                return {
                    format: 'json',
                    content: phpGrammar
                };
            }
        });

        registry.mapLanguageIdToTextmateGrammar(this.id, this.scopeName);
    }
}
