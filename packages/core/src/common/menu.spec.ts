/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';

import { CommandContribution, CommandRegistry } from './command';
import { CompositeMenuNode, MenuContribution, MenuModelRegistry } from './menu';

describe('menu-model-registry', () => {

    describe('01 #register', () => {
        test('Should allow to register menu actions.', () => {
            const fileMenu = ["main", "File"];
            const fileOpenMenu = [...fileMenu, "0_open"];
            const service = createMenuRegistry({
                registerMenus(menuRegistry: MenuModelRegistry): void {
                    menuRegistry.registerSubmenu(fileMenu, "File");
                    menuRegistry.registerMenuAction(fileOpenMenu, {
                        commandId: 'open'
                    });
                    menuRegistry.registerMenuAction(fileOpenMenu, {
                        commandId: 'open.with'
                    });
                }
            }, {
                    registerCommands(reg: CommandRegistry) {
                        reg.registerCommand({
                            id: 'open',
                            label: "A"
                        });
                        reg.registerCommand({
                            id: 'open.with',
                            label: "B"
                        });
                    }
                });
            const all = service.getMenu();
            const main = all.children[0] as CompositeMenuNode;
            expect(main.children).toHaveLength(1);
            expect(main.id).toBe("main");
            expect(all.children).toHaveLength(1);
            const file = main.children[0] as CompositeMenuNode;
            expect(file.children).toHaveLength(1);
            expect(file.label).toBe("File");
            const openGroup = file.children[0] as CompositeMenuNode;
            expect(openGroup.children).toHaveLength(2);
            expect(openGroup.label).toBeUndefined();
        });
    });
});

function createMenuRegistry(menuContrib: MenuContribution, commandContrib: CommandContribution) {
    const cmdReg = new CommandRegistry({ getContributions: () => [commandContrib] });
    cmdReg.onStart();
    const menuReg = new MenuModelRegistry({ getContributions: () => [menuContrib] }, cmdReg);
    menuReg.onStart();
    return menuReg;
}
