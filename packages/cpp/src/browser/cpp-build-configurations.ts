/********************************************************************************
 * Copyright (C) 2018-2019 Ericsson and others.
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

import { injectable, inject, postConstruct } from 'inversify';
import { Emitter, Event } from '@theia/core';
import { CppPreferences } from './cpp-preferences';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { CppBuildConfiguration, CppBuildConfigurationServer } from '../common/cpp-build-configuration-protocol';
import { VariableResolverService } from '@theia/variable-resolver/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { deepClone } from '@theia/core';

/**
 * @deprecated Import from `@theia/cpp/lib/common` instead
 */
export { CppBuildConfiguration };

// tslint:disable-next-line:no-any
export function isCppBuildConfiguration(arg: any): arg is CppBuildConfiguration {
    return arg.name !== undefined && arg.directory !== undefined;
}

export function equals(a: CppBuildConfiguration, b: CppBuildConfiguration): boolean {
    return (
        a.name === b.name &&
        a.directory === b.directory &&
        a.commands === b.commands
    );
}

/**
 * Representation of all saved build configurations per workspace root in local storage.
 */
class SavedActiveBuildConfigurations {
    configs: [string, CppBuildConfiguration | undefined][];
}

export const CppBuildConfigurationManager = Symbol('CppBuildConfigurationManager');
export interface CppBuildConfigurationManager {

    /**
     * Get the list of defined build configurations.
     *
     * @returns an array of defined `CppBuildConfiguration`.
     */
    getConfigs(root?: string): CppBuildConfiguration[];

    /**
     * Get the list of valid defined build configurations.
     *
     * @returns an array of valid defined `CppBuildConfiguration`.
     * A `CppBuildConfiguration` is considered valid if it has a `name` and `directory`.
     */
    getValidConfigs(root?: string): CppBuildConfiguration[];

    /**
     * Get the active build configuration.
     *
     * @param root the optional workspace root.
     * @returns the active `CppBuildConfiguration` if it exists, else `undefined`.
     */
    getActiveConfig(root?: string): CppBuildConfiguration | undefined;

    /**
     * Set the active build configuration.
     *
     * @param config the active `CppBuildConfiguration`. If `undefined` no active build configuration will be set.
     * @param root the optional workspace root.
     */
    setActiveConfig(config: CppBuildConfiguration | undefined, root?: string): void;

    /**
     * Get the active build configurations for all roots.
     */
    getAllActiveConfigs?(): Map<string, CppBuildConfiguration | undefined>;

    /**
     * Experimental:
     *
     * Get a filesystem path to a `compile_commands.json` file which will be the result of all
     * configurations merged together (provided through the `configs` parameter).
     *
     * This covers the case when `clangd` is not able to take multiple compilation database
     * in its initialization, so this is mostly a hack-around to still get diagnostics for all
     * projects and most importantly being able to cross reference project symbols.
     */
    getMergedCompilationDatabase?(configs: { directories: string[] }): Promise<string>;

    /**
     * @deprecated use `onActiveConfigChange2` instead.
     *
     * Event emitted when the active build configuration changes.
     *
     * @returns an event with the active `CppBuildConfiguration` if it exists, else `undefined`.
     */
    onActiveConfigChange: Event<CppBuildConfiguration | undefined>;

    /**
     * Updated `onActiveConfigChange` to support multi-root.
     *
     * @returns all the configurations to use.
     */
    onActiveConfigChange2: Event<Map<string, CppBuildConfiguration>>;

    /**
     * Promise resolved when the list of build configurations has been read
     * once, and the active configuration has been set, if relevant.
     */
    ready: Promise<void>;
}

export const CPP_BUILD_CONFIGURATIONS_PREFERENCE_KEY = 'cpp.buildConfigurations';

/**
 * Entry point to get the list of build configurations and get/set the active
 * build configuration.
 */
@injectable()
export class CppBuildConfigurationManagerImpl implements CppBuildConfigurationManager {

    @inject(CppPreferences)
    protected readonly cppPreferences: CppPreferences;

    @inject(StorageService)
    protected readonly storageService: StorageService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(VariableResolverService)
    protected readonly variableResolver: VariableResolverService;

    @inject(CppBuildConfigurationServer)
    protected readonly buildConfigurationServer: CppBuildConfigurationServer;

    /**
     * Resolved configurations, coming from the preferences.
     */
    protected resolvedConfigurations = new Map<string, CppBuildConfiguration[]>();

    /**
     * The current active build configurations map.
     */
    protected activeConfigurations = new Map<string, CppBuildConfiguration | undefined>();

    /**
     * @deprecated use `activeConfigChange2Emitter` instead.
     *
     * Emitter for when the active build configuration changes.
     */
    protected readonly activeConfigChangeEmitter = new Emitter<CppBuildConfiguration | undefined>();

    /**
     * Emitter for when an active build configuration changes.
     */
    protected readonly activeConfigChange2Emitter = new Emitter<Map<string, CppBuildConfiguration>>();

    /**
     * Persistent storage key for the active build configurations map.
     */
    readonly ACTIVE_BUILD_CONFIGURATIONS_MAP_STORAGE_KEY = 'cpp.active-build-configurations-map';

    public ready: Promise<void>;

    @postConstruct()
    async init(): Promise<void> {
        // Try to read the active build config from local storage.
        this.ready = new Promise(async resolve => {
            const loadActiveConfigurations = this.loadActiveConfigs();
            await this.cppPreferences.ready;
            await Promise.all([
                this.handlePreferencesUpdate(),
                loadActiveConfigurations,
            ]);
            this.cppPreferences.onPreferenceChanged(() => this.handlePreferencesUpdate());
            resolve();
        });
    }

