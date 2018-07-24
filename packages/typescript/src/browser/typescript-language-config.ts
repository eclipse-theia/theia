/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { TYPESCRIPT_LANGUAGE_ID, TYPESCRIPT_REACT_LANGUAGE_ID, TYPESCRIPT_LANGUAGE_NAME, TYPESCRIPT_REACT_LANGUAGE_NAME } from "../common";
import { injectable } from "inversify";
import { LanguageGrammarDefinitionContribution, TextmateRegistry } from "@theia/monaco/lib/browser/textmate";

@injectable()
export class TypescriptGrammarContribution implements LanguageGrammarDefinitionContribution {

    registerTextmateLanguage(registry: TextmateRegistry) {
        this.registerTypeScript();
        const grammar = require('../../data/grammars/typescript.tmlanguage.json');
        registry.registerTextMateGrammarScope('source.ts', {
            async getGrammarDefinition() {
                return {
                    format: 'json',
                    content: grammar,
                };
            }
        });

        registry.mapLanguageIdToTextmateGrammar(TYPESCRIPT_LANGUAGE_ID, 'source.ts');
        registry.registerGrammarConfiguration(TYPESCRIPT_LANGUAGE_ID, {
            "tokenTypes": {
                "entity.name.type.instance.jsdoc": 0,
                "entity.name.function.tagged-template": 0,
                "meta.import string.quoted": 0,
                "variable.other.jsdoc": 0
            }
        });

        const jsxGrammar = require('../../data/grammars/typescript.tsx.tmlanguage.json');
        registry.registerTextMateGrammarScope('source.tsx', {
            async getGrammarDefinition() {
                return {
                    format: 'json',
                    content: jsxGrammar,
                };
            }
        });

        registry.mapLanguageIdToTextmateGrammar(TYPESCRIPT_REACT_LANGUAGE_ID, 'source.tsx');
    }

    protected registerTypeScript() {
        monaco.languages.register({
            id: TYPESCRIPT_LANGUAGE_ID,
            aliases: [
                TYPESCRIPT_LANGUAGE_NAME,
                "typescript",
                "ts"
            ],
            extensions: [
                ".ts"
            ],
            mimetypes: [
                "text/typescript"
            ]
        });

        monaco.languages.onLanguage(TYPESCRIPT_LANGUAGE_ID, () => {
            monaco.languages.setLanguageConfiguration(TYPESCRIPT_LANGUAGE_ID, this.configuration);
        });

        monaco.languages.register({
            id: TYPESCRIPT_REACT_LANGUAGE_ID,
            aliases: [
                TYPESCRIPT_REACT_LANGUAGE_NAME,
                "tsx"
            ],
            extensions: [
                ".tsx"
            ]
        });
        monaco.languages.onLanguage(TYPESCRIPT_REACT_LANGUAGE_ID, () => {
            monaco.languages.setLanguageConfiguration(TYPESCRIPT_LANGUAGE_ID, this.configuration);
        });
    }

    protected configuration: monaco.languages.LanguageConfiguration = {
        "comments": {
            "lineComment": "//",
            "blockComment": ["/*", "*/"]
        },
        "brackets": [
            ["{", "}"],
            ["[", "]"],
            ["(", ")"]
        ],
        "autoClosingPairs": [
            { "open": "{", "close": "}" },
            { "open": "[", "close": "]" },
            { "open": "(", "close": ")" },
            { "open": "'", "close": "'", "notIn": ["string", "comment"] },
            { "open": "\"", "close": "\"", "notIn": ["string"] },
            { "open": "`", "close": "`", "notIn": ["string", "comment"] },
            { "open": "/**", "close": " */", "notIn": ["string"] }
        ],
        "surroundingPairs": [
            { "open": "{", "close": "}" },
            { "open": "[", "close": "]" },
            { "open": "(", "close": ")" },
            { "open": "'", "close": "'" },
            { "open": "\"", "close": "\"" },
            { "open": "`", "close": "`" }
        ],
        "folding": {
            "markers": {
                "start": new RegExp("^\\s*//\\s*#?region\\b"),
                "end": new RegExp("^\\s*//\\s*#?endregion\\b")
            }
        }
    };
}
