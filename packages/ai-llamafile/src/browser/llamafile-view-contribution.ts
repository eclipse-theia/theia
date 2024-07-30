// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { injectable } from '@theia/core/shared/inversify';
import { AbstractViewContribution, CommonMenus } from '@theia/core/lib/browser';
import { LlamafileListWidget } from './llamafile-list-widget';
import { CommandRegistry, MenuModelRegistry } from '@theia/core';

@injectable()
export class LlamafileViewContribution extends AbstractViewContribution<LlamafileListWidget> {

    constructor() {
        super({
            widgetId: LlamafileListWidget.ID,
            widgetName: LlamafileListWidget.LABEL,
            defaultWidgetOptions: { area: 'left' },
            toggleCommandId: 'llamafile-view:toggle',
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand({ id: 'llamafile-view:add', label: 'Add Item' }, {
            execute: () => this.openView({ activate: true }).then(widget => widget.addItem())
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerMenuAction(CommonMenus.EDIT_FIND, {
            commandId: 'llamafile-view:add',
            label: 'Add Item'
        });
    }
}
