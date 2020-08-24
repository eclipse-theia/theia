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

import { Disposable } from '@theia/core';

export class EditorDecorationStyle implements Disposable {

    constructor(
        readonly selector: string,
        styleProvider: (style: CSSStyleDeclaration) => void,
    ) {
        EditorDecorationStyle.createRule(selector, styleProvider);
    }

    get className(): string {
        return this.selector.split('::')[0];
    }

    dispose(): void {
        EditorDecorationStyle.deleteRule(this.selector);
    }

}

export namespace EditorDecorationStyle {

    export function copyStyle(from: CSSStyleDeclaration, to: CSSStyleDeclaration): void {
        Object.keys(from).forEach(key => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (<any>to)[key] = (<any>from)[key];
        });
    }

    export function createStyleSheet(container: HTMLElement = document.getElementsByTagName('head')[0]): CSSStyleSheet | undefined {
        if (!container) {
            return undefined;
        }
        const style = document.createElement('style');
        style.id = 'editorDecorationsStyle';
        // Note: Might be a typing error, the `type` field seems to not be deprecated according to MDN:
        // https://developer.mozilla.org/en-US/docs/Web/API/HTMLStyleElement/type
        // eslint-disable-next-line deprecation/deprecation
        style.type = 'text/css';
        style.media = 'screen';
        style.appendChild(document.createTextNode('')); // trick for webkit
        container.appendChild(style);
        return <CSSStyleSheet>style.sheet;
    }

    const editorDecorationsStyleSheet: CSSStyleSheet | undefined = createStyleSheet();

    export function createRule(selector: string, styleProvider: (style: CSSStyleDeclaration) => void,
        styleSheet: CSSStyleSheet | undefined = editorDecorationsStyleSheet
    ): void {
        if (!styleSheet) {
            return;
        }
        const index = styleSheet.insertRule('.' + selector + '{}', 0);
        const rules = styleSheet.cssRules || styleSheet.rules;
        const rule = rules[index];
        if (rule && rule.type === CSSRule.STYLE_RULE) {
            const styleRule = rule as CSSStyleRule;
            styleProvider(styleRule.style);
        }
    }

    export function deleteRule(selector: string, styleSheet: CSSStyleSheet | undefined = editorDecorationsStyleSheet): void {
        if (!styleSheet) {
            return;
        }
        const rules = styleSheet.cssRules || styleSheet.rules;
        for (let i = 0; i < rules.length; i++) {
            if (rules[i].type === CSSRule.STYLE_RULE) {
                if ((rules[i] as CSSStyleRule).selectorText === selector) {
                    styleSheet.removeRule(i);
                }
            }
        }
    }

}
