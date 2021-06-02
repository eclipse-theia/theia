/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as electron from '../../../shared/electron';
import { inject, injectable } from 'inversify';
import { ContextMenuRenderer, RenderContextMenuOptions, ContextMenuAccess, FrontendApplicationContribution, CommonCommands } from '../../browser';
import { ElectronMainMenuFactory } from './electron-main-menu-factory';
import { ContextMenuContext } from '../../browser/menu/context-menu-context';
import { MenuPath, MenuContribution, MenuModelRegistry } from '../../common';

export class ElectronContextMenuAccess extends ContextMenuAccess {
    constructor(readonly menu: electron.Menu) {
        super({
            dispose: () => menu.closePopup()
        });
    }
}

export namespace ElectronTextInputContextMenu {
    export const MENU_PATH: MenuPath = ['electron_text_input'];
    export const UNDO_REDO_EDIT_GROUP = [...MENU_PATH, '0_undo_redo_group'];
    export const EDIT_GROUP = [...MENU_PATH, '1_edit_group'];
    export const SELECT_GROUP = [...MENU_PATH, '2_select_group'];
}

@injectable()
export class ElectronTextInputContextMenuContribution implements FrontendApplicationContribution, MenuContribution {

    @inject(ContextMenuRenderer)
    protected readonly contextMenuRenderer: ContextMenuRenderer;

    onStart(): void {
        window.document.addEventListener('contextmenu', event => {
            if (event.target instanceof HTMLElement) {
                const target = <HTMLElement>event.target;
                if (target.nodeName && (target.nodeName.toLowerCase() === 'input' || target.nodeName.toLowerCase() === 'textarea')) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.contextMenuRenderer.render({
                        anchor: event,
                        menuPath: ElectronTextInputContextMenu.MENU_PATH,
                        onHide: () => target.focus()
                    });
                }
            }
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(ElectronTextInputContextMenu.UNDO_REDO_EDIT_GROUP, { commandId: CommonCommands.UNDO.id });
        registry.registerMenuAction(ElectronTextInputContextMenu.UNDO_REDO_EDIT_GROUP, { commandId: CommonCommands.REDO.id });
        registry.registerMenuAction(ElectronTextInputContextMenu.EDIT_GROUP, { commandId: CommonCommands.CUT.id });
        registry.registerMenuAction(ElectronTextInputContextMenu.EDIT_GROUP, { commandId: CommonCommands.COPY.id });
        registry.registerMenuAction(ElectronTextInputContextMenu.EDIT_GROUP, { commandId: CommonCommands.PASTE.id });
        registry.registerMenuAction(ElectronTextInputContextMenu.SELECT_GROUP, { commandId: CommonCommands.SELECT_ALL.id });
    }

}

@injectable()
export class ElectronContextMenuRenderer extends ContextMenuRenderer {

    @inject(ContextMenuContext)
    protected readonly context: ContextMenuContext;

    constructor(@inject(ElectronMainMenuFactory) private menuFactory: ElectronMainMenuFactory) {
        super();
    }

    protected doRender({ menuPath, anchor, args, onHide }: RenderContextMenuOptions): ElectronContextMenuAccess {
        const menu = this.menuFactory.createContextMenu(menuPath, args);
        const { x, y } = anchor instanceof MouseEvent ? { x: anchor.clientX, y: anchor.clientY } : anchor!;
        const zoom = electron.webFrame.getZoomFactor();
        // x and y values must be Ints or else there is a conversion error
        menu.popup({ x: Math.round(x * zoom), y: Math.round(y * zoom) });
        // native context menu stops the event loop, so there is no keyboard events
        this.context.resetAltPressed();
        if (onHide) {
            menu.once('menu-will-close', () => onHide());
        }
        return new ElectronContextMenuAccess(menu);
    }

}
