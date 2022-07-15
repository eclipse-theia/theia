// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, ContainerModule } from '@theia/core/shared/inversify';
import { CompoundMenuNode, MenuNode } from '@theia/core/lib/common/menu';
import { ElectronMainMenuFactory, ElectronMenuOptions } from '@theia/core/lib/electron-browser/menu/electron-main-menu-factory';
import { PlaceholderMenuNode } from '../../browser/menu/sample-menu-contribution';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    rebind(ElectronMainMenuFactory).to(SampleElectronMainMenuFactory).inSingletonScope();
});

@injectable()
class SampleElectronMainMenuFactory extends ElectronMainMenuFactory {
    protected override fillMenuTemplate(
        parentItems: Electron.MenuItemConstructorOptions[], menuModel: MenuNode & CompoundMenuNode, args: unknown[] = [], options: ElectronMenuOptions
    ): Electron.MenuItemConstructorOptions[] {
        if (menuModel instanceof PlaceholderMenuNode) {
            parentItems.push({ label: menuModel.label, enabled: false, visible: true });
        } else {
            super.fillMenuTemplate(parentItems, menuModel, args, options);
        }
        return parentItems;
    }
}
