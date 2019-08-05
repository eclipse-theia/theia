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
import { injectable } from 'inversify';

const EMPTY_ELEMENTS: string[] = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'menuitem', 'meta', 'param', 'source', 'track', 'wbr'];

@injectable()
export class HtmlContribution implements LanguageGrammarDefinitionContribution {

    readonly id = 'html';
    readonly scopeName = 'text.html.basic';

    registerTextmateLanguage(registry: TextmateRegistry): void {
        monaco.languages.register({
            id: this.id,
            extensions: ['.html', '.htm', '.shtml', '.xhtml', '.mdoc', '.jsp', '.asp', '.aspx', '.jshtm'],
            aliases: ['HTML', 'htm', 'html', 'xhtml'],
            mimetypes: ['text/html', 'text/x-jshtm', 'text/template', 'text/ng-template'],
        });
        monaco.languages.setLanguageConfiguration(this.id, {
            wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/g,

            comments: {
                blockComment: ['<!--', '-->']
            },

            brackets: [
                ['<!--', '-->'],
                ['<', '>'],
                ['{', '}'],
                ['(', ')']
            ],

            autoClosingPairs: [
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '"', close: '"' },
                { open: '\'', close: '\'' }
            ],

            surroundingPairs: [
                { open: '"', close: '"' },
                { open: '\'', close: '\'' },
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '<', close: '>' },
            ],

            onEnterRules: [
                {
                    beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))([_:\\w][_:\\w-.\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
                    afterText: /^<\/([_:\w][_:\w-.\d]*)\s*>$/i,
                    action: { indentAction: monaco.languages.IndentAction.IndentOutdent }
                },
                {
                    beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
                    action: { indentAction: monaco.languages.IndentAction.Indent }
                }
            ],

            folding: {
                markers: {
                    start: new RegExp('^\\s*<!--\\s*#region\\b.*-->'),
                    end: new RegExp('^\\s*<!--\\s*#endregion\\b.*-->')
                }
            }
        });

        const grammar = require('../../data/html.tmLanguage.json');
        registry.registerTextmateGrammarScope(this.scopeName, {
            async getGrammarDefinition(): Promise<GrammarDefinition> {
                return {
                    format: 'json',
                    content: grammar
                };
            }
        });
        registry.mapLanguageIdToTextmateGrammar(this.id, this.scopeName);
    }
}
