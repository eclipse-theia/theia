/********************************************************************************
 * Copyright (C) 2019 Red Hat and others.
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

import { LanguageGrammarDefinitionContribution, TextmateRegistry } from '@theia/monaco/lib/browser/textmate';
import { injectable } from 'inversify';

@injectable()
export class GoContribution implements LanguageGrammarDefinitionContribution {
    readonly id = 'go';
    readonly config: monaco.languages.LanguageConfiguration = {
        comments: {
            lineComment: '//',
            blockComment: ['/*', '*/'],
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
            { open: '`', close: '`', notIn: ['string'] },
            { open: '"', close: '"', notIn: ['string'] },
            { open: '\'', close: '\'', notIn: ['string', 'comment'] },
        ],
        surroundingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '`', close: '`' },
            { open: '"', close: '"' },
            { open: '\'', close: '\'' },
        ],
        indentationRules: {
            increaseIndentPattern: new RegExp('^.*(\\bcase\\b.*:|\\bdefault\\b:|(\\b(func|if|else|switch|select|for|struct)\\b.*)?{[^}"\'`]*|\\([^)"\`]*)$'),
            decreaseIndentPattern: new RegExp('^\\s*(\\bcase\\b.*:|\\bdefault\\b:|}[)}]*[),]?|\\)[,]?)$')
        }
    };

    registerTextmateLanguage(registry: TextmateRegistry) {
        monaco.languages.register({
            id: this.id,
            extensions: ['.go'],
            aliases: ['Go', 'go']
        });

        monaco.languages.setLanguageConfiguration(this.id, this.config);

        const goGrammar = require('../../data/go.tmLanguage.json');
        registry.registerTextmateGrammarScope('source.go', {
            async getGrammarDefinition() {
                return {
                    format: 'json',
                    content: goGrammar
                };
            }
        });
        registry.mapLanguageIdToTextmateGrammar(this.id, 'source.go');
    }
}
