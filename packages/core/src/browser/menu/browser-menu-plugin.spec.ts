// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { enableJSDOM } from '../test/jsdom.js';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '../frontend-application-config-provider.js';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { CommandRegistry as LuminoCommandRegistry } from '@lumino/commands';
import { Menu } from '@lumino/widgets';
import { CommandMenu, CompoundMenuNode } from '../../common/menu/menu-types.js';
import { ContextMatcher } from '../context-key-service.js';
import { DynamicMenuWidget, MenuServices } from './browser-menu-plugin.js';
disableJSDOM();

describe('DynamicMenuWidget', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    function commandMenu(id: string, toggled: boolean): CommandMenu {
        return {
            id,
            label: id,
            sortString: id,
            isVisible: () => true,
            isEnabled: () => true,
            isToggled: () => toggled,
            run: () => Promise.resolve()
        };
    }

    it('gives the menuitemcheckbox role only to toggled items', () => {
        const menu: CompoundMenuNode = {
            id: 'test',
            sortString: '',
            children: [commandMenu('plain', false), commandMenu('toggled', true)],
            isVisible: () => true,
            isEmpty: () => false
        };
        const widget = new DynamicMenuWidget(['test'], menu, { commands: new LuminoCommandRegistry() }, {} as ContextMatcher, {} as MenuServices);

        const aria = widget.items.map(item => Menu.defaultRenderer.createItemARIA({ item, active: false, collapsed: false }));

        expect(aria).to.deep.equal([
            { role: 'menuitem' },
            { role: 'menuitemcheckbox', 'aria-checked': 'true' }
        ]);
    });
});
