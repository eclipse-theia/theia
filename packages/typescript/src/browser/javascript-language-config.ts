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

import { JAVASCRIPT_LANGUAGE_ID, JAVASCRIPT_LANGUAGE_NAME, JAVASCRIPT_REACT_LANGUAGE_ID, JAVASCRIPT_REACT_LANGUAGE_NAME } from "../common";
import { injectable } from "inversify";
import { LanguageGrammarDefinitionContribution, TextmateRegistry } from "@theia/monaco/lib/browser/textmate";

@injectable()
export class JavascriptGrammarContribution implements LanguageGrammarDefinitionContribution {

    registerTextmateLanguage(registry: TextmateRegistry) {
        this.registerJavaScript();
        const grammar = require('../../data/grammars/javascript.tmlanguage.json');
        registry.registerTextMateGrammarScope('source.js', {
            async getGrammarDefinition() {
                return {
                    format: 'json',
                    content: grammar,
                };
            }
        });

        registry.mapLanguageIdToTextmateGrammar(JAVASCRIPT_LANGUAGE_ID, 'source.js');

        const jsxGrammar = require('../../data/grammars/javascript.jsx.tmlanguage.json');
        registry.registerTextMateGrammarScope('source.jsx', {
            async getGrammarDefinition() {
                return {
                    format: 'json',
                    content: jsxGrammar,
                };
            }
        });

        registry.mapLanguageIdToTextmateGrammar(JAVASCRIPT_REACT_LANGUAGE_ID, 'source.jsx');
    }

    protected registerJavaScript() {
        monaco.languages.register({
            id: JAVASCRIPT_LANGUAGE_ID,
            aliases: [
                JAVASCRIPT_LANGUAGE_NAME,
                "javascript",
                "js"
            ],
            extensions: [
                ".js",
                ".es6",
                ".mjs",
                ".pac"
            ],
            filenames: [
                "jakefile"
            ],
            firstLine: "^#!.*\\bnode",
            mimetypes: [
                "text/javascript"
            ]
        });

        monaco.languages.onLanguage(JAVASCRIPT_LANGUAGE_ID, () => {
            monaco.languages.setLanguageConfiguration(JAVASCRIPT_LANGUAGE_ID, this.configuration);
        });

        monaco.languages.register({
            id: JAVASCRIPT_REACT_LANGUAGE_ID,
            aliases: [
                JAVASCRIPT_REACT_LANGUAGE_NAME,
                "jsx"
            ],
            extensions: [
                ".jsx"
            ]
        });
        monaco.languages.onLanguage(JAVASCRIPT_REACT_LANGUAGE_ID, () => {
            monaco.languages.setLanguageConfiguration(JAVASCRIPT_LANGUAGE_ID, this.configuration);
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
