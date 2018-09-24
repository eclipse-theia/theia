/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { MenuPath, MessageService } from '@theia/core';
import { MenuModelRegistry } from '@theia/core/lib/common';
import { EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser';
import { NAVIGATOR_CONTEXT_MENU } from '@theia/navigator/lib/browser/navigator-contribution';
import { PluginContribution } from '../../../common';

@injectable()
export class MenusContributionPointHandler {

    @inject(MenuModelRegistry)
    protected readonly menuRegistry: MenuModelRegistry;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    handle(contributions: PluginContribution): void {
        if (!contributions.menus) {
            return;
        }

        for (const location in contributions.menus) {
            if (contributions.menus.hasOwnProperty(location)) {
                const menuPath = this.parseMenuPath(location);
                if (!menuPath) {
                    this.messageService.warn(`Plugin contributes items to a menu with invalid identifier: ${location}`);
                    continue;
                }
                const menus = contributions.menus[location];
                menus.forEach(menu => {
                    const [group = '', order = undefined] = (menu.group || '').split('@');
                    this.menuRegistry.registerMenuAction([...menuPath, group], {
                        commandId: menu.command,
                        order
                    });
                });
            }
        }
    }

    protected parseMenuPath(value: string): MenuPath | undefined {
        switch (value) {
            case 'editor/context': return EDITOR_CONTEXT_MENU;
            case 'explorer/context': return NAVIGATOR_CONTEXT_MENU;
        }
    }
}
