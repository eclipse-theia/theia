// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { MenuPath } from '@theia/core/lib/common/menu';
import { EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser';
import { Anchor, ContextMenuAccess, ContextMenuRenderer, Coordinate } from '@theia/core/lib/browser';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { Menu } from '@theia/core/shared/@lumino/widgets';
import { CommandRegistry } from '@theia/core/shared/@lumino/commands';
import { IContextMenuService } from '@theia/monaco-editor-core/esm/vs/platform/contextview/browser/contextView.js';
import { IContextMenuDelegate } from '@theia/monaco-editor-core/esm/vs/base/browser/contextmenu.js';
import { IAction, Separator, SubmenuAction } from '@theia/monaco-editor-core/esm/vs/base/common/actions.js';
import { MenuItemAction } from '@theia/monaco-editor-core/esm/vs/platform/actions/common/actions.js';
import { Event, Emitter } from '@theia/monaco-editor-core/esm/vs/base/common/event.js';
import { StandardMouseEvent } from '@theia/monaco-editor-core/esm/vs/base/browser/mouseEvent.js';

@injectable()
export class MonacoContextMenuService implements IContextMenuService {
    declare readonly _serviceBrand: undefined;

    protected readonly onDidShowContextMenuEmitter = new Emitter<void>();
    readonly onDidShowContextMenu: Event<void> = this.onDidShowContextMenuEmitter.event;
    protected readonly onDidHideContextMenuEmitter = new Emitter<void>();
    readonly onDidHideContextMenu: Event<void> = this.onDidHideContextMenuEmitter.event;

    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;

    toAnchor(anchor: HTMLElement | Coordinate | StandardMouseEvent): Anchor {
        if (anchor instanceof HTMLElement) {
            return { x: anchor.offsetLeft, y: anchor.offsetTop };
        } else if (anchor instanceof StandardMouseEvent) {
            return { x: anchor.posx, y: anchor.posy };
        } else {
            return anchor;
        }
    }

    private getContext(delegate: IContextMenuDelegate): HTMLElement {
        const anchor = delegate.getAnchor();
        if (anchor instanceof HTMLElement) {
            return anchor;
        } else if (anchor instanceof StandardMouseEvent) {
            return anchor.target;
        } else {
            return window.document.body; // last resort
        }
    }

    showContextMenu(delegate: IContextMenuDelegate): void {
        const anchor = this.toAnchor(delegate.getAnchor());
        const actions = delegate.getActions();
        const context = this.getContext(delegate);
        const toDisposeOnHide = new DisposableCollection();
        let hidden = false;
        const onHide = () => {
            hidden = true;
            toDisposeOnHide.dispose();
            delegate.onHide?.(false);
            this.onDidHideContextMenuEmitter.fire();
        };

        // Actions for editor context menu come as 'MenuItemAction' items
        // In case of 'Quick Fix' actions come as 'CodeActionAction' items
        let access: ContextMenuAccess;
        if (actions.length > 0 && actions[0] instanceof MenuItemAction) {
            access = this.contextMenuRenderer.render({
                context: context,
                menuPath: this.menuPath(),
                anchor,
                onHide
            });
        } else {
            const menu = new Menu({ commands: new CommandRegistry() });
            this.populateMenu(menu, actions);
            menu.aboutToClose.connect(() => onHide());
            menu.open(anchor.x, anchor.y);
            access = new ContextMenuAccess(menu);
            this.contextMenuRenderer.current = access;
        }
        if (!hidden) {
            toDisposeOnHide.push(this.closeOnMouseWheel(access));
        }
        this.onDidShowContextMenuEmitter.fire();
    }

    /**
     * Closes the context menu when the user scrolls outside of it, as Monaco does for its own context menu.
     * Otherwise the menu stays at a fixed position while the content it was opened for scrolls away.
     */
    protected closeOnMouseWheel(access: ContextMenuAccess): Disposable {
        const listener = (event: WheelEvent) => {
            if (event.target instanceof Element && event.target.closest('.lm-Menu')) {
                return; // scrolling inside the menu or one of its submenus
            }
            access.dispose();
        };
        window.addEventListener('wheel', listener, { capture: true, passive: true });
        return Disposable.create(() => window.removeEventListener('wheel', listener, { capture: true }));
    }

    protected populateMenu(menu: Menu, actions: readonly IAction[]): void {
        for (const action of actions) {
            if (action instanceof SubmenuAction) {
                const submenu = new Menu({ commands: new CommandRegistry() });
                submenu.title.label = action.label;
                submenu.title.caption = action.tooltip;
                if (action.class) {
                    submenu.addClass(action.class);
                }
                this.populateMenu(submenu, action.actions);
                menu.addItem({
                    type: 'submenu',
                    submenu
                });
            } else if (action instanceof Separator) {
                menu.addItem({
                    type: 'separator'
                });
            } else {
                menu.commands.addCommand(action.id, {
                    label: action.label,
                    className: action.class,
                    isToggled: () => Boolean(action.checked),
                    isEnabled: () => action.enabled,
                    execute: () => action.run()
                });
                menu.addItem({
                    type: 'command',
                    command: action.id
                });
            }
        }
    }

    protected menuPath(): MenuPath {
        return EDITOR_CONTEXT_MENU;
    }

}
