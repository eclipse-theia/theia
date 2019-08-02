/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { injectable } from 'inversify';
import { LanguageGrammarDefinitionContribution, TextmateRegistry, GrammarDefinition } from '@theia/monaco/lib/browser/textmate';

@injectable()
export class RustContribution implements LanguageGrammarDefinitionContribution {
    readonly id = 'rust';
    // copied from https://github.com/Microsoft/vscode/blob/9e1975d98598ef268ca760b8381ee628f27fc121/extensions/rust/language-configuration.json
    readonly config: monaco.languages.LanguageConfiguration = {
        comments: {
            lineComment: '//',
            blockComment: ['/*', '*/']
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
            { open: '\"', close: '\"' }
        ],
        surroundingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '\"', close: '\"' },
            { open: "'", close: "'" }
        ],
        folding: {
            markers: {
                start: new RegExp('^\\s*//\\s*#?region\\b'),
                end: new RegExp('^\\s*//\\s*#?endregion\\b')
            }
        }
    };

    registerTextmateLanguage(registry: TextmateRegistry): void {
        monaco.languages.register({
            // copied from https://github.com/Microsoft/vscode/blob/9e1975d98598ef268ca760b8381ee628f27fc121/extensions/rust/package.json#L12-L17
            id: this.id,
            extensions: ['.rs'],
            aliases: ['Rust', 'rust']
        });

        monaco.languages.setLanguageConfiguration(this.id, this.config);

        // copied from https://github.com/Microsoft/vscode/blob/9e1975d98598ef268ca760b8381ee628f27fc121/extensions/rust/syntaxes/rust.tmLanguage.json
        const platformGrammar = require('../../data/rust.tmLanguage.json');
        registry.registerTextmateGrammarScope('source.rust', {
            async getGrammarDefinition(): Promise<GrammarDefinition> {
                return {
                    format: 'json',
                    content: platformGrammar
                };
            }
        });
        registry.mapLanguageIdToTextmateGrammar(this.id, 'source.rust');
    }
}
