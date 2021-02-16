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

import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandHandler, CommandRegistry } from '@theia/core/lib/common/command';
import { DebugSessionManager } from './debug-session-manager';
import { DebugConfigurationManager } from './debug-configuration-manager';
import { DebugCommands } from './debug-frontend-application-contribution';
import { DebugSessionOptions } from './debug-session-options';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import URI from '@theia/core/lib/common/uri';
import { QuickAccessContribution, QuickInputService, StatusBar, StatusBarAlignment } from '@theia/core/lib/browser';
import { DebugPreferences } from './debug-preferences';
import { filterItems } from '@theia/core/lib/browser/quick-input/quick-input-service';

@injectable()
export class DebugPrefixConfiguration implements CommandContribution, CommandHandler, QuickAccessContribution, monaco.quickInput.IQuickAccessDataService {

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

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

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
        this.quickInputService?.open(DebugQuickAccessProvider.PREFIX);
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
        monaco.platform.Registry.as<monaco.quickInput.IQuickAccessRegistry>('workbench.contributions.quickaccess').registerQuickAccessProvider({
            ctor: DebugQuickAccessProvider,
            prefix: DebugQuickAccessProvider.PREFIX,
            placeholder: '',
            helpEntries: [{ description: 'Debug Configuration', needsEditor: false }]
        });
        DebugQuickAccessProvider.dataService = this as monaco.quickInput.IQuickAccessDataService;
    }

    async getPicks(filter: string, token: monaco.CancellationToken): Promise<monaco.quickInput.Picks<monaco.quickInput.IAnythingQuickPickItem>> {
        const items: Array<monaco.quickInput.IAnythingQuickPickItem> = [];
        const configurations = this.debugConfigurationManager.all;
        Array.from(configurations).forEach(config => {
            items.push({
                label: config.configuration.name,
                description: this.workspaceService.isMultiRootWorkspaceOpened
                    ? this.labelProvider.getName(new URI(config.workspaceFolderUri))
                    : '',
                accept: () => this.runConfiguration(config)
            });
        });
        return filterItems(items, filter);
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
export class DebugQuickAccessProvider extends monaco.quickInput.PickerQuickAccessProvider<monaco.quickInput.IQuickPickItem> {
    static PREFIX = 'debug ';
    static dataService: monaco.quickInput.IQuickAccessDataService;

    private static readonly NO_RESULTS_PICK: monaco.quickInput.IAnythingQuickPickItem = {
        label: 'No matching launch configurations'
    };

    constructor() {
        super(DebugQuickAccessProvider.PREFIX, {
            canAcceptInBackground: true,
            noResultsPick: DebugQuickAccessProvider.NO_RESULTS_PICK
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getPicks(filter: string, disposables: any, token: monaco.CancellationToken): monaco.quickInput.Picks<monaco.quickInput.IAnythingQuickPickItem>
        | Promise<monaco.quickInput.Picks<monaco.quickInput.IAnythingQuickPickItem>>
        | monaco.quickInput.FastAndSlowPicks<monaco.quickInput.IAnythingQuickPickItem>
        | null {
        return DebugQuickAccessProvider.dataService?.getPicks(filter, token);
    }
}