    protected getConfigsFromPreferences(root?: string): CppBuildConfiguration[] {
        if (root) {
            return Array.from(this.cppPreferences.get(CPP_BUILD_CONFIGURATIONS_PREFERENCE_KEY, [], root));
        }
        return Array.from(this.cppPreferences[CPP_BUILD_CONFIGURATIONS_PREFERENCE_KEY] || []);
    }

    /**
     * Load the active build configuration from persistent storage.
     */
    protected async loadActiveConfigs(): Promise<void> {
        const savedConfig = await this.storageService.getData<SavedActiveBuildConfigurations>(
            this.ACTIVE_BUILD_CONFIGURATIONS_MAP_STORAGE_KEY
        );
        if (savedConfig !== undefined) {
            // read from local storage and update the map.
            this.activeConfigurations = new Map(savedConfig.configs);
        }
    }

    /**
     * Save the active build configuration to persistent storage.
     *
     * @param config the active `CppBuildConfiguration`.
     */
    protected saveActiveConfigs(configs: Map<string, CppBuildConfiguration | undefined>): void {
        this.storageService.setData<SavedActiveBuildConfigurations>(
            this.ACTIVE_BUILD_CONFIGURATIONS_MAP_STORAGE_KEY, { configs: [...configs.entries()] }
        );
    }

    /**
     * Update the active build configuration if applicable.
     */
    protected async handlePreferencesUpdate(): Promise<void> {
        // tslint:disable:no-any
        const roots = this.workspaceService.tryGetRoots();

        // Resolve variables for all configurations.
        await Promise.all(roots.map(async ({ uri: root }) => {
            const context = new URI(root);
            const configs = this.getConfigsFromPreferences(root);
            const resolvedConfigs = configs.map(config => deepClone(config)); // copy
            await Promise.all(resolvedConfigs.map(async config => Promise.all<any>([
                this.variableResolver.resolve(config.directory, { context })
                    .then(resolved => config.directory = resolved),
                config.commands && Promise.all(Object.keys(config.commands)
                    .map(command => this.variableResolver.resolve((config.commands as any)[command], { context })
                        .then(resolved => (config.commands as any)[command] = resolved)
                    )
                ),
            ])));
            this.resolvedConfigurations.set(root, resolvedConfigs);
        }));

        // Look for missing active configurations.
        for (const [root, active] of this.activeConfigurations.entries()) {
            if (!active) {
                continue;
            }
            const configs = this.getValidConfigs(root);
            const stillExists = configs.some(config => this.equals(config, active));
            if (!stillExists) {
                this.setActiveConfig(undefined, root);
            }
        }
        // tslint:enable:no-any
    }

    /**
     * Determine if two `CppBuildConfiguration` are equal.
     *
     * @param a `CppBuildConfiguration`.
     * @param b `CppBuildConfiguration`.
     */
    protected equals(a: CppBuildConfiguration, b: CppBuildConfiguration): boolean {
        return a.name === b.name && a.directory === b.directory;
    }

    getActiveConfig(root?: string): CppBuildConfiguration | undefined {
        // Get the active workspace root for the given uri, else for the first workspace root.
        const workspaceRoot = this.getRoot(root);
        if (!workspaceRoot) {
            return undefined;
        }
        return this.activeConfigurations.get(workspaceRoot);
    }

    getAllActiveConfigs(): Map<string, CppBuildConfiguration | undefined> {
        return this.activeConfigurations;
    }

    setActiveConfig(config: CppBuildConfiguration | undefined, root?: string): void {
        // Set the active workspace root for the given uri, else for the first workspace root.
        const workspaceRoot = this.getRoot(root);
        if (!workspaceRoot) {
            return;
        }
        this.activeConfigurations.set(workspaceRoot, config);
        this.saveActiveConfigs(this.activeConfigurations);

        const activeConfigurations = new Map<string, CppBuildConfiguration>();
        for (const [source, cppConfig] of this.getAllActiveConfigs()) {
            if (typeof cppConfig !== 'undefined') {
                activeConfigurations.set(source, cppConfig);
            }
        }

        this.activeConfigChange2Emitter.fire(activeConfigurations);
        this.activeConfigChangeEmitter.fire(config);
    }

    get onActiveConfigChange(): Event<CppBuildConfiguration | undefined> {
        return this.activeConfigChangeEmitter.event;
    }

    get onActiveConfigChange2(): Event<Map<string, CppBuildConfiguration>> {
        return this.activeConfigChange2Emitter.event;
    }

    getConfigs(root?: string): CppBuildConfiguration[] {
        const workspaceRoot = this.getRoot(root);
        if (!workspaceRoot) {
            return [];
        }
        let configs = this.resolvedConfigurations.get(workspaceRoot);
        if (!configs) {
            this.resolvedConfigurations.set(workspaceRoot, configs = []);
        }
        return configs;
    }

    getValidConfigs(root?: string): CppBuildConfiguration[] {
        return this.getConfigs(root)
            .filter(a => a.name !== '' && a.directory !== '')
            .sort((a, b) => (a.name.localeCompare(b.name)));
    }

    /**
     * @todo Optimize by caching the merge result, based on the `CppBuildConfiguration.directory` field?
     */
    async getMergedCompilationDatabase(params: { directories: string[] }): Promise<string> {
        return this.buildConfigurationServer.getMergedCompilationDatabase(params);
    }

    protected getRoot(root?: string): string | undefined {
        if (root) {
            return root;
        }
        const roots = this.workspaceService.tryGetRoots();
        if (roots.length > 0) {
            return roots[0].uri;
        }
        return undefined;
    }
}
