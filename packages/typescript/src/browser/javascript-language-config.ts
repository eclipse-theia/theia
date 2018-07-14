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
import { LanguageGrammarDefinitionContribution, TextmateRegistry, getEncodedLanguageId } from "@theia/monaco/lib/browser/textmate";
import { StandardTokenType } from "monaco-textmate";

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

        registry.registerTextMateGrammarScope('source.js.regexp', {
            async getGrammarDefinition() {
                return {
                    format: 'plist',
                    content: regExpGrammar,
                };
            }
        });

        registry.registerGrammarConfiguration(JAVASCRIPT_LANGUAGE_ID, {
            embeddedLanguages: {
                "meta.tag.js": getEncodedLanguageId("jsx-tags"),
                "meta.tag.without-attributes.js": getEncodedLanguageId("jsx-tags"),
                "meta.tag.attributes.js.jsx": getEncodedLanguageId("javascriptreact"),
                "meta.embedded.expression.js": getEncodedLanguageId("javascriptreact")
            },
            tokenTypes: {
                "entity.name.type.instance.jsdoc": StandardTokenType.Other,
                "entity.name.function.tagged-template": StandardTokenType.Other,
                "meta.import string.quoted": StandardTokenType.Other,
                "variable.other.jsdoc": StandardTokenType.Other
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

const regExpGrammar = String.raw`
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>fileTypes</key>
	<array/>
	<key>hideFromUser</key>
	<true/>
	<key>name</key>
	<string>Regular Expressions (JavaScript)</string>
	<key>patterns</key>
	<array>
		<dict>
			<key>include</key>
			<string>#regexp</string>
		</dict>
	</array>
	<key>repository</key>
	<dict>
		<key>regex-character-class</key>
		<dict>
			<key>patterns</key>
			<array>
				<dict>
					<key>match</key>
					<string>\\[wWsSdD]|\.</string>
					<key>name</key>
					<string>constant.character.character-class.regexp</string>
				</dict>
				<dict>
					<key>match</key>
					<string>\\([0-7]{3}|x\h\h|u\h\h\h\h)</string>
					<key>name</key>
					<string>constant.character.numeric.regexp</string>
				</dict>
				<dict>
					<key>match</key>
					<string>\\c[A-Z]</string>
					<key>name</key>
					<string>constant.character.control.regexp</string>
				</dict>
				<dict>
					<key>match</key>
					<string>\\.</string>
					<key>name</key>
					<string>constant.character.escape.backslash.regexp</string>
				</dict>
			</array>
		</dict>
		<key>regexp</key>
		<dict>
			<key>patterns</key>
			<array>
				<dict>
					<key>match</key>
					<string>\\[bB]|\^|\$</string>
					<key>name</key>
					<string>keyword.control.anchor.regexp</string>
				</dict>
				<dict>
					<key>match</key>
					<string>\\[1-9]\d*</string>
					<key>name</key>
					<string>keyword.other.back-reference.regexp</string>
				</dict>
				<dict>
					<key>match</key>
					<string>[?+*]|\{(\d+,\d+|\d+,|,\d+|\d+)\}\??</string>
					<key>name</key>
					<string>keyword.operator.quantifier.regexp</string>
				</dict>
				<dict>
					<key>match</key>
					<string>\|</string>
					<key>name</key>
					<string>keyword.operator.or.regexp</string>
				</dict>
				<dict>
					<key>begin</key>
					<string>(\()((\?=)|(\?!))</string>
					<key>beginCaptures</key>
					<dict>
						<key>1</key>
						<dict>
							<key>name</key>
							<string>punctuation.definition.group.regexp</string>
						</dict>
						<key>3</key>
						<dict>
							<key>name</key>
							<string>meta.assertion.look-ahead.regexp</string>
						</dict>
						<key>4</key>
						<dict>
							<key>name</key>
							<string>meta.assertion.negative-look-ahead.regexp</string>
						</dict>
					</dict>
					<key>end</key>
					<string>(\))</string>
					<key>endCaptures</key>
					<dict>
						<key>1</key>
						<dict>
							<key>name</key>
							<string>punctuation.definition.group.regexp</string>
						</dict>
					</dict>
					<key>name</key>
					<string>meta.group.assertion.regexp</string>
					<key>patterns</key>
					<array>
						<dict>
							<key>include</key>
							<string>#regexp</string>
						</dict>
					</array>
				</dict>
				<dict>
					<key>begin</key>
					<string>\((\?:)?</string>
					<key>beginCaptures</key>
					<dict>
						<key>0</key>
						<dict>
							<key>name</key>
							<string>punctuation.definition.group.regexp</string>
						</dict>
					</dict>
					<key>end</key>
					<string>\)</string>
					<key>endCaptures</key>
					<dict>
						<key>0</key>
						<dict>
							<key>name</key>
							<string>punctuation.definition.group.regexp</string>
						</dict>
					</dict>
					<key>name</key>
					<string>meta.group.regexp</string>
					<key>patterns</key>
					<array>
						<dict>
							<key>include</key>
							<string>#regexp</string>
						</dict>
					</array>
				</dict>
				<dict>
					<key>begin</key>
					<string>(\[)(\^)?</string>
					<key>beginCaptures</key>
					<dict>
						<key>1</key>
						<dict>
							<key>name</key>
							<string>punctuation.definition.character-class.regexp</string>
						</dict>
						<key>2</key>
						<dict>
							<key>name</key>
							<string>keyword.operator.negation.regexp</string>
						</dict>
					</dict>
					<key>end</key>
					<string>(\])</string>
					<key>endCaptures</key>
					<dict>
						<key>1</key>
						<dict>
							<key>name</key>
							<string>punctuation.definition.character-class.regexp</string>
						</dict>
					</dict>
					<key>name</key>
					<string>constant.other.character-class.set.regexp</string>
					<key>patterns</key>
					<array>
						<dict>
							<key>captures</key>
							<dict>
								<key>1</key>
								<dict>
									<key>name</key>
									<string>constant.character.numeric.regexp</string>
								</dict>
								<key>2</key>
								<dict>
									<key>name</key>
									<string>constant.character.control.regexp</string>
								</dict>
								<key>3</key>
								<dict>
									<key>name</key>
									<string>constant.character.escape.backslash.regexp</string>
								</dict>
								<key>4</key>
								<dict>
									<key>name</key>
									<string>constant.character.numeric.regexp</string>
								</dict>
								<key>5</key>
								<dict>
									<key>name</key>
									<string>constant.character.control.regexp</string>
								</dict>
								<key>6</key>
								<dict>
									<key>name</key>
									<string>constant.character.escape.backslash.regexp</string>
								</dict>
							</dict>
							<key>match</key>
							<string>(?:.|(\\(?:[0-7]{3}|x\h\h|u\h\h\h\h))|(\\c[A-Z])|(\\.))\-(?:[^\]\\]|(\\(?:[0-7]{3}|x\h\h|u\h\h\h\h))|(\\c[A-Z])|(\\.))</string>
							<key>name</key>
							<string>constant.other.character-class.range.regexp</string>
						</dict>
						<dict>
							<key>include</key>
							<string>#regex-character-class</string>
						</dict>
					</array>
				</dict>
				<dict>
					<key>include</key>
					<string>#regex-character-class</string>
				</dict>
			</array>
		</dict>
	</dict>
	<key>scopeName</key>
	<string>source.js.regexp</string>
	<key>uuid</key>
	<string>AC8679DE-3AC7-4056-84F9-69A7ADC29DDD</string>
</dict>
</plist>
`;
