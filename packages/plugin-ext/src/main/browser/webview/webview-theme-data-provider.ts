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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// copied and modified from https://github.com/microsoft/vscode/blob/ba40bd16433d5a817bfae15f3b4350e18f144af4/src/vs/workbench/contrib/webview/common/themeing.ts

import { inject, postConstruct, injectable } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common/event';
import { EditorPreferences, EditorConfiguration } from '@theia/editor/lib/browser/editor-preferences';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { ColorApplicationContribution } from '@theia/core/lib/browser/color-application-contribution';

export type WebviewThemeType = 'vscode-light' | 'vscode-dark' | 'vscode-high-contrast';
export interface WebviewThemeData {
    readonly activeTheme: WebviewThemeType;
    readonly styles: { readonly [key: string]: string | number; };
}

@injectable()
export class WebviewThemeDataProvider {

    protected readonly onDidChangeThemeDataEmitter = new Emitter<void>();
    readonly onDidChangeThemeData = this.onDidChangeThemeDataEmitter.event;

    @inject(EditorPreferences)
    protected readonly editorPreferences: EditorPreferences;

    @inject(ColorRegistry)
    protected readonly colors: ColorRegistry;

    @inject(ColorApplicationContribution)
    protected readonly colorContribution: ColorApplicationContribution;

    protected themeData: WebviewThemeData | undefined;

    protected readonly editorStyles = new Map<keyof EditorConfiguration, string>([
        ['editor.fontFamily', 'editor-font-family'],
        ['editor.fontWeight', 'editor-font-weight'],
        ['editor.fontSize', 'editor-font-size']
    ]);

    @postConstruct()
    protected init(): void {
        this.colorContribution.onDidChange(() => this.reset());

        this.editorPreferences.onPreferenceChanged(e => {
            if (this.editorStyles.has(e.preferenceName)) {
                this.reset();
            }
        });
    }

    protected reset(): void {
        if (this.themeData) {
            this.themeData = undefined;
            this.onDidChangeThemeDataEmitter.fire(undefined);
        }
    }

    getThemeData(): WebviewThemeData {
        if (!this.themeData) {
            this.themeData = this.computeThemeData();
        }
        return this.themeData;
    }

    protected computeThemeData(): WebviewThemeData {
        const styles: { [key: string]: string | number; } = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const addStyle = (id: string, rawValue: any) => {
            if (rawValue) {
                const value = typeof rawValue === 'number' || typeof rawValue === 'string' ? rawValue : String(rawValue);
                styles[this.colors.toCssVariableName(id).substr(2)] = value;
                styles[this.colors.toCssVariableName(id, 'vscode').substr(2)] = value;
            }
        };

        addStyle('font-family', '-apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "Ubuntu", "Droid Sans", sans-serif');
        addStyle('font-weight', 'normal');
        addStyle('font-size', '13px');
        this.editorStyles.forEach((value, key) => addStyle(value, this.editorPreferences[key]));

        for (const id of this.colors.getColors()) {
            const color = this.colors.getCurrentColor(id);
            if (color) {
                addStyle(id, color.toString());
            }
        }

        const activeTheme = this.getActiveTheme();
        return { styles, activeTheme };
    }

    protected getActiveTheme(): WebviewThemeType {
        const theme = ThemeService.get().getCurrentTheme();
        switch (theme.type) {
            case 'light': return 'vscode-light';
            case 'dark': return 'vscode-dark';
            default: return 'vscode-high-contrast';
        }
    }

}
