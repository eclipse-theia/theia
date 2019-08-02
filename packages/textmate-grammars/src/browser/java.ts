/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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
export class JavaContribution implements LanguageGrammarDefinitionContribution {
    private readonly id = 'java';
    private readonly javaScope = 'source.java';
    private readonly javaDocScope = 'text.html.javadoc';

    registerTextmateLanguage(registry: TextmateRegistry): void {
        monaco.languages.register({
            id: this.id,
            extensions: [
                '.java',
                '.jav',
                '.class'
            ],
            firstLine: '(\\<\\?xml.*)|(\\<svg)|(\\<\\!doctype\\s+svg)',
            aliases: ['Java', 'java'],
            mimetypes: ['text/x-java-source', 'text/x-java']
        });
        monaco.languages.setLanguageConfiguration(this.id, {
            // the default separators except `@$`
            wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
            comments: {
                lineComment: '//',
                blockComment: ['/*', '*/'],
            },
            brackets: [['{', '}'], ['[', ']'], ['(', ')'], ['<', '>']],
            autoClosingPairs: [
                { open: '"', close: '"', notIn: ['string', 'comment'] },
                { open: '\'', close: '\'', notIn: ['string', 'comment'] },
                { open: '{', close: '}', notIn: ['string', 'comment'] },
                { open: '[', close: ']', notIn: ['string', 'comment'] },
                { open: '(', close: ')', notIn: ['string', 'comment'] },
                { open: '<', close: '>', notIn: ['string', 'comment'] },
            ]
        });

        const javaDocGrammar = require('../../data/java.tmLanguage.json');
        registry.registerTextmateGrammarScope(this.javaDocScope, {
            async getGrammarDefinition(): Promise<GrammarDefinition> {
                return {
                    format: 'json',
                    content: javaDocGrammar
                };
            }
        });
        const javaGrammar = require('../../data/java.tmLanguage.json');
        registry.registerTextmateGrammarScope(this.javaScope, {
            async getGrammarDefinition(): Promise<GrammarDefinition> {
                return {
                    format: 'json',
                    content: javaGrammar
                };
            }
        });
        registry.mapLanguageIdToTextmateGrammar(this.id, this.javaScope);
    }
}
