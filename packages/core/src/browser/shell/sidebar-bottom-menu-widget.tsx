/********************************************************************************
 * Copyright (C) 2020 Alibaba Inc. and others.
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
import * as React from 'react';
import { ReactWidget } from '../widgets';
import { ContextMenuRenderer } from '../context-menu-renderer';
import { MenuPath } from '../../common/menu';

export const SidebarBottomMenuWidgetFactory = Symbol('SidebarBottomMenuWidgetFactory');

export interface SidebarBottomMenu {
  id: string;
  iconClass: string;
  title: string;
  menuPath: MenuPath;
  order: number; // smaller one place lower
}

/**
 * The menu widget placed on the bottom of the sidebar.
 */
@injectable()
export class SidebarBottomMenuWidget extends ReactWidget {
  protected readonly menus: SidebarBottomMenu[];

  @inject(ContextMenuRenderer)
  protected readonly contextMenuRenderer: ContextMenuRenderer;

  constructor() {
    super();
    this.menus = [];
  }

  addMenu(menu: SidebarBottomMenu): void {
    const exists = this.menus.find(m => m.id === menu.id);
    if (exists) {
      return;
    }
    this.menus.push(menu);
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

  protected onClick(e: React.MouseEvent<HTMLElement, MouseEvent>, menuPath: MenuPath): void {
    this.contextMenuRenderer.render({
      menuPath,
      anchor: {
        x: e.clientX,
        y: e.clientY,
      }
    });
  }

  protected render(): React.ReactNode {
    return <React.Fragment>
      {this.menus.sort((a, b) => a.order - b.order).map(menu => <i
        key={menu.id}
        className={menu.iconClass}
        title={menu.title}
        onClick={e => this.onClick(e, menu.menuPath)}
      />)}
    </React.Fragment>;
  }
}
