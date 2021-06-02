/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

import { injectable, ContainerModule } from '@theia/core/shared/inversify';
import { Menu as MenuWidget } from '@theia/core/shared/@phosphor/widgets';
import { Disposable } from '@theia/core/lib/common/disposable';
import { MenuNode, CompositeMenuNode } from '@theia/core/lib/common/menu';
import { BrowserMainMenuFactory, MenuCommandRegistry, DynamicMenuWidget } from '@theia/core/lib/browser/menu/browser-menu-plugin';
import { PlaceholderMenuNode } from './sample-menu-contribution';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    rebind(BrowserMainMenuFactory).to(SampleBrowserMainMenuFactory).inSingletonScope();
});

@injectable()
class SampleBrowserMainMenuFactory extends BrowserMainMenuFactory {

    protected handleDefault(menuCommandRegistry: MenuCommandRegistry, menuNode: MenuNode): void {
        if (menuNode instanceof PlaceholderMenuNode && menuCommandRegistry instanceof SampleMenuCommandRegistry) {
            menuCommandRegistry.registerPlaceholderMenu(menuNode);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected createMenuCommandRegistry(menu: CompositeMenuNode, args: any[] = []): MenuCommandRegistry {
        const menuCommandRegistry = new SampleMenuCommandRegistry(this.services);
        this.registerMenu(menuCommandRegistry, menu, args);
        return menuCommandRegistry;
    }

    createMenuWidget(menu: CompositeMenuNode, options: MenuWidget.IOptions & { commands: MenuCommandRegistry }): DynamicMenuWidget {
        return new SampleDynamicMenuWidget(menu, options, this.services);
    }

}

class SampleMenuCommandRegistry extends MenuCommandRegistry {

    protected placeholders = new Map<string, PlaceholderMenuNode>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerPlaceholderMenu(menu: PlaceholderMenuNode): void {
        const { id } = menu;
        if (this.placeholders.has(id)) {
            return;
        }
        this.placeholders.set(id, menu);
    }

    snapshot(): this {
        super.snapshot();
        for (const menu of this.placeholders.values()) {
            this.toDispose.push(this.registerPlaceholder(menu));
        }
        return this;
    }

    protected registerPlaceholder(menu: PlaceholderMenuNode): Disposable {
        const { id } = menu;
        const unregisterCommand = this.addCommand(id, {
            execute: () => { /* NOOP */ },
            label: menu.label,
            icon: menu.icon,
            isEnabled: () => false,
            isVisible: () => true
        });
        return Disposable.create(() => unregisterCommand.dispose());
    }

}

class SampleDynamicMenuWidget extends DynamicMenuWidget {

    protected handleDefault(menuNode: MenuNode): MenuWidget.IItemOptions[] {
        if (menuNode instanceof PlaceholderMenuNode) {
            return [{
                command: menuNode.id,
                type: 'command'
            }];
        }
        return [];
    }

}
