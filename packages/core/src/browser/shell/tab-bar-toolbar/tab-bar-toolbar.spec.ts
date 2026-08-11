// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { enableJSDOM } from '../../test/jsdom';

let disableJSDOM = enableJSDOM();
import { expect } from 'chai';
import {
    CommandMenu, CommandRegistry, CompoundMenuNode, Group, GroupImpl, MenuAction, MenuModelRegistry, MenuNode, MenuNodeFactory, MutableCompoundMenuNode,
    Submenu, SubmenuImpl, SubMenuLink
} from '../../../common';
import { ContextKeyServiceDummyImpl } from '../../context-key-service';
import { ContextMenuRenderer } from '../../context-menu-renderer';
import { Widget } from '../../widgets';
import { TOOLBAR_WRAPPER_ID_SUFFIX } from './tab-bar-toolbar-menu-adapters';
import { TabBarToolbarRegistry } from './tab-bar-toolbar-registry';
import { TAB_BAR_TOOLBAR_CONTEXT_MENU, TabBarToolbarAction } from './tab-bar-toolbar-types';

disableJSDOM();

describe('tab-bar-toolbar', () => {

    describe('comparator', () => {

        before(() => {
            disableJSDOM = enableJSDOM();
        });

        after(() => {
            disableJSDOM();
        });

        const testMe = TabBarToolbarAction.PRIORITY_COMPARATOR;

        it("should favour the 'navigation' group before everything else", () => {
            expect(testMe({ group: 'navigation' }, { group: 'other' })).to.be.equal(-1);
        });

        it("should treat 'undefined' groups as 'navigation'", () => {
            expect(testMe({}, {})).to.be.equal(0);
            expect(testMe({ group: 'navigation' }, {})).to.be.equal(0);
            expect(testMe({}, { group: 'navigation' })).to.be.equal(0);
            expect(testMe({}, { group: 'other' })).to.be.equal(-1);
        });

        it("should fall back to 'priority' if the groups are the same", () => {
            expect(testMe({ priority: 1 }, { priority: 2 })).to.be.equal(-1);
            expect(testMe({ group: 'navigation', priority: 1 }, { priority: 2 })).to.be.equal(-1);
            expect(testMe({ priority: 1 }, { group: 'navigation', priority: 2 })).to.be.equal(-1);
            expect(testMe({ priority: 1, group: 'other' }, { priority: 2 })).to.be.equal(1);
            expect(testMe({ group: 'other', priority: 1 }, { priority: 2, group: 'other' })).to.be.equal(-1);
            expect(testMe({ priority: 10 }, { group: 'other', priority: 2 })).to.be.equal(-1);
            expect(testMe({ group: 'other', priority: 10 }, { group: 'other', priority: 10 })).to.be.equal(0);
        });

    });

    describe('menu delegates', () => {

        const TEST_MENU_PATH = ['test-toolbar-delegate'];
        const TEST_COMMAND = 'test.toolbar.command';
        const TEST_SUBMENU_COMMAND = 'test.toolbar.submenu.command';

        let contextKeyService: ContextKeyServiceDummyImpl;

        before(() => {
            disableJSDOM = enableJSDOM();
        });

        beforeEach(() => {
            contextKeyService = new ContextKeyServiceDummyImpl();
        });

        after(() => {
            disableJSDOM();
        });

        it('passes the delegated widget to command visibility', () => {
            const testWidget = new TestToolbarWidget();
            const commands = createCommandRegistry();
            commands.registerCommand({ id: TEST_COMMAND, label: 'Test Command' }, {
                execute: () => { },
                isVisible: widget => TestToolbarWidget.is(widget) && widget === testWidget
            });
            const menuRegistry = createMenuRegistry(commands);
            menuRegistry.registerMenuAction([...TEST_MENU_PATH, 'other'], { commandId: TEST_COMMAND });
            const registry = createToolbarRegistry(commands, menuRegistry, contextKeyService);
            registry.registerMenuDelegate(TEST_MENU_PATH, TestToolbarWidget.is);

            const commandItem = registry.visibleItems(testWidget).find(item => item.id === `${TEST_COMMAND}${TOOLBAR_WRAPPER_ID_SUFFIX}`);

            expect(commandItem).to.exist;
            testWidget.dispose();
        });

        it('preserves the widget for wrapped command menu visibility, enablement, toggled state, and execution', async () => {
            const testWidget = new TestToolbarWidget();
            let executedWith: unknown;
            const commands = createCommandRegistry();
            commands.registerCommand({ id: TEST_COMMAND, label: 'Test Command' }, {
                execute: widget => executedWith = widget,
                isVisible: widget => TestToolbarWidget.is(widget) && widget === testWidget,
                isEnabled: widget => TestToolbarWidget.is(widget) && widget === testWidget,
                isToggled: widget => TestToolbarWidget.is(widget) && widget === testWidget
            });
            const menuRegistry = createMenuRegistry(commands);
            menuRegistry.registerMenuAction([...TEST_MENU_PATH, 'other'], { commandId: TEST_COMMAND });
            const registry = createToolbarRegistry(commands, menuRegistry, contextKeyService);
            registry.registerMenuDelegate(TEST_MENU_PATH, TestToolbarWidget.is);
            const commandItem = registry.visibleItems(testWidget).find(item => item.id === `${TEST_COMMAND}${TOOLBAR_WRAPPER_ID_SUFFIX}`);
            const node = commandItem?.toMenuNode?.();

            expect(CommandMenu.is(node)).to.be.true;
            if (!CommandMenu.is(node)) {
                throw new Error('Expected a command menu node.');
            }
            expect(node.isVisible(TAB_BAR_TOOLBAR_CONTEXT_MENU, contextKeyService, testWidget.node, testWidget)).to.be.true;
            expect(node.isEnabled(TAB_BAR_TOOLBAR_CONTEXT_MENU, testWidget)).to.be.true;
            expect(node.isToggled(TAB_BAR_TOOLBAR_CONTEXT_MENU, testWidget)).to.be.true;
            await node.run(TAB_BAR_TOOLBAR_CONTEXT_MENU, testWidget);
            expect(executedWith).to.equal(testWidget);
            testWidget.dispose();
        });

        it('preserves the widget for wrapped submenu emptiness checks', () => {
            const testWidget = new TestToolbarWidget();
            const commands = createCommandRegistry();
            commands.registerCommand({ id: TEST_SUBMENU_COMMAND, label: 'Test Submenu Command' }, {
                execute: () => { },
                isVisible: widget => TestToolbarWidget.is(widget) && widget === testWidget
            });
            const menuRegistry = createMenuRegistry(commands);
            menuRegistry.registerSubmenu([...TEST_MENU_PATH, 'other', 'test-submenu'], 'Test Submenu');
            menuRegistry.registerMenuAction([...TEST_MENU_PATH, 'other', 'test-submenu'], { commandId: TEST_SUBMENU_COMMAND });
            const registry = createToolbarRegistry(commands, menuRegistry, contextKeyService);
            registry.registerMenuDelegate(TEST_MENU_PATH, TestToolbarWidget.is);
            const submenuItem = registry.visibleItems(testWidget).find(item => item.id === `test-submenu${TOOLBAR_WRAPPER_ID_SUFFIX}`);
            const node = submenuItem?.toMenuNode?.();

            expect(CompoundMenuNode.is(node)).to.be.true;
            if (!CompoundMenuNode.is(node)) {
                throw new Error('Expected a compound menu node.');
            }
            expect(node.isEmpty(TAB_BAR_TOOLBAR_CONTEXT_MENU, contextKeyService, testWidget.node, testWidget)).to.be.false;
            testWidget.dispose();
        });

    });

});

