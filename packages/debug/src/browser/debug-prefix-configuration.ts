// *****************************************************************************
// Copyright (C) 2019 Ericsson and others.
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

import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandHandler, CommandRegistry } from '@theia/core/lib/common/command';
import { DebugSessionManager } from './debug-session-manager';
import { DebugConfigurationManager } from './debug-configuration-manager';
import { DebugCommands } from './debug-frontend-application-contribution';
import { DebugSessionOptions } from './debug-session-options';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import URI from '@theia/core/lib/common/uri';
import { QuickAccessContribution, QuickAccessProvider, QuickAccessRegistry, QuickInputService, StatusBar, StatusBarAlignment } from '@theia/core/lib/browser';
import { DebugPreferences } from './debug-preferences';
import { filterItems, QuickPickItemOrSeparator, QuickPicks } from '@theia/core/lib/browser/quick-input/quick-input-service';
import { CancellationToken } from '@theia/core/lib/common';

@injectable()
export class DebugPrefixConfiguration implements CommandContribution, CommandHandler, QuickAccessContribution, QuickAccessProvider {
    static readonly PREFIX = 'debug ';

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;

    @inject(DebugPreferences)
    protected readonly preference: DebugPreferences;

    @inject(DebugConfigurationManager)
    protected readonly debugConfigurationManager: DebugConfigurationManager;

    @inject(QuickInputService) @optional()
    protected readonly quickInputService: QuickInputService;

    @inject(QuickAccessRegistry)
    protected readonly quickAccessRegistry: QuickAccessRegistry;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    readonly statusBarId = 'select-run-debug-statusbar-item';

    private readonly command = Command.toDefaultLocalizedCommand({
        id: 'select.debug.configuration',
        category: DebugCommands.DEBUG_CATEGORY,
        label: 'Select and Start Debugging'
    });

    @postConstruct()
    protected init(): void {
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
        this.quickInputService?.open(DebugPrefixConfiguration.PREFIX);
    }

    isEnabled(): boolean {
        return true;
    }

    isVisible(): boolean {
        return true;
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(this.command, this);
    }

    registerQuickAccessProvider(): void {
        this.quickAccessRegistry.registerQuickAccessProvider({
            getInstance: () => this,
            prefix: DebugPrefixConfiguration.PREFIX,
            placeholder: '',
            helpEntries: [{ description: 'Debug Configuration', needsEditor: false }]
        });
    }

    protected resolveRootFolderName(uri: string | undefined): string | undefined {
        return uri && this.workspaceService.isMultiRootWorkspaceOpened
            ? this.labelProvider.getName(new URI(uri))
            : '';
    }

    async getPicks(filter: string, token: CancellationToken): Promise<QuickPicks> {
        const items: QuickPickItemOrSeparator[] = [];
        const configurations = this.debugConfigurationManager.all;

        for (const config of configurations) {
            items.push({
                label: config.name,
                description: this.resolveRootFolderName(config.workspaceFolderUri),
                execute: () => this.runConfiguration(config)
            });
        }

        // Resolve dynamic configurations from providers
        const record = await this.debugConfigurationManager.provideDynamicDebugConfigurations();
        for (const [providerType, configurationOptions] of Object.entries(record)) {
            if (configurationOptions.length > 0) {
                items.push({
                    label: providerType,
                    type: 'separator'
                });
            }

            for (const options of configurationOptions) {
                items.push({
                    label: options.name,
                    description: this.resolveRootFolderName(options.workspaceFolderUri),
                    execute: () => this.runConfiguration({ name: options.name, configuration: options.configuration, providerType, workspaceFolderUri: options.workspaceFolderUri })
                });
            }
        }

        return filterItems(items, filter);
    }

    /**
     * Set the current debug configuration, and execute debug start command.
     *
     * @param configurationOptions the `DebugSessionOptions`.
     */
    protected runConfiguration(configurationOptions: DebugSessionOptions): void {
        this.debugConfigurationManager.current = configurationOptions;
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
            ? this.debugConfigurationManager.current.name
            : '';
        const icon = '$(codicon-debug-alt-small)';
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
