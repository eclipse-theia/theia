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

@injectable()
export class HandlebarsContribution implements LanguageGrammarDefinitionContribution {

    readonly id = 'handlebars';
    readonly scopeName = 'text.html.handlebars';

    registerTextmateLanguage(registry: TextmateRegistry): void {
        monaco.languages.register({
            id: this.id,
            extensions: ['.handlebars', '.hbs', '.hjs'],
            aliases: ['Handlebars', 'handlebars'],
            mimetypes: ['text/x-handlebars-template']
        });
        monaco.languages.setLanguageConfiguration(this.id, {
            comments: {
                blockComment: ['{{!--', '--}}']
            },
            brackets: [
                ['<!--', '-->'],
                ['<', '>'],
                ['{{', '}}'],
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
                { open: '<', close: '>' },
                { open: '"', close: '"' },
                { open: '\'', close: '\'' }
            ]
        });
        const grammar = require('../../data/handlebars.tmLanguage.json');
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
