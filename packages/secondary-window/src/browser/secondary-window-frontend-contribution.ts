// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics, Ericsson, ARM, EclipseSource and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandRegistry, CommandContribution, Command } from '@theia/core/lib/common/command';
import { codicon, ExtractableWidget } from '@theia/core/lib/browser/widgets';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { SecondaryWindowHandler } from '@theia/core/lib/browser/secondary-window-handler';

export const EXTRACT_WIDGET = Command.toLocalizedCommand({
    id: 'extract-widget',
    label: 'Move View to Secondary Window'
}, 'theia/secondary-window/extract-widget');

/** Contributes the widget extraction command and registers it in the toolbar of extractable widgets. */
@injectable()
export class SecondaryWindowContribution implements CommandContribution, TabBarToolbarContribution {

    @inject(SecondaryWindowHandler)
    protected readonly secondaryWindowHandler: SecondaryWindowHandler;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(EXTRACT_WIDGET, {
            execute: async widget => this.secondaryWindowHandler.moveWidgetToSecondaryWindow(widget),
            isVisible: widget => ExtractableWidget.is(widget),
            isEnabled: widget => ExtractableWidget.is(widget)
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: EXTRACT_WIDGET.id,
            command: EXTRACT_WIDGET.id,
            icon: codicon('window'),
        });
    }
}
