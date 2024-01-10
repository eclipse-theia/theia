// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export namespace DecorationStyle {

    export function createStyleElement(styleId: string, container: HTMLElement = document.head): HTMLStyleElement {
        const style = document.createElement('style');
        style.id = styleId;
        style.type = 'text/css';
        style.media = 'screen';
        style.appendChild(document.createTextNode('')); // trick for webkit
        container.appendChild(style);
        return style;
    }

    export function createStyleSheet(styleId: string, container?: HTMLElement): CSSStyleSheet {
        return <CSSStyleSheet>createStyleElement(styleId, container).sheet;
    }

    function getRuleIndex(selector: string, styleSheet: CSSStyleSheet): number {
        return Array.from(styleSheet.cssRules || styleSheet.rules).findIndex(rule => rule.type === CSSRule.STYLE_RULE && (<CSSStyleRule>rule).selectorText === selector);
    }

    export function getOrCreateStyleRule(selector: string, styleSheet: CSSStyleSheet): CSSStyleRule {
        let index = getRuleIndex(selector, styleSheet);
        if (index === -1) {
            // The given selector does not exist in the provided independent style sheet, rule index = 0
            index = styleSheet.insertRule(selector + '{}', 0);
        }

        const rules = styleSheet.cssRules || styleSheet.rules;
        const rule = rules[index];
        if (rule && rule.type === CSSRule.STYLE_RULE) {
            return rule as CSSStyleRule;
        }
        styleSheet.deleteRule(index);
        throw new Error('This function is only for CSS style rules. Other types of CSS rules are not allowed.');
    }

    export function deleteStyleRule(selector: string, styleSheet: CSSStyleSheet): void {
        if (!styleSheet) {
            return;
        }

        // In general, only one rule exists for a given selector in the provided independent style sheet
        const index = getRuleIndex(selector, styleSheet);
        if (index !== -1) {
            styleSheet.deleteRule(index);
        }
    }
}

