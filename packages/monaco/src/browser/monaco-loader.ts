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

// tslint:disable:no-any

export function loadVsRequire(context: any): Promise<any> {
    // Monaco uses a custom amd loader that over-rides node's require.
    // Keep a reference to an original require so we can restore it after executing the amd loader file.
    const originalRequire = context.require;

    return new Promise<any>(resolve =>
        window.addEventListener('load', () => {
            const vsLoader = document.createElement('script');
            vsLoader.type = 'text/javascript';
            vsLoader.src = './vs/loader.js';
            vsLoader.charset = 'utf-8';
            vsLoader.addEventListener('load', () => {
                // Save Monaco's amd require and restore the original require
                const amdRequire = context.require;
                if (originalRequire) {
                    context.require = originalRequire;
                }
                resolve(amdRequire);
            });
            document.body.appendChild(vsLoader);
        }, { once: true })
    );
}

export function loadMonaco(vsRequire: any): Promise<void> {
    return new Promise<void>(resolve => {
        vsRequire(["vs/editor/editor.main"], () => {
            vsRequire([
                'vs/language/css/monaco.contribution',
                'vs/language/html/monaco.contribution',
                'vs/platform/commands/common/commands',
                'vs/platform/actions/common/actions',
                'vs/platform/keybinding/common/keybindingsRegistry',
                'vs/platform/keybinding/common/keybindingResolver',
                'vs/platform/keybinding/common/usLayoutResolvedKeybinding',
                'vs/base/common/keyCodes',
                'vs/editor/browser/editorExtensions',
                'vs/editor/standalone/browser/simpleServices',
                'vs/editor/standalone/browser/standaloneServices',
                'vs/base/parts/quickopen/common/quickOpen',
                'vs/base/parts/quickopen/browser/quickOpenWidget',
                'vs/base/parts/quickopen/browser/quickOpenModel',
                'vs/base/common/filters',
                'vs/platform/theme/common/styler',
                'vs/base/common/platform',
                'vs/editor/common/modes',
                'vs/base/common/cancellation',
                'vs/editor/contrib/suggest/suggestController',
                'vs/editor/contrib/find/findController',
                'vs/editor/contrib/rename/rename',
            ], (css: any, html: any, commands: any, actions: any, registry: any, resolver: any, resolvedKeybinding: any,
                keyCodes: any, editorExtensions: any, simpleServices: any, standaloneServices: any, quickOpen: any, quickOpenWidget: any, quickOpenModel: any,
                filters: any, styler: any, platform: any, modes: any, cancellation: any, suggestController: any, findController: any, rename: any) => {
                    const global: any = self;
                    global.monaco.commands = commands;
                    global.monaco.actions = actions;
                    global.monaco.keybindings = Object.assign({}, registry, resolver, resolvedKeybinding, keyCodes);
                    global.monaco.services = Object.assign({}, simpleServices, standaloneServices);
                    global.monaco.quickOpen = Object.assign({}, quickOpen, quickOpenWidget, quickOpenModel);
                    global.monaco.filters = filters;
                    global.monaco.theme = styler;
                    global.monaco.platform = platform;
                    global.monaco.editorExtensions = editorExtensions;
                    global.monaco.modes = modes;
                    global.monaco.cancellation = cancellation;
                    global.monaco.suggestController = suggestController;
                    global.monaco.findController = findController;
                    global.monaco.rename = rename;
                    resolve();
                });
        });
    });
}
