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

import { inject, injectable } from 'inversify';
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

@injectable()
export class DebugPrefixConfiguration implements CommandContribution, CommandHandler, QuickOpenContribution, QuickOpenHandler, QuickOpenModel {

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;

    @inject(DebugConfigurationManager)
    protected readonly debugConfigurationManager: DebugConfigurationManager;

    @inject(PrefixQuickOpenService)
    protected readonly prefixQuickOpenService: PrefixQuickOpenService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    readonly prefix = 'debug ';
    readonly description = 'Debug Configuration';

    private readonly command: Command = {
        id: 'select.debug.configuration',
        category: 'Debug',
        label: 'Select and Start Debugging'
    };

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
}
