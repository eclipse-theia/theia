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
import { MenuContribution, MenuModelRegistry, MenuPath } from '@theia/core/lib/common/menu';
import { codicon, ExtractableWidget, Widget } from '@theia/core/lib/browser/widgets';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { SHELL_TABBAR_CONTEXT_MENU } from '@theia/core/lib/browser/shell/tab-bars';
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

export const RESTORE_ALL_WIDGETS = Command.toLocalizedCommand({
    id: 'restore-all-widgets',
    label: 'Move All Views to Main Window'
}, 'theia/secondary-window/restore-all-widgets');

export const SHELL_TABBAR_CONTEXT_SECONDARY_WINDOW: MenuPath = [...SHELL_TABBAR_CONTEXT_MENU, '6_secondaryWindow'];

/**
 * Contributes the commands to move widgets to secondary windows and back, and registers them in the toolbar and in the context menu of tabs.
 * In addition, extracts widgets whose tab is dragged out of the application's windows.
 */
@injectable()
export class SecondaryWindowContribution implements CommandContribution, MenuContribution, TabBarToolbarContribution {

    @inject(SecondaryWindowHandler)
    protected readonly secondaryWindowHandler: SecondaryWindowHandler;

    @inject(NativeTabDragService)
    protected readonly nativeTabDragService: NativeTabDragService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

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
        const canExtract = (arg?: unknown) => {
            const widget = this.getTargetWidget(arg);
            return ExtractableWidget.is(widget) && widget.secondaryWindow === undefined;
        };
        commands.registerCommand(EXTRACT_WIDGET, {
            execute: async arg => {
                const widget = this.getTargetWidget(arg);
                if (ExtractableWidget.is(widget)) {
                    this.secondaryWindowHandler.moveWidgetToSecondaryWindow(widget);
                }
            },
            isVisible: canExtract,
            isEnabled: canExtract,
        });
        const isInSecondaryWindow = (arg?: unknown) => extractSecondaryWindow(this.getTargetWidget(arg)) !== undefined;
        commands.registerCommand(RESTORE_WIDGET, {
            execute: async arg => {
                const widget = this.getTargetWidget(arg);
                if (widget) {
                    await this.secondaryWindowHandler.moveWidgetToMainWindow(widget);
                }
            },
            isVisible: isInSecondaryWindow,
            isEnabled: isInSecondaryWindow,
        });
        commands.registerCommand(RESTORE_ALL_WIDGETS, {
            execute: async arg => {
                const secondaryWindow = extractSecondaryWindow(this.getTargetWidget(arg));
                if (secondaryWindow) {
                    await this.secondaryWindowHandler.moveAllWidgetsToMainWindow(secondaryWindow);
                }
            },
            isVisible: isInSecondaryWindow,
            isEnabled: isInSecondaryWindow,
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(SHELL_TABBAR_CONTEXT_SECONDARY_WINDOW, {
            commandId: EXTRACT_WIDGET.id,
            order: 'a'
        });
        menus.registerMenuAction(SHELL_TABBAR_CONTEXT_SECONDARY_WINDOW, {
            commandId: RESTORE_WIDGET.id,
            order: 'b'
        });
        menus.registerMenuAction(SHELL_TABBAR_CONTEXT_SECONDARY_WINDOW, {
            commandId: RESTORE_ALL_WIDGETS.id,
            order: 'c'
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

    /**
     * @returns the widget a command is executed for: the widget passed by the tab bar toolbar, the widget of the tab
     * whose context menu has been opened, or the current widget if no argument is passed, e.g. from the command palette
     */
    protected getTargetWidget(arg: unknown): Widget | undefined {
        if (arg instanceof Widget) {
            return arg;
        }
        // not using `instanceof Event`, the event may come from a secondary window, i.e. from another JavaScript realm
        if ((arg as Event | undefined)?.target) {
            return this.shell.findTargetedWidget(arg as Event);
        }
        return arg === undefined ? this.shell.currentWidget : undefined;
    }
}
