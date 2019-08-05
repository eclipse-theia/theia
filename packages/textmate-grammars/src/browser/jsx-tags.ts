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

import { injectable } from 'inversify';
import { LanguageGrammarDefinitionContribution, TextmateRegistry } from '@theia/monaco/lib/browser/textmate';

@injectable()
export class JsxTagsContribution implements LanguageGrammarDefinitionContribution {
    private readonly id = 'jsx-tags';

    registerTextmateLanguage(registry: TextmateRegistry): void {
        this.registerJsxTags();
    }

    protected registerJsxTags(): void {
        monaco.languages.register({
            id: this.id
        });

        monaco.languages.onLanguage(this.id, () => {
            monaco.languages.setLanguageConfiguration(this.id, this.configuration);
        });
    }

    protected configuration: monaco.languages.LanguageConfiguration = {
        'comments': {
            'blockComment': ['{/*', '*/}']
        },
        'brackets': [
            ['{', '}'],
            ['[', ']'],
            ['(', ')'],
            ['<', '>']
        ],
        'autoClosingPairs': [
            { 'open': '{', 'close': '}' },
            { 'open': '[', 'close': ']' },
            { 'open': '(', 'close': ')' },
            { 'open': '\'', 'close': '\'', 'notIn': ['string', 'comment'] },
            { 'open': '"', 'close': '"', 'notIn': ['string'] },
            { 'open': '/**', 'close': ' */', 'notIn': ['string'] }
        ],
        'surroundingPairs': [
            { 'open': '{', 'close': '}' },
            { 'open': '[', 'close': ']' },
            { 'open': '(', 'close': ')' },
            { 'open': '<', 'close': '>' },
            { 'open': '\'', 'close': '\'' },
            { 'open': '"', 'close': '"' }
        ]
    };
}
