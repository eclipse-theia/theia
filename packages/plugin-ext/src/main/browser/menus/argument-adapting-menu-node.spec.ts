// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { expect } from 'chai';
import { AcceleratorSource, CommandMenu, CompoundMenuNode, ContextExpressionMatcher, RenderedMenuNode } from '@theia/core';
import { GroupImpl, SubmenuImpl } from '@theia/core/lib/browser/menu/composite-menu-node';
import { ArgumentAdaptingCompoundMenuNode } from './argument-adapting-menu-node';

describe('ArgumentAdaptingCompoundMenuNode', () => {

    const contextMatcher: ContextExpressionMatcher<undefined> = { match: () => true };

    class RecordingCommandMenu implements CommandMenu, AcceleratorSource {
        readonly calls: { method: string, args: unknown[] }[] = [];
        readonly sortString = '';
        constructor(readonly id: string, readonly label = id) { }
        isVisible<T>(_contextMatcher: ContextExpressionMatcher<T>, _context: T | undefined, ...args: unknown[]): boolean {
            this.calls.push({ method: 'isVisible', args });
            return true;
        }
        isEnabled(...args: unknown[]): boolean {
            this.calls.push({ method: 'isEnabled', args });
            return true;
        }
        isToggled(...args: unknown[]): boolean {
            this.calls.push({ method: 'isToggled', args });
            return false;
        }
        async run(...args: unknown[]): Promise<void> {
            this.calls.push({ method: 'run', args });
        }
        getAccelerator(): string[] {
            return ['ctrl', 'k'];
        }
    }

    const toInner = (...args: unknown[]) => ['inner', ...args];
    const toOuter = (...args: unknown[]) => ['outer', ...args];

    function firstCommand(node: CompoundMenuNode): CommandMenu {
        const child = node.children[0];
        if (!CommandMenu.is(child)) {
            throw new Error('Expected a command menu node.');
        }
        return child;
    }

    it('passes adapted arguments to the actions it contains', async () => {
        const command = new RecordingCommandMenu('command');
        const submenu = new SubmenuImpl('submenu', 'Submenu', undefined);
        submenu.addNode(command);
        const adapted = firstCommand(new ArgumentAdaptingCompoundMenuNode(submenu, toOuter));

        adapted.isVisible(contextMatcher, undefined, 'arg');
        adapted.isEnabled('arg');
        adapted.isToggled('arg');
        await adapted.run('arg');

        expect(command.calls).to.deep.equal(['isVisible', 'isEnabled', 'isToggled', 'run'].map(method => ({ method, args: ['outer', 'arg'] })));
    });

    it('adapts the arguments of actions in nested menus', async () => {
        const command = new RecordingCommandMenu('command');
        const submenu = new SubmenuImpl('submenu', 'Submenu', undefined);
        const group = new GroupImpl('group');
        group.addNode(command);
        submenu.addNode(group);
        const adaptedGroup = new ArgumentAdaptingCompoundMenuNode(submenu, toOuter).children[0];
        if (!CompoundMenuNode.is(adaptedGroup)) {
            throw new Error('Expected a compound menu node.');
        }

        await firstCommand(adaptedGroup).run('arg');

        expect(command.calls).to.deep.equal([{ method: 'run', args: ['outer', 'arg'] }]);
    });

    it('lets an outer adapter replace an inner one', async () => {
        const command = new RecordingCommandMenu('command');
        const innerSubmenu = new SubmenuImpl('inner', 'Inner', undefined);
        innerSubmenu.addNode(command);
        const outerSubmenu = new SubmenuImpl('outer', 'Outer', undefined);
        outerSubmenu.addNode(new ArgumentAdaptingCompoundMenuNode(innerSubmenu, toInner));
        const adaptedInner = new ArgumentAdaptingCompoundMenuNode(outerSubmenu, toOuter).children[0];
        if (!CompoundMenuNode.is(adaptedInner)) {
            throw new Error('Expected a compound menu node.');
        }

        await firstCommand(adaptedInner).run('arg');

        expect(command.calls).to.deep.equal([{ method: 'run', args: ['outer', 'arg'] }]);
    });

    it('returns the same adapted children on every access', () => {
        const submenu = new SubmenuImpl('submenu', 'Submenu', undefined);
        submenu.addNode(new RecordingCommandMenu('command'));
        const adapted = new ArgumentAdaptingCompoundMenuNode(submenu, toOuter);

        expect(adapted.children[0]).to.equal(adapted.children[0]);
    });

    it('preserves whether the delegate is a submenu or a group', () => {
        expect(RenderedMenuNode.is(new ArgumentAdaptingCompoundMenuNode(new SubmenuImpl('submenu', 'Submenu', undefined), toOuter))).to.be.true;
        expect(RenderedMenuNode.is(new ArgumentAdaptingCompoundMenuNode(new GroupImpl('group'), toOuter))).to.be.false;
    });

    it('forwards accelerators of the actions it contains', () => {
        const submenu = new SubmenuImpl('submenu', 'Submenu', undefined);
        submenu.addNode(new RecordingCommandMenu('command'));
        const adapted = firstCommand(new ArgumentAdaptingCompoundMenuNode(submenu, toOuter));

        expect(AcceleratorSource.is(adapted) && adapted.getAccelerator(undefined)).to.deep.equal(['ctrl', 'k']);
    });

    it('considers adapted arguments when checking for visible children', () => {
        const submenu = new SubmenuImpl('submenu', 'Submenu', undefined);
        const command = new RecordingCommandMenu('command');
        command.isVisible = <T>(_contextMatcher: ContextExpressionMatcher<T>, _context: T | undefined, ...args: unknown[]): boolean => args[0] === 'outer';
        submenu.addNode(command);

        expect(submenu.isEmpty(contextMatcher, undefined)).to.be.true;
        expect(new ArgumentAdaptingCompoundMenuNode(submenu, toOuter).isEmpty(contextMatcher, undefined)).to.be.false;
    });
});