class TestToolbarWidget extends Widget {
    static is(candidate?: Widget): candidate is TestToolbarWidget {
        return candidate instanceof TestToolbarWidget;
    }
}

class TestMenuNodeFactory implements MenuNodeFactory {

    constructor(protected readonly commands: CommandRegistry) { }

    createGroup(id: string, orderString?: string, when?: string): Group & MutableCompoundMenuNode {
        return new GroupImpl(id, orderString, when);
    }

    createSubmenu(id: string, label: string, contextKeyOverlays: Record<string, string> | undefined, orderString?: string, icon?: string, when?: string):
        Submenu & MutableCompoundMenuNode {
        return new SubmenuImpl(id, label, contextKeyOverlays, orderString, icon, when);
    }

    createSubmenuLink(delegate: Submenu, sortString?: string, when?: string): MenuNode {
        return new SubMenuLink(delegate, sortString, when);
    }

    createCommandMenu(item: MenuAction): CommandMenu {
        return {
            isVisible: (_path, _contextMatcher, _context, ...args) => this.commands.isVisible(item.commandId, ...args),
            isEnabled: (_path, ...args) => this.commands.isEnabled(item.commandId, ...args),
            isToggled: (_path, ...args) => this.commands.isToggled(item.commandId, ...args),
            id: item.commandId,
            label: item.label || this.commands.getCommand(item.commandId)?.label || '',
            icon: item.icon,
            when: item.when,
            sortString: item.order || '',
            run: async (_path, ...args) => { await this.commands.executeCommand(item.commandId, ...args); }
        };
    }
}

function createCommandRegistry(): CommandRegistry {
    return new CommandRegistry({ getContributions: () => [] });
}

function createMenuRegistry(commands: CommandRegistry): MenuModelRegistry {
    return new MenuModelRegistry({ getContributions: () => [] }, commands, new TestMenuNodeFactory(commands));
}

function createToolbarRegistry(commands: CommandRegistry, menuRegistry: MenuModelRegistry, contextKeyService: ContextKeyServiceDummyImpl): TabBarToolbarRegistry {
    const registry = new TabBarToolbarRegistry();
    Reflect.set(registry, 'commandRegistry', commands);
    Reflect.set(registry, 'contextKeyService', contextKeyService);
    Reflect.set(registry, 'menuRegistry', menuRegistry);
    Reflect.set(registry, 'keybindingRegistry', {});
    Reflect.set(registry, 'labelParser', {});
    Reflect.set(registry, 'contextMenuRenderer', { render: () => undefined } as unknown as ContextMenuRenderer);
    return registry;
}
