/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { injectable } from 'inversify';
import { LanguageGrammarDefinitionContribution, TextmateRegistry } from '@theia/monaco/lib/browser/textmate';

export interface BuiltinGrammar {
    format: 'json' | 'plist';
    language: string;
    scope: string;
    grammar?: object | string;
}

@injectable()
export class MonacoTextmateBuiltinGrammarContribution implements LanguageGrammarDefinitionContribution {

    protected readonly builtins: BuiltinGrammar[] = [
        {
            format: 'json',
            language: 'typescript',
            scope: 'source.ts',
            grammar: require('../../data/grammars/typescript.tmlanguage.json'),
        },
        {
            format: 'json',
            language: 'javascript',
            scope: 'source.js',
            grammar: require('../../data/grammars/javascript.tmlanguage.json'),
        }
    ];

    registerTextmateLanguage(registry: TextmateRegistry) {
        for (const grammar of this.builtins) {
            registry.registerTextMateGrammarScope(grammar.scope, {
                async getGrammarDefinition() {
                    return {
                        format: grammar.format,
                        content: grammar.grammar || '',
                    };
                }
            });

            registry.mapLanguageIdToTextmateGrammar(grammar.language, grammar.scope);
        }
    }
}
