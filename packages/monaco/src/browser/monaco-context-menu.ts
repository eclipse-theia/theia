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

import { injectable, inject } from 'inversify';
import { EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser';
import { ContextMenuRenderer, toAnchor } from '@theia/core/lib/browser';
import IContextMenuService = monaco.editor.IContextMenuService;
import IContextMenuDelegate = monaco.editor.IContextMenuDelegate;
import { Menu } from '@phosphor/widgets';
import { CommandRegistry } from '@phosphor/commands';

@injectable()
export class MonacoContextMenuService implements IContextMenuService {

    constructor(@inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer) {
    }

    showContextMenu(delegate: IContextMenuDelegate): void {
        const anchor = toAnchor(delegate.getAnchor());
        // If it is the general context menu, we want to delegate to our menu registry entirely and ignore the actually passed actions.
        // Unfortunately checking the existence of certain properties seems to be the best way to tell, what kind of context menu is requested.
        if (delegate.hasOwnProperty('getKeyBinding')) {
            this.contextMenuRenderer.render(EDITOR_CONTEXT_MENU, anchor, () => delegate.onHide(false));
        } else {
            const actions = delegate.getActions();
            const commands = new CommandRegistry();
            const menu = new Menu({
                commands
            });

            for (const action of actions) {
                const commandId = 'quickfix_' + actions.indexOf(action);
                commands.addCommand(commandId, {
                    label: action.label,
                    className: action.class,
                    isToggled: () => action.checked,
                    isEnabled: () => action.enabled,
                    execute: () => action.run()
                });
                menu.addItem({
                    type: 'command',
                    command: commandId
                });
            }
            menu.aboutToClose.connect(() => delegate.onHide(false));
            menu.open(anchor.x, anchor.y);
        }
    }

}
