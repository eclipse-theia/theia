/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandHandler, CommandRegistry } from '@theia/core/lib/common/command';
import {
    QuickOpenContribution, QuickOpenHandler, QuickOpenModel,
    PrefixQuickOpenService, QuickOpenOptions, QuickOpenHandlerRegistry, QuickOpenItem, QuickOpenMode
} from '@theia/core/lib/browser/quick-open';
import { DebugSessionManager } from './debug-session-manager';
import { DebugConfigurationManager } from './debug-configuration-manager';
import { DebugCommands } from './debug-frontend-application-contribution';
import { DebugSessionOptions } from './debug-session-options';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import URI from '@theia/core/lib/common/uri';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser';
import { DebugPreferences } from './debug-preferences';

@injectable()
export class DebugPrefixConfiguration implements CommandContribution, CommandHandler, QuickOpenContribution, QuickOpenHandler, QuickOpenModel {

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;

    @inject(DebugPreferences)
    protected readonly preference: DebugPreferences;

    @inject(DebugConfigurationManager)
    protected readonly debugConfigurationManager: DebugConfigurationManager;

    @inject(PrefixQuickOpenService)
    protected readonly prefixQuickOpenService: PrefixQuickOpenService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    readonly prefix = 'debug ';
    readonly description = 'Debug Configuration';
    readonly statusBarId = 'select-run-debug-statusbar-item';

    private readonly command: Command = {
        id: 'select.debug.configuration',
        category: 'Debug',
        label: 'Select and Start Debugging'
    };

    @postConstruct()
    protected initialize(): void {
        this.handleDebugStatusBarVisibility();
        this.preference.onPreferenceChanged(e => {
            if (e.preferenceName === 'debug.showInStatusBar') {
                this.handleDebugStatusBarVisibility();
            }
        });
        const toDisposeOnStart = this.debugSessionManager.onDidStartDebugSession(() => {
            toDisposeOnStart.dispose();
            this.handleDebugStatusBarVisibility(true);
            this.debugConfigurationManager.onDidChange(() => this.handleDebugStatusBarVisibility(true));
        });
    }

    execute(): void {
        this.prefixQuickOpenService.open(this.prefix);
    }

    isEnabled(): boolean {
        return true;
    }

    isVisible(): boolean {
        return true;
    }

    getModel(): QuickOpenModel {
        return this;
    }

    getOptions(): QuickOpenOptions {
        return {
            fuzzyMatchLabel: true,
            fuzzySort: false,
        };
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(this.command, this);
    }

    registerQuickOpenHandlers(handlers: QuickOpenHandlerRegistry): void {
        handlers.registerHandler(this);
    }

    async onType(_lookFor: string, acceptor: (items: QuickOpenItem[]) => void): Promise<void> {
        const items: QuickOpenItem[] = [];
        const configurations = this.debugConfigurationManager.all;
        Array.from(configurations).forEach(config => {
            items.push(new QuickOpenItem({
                label: config.configuration.name,
                description: this.workspaceService.isMultiRootWorkspaceOpened
                    ? this.labelProvider.getName(new URI(config.workspaceFolderUri))
                    : '',
                run: (mode: QuickOpenMode) => {
                    if (mode !== QuickOpenMode.OPEN) {
                        return false;
                    }
                    this.runConfiguration(config);
                    return true;
                }
            }));
        });
        acceptor(items);
    }

    /**
     * Set the current debug configuration, and execute debug start command.
     *
     * @param configuration the `DebugSessionOptions`.
     */
    protected runConfiguration(configuration: DebugSessionOptions): void {
        this.debugConfigurationManager.current = { ...configuration };
        this.commandRegistry.executeCommand(DebugCommands.START.id);
    }

    /**
     * Handle the visibility of the debug status bar.
     * @param event the preference change event.
     */
    protected handleDebugStatusBarVisibility(started?: boolean): void {
        const showInStatusBar = this.preference['debug.showInStatusBar'];
        if (showInStatusBar === 'never') {
            return this.removeDebugStatusBar();
        } else if (showInStatusBar === 'always' || started) {
            return this.updateStatusBar();
        }
    }

    /**
     * Update the debug status bar element based on the current configuration.
     */
    protected updateStatusBar(): void {
        const text: string = this.debugConfigurationManager.current
            ? this.debugConfigurationManager.current.configuration.name
            : '';
        const icon = '$(play)';
        this.statusBar.setElement(this.statusBarId, {
            alignment: StatusBarAlignment.LEFT,
            text: text.length ? `${icon} ${text}` : icon,
            tooltip: this.command.label,
            command: this.command.id,
        });
    }

    /**
     * Remove the debug status bar element.
     */
    protected removeDebugStatusBar(): void {
        this.statusBar.removeElement(this.statusBarId);
    }
}
