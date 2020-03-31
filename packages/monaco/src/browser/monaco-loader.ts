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

/* eslint-disable @typescript-eslint/no-explicit-any */

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
        vsRequire(['vs/editor/editor.main'], () => {
            vsRequire([
                'vs/language/css/monaco.contribution',
                'vs/language/html/monaco.contribution',
                'vs/platform/commands/common/commands',
                'vs/platform/actions/common/actions',
                'vs/platform/keybinding/common/keybindingsRegistry',
                'vs/platform/keybinding/common/keybindingResolver',
                'vs/platform/keybinding/common/usLayoutResolvedKeybinding',
                'vs/base/common/keybindingLabels',
                'vs/base/common/keyCodes',
                'vs/base/common/mime',
                'vs/editor/browser/editorExtensions',
                'vs/editor/standalone/browser/simpleServices',
                'vs/editor/standalone/browser/standaloneServices',
                'vs/editor/standalone/browser/standaloneLanguages',
                'vs/base/parts/quickopen/browser/quickOpenWidget',
                'vs/base/parts/quickopen/browser/quickOpenModel',
                'vs/base/common/filters',
                'vs/platform/theme/common/styler',
                'vs/platform/theme/common/colorRegistry',
                'vs/base/common/color',
                'vs/base/common/platform',
                'vs/editor/common/modes',
                'vs/editor/contrib/suggest/suggest',
                'vs/editor/contrib/snippet/snippetParser',
                'vs/platform/configuration/common/configuration',
                'vs/platform/configuration/common/configurationModels',
                'vs/editor/browser/services/codeEditorService',
                'vs/editor/browser/services/codeEditorServiceImpl',
                'vs/platform/markers/common/markerService',
                'vs/platform/contextkey/common/contextkey',
                'vs/platform/contextkey/browser/contextKeyService',
                'vs/base/common/errors',
                'vs/platform/instantiation/common/instantiation'
            ], (css: any, html: any, commands: any, actions: any,
                keybindingsRegistry: any, keybindingResolver: any, resolvedKeybinding: any, keybindingLabels: any,
                keyCodes: any, mime: any, editorExtensions: any, simpleServices: any,
                standaloneServices: any, standaloneLanguages: any, quickOpenWidget: any, quickOpenModel: any,
                filters: any, styler: any, colorRegistry: any, color: any,
                platform: any, modes: any, suggest: any, snippetParser: any,
                configuration: any, configurationModels: any,
                codeEditorService: any, codeEditorServiceImpl: any,
                markerService: any,
                contextKey: any, contextKeyService: any,
                error: any,
                instantiation: any) => {
                    const global: any = self;
                    global.monaco.commands = commands;
                    global.monaco.actions = actions;
                    global.monaco.keybindings = Object.assign({}, keybindingsRegistry, keybindingResolver, resolvedKeybinding, keybindingLabels, keyCodes);
                    global.monaco.services = Object.assign({}, simpleServices, standaloneServices, standaloneLanguages, configuration, configurationModels,
                        codeEditorService, codeEditorServiceImpl, markerService);
                    global.monaco.quickOpen = Object.assign({}, quickOpenWidget, quickOpenModel);
                    global.monaco.filters = filters;
                    global.monaco.theme = styler;
                    global.monaco.color = Object.assign({}, colorRegistry, color);
                    global.monaco.platform = platform;
                    global.monaco.editorExtensions = editorExtensions;
                    global.monaco.modes = modes;
                    global.monaco.suggest = suggest;
                    global.monaco.snippetParser = snippetParser;
                    global.monaco.contextkey = contextKey;
                    global.monaco.contextKeyService = contextKeyService;
                    global.monaco.mime = mime;
                    global.monaco.error = error;
                    global.monaco.instantiation = instantiation;
                    resolve();
                });
        });
    });
}
