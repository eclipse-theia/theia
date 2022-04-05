/********************************************************************************
 * Copyright (C) 2022 Ericsson and others.
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

import { ColorId, FontStyle } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import {
    ColorMap, ParsedTokenThemeRule, strcmp,
    ThemeTrieElement, ThemeTrieElementRule, TokenTheme
} from '@theia/monaco-editor-core/esm/vs/editor/common/languages/supports/tokenization';

// Cf. https://github.com/theia-ide/vscode/blob/e930e4240ee604757efbd7fd621b77b75568f95d/src/vs/platform/theme/common/tokenClassificationRegistry.ts#L508-L535
// TODO: Remove in favor of full implementation of the token type contribution points.
// https://github.com/theia-ide/vscode/blob/standalone/0.23.x/src/vs/workbench/services/themes/common/colorExtensionPoint.ts
const defaultTokenMappings = new Map<string, string[]>([
    ['keyword', ['keyword.control']], ['number', ['constant.numeric']],
    ['regexp', ['constant.regexp']], ['operator', ['keyword.operator']],
    ['namepace', ['entity.name.namespace']], ['type', ['entity.name.type', 'support.type']],
    ['struct', ['entity.name.type.struct']], ['class', ['entity.name.type.class', 'support.class']],
    ['interface', ['entity.name.type.interface']], ['enum', ['entity.name.type.enum']],
    ['typeParameter', ['entity.name.type.parameter']], ['function', ['support.function']],
    ['member', ['method']], ['method', ['entity.name.function.member', 'support.function']],
    ['macro', ['entity.name.function.preprocessor']], ['variable', ['variable.other.readwrite', 'entity.name.variable']],
    ['parameter', ['variable.parameter']], ['property', ['variable.other.property']],
    ['enumMember', ['variable.other.enummember']], ['event', ['variable.other.event']],
    ['decorator', ['entity.name.decorator', 'entity.name.function']], ['label', []]
]);
// Ensure that code backtracks only once - attempts during a backtrack should not themselves backtrack.
let overrideCheckInProgress = false;
// Overrides https://github.com/theia-ide/vscode/blob/e930e4240ee604757efbd7fd621b77b75568f95d/src/vs/editor/common/modes/supports/tokenization.ts#L346-L368
ThemeTrieElement.prototype.match = function (
    this: ThemeTrieElement,
    token: string,
): ThemeTrieElementRule {
    let usingOverride = false;
    try {
        if (token === '') {
            return this['_mainRule'];
        }

        const dotIndex = token.indexOf('.');
        let head: string;
        let tail: string;
        if (dotIndex === -1) {
            head = token;
            tail = '';
        } else {
            head = token.substring(0, dotIndex);
            tail = token.substring(dotIndex + 1);
        }

        // OVERRIDE: Check default mappings
        if (!overrideCheckInProgress) {
            usingOverride = overrideCheckInProgress = true;
            if (defaultTokenMappings.has(head)) {
                for (const option of defaultTokenMappings.get(head)!) {
                    const rule = this.match(option);
                    if (rule.metadata !== this['_mainRule'].metadata) {
                        return rule;
                    }
                }
            }
        }
        const child = this['_children'].get(head);
        if (typeof child !== 'undefined') {
            return child.match(tail);
        }
        // OVERRIDE: Finally, try a breadth-first search of the tree for a match.
        const candidates = [...this['_children'].values()];
        for (const candidate of candidates) {
            if (candidate._children.has(head)) {
                return candidate.match(token);
            } else {
                candidates.push(...candidate._children.values());
            }
        }

        return this['_mainRule'];
    } finally {
        if (usingOverride) {
            overrideCheckInProgress = false;
        }
    }
};

// Overrides https://github.com/theia-ide/vscode/blob/e930e4240ee604757efbd7fd621b77b75568f95d/src/vs/editor/common/modes/supports/tokenization.ts#L101-L147
TokenTheme.createFromParsedTokenTheme = function resolveParsedTokenThemeRules(
    parsedThemeRules: ParsedTokenThemeRule[], customTokenColors: string[]): TokenTheme {
    // Sort rules lexicographically, and then by index if necessary
    parsedThemeRules.sort((a, b) => {
        const r = strcmp(a.token, b.token);
        if (r !== 0) {
            return r;
        }
        return a.index - b.index;
    });

    const colorMap = new ColorMap();

    // start with token colors from custom token themes
    for (const color of customTokenColors) {
        colorMap.getId(color);
    }

    const defaults = new ThemeTrieElementRule(FontStyle.None, ColorId.None, ColorId.None);
    const root = new ThemeTrieElement(defaults);
    for (let i = 0, len = parsedThemeRules.length; i < len; i++) {
        const rule = parsedThemeRules[i];
        root.insert(rule.token, rule.fontStyle, colorMap.getId(rule.foreground), colorMap.getId(rule.background));
        // OVERRIDE: At the root, return an empty rule. This allows the grammar-set color to persist.
        // @ts-expect-error 2540
        root['_mainRule'] = new ThemeTrieElementRule(FontStyle.None, ColorId.None, ColorId.None);
    }

    return new TokenTheme(colorMap, root);
};
