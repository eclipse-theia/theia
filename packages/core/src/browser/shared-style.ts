/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable } from 'inversify';
import { Theme, ThemeService } from './theming';
import { Disposable, DisposableCollection } from '../common/disposable';

@injectable()
export class SharedStyle {

    /**
     * The branding style element.
     */
    protected style: HTMLStyleElement;

    /**
     * The branding style rules.
     */
    protected readonly rules: {
        selector: string;
        body: (theme: Theme) => string
    }[] = [];

    constructor() {
        this.update();
        ThemeService.get().onThemeChange(() => this.update());
    }

    protected readonly toUpdate = new DisposableCollection();

    /**
     * Update the StyleSheet.
     */
    protected update(): void {
        this.toUpdate.dispose();

        const style = this.style = document.createElement('style');
        style.type = 'text/css';
        style.media = 'screen';
        document.getElementsByTagName('head')[0].appendChild(style);
        this.toUpdate.push(Disposable.create(() =>
            document.getElementsByTagName('head')[0].removeChild(style)
        ));

        for (const rule of this.rules) {
            this.doInsertRule(rule);
        }
    }

    /**
     * Insert rule into StyleSheet.
     *
     * @param selector the selector for the rule.
     * @param body the body selector.
     */
    insertRule(selector: string, body: (theme: Theme) => string): Disposable {
        const rule = { selector, body };
        this.rules.push(rule);
        this.doInsertRule(rule);
        return Disposable.create(() => {
            const index = this.rules.indexOf(rule);
            if (index !== -1) {
                this.rules.splice(index, 1);
                this.deleteRule(selector);
            }
        });
    }

    /**
     * Actually perform inserting rule into StyleSheet.
     */
    protected doInsertRule({ selector, body }: {
        selector: string;
        body: (theme: Theme) => string
    }): void {
        const sheet = (<CSSStyleSheet>this.style.sheet);
        const cssBody = body(ThemeService.get().getCurrentTheme());
        sheet.insertRule(selector + ' { ' + cssBody + ' }', 0);
    }

    /**
     * Delete rule from StyleSheet.
     *
     * @param selector the selector for the rule.
     */
    deleteRule(selector: string): void {
        const sheet = (<CSSStyleSheet>this.style.sheet);
        const rules = sheet.rules || sheet.cssRules || [];
        for (let i = rules.length - 1; i >= 0; i--) {
            const rule = rules[i];
            // tslint:disable-next-line:no-any
            if ((<any>rule).selectorText.indexOf(selector) !== -1) {
                sheet.deleteRule(i);
            }
        }
    }

}
