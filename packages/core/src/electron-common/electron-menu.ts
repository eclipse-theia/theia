// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

export type MenuRole = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll' | 'about' | 'services' | 'hide' | 'hideOthers' | 'unhide' | 'quit';

export interface MenuDto {
    id?: string;
    label?: string;
    submenu?: MenuDto[];
    type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio';
    checked?: boolean;
    enabled?: boolean;
    visible?: boolean;
    role?: MenuRole;
    accelerator?: string;
    execute?: () => void;
}

export type InternalMenuDto = Omit<MenuDto, 'execute' | 'submenu'> & {
    submenu?: InternalMenuDto[];
    handlerId?: number;
};
