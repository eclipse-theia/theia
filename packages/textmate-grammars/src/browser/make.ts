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
export class MakeContribution implements LanguageGrammarDefinitionContribution {

    readonly id = 'makefile';
    readonly scopeName = 'source.makefile';

    registerTextmateLanguage(registry: TextmateRegistry): void {
        monaco.languages.register({
            id: this.id,
            aliases: ['Makefile', 'makefile'],
            extensions: ['.mk'],
            filenames: [
                'Makefile',
                'makefile',
                'GNUmakefile',
                'OCamlMakefile'
            ],
            firstLine: '^#!\\s*/usr/bin/make'
        });
        monaco.languages.setLanguageConfiguration(this.id, {
            comments: {
                lineComment: '#'
            },
            brackets: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')']
            ]
        });
        const grammar = require('../../data/make.tmLanguage.json');
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
