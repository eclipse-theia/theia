/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { ThemeService } from '@theia/core/lib/browser/theming';

export const ThemeRulesServiceSymbol = Symbol('ThemeRulesService');

interface IconPath {
    light: string,
    dark: string
}

const DEFAULT_RULE = 'body { font-size: var(--theia-ui-font-size1); color: var(--theia-ui-font-color1); }';

export class ThemeRulesService {
    private styleElement?: HTMLStyleElement;
    private icons = new Map<string, IconPath | string>();
    protected readonly themeService = ThemeService.get();
    protected readonly themeRules = new Map<string, string[]>();

    static get(): ThemeRulesService {
        const global = window as any; // tslint:disable-line
        return global[ThemeRulesServiceSymbol] || new ThemeRulesService();
    }

    protected constructor() {
        const global = window as any; // tslint:disable-line
        global[ThemeRulesServiceSymbol] = this;

        this.themeService.onThemeChange(() => {
            this.updateIconStyleElement();
        });
    }

    createStyleSheet(container: HTMLElement = document.getElementsByTagName('head')[0]): HTMLStyleElement {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.media = 'screen';
        container.appendChild(style);
        return style;
    }

    getCurrentThemeRules(): string[] {
        const cssText: string[] = [];
        const themeId = this.themeService.getCurrentTheme().id;
        if (this.themeRules.has(themeId)) {
            return <string[]>this.themeRules.get(themeId);
        }
        // tslint:disable-next-line:no-any
        const styleElement = document.getElementById('theia-theme') as any;
        if (!styleElement) {
            return cssText;
        }

        const sheet: {
            insertRule: (rule: string, index: number) => void,
            removeRule: (index: number) => void,
            rules: CSSRuleList
            // tslint:disable-next-line:no-any
        } | undefined = (<any>styleElement).sheet;
        if (!sheet || !sheet.rules || !sheet.rules.length) {
            return cssText;
        }

        const ruleList = sheet.rules;
        for (let index = 0; index < ruleList.length; index++) {
            if (ruleList[index] && ruleList[index].cssText) {
                cssText.push(ruleList[index].cssText.toString());
            }
        }

        if (cssText.length) {
            cssText.push(DEFAULT_RULE);
        }

        return cssText;
    }

    setRules(styleSheet: HTMLElement, newRules: string[]): boolean {
        const sheet: {
            insertRule: (rule: string, index: number) => void;
            removeRule: (index: number) => void;
            rules: CSSRuleList;
            // tslint:disable-next-line:no-any
        } | undefined = (<any>styleSheet).sheet;

        if (!sheet) {
            return false;
        }
        for (let index = sheet.rules!.length; index > 0; index--) {
            sheet.removeRule(0);
        }
        newRules.forEach((rule: string, index: number) => {
            sheet.insertRule(rule, index);
        });
        return true;
    }

    setIconPath(webviewId: string, iconPath: IconPath | string | undefined): void {
        if (!iconPath) {
            this.icons.delete(webviewId);
        } else {
            this.icons.set(webviewId, <IconPath | string>iconPath);
        }
        if (!this.styleElement) {
            this.styleElement = this.createStyleSheet();
            this.styleElement.id = 'webview-icons';
        }
        this.updateIconStyleElement();
    }

    private updateIconStyleElement(): void {
        if (!this.styleElement) {
            return;
        }
        const cssRules: string[] = [];
        this.icons.forEach((value, key) => {
            let path: string;
            if (typeof value === 'string') {
                path = value;
            } else {
                path = this.isDark() ? value.dark : value.light;
            }
            if (path.startsWith('/')) {
                path = `/webview${path}`;
            }
            cssRules.push(`.webview-icon.${key}-file-icon::before { background-image: url(${path}); }`);
        });
        this.setRules(this.styleElement, cssRules);
    }

    private isDark(): boolean {
        const currentThemeId: string = this.themeService.getCurrentTheme().id;
        return !currentThemeId.includes('light');
    }
}
