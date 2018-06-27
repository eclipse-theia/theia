/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { MonacoTheme } from '../../common/monaco-theme-types';

export class BuiltinMonacoThemeProvider {

    protected static readonly rawThemes: { [file: string]: object } = {
        './dark_default.json': require('../../../data/monaco-themes/vscode/dark_defaults.json'),
        './dark_vs.json': require('../../../data/monaco-themes/vscode/dark_vs.json'),
        './dark_plus.json': require('../../../data/monaco-themes/vscode/dark_plus.json'),

        './light_default.json': require('../../../data/monaco-themes/vscode/light_defaults.json'),
        './light_vs.json': require('../../../data/monaco-themes/vscode/light_vs.json'),
        './light_plus.json': require('../../../data/monaco-themes/vscode/light_plus.json'),
    };

    protected static readonly nameMap: { [name: string]: string } = {
        'light-plus': 'light_plus',
        'dark-plus': 'dark_plus',
    };

    protected static readonly baseMap: { [name: string]: monaco.editor.BuiltinTheme } = {
        'light-plus': 'vs',
    };

    static compileMonacoThemes() {
        [
            'light-plus', 'dark-plus',
        ].forEach(name => {
            const rawName = this.nameMap[name] || name;
            const theme = this.convertVscodeToMonaco(
                this.rawThemes[`./${rawName}.json`],
                {
                    name,
                    base: this.baseMap[name] || 'vs-dark',
                    inherit: true,
                    rules: [],
                    colors: {},
                }
            );

            monaco.editor.defineTheme(theme.name, theme);
        });
    }

    // tslint:disable-next-line:no-any
    protected static convertVscodeToMonaco(vscodeTheme: any, monacoTheme: MonacoTheme): MonacoTheme {

        // Recursion in order to follow the theme dependencies that vscode has...
        if (typeof vscodeTheme.include !== 'undefined') {
            const subTheme = this.rawThemes[vscodeTheme.include];
            if (subTheme) {
                this.convertVscodeToMonaco(subTheme, monacoTheme);
            }
        }

        Object.assign(monacoTheme.colors, vscodeTheme.colors);

        if (typeof vscodeTheme.tokenColors !== 'undefined') {
            for (const tokenColor of vscodeTheme.tokenColors) {

                if (typeof tokenColor.scope === 'undefined') {
                    tokenColor.scope = [''];
                } else if (typeof tokenColor.scope === 'string') {
                    // tokenColor.scope = tokenColor.scope.split(',').map((scope: string) => scope.trim()); // ?
                    tokenColor.scope = [tokenColor.scope];
                }

                for (const scope of tokenColor.scope) {

                    // Converting numbers into a format that monaco understands
                    const settings = Object.keys(tokenColor.settings).reduce((previous: { [key: string]: string }, current) => {
                        let value: string = tokenColor.settings[current];
                        if (typeof value === typeof '') {
                            value = value.replace(/^\#/, '').slice(0, 6);
                        }
                        previous[current] = value;
                        return previous;
                    }, {});

                    monacoTheme.rules.push({
                        ...settings, token: scope
                    });
                }
            }
        }

        return monacoTheme;
    }

}
