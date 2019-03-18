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
import { FileSystem } from '@theia/filesystem/lib/common';
import URI from '@theia/core/lib/common/uri';
import { PreferenceScope, PreferenceService } from '@theia/preferences/lib/browser';
import { CppBuildConfigurationManager, CPP_BUILD_CONFIGURATIONS_PREFERENCE_KEY, isCppBuildConfiguration, equals } from './cpp-build-configurations';
import { EditorManager } from '@theia/editor/lib/browser';
import { CommonCommands, LabelProvider } from '@theia/core/lib/browser';
import { QuickPickService, QuickPickItem } from '@theia/core/lib/common/quick-pick-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { CppBuildConfiguration } from '../common/cpp-build-configuration-protocol';

@injectable()
export class CppBuildConfigurationChanger {

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(CppBuildConfigurationManager)
    protected readonly cppBuildConfigurations: CppBuildConfigurationManager;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(QuickPickService)
    protected readonly quickPick: QuickPickService;

    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    /**
     * Item used to trigger creation of a new build configuration.
     */
    protected readonly createItem: QuickPickItem<'createNew'> = ({
        label: 'Create New',
        value: 'createNew',
        description: 'Create a new build configuration',
        iconClass: 'fa fa-plus'
    });

    /**
     * Item used to trigger reset of the active build configuration.
     */
    protected readonly resetItem: QuickPickItem<'reset'> = ({
        label: 'None',
        value: 'reset',
        description: 'Reset the active build configuration',
        iconClass: 'fa fa-times'
    });

    /**
     * Change the build configuration for a given root.
     * If multiple roots are available, prompt users a first time to select their desired root.
     * Once a root is determined, prompt users to select an active build configuration if applicable.
     */
    async change(): Promise<void> {

        // Prompt users to determine working root.
        const root = await this.selectWorkspaceRoot();
        if (!root) {
            return;
        }

        // Prompt users to determine action (set active config, reset active config, create new config).
        const action = await this.selectCppAction(root);
        if (!action) {
            return;
        }

        // Perform desired action.
        if (action === 'createNew') {
            this.commandService.executeCommand(CPP_CREATE_NEW_BUILD_CONFIGURATION.id);
        }
        if (action === 'reset') {
            this.cppBuildConfigurations.setActiveConfig(undefined, root);
        }
        if (action && isCppBuildConfiguration(action)) {
            this.cppBuildConfigurations.setActiveConfig(action, root);
        }
    }

    /**
     * Pick a workspace root using the quick open menu.
     */
    protected async selectWorkspaceRoot(): Promise<string | undefined> {
        const roots = this.workspaceService.tryGetRoots();
        return this.quickPick.show(roots.map(({ uri: root }) => {
            const active = this.cppBuildConfigurations.getActiveConfig(root);
            return {
                // See: WorkspaceUriLabelProviderContribution
                // It will transform the path to a prettier display (adding a ~, etc).
                label: this.labelProvider.getName(new URI(root).withScheme('file')),
                description: active ? active.name : 'undefined',
                value: root,
            };
        }), { placeholder: 'Select workspace root' });
    }

    /**
     * Lists the different options for a given root if specified, first else.
     * In this case, the options are to set/unset/create a build configuration.
     *
     * @param root
     */
    protected async selectCppAction(root: string | undefined): Promise<string | CppBuildConfiguration | undefined> {
        const items: QuickPickItem<'createNew' | 'reset' | CppBuildConfiguration>[] = [];
        // Add the 'Create New' item at all times.
        items.push(this.createItem);
        // Add the 'Reset' item if there currently is an active config.
        if (this.cppBuildConfigurations.getActiveConfig(root)) {
            items.push(this.resetItem);
        }
        // Display all valid configurations for a given root.
        const configs = this.cppBuildConfigurations.getValidConfigs(root);
        const active = this.cppBuildConfigurations.getActiveConfig(root);
        configs.map(config => {
            items.push({
                label: config.name,
                description: config.directory,
                iconClass: active && equals(config, active) ? 'fa fa-check' : 'fa fa-empty-item',
                value: {
                    name: config.name,
                    directory: config.directory,
                    commands: config.commands
                },
            });
        });
        return this.quickPick.show(items, { placeholder: 'Select action' });
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
            execute: () => this.cppChangeBuildConfiguration.change()
        });
    }
}
