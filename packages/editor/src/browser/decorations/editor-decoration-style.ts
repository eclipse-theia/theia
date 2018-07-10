/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Disposable } from "@theia/core";

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
            // tslint:disable-next-line:no-any
            (<any>to)[key] = (<any>from)[key];
        });
    }

    export function createStyleSheet(container: HTMLElement = document.getElementsByTagName('head')[0]): CSSStyleSheet | undefined {
        if (!container) {
            return undefined;
        }
        const style = document.createElement('style');
        style.id = 'editorDecorationsStyle';
        style.type = 'text/css';
        style.media = 'screen';
        style.appendChild(document.createTextNode("")); // trick for webkit
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
        const rule = rules.item(index);
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
