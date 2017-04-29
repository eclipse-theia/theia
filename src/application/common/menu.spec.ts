/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { CommandContribution, CommandRegistry } from './command';
import { CompositeMenuNode, MenuContribution, MenuModelRegistry } from './menu';
import "mocha";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";

const expect = chai.expect;

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
    chai.should();
    chai.use(chaiAsPromised);
});

beforeEach(() => {
});

describe('menu-model-registry', () => {

    describe('01 #register', () => {
        it('Should allow to register menu actions.', () => {
            let service = createMenuRegistry({
                contribute(menuRegistry: MenuModelRegistry): void {
                    menuRegistry.registerSubmenu(["main"], "File", "File");
                    menuRegistry.registerMenuAction(["main", "File", "0_open"], {
                        commandId: 'open'
                    });
                    menuRegistry.registerMenuAction(["main", "File", "0_open"], {
                        commandId: 'open.with'
                    });
                }
            }, {
                contribute(reg: CommandRegistry) {
                    reg.registerCommand({
                        id : 'open',
                        label : "A"
                    });
                    reg.registerCommand({
                        id : 'open.with',
                        label : "B"
                    });
                }
            });
            let all = service.getMenu();
            let main = all.childrens[0] as CompositeMenuNode;
            expect(main.childrens.length).equals(1);
            expect(main.id, "main");
            expect(all.childrens.length).equals(1);
            let file = main.childrens[0] as CompositeMenuNode;
            expect(file.childrens.length).equals(1);
            expect(file.label, "File");
            let openGroup = file.childrens[0] as CompositeMenuNode;
            expect(openGroup.childrens.length).equals(2);
            expect(openGroup.label).undefined;
        });
    });
});

function createMenuRegistry(menuContrib: MenuContribution, commandContrib: CommandContribution) {
    let cmdReg = new CommandRegistry(() => [commandContrib]);
    cmdReg.initialize();
    let menuReg = new MenuModelRegistry(() => [menuContrib], cmdReg);
    menuReg.initialize();
    return menuReg;
}
