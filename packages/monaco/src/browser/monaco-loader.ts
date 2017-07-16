/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { FileUri } from "@theia/core/lib/node/file-uri";

export function loadVsRequire(context: any): Promise<any> {
    // Monaco uses a custom amd loader that over-rides node's require.
    // Keep a reference to an original require so we can restore it after executing the amd loader file.
    const originalRequire = context.require;

    return new Promise<any>(resolve => {
        const vsLoader = document.createElement('script');
        vsLoader.type = 'text/javascript';
        vsLoader.src = './vs/loader.js';
        vsLoader.charset = 'utf-8';
        vsLoader.addEventListener('load', () => {
            // Save Monaco's amd require and restore the original require
            const amdRequire = context.require;
            context.require = originalRequire;

            const baseUrl = FileUri.create(__dirname).toString();
            amdRequire.config({ baseUrl });
            resolve(amdRequire);
        });
        document.body.appendChild(vsLoader);
    });
}

export function loadMonaco(vsRequire: any): Promise<void> {
    return new Promise<void>(resolve => {
        vsRequire(["vs/editor/editor.main"], () => {
            vsRequire([
                'vs/basic-languages/src/monaco.contribution',
                'vs/language/css/monaco.contribution',
                'vs/language/typescript/src/monaco.contribution',
                'vs/language/html/monaco.contribution',
                'vs/language/json/monaco.contribution',
                'vs/platform/commands/common/commands',
                'vs/platform/actions/common/actions',
                'vs/platform/keybinding/common/keybindingsRegistry',
                'vs/platform/keybinding/common/keybindingResolver',
                'vs/base/common/keyCodes',
                'vs/editor/browser/standalone/simpleServices'
            ], (basic: any, css: any, ts: any, html: any, json: any, commands: any, actions: any, registry: any, resolver: any,
                keyCodes: any, simpleServices: any) => {
                    const global: any = self;
                    global.monaco.commands = commands;
                    global.monaco.actions = actions;
                    global.monaco.keybindings = Object.assign(registry, resolver, keyCodes);
                    global.monaco.services = simpleServices;
                    resolve();
                });
        });
    });
};