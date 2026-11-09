// *****************************************************************************
// Copyright (C) 2026 Yash Kakade and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { ContextMenuAccess, ContextMenuRenderer, RenderContextMenuOptions } from '@theia/core/lib/browser/context-menu-renderer';
import { Disposable } from '@theia/core/lib/common/disposable';
import { MenuItemAction } from '@theia/monaco-editor-core/esm/vs/platform/actions/common/actions.js';
import { IContextMenuDelegate } from '@theia/monaco-editor-core/esm/vs/base/browser/contextmenu.js';
import type { MonacoContextMenuService as MonacoContextMenuServiceType } from './monaco-context-menu.js';

disableJSDOM();

describe('MonacoContextMenuService', () => {

    let MonacoContextMenuService: typeof MonacoContextMenuServiceType;
    let service: MonacoContextMenuServiceType;
    let access: ContextMenuAccess | undefined;
    let hidden: number;

    before(async () => {
        disableJSDOM = enableJSDOM();
        ({ MonacoContextMenuService } = await import('./monaco-context-menu.js'));
    });
    after(() => disableJSDOM());

    beforeEach(() => {
        access = undefined;
        hidden = 0;
        const renderer = {
            render: (options: RenderContextMenuOptions) => {
                // Like the browser renderer, disposing the access closes the menu and calls `onHide`.
                access = new ContextMenuAccess(Disposable.create(() => options.onHide?.()));
                return access;
            }
        } as unknown as ContextMenuRenderer;
        const container = new Container();
        container.bind(ContextMenuRenderer).toConstantValue(renderer);
        container.bind(MonacoContextMenuService).toSelf();
        service = container.get(MonacoContextMenuService);
    });

    const showEditorContextMenu = () => service.showContextMenu({
        getAnchor: () => ({ x: 10, y: 10 }),
        // The editor context menu is rendered by Theia when Monaco passes `MenuItemAction`s.
        getActions: () => [Object.create(MenuItemAction.prototype)],
        onHide: () => hidden++
    } as unknown as IContextMenuDelegate);

    const wheel = (target: EventTarget) => target.dispatchEvent(new window.WheelEvent('wheel', { bubbles: true, deltaY: 100 }));

    it('closes the editor context menu on mouse wheel', () => {
        showEditorContextMenu();
        expect(access?.disposed).to.be.false;

        wheel(document.body);

        expect(access?.disposed).to.be.true;
        expect(hidden).to.equal(1);
    });

    it('keeps the context menu open on mouse wheel over the menu itself', () => {
        showEditorContextMenu();
        const menuNode = document.createElement('div');
        menuNode.classList.add('lm-Menu');
        const item = document.createElement('div');
        menuNode.appendChild(item);
        document.body.appendChild(menuNode);
        try {
            wheel(item);
            expect(access?.disposed).to.be.false;
        } finally {
            menuNode.remove();
            access?.dispose();
        }
    });

    it('stops listening for the mouse wheel when the context menu is hidden', () => {
        showEditorContextMenu();
        const first = access!;
        first.dispose();
        expect(hidden).to.equal(1);

        wheel(document.body);

        expect(hidden).to.equal(1);
    });
});
