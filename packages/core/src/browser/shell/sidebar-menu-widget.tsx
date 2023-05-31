// *****************************************************************************
// Copyright (C) 2020 Alibaba Inc. and others.
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

import { injectable, inject } from 'inversify';
import * as React from 'react';
import { ReactWidget } from '../widgets';
import { ContextMenuRenderer } from '../context-menu-renderer';
import { MenuPath } from '../../common/menu';
import { HoverService } from '../hover-service';

export const SidebarTopMenuWidgetFactory = Symbol('SidebarTopMenuWidgetFactory');
export const SidebarBottomMenuWidgetFactory = Symbol('SidebarBottomMenuWidgetFactory');

export interface SidebarMenu {
    id: string;
    iconClass: string;
    title: string;
    menuPath: MenuPath;
    /*
     * Used to sort menus. The lower the value the lower they are placed in the sidebar.
     */
    order: number;
}

/**
 * The menu widget placed on the sidebar.
 */
@injectable()
export class SidebarMenuWidget extends ReactWidget {
    protected readonly menus: SidebarMenu[];
    /**
     * The element that had focus when a menu rendered by this widget was activated.
     */
    protected preservedContext: HTMLElement | undefined;
    /**
     * Flag indicating whether a context menu is open. While a context menu is open, the `preservedContext` should not be cleared.
     */
    protected preservingContext = false;

    @inject(ContextMenuRenderer)
    protected readonly contextMenuRenderer: ContextMenuRenderer;

    @inject(HoverService)
    protected readonly hoverService: HoverService;

    constructor() {
        super();
        this.menus = [];
    }

    addMenu(menu: SidebarMenu): void {
        const exists = this.menus.find(m => m.id === menu.id);
        if (exists) {
            return;
        }
        this.menus.push(menu);
        this.menus.sort((a, b) => a.order - b.order);
        this.update();
    }

    removeMenu(menuId: string): void {
        const menu = this.menus.find(m => m.id === menuId);
        if (menu) {
            const index = this.menus.indexOf(menu);
            if (index !== -1) {
                this.menus.splice(index, 1);
                this.update();
            }
        }
    }

    protected readonly onMouseDown = () => {
        const { activeElement } = document;
        if (activeElement instanceof HTMLElement && !this.node.contains(activeElement)) {
            this.preservedContext = activeElement;
        }
    };

    protected readonly onMouseOut = () => {
        if (!this.preservingContext) {
            this.preservedContext = undefined;
        }
    };

    protected readonly onMouseEnter = (event: React.MouseEvent<HTMLElement, MouseEvent>, title: string) => {
        if (title && event.nativeEvent.currentTarget) {
            this.hoverService.requestHover({
                content: title,
                target: event.currentTarget,
                position: 'right'
            });
        }
    };

    protected onClick(e: React.MouseEvent<HTMLElement, MouseEvent>, menuPath: MenuPath): void {
        this.preservingContext = true;
        const button = e.currentTarget.getBoundingClientRect();
        this.contextMenuRenderer.render({
            menuPath,
            includeAnchorArg: false,
            anchor: {
                x: button.left + button.width,
                y: button.top,
            },
            onHide: () => {
                this.preservingContext = false;
                if (this.preservedContext) {
                    this.preservedContext.focus({ preventScroll: true });
                    this.preservedContext = undefined;
                }
            }
        });
    }

    protected render(): React.ReactNode {
        return <React.Fragment>
            {this.menus.map(menu => <i
                key={menu.id}
                className={menu.iconClass}
                onClick={e => this.onClick(e, menu.menuPath)}
                onMouseDown={this.onMouseDown}
                onMouseEnter={e => this.onMouseEnter(e, menu.title)}
                onMouseLeave={this.onMouseOut}
            />)}
        </React.Fragment>;
    }
}
