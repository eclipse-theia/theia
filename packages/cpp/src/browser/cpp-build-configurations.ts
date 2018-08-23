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

import URI from '@theia/core/lib/common/uri';
import { Emitter, Event } from '@theia/core';
import { injectable, inject, postConstruct } from 'inversify';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { Command, CommandContribution, CommandRegistry, Event, Emitter } from '@theia/core/lib/common';
import { QuickOpenModel, QuickOpenItem, QuickOpenMode, } from '@theia/core/lib/browser/quick-open/quick-open-model';
import { QuickOpenService } from '@theia/core/lib/browser/quick-open/quick-open-service';
import { ProcessTaskConfiguration } from '@theia/task/lib/common/process/task-protocol';
import { FileSystem, FileSystemUtils } from '@theia/filesystem/lib/common';
import { CppBuildManager } from './cpp-build-manager';
import { CppPreferences } from './cpp-preferences';

export interface CppBuildConfiguration {
    /** Human-readable configuration name.  */
    name: string;

    /** Base directory of this build.  */
    directory: string;

    /** List of commands for this project (build, or others) */
    commands?: { [key: string]: string };
}

export interface CppBuildTaskConfiguration extends ProcessTaskConfiguration<'cpp'> {
    configuration: CppBuildConfiguration;
    target?: string;
}

/** What we save in the local storage.  */
class SavedActiveBuildConfiguration {
    configName?: string;
}

/**
 * Entry point to get the list of build configurations and get/set the active
 * build configuration.
 */
@injectable()
export class CppBuildConfigurationManager {

    @inject(CppPreferences)
    protected readonly cppPreferences: CppPreferences;

    @inject(StorageService)
    protected readonly storageService: StorageService;

    /**
     * The current active build configuration.  undefined means there's not
     * current active configuration.
     */
    protected activeConfig: CppBuildConfiguration | undefined;

    /** Emitter for when the active build configuration changes.  */
    protected readonly activeConfigChangeEmitter = new Emitter<CppBuildConfiguration | undefined>();

    readonly ACTIVE_BUILD_CONFIGURATION_STORAGE_KEY = 'cpp.active-build-configuration';
    readonly BUILD_CONFIGURATIONS_PREFERENCE_KEY = 'cpp.buildConfigurations';

    /**
     * Promise resolved when the list of build configurations has been read
     * once, and the active configuration has been set, if relevant.
     */
    public ready: Promise<void>;

    @postConstruct()
    async init() {
        // Try to read the active build config from local storage.
        this.ready = new Promise(async resolve => {
            await this.cppPreferences.ready;
            this.loadActiveConfiguration().then(resolve);
        });
    }

    /** Load the active build config from the persistent storage.  */
    protected async loadActiveConfiguration() {
        const savedConfig =
            await this.storageService.getData<SavedActiveBuildConfiguration>(
                this.ACTIVE_BUILD_CONFIGURATION_STORAGE_KEY);

        if (savedConfig !== undefined && savedConfig.configName !== undefined) {
            // Try to find an existing config with that name.
            const configs = this.getConfigs();
            const config = configs.find(cfg => savedConfig.configName === cfg.name);
            if (config) {
                this.setActiveConfig(config);
            }
        }
    }

    /**
     * Save the active build config name to persistent storage.
     */
    protected saveActiveConfiguration(config: CppBuildConfiguration | undefined) {
        this.storageService.setData<SavedActiveBuildConfiguration>(
            this.ACTIVE_BUILD_CONFIGURATION_STORAGE_KEY, {
                configName: config ? config.name : undefined,
            });
    }

    /** Get the active build configuration.  */
    getActiveConfig(): CppBuildConfiguration | undefined {
        return this.activeConfig;
    }

    /** Change the active build configuration.  */
    setActiveConfig(config: CppBuildConfiguration | undefined) {
        this.activeConfig = config;
        this.saveActiveConfiguration(config);
        this.activeConfigChangeEmitter.fire(config);
    }

    /** Event emitted when the active build configuration changes.  */
    get onActiveConfigChange(): Event<CppBuildConfiguration | undefined> {
        return this.activeConfigChangeEmitter.event;
    }

    /** Get the list of defined build configurations.  */
    getConfigs(): CppBuildConfiguration[] {
        return this.cppPreferences[this.BUILD_CONFIGURATIONS_PREFERENCE_KEY] || [];
    }

    /** Get the list of valid defined build configurations.  */
    getValidConfigs(): CppBuildConfiguration[] {
        return Array.from(this.getConfigs())
            .filter(a => a.name !== '' && a.directory !== '')
            .sort((a, b) => (a.name.localeCompare(b.name)));
    }
}
