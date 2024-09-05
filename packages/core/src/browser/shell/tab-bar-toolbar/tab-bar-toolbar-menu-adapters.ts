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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { MenuNode, MenuPath } from '../../../common';
import { NAVIGATION, RenderedToolbarItem } from './tab-bar-toolbar-types';

export const TOOLBAR_WRAPPER_ID_SUFFIX = '-as-tabbar-toolbar-item';

export class ToolbarMenuNodeWrapper implements RenderedToolbarItem {
    constructor(protected readonly menuNode: MenuNode, readonly group: string | undefined, readonly delegateMenuPath: MenuPath, readonly menuPath?: MenuPath) { }
    get id(): string { return this.menuNode.id + TOOLBAR_WRAPPER_ID_SUFFIX; }
    get command(): string { return this.menuNode.command ?? ''; };
    get icon(): string | undefined { return this.menuNode.icon; }
    get tooltip(): string | undefined { return this.menuNode.label; }
    get when(): string | undefined { return this.menuNode.when; }
    get text(): string | undefined { return (this.group === NAVIGATION || this.group === undefined) ? undefined : this.menuNode.label; }
}

