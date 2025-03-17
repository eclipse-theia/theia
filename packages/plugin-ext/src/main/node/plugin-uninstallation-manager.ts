// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { Emitter, Event } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { PluginIdentifiers } from '../../common';
import { SettingService } from '@theia/core/lib/node';
import { Deferred } from '@theia/core/lib/common/promise-util';

@injectable()
export class PluginUninstallationManager {
    static DISABLED_PLUGINS = 'installedPlugins.disabledPlugins';

    @inject(SettingService)
    protected readonly settingService: SettingService;

    protected readonly onDidChangeUninstalledPluginsEmitter = new Emitter<readonly PluginIdentifiers.VersionedId[]>();
    onDidChangeUninstalledPlugins: Event<readonly PluginIdentifiers.VersionedId[]> = this.onDidChangeUninstalledPluginsEmitter.event;

    protected readonly onDidChangeDisabledPluginsEmitter = new Emitter<readonly PluginIdentifiers.VersionedId[]>();
    onDidChangeDisabledPlugins: Event<readonly PluginIdentifiers.VersionedId[]> = this.onDidChangeDisabledPluginsEmitter.event;

    protected uninstalledPlugins: Set<PluginIdentifiers.VersionedId> = new Set();
    protected disabledPlugins: Set<PluginIdentifiers.VersionedId> = new Set();

    protected readonly initialized = new Deferred<void>();

    @postConstruct()
    init(): void {
        this.load().then(() => this.initialized.resolve());
    }

    protected async load(): Promise<void> {
        try {
            const disabled: PluginIdentifiers.VersionedId[] = JSON.parse(await this.settingService.get(PluginUninstallationManager.DISABLED_PLUGINS) || '[]');
            disabled.forEach(id => this.disabledPlugins.add(id));
        } catch (e) {
            // settings may be corrupt; just carry on
            console.warn(e);
        }
    }

    protected async save(): Promise<void> {
        await this.settingService.set(PluginUninstallationManager.DISABLED_PLUGINS, JSON.stringify(await this.getDisabledPluginIds()));
    }

    async markAsUninstalled(...pluginIds: PluginIdentifiers.VersionedId[]): Promise<boolean> {
        let didChange = false;
        for (const id of pluginIds) {
            if (!this.uninstalledPlugins.has(id)) {
                didChange = true;
                this.uninstalledPlugins.add(id);
            }
        }
        if (didChange) {
            this.onDidChangeUninstalledPluginsEmitter.fire(this.getUninstalledPluginIds());
        }
        this.markAsEnabled(...pluginIds);
        return didChange;
    }

    async markAsInstalled(...pluginIds: PluginIdentifiers.VersionedId[]): Promise<boolean> {
        let didChange = false;
        for (const id of pluginIds) {
            didChange = this.uninstalledPlugins.delete(id) || didChange;
        }
        if (didChange) {
            this.onDidChangeUninstalledPluginsEmitter.fire(this.getUninstalledPluginIds());
        }
        return didChange;
    }

    isUninstalled(pluginId: PluginIdentifiers.VersionedId): boolean {
        return this.uninstalledPlugins.has(pluginId);
    }

    getUninstalledPluginIds(): readonly PluginIdentifiers.VersionedId[] {
        return [...this.uninstalledPlugins];
    }

    async markAsDisabled(...pluginIds: PluginIdentifiers.VersionedId[]): Promise<boolean> {
        await this.initialized.promise;
        let didChange = false;
        for (const id of pluginIds) {
            if (!this.disabledPlugins.has(id)) {
                this.disabledPlugins.add(id);
                didChange = true;
            }
        }
        if (didChange) {
            await this.save();
            this.onDidChangeDisabledPluginsEmitter.fire([...this.disabledPlugins]);
        }
        return didChange;
    }

    async markAsEnabled(...pluginIds: PluginIdentifiers.VersionedId[]): Promise<boolean> {
        await this.initialized.promise;
        let didChange = false;
        for (const id of pluginIds) {
            didChange = this.disabledPlugins.delete(id) || didChange;
        }
        if (didChange) {
            await this.save();
            this.onDidChangeDisabledPluginsEmitter.fire([...this.disabledPlugins]);
        }
        return didChange;
    }

    async isDisabled(pluginId: PluginIdentifiers.VersionedId): Promise<boolean> {
        await this.initialized.promise;
        return this.disabledPlugins.has(pluginId);
    }

    async getDisabledPluginIds(): Promise<readonly PluginIdentifiers.VersionedId[]> {
        await this.initialized.promise;
        return [...this.disabledPlugins];
    }
}
