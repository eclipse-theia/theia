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
import { JSON_LANGUAGE_ID, JSONC_LANGUAGE_ID } from '../common';

@injectable()
export class JsonGrammarContribution implements LanguageGrammarDefinitionContribution {

    readonly config: monaco.languages.LanguageConfiguration = {
        'comments': {
            'lineComment': '//',
            'blockComment': ['/*', '*/']
        },
        'brackets': [
            ['{', '}'],
            ['[', ']']
        ],
        'autoClosingPairs': [
            { 'open': '{', 'close': '}', 'notIn': ['string'] },
            { 'open': '[', 'close': ']', 'notIn': ['string'] },
            { 'open': '(', 'close': ')', 'notIn': ['string'] },
            { 'open': '/*', 'close': '*/', 'notIn': ['string'] },
            { 'open': '\'', 'close': '\'', 'notIn': ['string', 'comment'] },
            { 'open': '`', 'close': '`', 'notIn': ['string', 'comment'] },
            { 'open': '"', 'close': '"', 'notIn': ['string', 'comment'] },
        ]
    };

    registerTextmateLanguage(registry: TextmateRegistry): void {
        monaco.languages.register({
            id: JSON_LANGUAGE_ID,
            'aliases': [
                'JSON',
                'json'
            ],
            'extensions': [
                '.json',
                '.bowerrc',
                '.jshintrc',
                '.jscsrc',
                '.eslintrc',
                '.babelrc',
                '.webmanifest',
                '.js.map',
                '.css.map'
            ],
            'filenames': [
                '.watchmanconfig',
                '.ember-cli'
            ],
            'mimetypes': [
                'application/json',
                'application/manifest+json'
            ]
        });

        monaco.languages.setLanguageConfiguration(JSON_LANGUAGE_ID, this.config);

        const jsonGrammar = require('../../data/json.tmLanguage.json');
        registry.registerTextmateGrammarScope('source.json', {
            async getGrammarDefinition(): Promise<GrammarDefinition> {
                return {
                    format: 'json',
                    content: jsonGrammar
                };
            }
        });

        registry.mapLanguageIdToTextmateGrammar(JSON_LANGUAGE_ID, 'source.json');

        // jsonc
        monaco.languages.register({
            id: JSONC_LANGUAGE_ID,
            'aliases': [
                'JSON with Comments'
            ],
            'extensions': [
                '.jsonc'
            ]
        });

        monaco.languages.setLanguageConfiguration(JSONC_LANGUAGE_ID, this.config);

        const jsoncGrammar = require('../../data/jsonc.tmLanguage.json');
        registry.registerTextmateGrammarScope('source.json.comments', {
            async getGrammarDefinition(): Promise<GrammarDefinition> {
                return {
                    format: 'json',
                    content: jsoncGrammar
                };
            }
        });
        registry.mapLanguageIdToTextmateGrammar(JSONC_LANGUAGE_ID, 'source.json.comments');
    }
}
