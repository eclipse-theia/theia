// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { interfaces } from '@theia/core/shared/inversify';
import { ReactTabBarToolbarItem, TabBarToolbar, TabBarToolbarItem } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { serviceIdentifier } from '@theia/core';

export enum ToolbarAlignment {
    LEFT = 'left',
    CENTER = 'center',
    RIGHT = 'right'
}

export interface ToolbarTreeSchema {
    items: {
        [key in ToolbarAlignment]: ToolbarItem[][];
    };
}

export interface DeflatedToolbarTree {
    items: {
        [key in ToolbarAlignment]: ToolbarItemDeflated[][];
    };
}
export namespace ToolbarAlignmentString {
    export const is = (obj: unknown): obj is ToolbarAlignment => obj === ToolbarAlignment.LEFT
        || obj === ToolbarAlignment.CENTER
        || obj === ToolbarAlignment.RIGHT;
}

export interface ToolbarContributionProperties {
    toJSON(): DeflatedContributedToolbarItem;
}

export type ToolbarContribution = ReactTabBarToolbarItem & ToolbarContributionProperties;

export const ToolbarContribution = serviceIdentifier<ToolbarContribution>('ToolbarContribution');

export const Toolbar = serviceIdentifier<Toolbar>('Toolbar');
export const ToolbarFactory = serviceIdentifier<() => Toolbar>('ToolbarFactory');
export type Toolbar = TabBarToolbar;

export type ToolbarItem = ToolbarContribution | TabBarToolbarItem;
export interface DeflatedContributedToolbarItem { id: string; group: 'contributed' };
export type ToolbarItemDeflated = DeflatedContributedToolbarItem | TabBarToolbarItem;

export const LateInjector = serviceIdentifier<<T>(id: interfaces.ServiceIdentifier<T>) => T>('LateInjector');
export type LateInjector = <T>(identifier: interfaces.ServiceIdentifier<T>) => T;

export const lateInjectorFactory = (ctx: interfaces.Context): LateInjector => identifier => ctx.container.get(identifier);

export interface ToolbarItemPosition {
    alignment: ToolbarAlignment;
    groupIndex: number;
    itemIndex: number;
}

export enum IconSet {
    FA = 'fa',
    CODICON = 'codicon'
}
