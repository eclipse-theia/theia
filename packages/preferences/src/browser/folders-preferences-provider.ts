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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { PreferenceProvider, PreferenceResolveResult } from '@theia/core/lib/browser/preferences/preference-provider';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';
import { FolderPreferenceProvider, FolderPreferenceProviderFactory } from './folder-preference-provider';
import { FileStat } from '@theia/filesystem/lib/common/files';

@injectable()
export class FoldersPreferencesProvider extends PreferenceProvider {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FolderPreferenceProviderFactory)
    protected readonly folderPreferenceProviderFactory: FolderPreferenceProviderFactory;

    @inject(PreferenceConfigurations)
    protected readonly configurations: PreferenceConfigurations;

    protected readonly providers = new Map<string, FolderPreferenceProvider>();

    @postConstruct()
    protected async init(): Promise<void> {
        await this.workspaceService.roots;

        this.updateProviders();
        this.workspaceService.onWorkspaceChanged(() => this.updateProviders());

        const readyPromises: Promise<void>[] = [];
        for (const provider of this.providers.values()) {
            readyPromises.push(provider.ready.catch(e => console.error(e)));
        }
        Promise.all(readyPromises).then(() => this._ready.resolve());
    }

    protected updateProviders(): void {
        const roots = this.workspaceService.tryGetRoots();
        const toDelete = new Set(this.providers.keys());
        for (const folder of roots) {
            for (const configPath of this.configurations.getPaths()) {
                for (const configName of [...this.configurations.getSectionNames(), this.configurations.getConfigName()]) {
                    const sectionUri = this.configurations.createUri(folder.resource, configPath, configName);
                    const sectionKey = sectionUri.toString();
                    toDelete.delete(sectionKey);
                    if (!this.providers.has(sectionKey)) {
                        const provider = this.createProvider(sectionUri, configName, folder);
                        this.providers.set(sectionKey, provider);
                    }
                }
            }
        }
        for (const key of toDelete) {
            const provider = this.providers.get(key);
            if (provider) {
                this.providers.delete(key);
                provider.dispose();
            }
        }
    }

    getConfigUri(resourceUri?: string, sectionName: string = this.configurations.getConfigName()): URI | undefined {
        for (const provider of this.getFolderProviders(resourceUri)) {
            const configUri = provider.getConfigUri(resourceUri);
            if (configUri && this.configurations.getName(configUri) === sectionName) {
                return configUri;
            }
        }
        return undefined;
    }

    getContainingConfigUri(resourceUri?: string, sectionName: string = this.configurations.getConfigName()): URI | undefined {
        for (const provider of this.getFolderProviders(resourceUri)) {
            const configUri = provider.getConfigUri();
            if (provider.contains(resourceUri) && this.configurations.getName(configUri) === sectionName) {
                return configUri;
            }
        }
        return undefined;
    }

    getDomain(): string[] {
        return this.workspaceService.tryGetRoots().map(root => root.resource.toString());
    }

    resolve<T>(preferenceName: string, resourceUri?: string): PreferenceResolveResult<T> {
        const result: PreferenceResolveResult<T> = {};
        const groups = this.groupProvidersByConfigName(resourceUri);
        for (const group of groups.values()) {
            for (const provider of group) {
                const { value, configUri } = provider.resolve<T>(preferenceName, resourceUri);
                if (configUri && value !== undefined) {
                    result.configUri = configUri;
                    result.value = PreferenceProvider.merge(result.value as any, value as any) as any;
                    break;
                }
            }
        }
        return result;
    }

    getPreferences(resourceUri?: string): { [p: string]: any } {
        let result = {};
        const groups = this.groupProvidersByConfigName(resourceUri);
        for (const group of groups.values()) {
            for (const provider of group) {
                if (provider.getConfigUri(resourceUri)) {
                    const preferences = provider.getPreferences();
                    result = PreferenceProvider.merge(result, preferences) as any;
                    break;
                }
            }
        }
        return result;
    }

    async setPreference(preferenceName: string, value: any, resourceUri?: string): Promise<boolean> {
        const sectionName = preferenceName.split('.', 1)[0];
        const configName = this.configurations.isSectionName(sectionName) ? sectionName : this.configurations.getConfigName();

        const providers = this.getFolderProviders(resourceUri);
        let configPath: string | undefined;

        const iterator: (() => FolderPreferenceProvider | undefined)[] = [];
        for (const provider of providers) {
            if (configPath === undefined) {
                const configUri = provider.getConfigUri(resourceUri);
                if (configUri) {
                    configPath = this.configurations.getPath(configUri);
                }
            }
            if (this.configurations.getName(provider.getConfigUri()) === configName) {
                iterator.push(() => {
                    if (provider.getConfigUri(resourceUri)) {
                        return provider;
                    }
                    iterator.push(() => {
                        if (this.configurations.getPath(provider.getConfigUri()) === configPath) {
                            return provider;
                        }
                        iterator.push(() => provider);
                    });
                });
            }
        }

        let next = iterator.shift();
        while (next) {
            const provider = next();
            if (provider) {
                if (await provider.setPreference(preferenceName, value, resourceUri)) {
                    return true;
                }
            }
            next = iterator.shift();
        }
        return false;
    }

    protected groupProvidersByConfigName(resourceUri?: string): Map<string, FolderPreferenceProvider[]> {
        const groups = new Map<string, FolderPreferenceProvider[]>();
        const providers = this.getFolderProviders(resourceUri);
        for (const configName of [this.configurations.getConfigName(), ...this.configurations.getSectionNames()]) {
            const group = [];
            for (const provider of providers) {
                if (this.configurations.getName(provider.getConfigUri()) === configName) {
                    group.push(provider);
                }
            }
            groups.set(configName, group);
        }
        return groups;
    }

    protected getFolderProviders(resourceUri?: string): FolderPreferenceProvider[] {
        if (!resourceUri) {
            return [];
        }
        const resourcePath = new URI(resourceUri).path;
        let folder: Readonly<{ relativity: number, uri?: string }> = { relativity: Number.MAX_SAFE_INTEGER };
        const providers = new Map<string, FolderPreferenceProvider[]>();
        for (const provider of this.providers.values()) {
            const uri = provider.folderUri.toString();
            const folderProviders = (providers.get(uri) || []);
            folderProviders.push(provider);
            providers.set(uri, folderProviders);

            // in case we have nested folders mounted as workspace roots, select the innermost enclosing folder
            const relativity = provider.folderUri.path.relativity(resourcePath);
            if (relativity >= 0 && folder.relativity > relativity) {
                folder = { relativity, uri };
            }
        }
        return folder.uri && providers.get(folder.uri) || [];
    }

    protected createProvider(uri: URI, section: string, folder: FileStat): FolderPreferenceProvider {
        const provider = this.folderPreferenceProviderFactory(uri, section, folder);
        this.toDispose.push(provider);
        this.toDispose.push(provider.onDidPreferencesChanged(change => {
            this.onDidPreferencesChangedEmitter.fire(change);
        }
        ));
        return provider;
    }

}
