/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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