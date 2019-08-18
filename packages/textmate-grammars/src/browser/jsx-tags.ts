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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { injectable } from 'inversify';
import { LanguageGrammarDefinitionContribution, TextmateRegistry } from '@theia/monaco/lib/browser/textmate';

@injectable()
export class JsxTagsContribution implements LanguageGrammarDefinitionContribution {
    private readonly id = 'jsx-tags';
    // copied and modified from https://github.com/microsoft/vscode/blob/master/extensions/typescript-language-features/src/features/languageConfiguration.ts
    static EMPTY_ELEMENTS: string[] = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'menuitem', 'meta', 'param', 'source', 'track', 'wbr'];

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
        // copied and modified from https://github.com/microsoft/vscode/blob/master/extensions/typescript-language-features/src/features/languageConfiguration.ts
        'wordPattern': /(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/g,
        'onEnterRules': [
            {
                'beforeText': new RegExp(`<(?!(?:${JsxTagsContribution.EMPTY_ELEMENTS.join('|')}))([_:\\w][_:\\w\\-.\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
                'afterText': /^<\/([_:\w][_:\w-.\d]*)\s*>$/i,
                'action': { indentAction: monaco.languages.IndentAction.IndentOutdent }
            },
            {
                'beforeText': new RegExp(`<(?!(?:${JsxTagsContribution.EMPTY_ELEMENTS.join('|')}))([_:\\w][_:\\w\\-.\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
                'action': { indentAction: monaco.languages.IndentAction.Indent }
            },
            {
                // `beforeText` only applies to tokens of a given language. Since we are dealing with jsx-tags,
                // make sure we apply to the closing `>` of a tag so that mixed language spans
                // such as `<div onclick={1}>` are handled properly.
                'beforeText': /^>$/,
                'afterText': /^<\/([_:\w][_:\w-.\d]*)\s*>$/i,
                'action': { indentAction: monaco.languages.IndentAction.IndentOutdent }
            },
            {
                'beforeText': /^>$/,
                'action': { indentAction: monaco.languages.IndentAction.Indent }
            },
        ],
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
