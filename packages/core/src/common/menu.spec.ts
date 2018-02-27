/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { CommandContribution, CommandRegistry } from './command';
import { CompositeMenuNode, MenuContribution, MenuModelRegistry } from './menu';
import * as chai from "chai";

const expect = chai.expect;

describe('menu-model-registry', () => {

    describe('01 #register', () => {
        it('Should allow to register menu actions.', () => {
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
            expect(main.children.length).equals(1);
            expect(main.id, "main");
            expect(all.children.length).equals(1);
            const file = main.children[0] as CompositeMenuNode;
            expect(file.children.length).equals(1);
            expect(file.label, "File");
            const openGroup = file.children[0] as CompositeMenuNode;
            expect(openGroup.children.length).equals(2);
            // tslint:disable-next-line:no-unused-expression
            expect(openGroup.label).undefined;
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
