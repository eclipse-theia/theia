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
export class FSharpContribution implements LanguageGrammarDefinitionContribution {

    readonly id = 'fsharp';
    readonly scopeName = 'source.fsharp';

    registerTextmateLanguage(registry: TextmateRegistry): void {
        monaco.languages.register({
            id: this.id,
            extensions: ['.fs', '.fsi', '.fsx', '.fsscript'],
            aliases: ['F#', 'FSharp', 'fsharp']
        });
        monaco.languages.setLanguageConfiguration(this.id, {
            comments: {
                lineComment: '//',
                blockComment: ['(*', '*)']
            },
            brackets: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')']
            ],
            autoClosingPairs: [
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '"', close: '"', notIn: ['string'] }
            ],
            surroundingPairs: [
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '"', close: '"' },
                { open: '\'', close: '\'' }
            ],
            folding: {
                offSide: true,
                markers: {
                    'start': new RegExp('^\\s*//\\s*#region\\b|^\\s*\\(\\*\\s*#region(.*)\\*\\)'),
                    'end': new RegExp('^\\s*//\\s*#endregion\\b|^\\s*\\(\\*\\s*#endregion\\s*\\*\\)')
                }
            }
        });
        const grammar = require('../../data/fsharp.tmLanguage.json');
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
