/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { Command, CommandContribution, CommandRegistry, CommandService } from '@theia/core';
import { injectable, inject } from 'inversify';
import { QuickOpenService } from '@theia/core/lib/browser/quick-open/quick-open-service';
import { QuickOpenModel, QuickOpenItem, QuickOpenMode, } from '@theia/core/lib/browser/quick-open/quick-open-model';
import { FileSystem, FileSystemUtils } from '@theia/filesystem/lib/common';
import URI from '@theia/core/lib/common/uri';
import { PreferenceScope, PreferenceService } from '@theia/preferences/lib/browser';
import { CppBuildConfigurationManager, CppBuildConfiguration, CPP_BUILD_CONFIGURATIONS_PREFERENCE_KEY } from './cpp-build-configurations';
import { EditorManager } from '@theia/editor/lib/browser';
import { CommonCommands } from '@theia/core/lib/browser';

@injectable()
export class CppBuildConfigurationChanger implements QuickOpenModel {

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(CppBuildConfigurationManager)
    protected readonly cppBuildConfigurations: CppBuildConfigurationManager;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    readonly createItem: QuickOpenItem = new QuickOpenItem({
        label: 'Create New',
        iconClass: 'fa fa-plus',
        description: 'Create a new build configuration',
        run: (mode: QuickOpenMode): boolean => {
            if (mode !== QuickOpenMode.OPEN) {
                return false;
            }
            this.commandService.executeCommand(CPP_CREATE_NEW_BUILD_CONFIGURATION.id);
            return true;
        },
    });

    readonly resetItem: QuickOpenItem = new QuickOpenItem({
        label: 'None',
        iconClass: 'fa fa-times',
        description: 'Reset active build configuration',
        run: (mode: QuickOpenMode): boolean => {
            if (mode !== QuickOpenMode.OPEN) {
                return false;
            }
            this.commandService.executeCommand(CPP_RESET_BUILD_CONFIGURATION.id);
            return true;
        },
    });

    async onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): Promise<void> {
        const items: QuickOpenItem[] = [];
        const active: CppBuildConfiguration | undefined = this.cppBuildConfigurations.getActiveConfig();
        const configurations = this.cppBuildConfigurations.getValidConfigs();

        const homeStat = await this.fileSystem.getCurrentUserHome();
        const home = (homeStat) ? new URI(homeStat.uri).withoutScheme().toString() : undefined;

        // Item to create a new build configuration
        items.push(this.createItem);

        // Only return 'Create New' when no build configurations present
        if (!configurations.length) {
            return acceptor(items);
        }

        // Item to de-select any active build config
        if (active) {
            items.push(this.resetItem);
        }

        // Add one item per build config
        configurations.forEach(config => {
            const uri = new URI(config.directory);
            items.push(new QuickOpenItem({
                label: config.name,
                // add an icon for active build config, and an empty placeholder for all others
                iconClass: (config === active) ? 'fa fa-check' : 'fa fa-empty-item',
                description: (home) ? FileSystemUtils.tildifyPath(uri.path.toString(), home) : uri.path.toString(),
                run: (mode: QuickOpenMode): boolean => {
                    if (mode !== QuickOpenMode.OPEN) {
                        return false;
                    }

                    this.cppBuildConfigurations.setActiveConfig(config);
                    return true;
                },
            }));
        });

        acceptor(items);
    }

    open() {
        const configs = this.cppBuildConfigurations.getValidConfigs();
        this.quickOpenService.open(this, {
            placeholder: (configs.length) ? 'Choose a build configuration...' : 'No build configurations present',
            fuzzyMatchLabel: true,
            fuzzyMatchDescription: true,
        });
    }

    /** Create a new build configuration with placeholder values.  */
    async createConfig(): Promise<void> {
        this.commandService.executeCommand(CommonCommands.OPEN_PREFERENCES.id, PreferenceScope.Workspace);
        const configs = this.cppBuildConfigurations.getConfigs().slice(0);
        configs.push({ name: '', directory: '' });
        await this.preferenceService.set(CPP_BUILD_CONFIGURATIONS_PREFERENCE_KEY, configs, PreferenceScope.Workspace);
    }

}

export const CPP_CATEGORY = 'C/C++';

/**
 * Reset active build configuration if applicable.
 * Set active build configuration to `None`.
 */
export const CPP_RESET_BUILD_CONFIGURATION: Command = {
    id: 'cpp.resetBuildConfiguration',
    category: CPP_CATEGORY,
    label: 'Reset Build Configuration'
};

/**
 * Create a new build configuration, and trigger opening the preferences widget.
 */
export const CPP_CREATE_NEW_BUILD_CONFIGURATION: Command = {
    id: 'cpp.createNewBuildConfiguration',
    category: CPP_CATEGORY,
    label: 'Create New Build Configuration'
};

/**
 * Open the quick open menu to let the user change the active build configuration.
 */
export const CPP_CHANGE_BUILD_CONFIGURATION: Command = {
    id: 'cpp.change-build-configuration',
    category: CPP_CATEGORY,
    label: 'Change Build Configuration'
};

@injectable()
export class CppBuildConfigurationsContributions implements CommandContribution {

    @inject(CppBuildConfigurationChanger)
    protected readonly cppChangeBuildConfiguration: CppBuildConfigurationChanger;

    @inject(CppBuildConfigurationManager)
    protected readonly cppManager: CppBuildConfigurationManager;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(CPP_RESET_BUILD_CONFIGURATION, {
            isEnabled: () => !!this.cppManager.getActiveConfig(),
            isVisible: () => !!this.cppManager.getActiveConfig(),
            execute: () => this.cppManager.setActiveConfig(undefined)
        });
        commands.registerCommand(CPP_CREATE_NEW_BUILD_CONFIGURATION, {
            execute: () => this.cppChangeBuildConfiguration.createConfig()
        });
        commands.registerCommand(CPP_CHANGE_BUILD_CONFIGURATION, {
            execute: () => this.cppChangeBuildConfiguration.open()
        });
    }
}
