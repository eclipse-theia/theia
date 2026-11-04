// *****************************************************************************
// Copyright (C) 2026 JuliaHub and others.
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

import { expect } from 'chai';
import { Title, Widget } from '@lumino/widgets';
import { SidePanelHandler } from './side-panel-handler.js';
import { CommandMenu, CompoundMenuNode } from '../../common/menu/index.js';
import { RenderContextMenuOptions } from '../context-menu-renderer.js';
disableJSDOM();

describe('SidePanelHandler', () => {

    beforeEach(() => {
        disableJSDOM = enableJSDOM();
    });

    afterEach(() => {
        disableJSDOM();
    });

    function createHandler(ids: string[]): { titles: Title<Widget>[], hidden: Set<string>, openItemsMenu(): CommandMenu[] } {
        const titles = ids.map(id => {
            const widget = new Widget();
            widget.id = id;
            widget.title.label = id;
            return widget.title;
        });
        const hidden = new Set<string>();
        let menu: CompoundMenuNode | undefined;
        const handler = Object.create(SidePanelHandler.prototype) as SidePanelHandler;
        Object.assign(handler, {
            side: 'left',
            tabBar: {
                titles,
                node: document.createElement('div'),
                canHideTitle: (title: Title<Widget>) => !hidden.has(title.owner.id) && titles.some(other => other !== title && !hidden.has(other.owner.id))
            },
            itemVisibility: {
                isHidden: (id: string) => hidden.has(id),
                setHidden: (id: string, value: boolean) => value ? hidden.add(id) : hidden.delete(id)
            },
            contextMenuRenderer: {
                render: (options: RenderContextMenuOptions) => {
                    menu = options.menu;
                }
            }
        });
        return {
            titles,
            hidden,
            openItemsMenu: () => {
                handler['showItemsContextMenu'](new MouseEvent('contextmenu'));
                return (menu?.children ?? []).filter(CommandMenu.is);
            }
        };
    }

    it('lists every item as a checked toggle that hides it when run', async () => {
        const { hidden, openItemsMenu } = createHandler(['explorer', 'search']);

        const [explorer, search] = openItemsMenu();
        expect([explorer.label, search.label]).to.deep.equal(['explorer', 'search']);
        expect(search.isToggled([])).to.be.true;

        await search.run([]);
        expect(hidden.has('search')).to.be.true;
        expect(search.isToggled([])).to.be.false;
    });

    it('disables the toggle of the last visible item', () => {
        const { hidden, openItemsMenu } = createHandler(['explorer', 'search']);
        hidden.add('search');

        const [explorer, search] = openItemsMenu();
        expect(explorer.isEnabled([])).to.be.false;
        expect(search.isEnabled([])).to.be.true;
    });
});
