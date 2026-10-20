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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CommandRegistry, CommandContribution, Command } from '@theia/core/lib/common/command';
import { codicon, ExtractableWidget } from '@theia/core/lib/browser/widgets';
import { NativeTabDragService, TabDropOutsideWindowsEvent } from '@theia/core/lib/browser/shell/native-tab-drag-service';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { extractSecondaryWindow, getAllWidgetsFromSecondaryWindow, SecondaryWindowHandler } from '@theia/core/lib/browser/secondary-window-handler';

export const EXTRACT_WIDGET = Command.toLocalizedCommand({
    id: 'extract-widget',
    label: 'Move View to Secondary Window'
}, 'theia/secondary-window/extract-widget');

export const RESTORE_WIDGET = Command.toLocalizedCommand({
    id: 'restore-widget',
    label: 'Move View to Main Window'
}, 'theia/secondary-window/restore-widget');

/**
 * Contributes the widget extraction and restore commands and registers them in the toolbar of extractable and extracted widgets.
 * In addition, extracts widgets whose tab is dragged out of the application's windows.
 */
@injectable()
export class SecondaryWindowContribution implements CommandContribution, TabBarToolbarContribution {

    @inject(SecondaryWindowHandler)
    protected readonly secondaryWindowHandler: SecondaryWindowHandler;

    @inject(NativeTabDragService)
    protected readonly nativeTabDragService: NativeTabDragService;

    @postConstruct()
    protected init(): void {
        this.nativeTabDragService.onDidDropTabOutsideWindows(event => this.onDidDropTabOutsideWindows(event));
    }

    protected onDidDropTabOutsideWindows({ title, screenX, screenY }: TabDropOutsideWindowsEvent): void {
        const widget = title.owner;
        const secondaryWindow = extractSecondaryWindow(widget);
        if (secondaryWindow && getAllWidgetsFromSecondaryWindow(secondaryWindow)?.length === 1) {
            // the widget is the only one in its secondary window, so move the window instead of opening a new one
            secondaryWindow.moveTo(screenX, screenY);
        } else if (ExtractableWidget.is(widget)) {
            this.secondaryWindowHandler.moveWidgetToSecondaryWindow(widget, { position: { x: screenX, y: screenY } });
        }
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(EXTRACT_WIDGET, {
            execute: async widget => this.secondaryWindowHandler.moveWidgetToSecondaryWindow(widget),
            isVisible: widget => ExtractableWidget.is(widget) && widget.secondaryWindow === undefined,
            isEnabled: widget => ExtractableWidget.is(widget) && widget.secondaryWindow === undefined,
        });
        commands.registerCommand(RESTORE_WIDGET, {
            execute: async widget => this.secondaryWindowHandler.moveWidgetToMainWindow(widget),
            isVisible: widget => extractSecondaryWindow(widget) !== undefined,
            isEnabled: widget => extractSecondaryWindow(widget) !== undefined,
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: EXTRACT_WIDGET.id,
            command: EXTRACT_WIDGET.id,
            icon: codicon('window'),
        });
        registry.registerItem({
            id: RESTORE_WIDGET.id,
            command: RESTORE_WIDGET.id,
            // TODO use `open-in-window` once the codicon font bundled with Monaco provides it, see #17789
            icon: codicon('screen-normal'),
        });
    }
}
