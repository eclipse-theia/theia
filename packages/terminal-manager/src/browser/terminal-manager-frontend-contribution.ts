// *****************************************************************************
// Copyright (C) 2025 EclipseSource and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, PreferenceService, DisposableCollection } from '@theia/core/lib/common';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalFrontendContribution, TerminalCommands } from '@theia/terminal/lib/browser/terminal-frontend-contribution';
import { ApplicationShell, WidgetManager, FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser';
import { TerminalManagerWidget } from './terminal-manager-widget';
import { TerminalManagerFrontendViewContribution } from './terminal-manager-frontend-view-contribution';
import { TerminalManagerPreferences } from './terminal-manager-preferences';
/**
 * Re-registers terminal commands (e.g. new terminal) to execute them via the terminal manager
 * instead of creating new, separate terminals.
 */
@injectable()
export class TerminalManagerFrontendContribution implements CommandContribution, FrontendApplicationContribution {
    @inject(TerminalFrontendContribution)
    protected readonly terminalFrontendContribution: TerminalFrontendContribution;

    @inject(TerminalManagerFrontendViewContribution)
    protected readonly terminalManagerViewContribution: TerminalManagerFrontendViewContribution;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(TerminalManagerPreferences)
    protected readonly preferences: TerminalManagerPreferences;

    protected commandHandlerDisposables = new DisposableCollection();
    protected commandRegistry?: CommandRegistry;

    onStart(app: FrontendApplication): void {
        this.preferenceService.ready.then(() => {
            this.preferenceService.onPreferenceChanged(change => {
                if (change.preferenceName === 'terminal.tabs.display') {
                    this.handleTabsDisplayChange(change.newValue as string);
                }
            });
        });
    }

    protected handleTabsDisplayChange(newValue: string): void {
        if (newValue === 'manager') {
            if (this.commandRegistry) {
                this.registerHandlers(this.commandRegistry);
            }
        } else {
            this.unregisterHandlers();
        }
    }

    protected unregisterHandlers(): void {
        this.commandHandlerDisposables.dispose();
        this.commandHandlerDisposables = new DisposableCollection();
    }

    protected registerHandlers(commands: CommandRegistry): void {
        this.unregisterHandlers();
        this.doRegisterCommands(commands);
    }

    registerCommands(commands: CommandRegistry): void {
        this.commandRegistry = commands;
        this.preferences.ready.then(() => {
            if (this.preferences.get('terminal.tabs.display') !== 'manager') {
                console.debug('Terminal tab style is not manager. Use separate terminals.');
                return;
            }
            console.debug('Terminal tab style is manager. Override command handlers accordingly.');
            this.registerHandlers(commands);
        });
    }

    protected doRegisterCommands(commands: CommandRegistry): void {
        this.commandHandlerDisposables.push(commands.registerHandler(TerminalCommands.NEW.id, {
            execute: async () => {
                // Only create a new terminal if the view was existing as opening it automatically create a terminal
                const existing = this.terminalManagerViewContribution.tryGetWidget();
                const managerWidget = await this.terminalManagerViewContribution.openView({ reveal: true });
                if (managerWidget instanceof TerminalManagerWidget && existing) {
                    const terminalWidget = await managerWidget.createTerminalWidget();
                    managerWidget.addTerminalPage(terminalWidget);
                }
            }
        }));

        this.commandHandlerDisposables.push(commands.registerHandler(TerminalCommands.NEW_ACTIVE_WORKSPACE.id, {
            execute: async () => {
                // Only create a new terminal if the view was existing as opening it automatically create a terminal
                const existing = this.terminalManagerViewContribution.tryGetWidget();
                const managerWidget = await this.terminalManagerViewContribution.openView({ reveal: true });
                if (managerWidget instanceof TerminalManagerWidget && existing) {
                    const terminalWidget = await managerWidget.createTerminalWidget();
                    managerWidget.addTerminalPage(terminalWidget);
                }
            }
        }));

        this.commandHandlerDisposables.push(commands.registerHandler(TerminalCommands.SPLIT.id, {
            execute: async () => {
                const managerWidget = await this.terminalManagerViewContribution.openView({ reveal: true });
                if (managerWidget instanceof TerminalManagerWidget) {
                    const terminalWidget = await managerWidget.createTerminalWidget();
                    const { model } = managerWidget.treeWidget;
                    const activeGroupId = model.activeGroupNode?.id;
                    const activePageId = model.activePageNode?.id;

                    if (activeGroupId) {
                        managerWidget.addWidgetToTerminalGroup(terminalWidget, activeGroupId);
                    } else if (activePageId) {
                        managerWidget.addTerminalGroupToPage(terminalWidget, activePageId);
                    } else {
                        managerWidget.addTerminalPage(terminalWidget);
                    }
                }
            },
            isEnabled: w => w instanceof TerminalWidget || w instanceof TerminalManagerWidget,
            isVisible: w => w instanceof TerminalWidget || w instanceof TerminalManagerWidget,
        }));

        this.commandHandlerDisposables.push(commands.registerHandler(TerminalCommands.TOGGLE_TERMINAL.id, {
            execute: async () => {
                const existing = this.terminalManagerViewContribution.tryGetWidget();
                if (!existing || !(existing instanceof TerminalManagerWidget)) {
                    const managerWidget = await this.terminalManagerViewContribution.openView({ activate: true });
                    if (managerWidget instanceof TerminalManagerWidget && !this.shell.isExpanded('bottom')) {
                        this.shell.expandPanel('bottom');
                    }
                    return;
                }

                if (!existing.isAttached) {
                    await this.terminalManagerViewContribution.openView({ activate: true });
                    if (!this.shell.isExpanded('bottom')) {
                        this.shell.expandPanel('bottom');
                    }
                    return;
                }

                if (!this.shell.isExpanded('bottom')) {
                    this.shell.expandPanel('bottom');
                    this.shell.bottomPanel.activateWidget(existing);
                    return;
                }

                const active = this.shell.activeWidget;
                const isManagerOrChildActive = active === existing || Array.from(existing.terminalWidgets.values()).some(widget => widget === active);
                if (isManagerOrChildActive) {
                    this.shell.collapsePanel('bottom');
                } else {
                    this.shell.bottomPanel.activateWidget(existing);
                }
            }
        }));
    }
}
