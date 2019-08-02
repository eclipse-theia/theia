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
export class PythonContribution implements LanguageGrammarDefinitionContribution {
    readonly id = 'python';
    readonly config: monaco.languages.LanguageConfiguration = {
        comments: {
            lineComment: '#'
        },
        brackets: [
            ['{', '}'],
            ['[', ']'],
            ['(', ')']
        ],
        autoClosingPairs: [
            { open: '[', close: ']' },
            { open: '{', close: '}' },
            { open: '(', close: ')' },
            { open: '\'', close: '\'', notIn: ['string', 'comment'] },
            { open: '"', close: '"', notIn: ['string'] },
        ],
        surroundingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"' },
            { open: '\'', close: '\'' },
        ],
        folding: {
            markers: {
                start: new RegExp('^\\s*#pragma\\s+region\\b'),
                end: new RegExp('^\\s*#pragma\\s+endregion\\b')
            }
        },
        onEnterRules: [
            {
                beforeText: /^\s*(?:def|class|for|if|elif|else|while|try|with|finally|except|async).*?:\s*$/,
                action: { indentAction: monaco.languages.IndentAction.Indent }
            }
        ]
    };

    registerTextmateLanguage(registry: TextmateRegistry): void {
        monaco.languages.register({
            id: this.id,
            extensions: ['.py', '.rpy', '.pyw', '.cpy', '.gyp', '.gypi', '.snakefile', '.smk'],
            aliases: ['Python', 'py'],
            firstLine: '^#!\\s*/.*\\bpython[0-9.-]*\\b',
        });

        monaco.languages.setLanguageConfiguration(this.id, this.config);

        const platformGrammar = require('../../data/MagicPython.tmLanguage.json');
        registry.registerTextmateGrammarScope('source.python', {
            async getGrammarDefinition(): Promise<GrammarDefinition> {
                return {
                    format: 'json',
                    content: platformGrammar
                };
            }
        });

        const cGrammar = require('../../data/MagicRegExp.tmLanguage.json');
        registry.registerTextmateGrammarScope('source.regexp.python', {
            async getGrammarDefinition(): Promise<GrammarDefinition> {
                return {
                    format: 'json',
                    content: cGrammar
                };
            }
        });
        registry.mapLanguageIdToTextmateGrammar(this.id, 'source.python');
    }
}
