// *****************************************************************************
// Copyright (C) 2022 Arduino SA and others.
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

import type { MenuItemConstructorOptions as ElectronMenuItemConstructorOptions } from '../../electron-shared/electron';

export type MenuItemConstructorOptions = Omit<ElectronMenuItemConstructorOptions, 'click' | 'accelerator' | 'icon' | 'sharingItem' | 'submenu'> & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    click?: { commandId: string, args?: any[] };
    accelerator?: string,
    icon?: string,
    submenu?: MenuItemConstructorOptions[],
};
export namespace MenuItemConstructorOptions {
    export function toElectron(
        options: MenuItemConstructorOptions,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        clickHandler: ({ commandId, args }: { commandId: string, args?: any[] }) => () => void
    ): ElectronMenuItemConstructorOptions {
        const { click, submenu, ...rest } = options;
        return {
            ...rest,
            ...click && { click: clickHandler(click) },
            ...submenu && { submenu: submenu.map(subOption => toElectron(subOption, clickHandler)) }
        };
    }
}
