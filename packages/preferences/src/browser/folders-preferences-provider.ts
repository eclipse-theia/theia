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

import { inject, injectable, postConstruct } from 'inversify';
import { PreferenceProvider } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { FolderPreferenceProvider, FolderPreferenceProviderFactory } from './folder-preference-provider';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common';
import URI from '@theia/core/lib/common/uri';

export const SETTINGS_FILE_NAME = 'settings.json';
export const LAUNCH_FILE_NAME = 'launch.json';
export const LAUNCH_PROPERTY_NAME = 'launch';

@injectable()
export class FoldersPreferencesProvider extends PreferenceProvider {

    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(FileSystem) protected readonly fileSystem: FileSystem;
    @inject(FolderPreferenceProviderFactory) protected readonly folderPreferenceProviderFactory: FolderPreferenceProviderFactory;

    private providers: { [fileName: string]: FolderPreferenceProvider[] } = {};

    @postConstruct()
    protected async init(): Promise<void> {
        [SETTINGS_FILE_NAME, LAUNCH_FILE_NAME].forEach(fileName => this.providers[fileName] = []);

        await this.workspaceService.roots;
        const readyPromises: Promise<void>[] = [];
        for (const root of this.workspaceService.tryGetRoots()) {
            if (await this.fileSystem.exists(root.uri)) {
                [SETTINGS_FILE_NAME, LAUNCH_FILE_NAME].forEach(fileName => {
                    const provider = this.createFolderPreferenceProvider(root, fileName);
                    this.providers[fileName].push(provider);
                    readyPromises.push(provider.ready);
                });
            }
        }

        // Try to read the initial content of the preferences.  The provider
        // becomes ready even if we fail reading the preferences, so we don't
        // hang the preference service.
        Promise.all(readyPromises)
            .then(() => this._ready.resolve())
            .catch(() => this._ready.resolve());

        this.workspaceService.onWorkspaceChanged(roots => {
            for (const root of roots) {
                [SETTINGS_FILE_NAME, LAUNCH_FILE_NAME].forEach(fileName => {
                    if (!this.existsProvider(root.uri, fileName)) {
                        const provider = this.createFolderPreferenceProvider(root, fileName);
                        this.providers[fileName].push(provider);
                    }
                });
            }

            [SETTINGS_FILE_NAME, LAUNCH_FILE_NAME].forEach(fileName => {
                if (!this.providers[fileName]) {
                    return;
                }
                const numProviders = this.providers[fileName].length;
                for (let i = numProviders - 1; i >= 0; i--) {
                    const provider = this.providers[fileName][i];
                    if (!this.existsRoot(roots, provider)) {
                        this.providers[fileName].splice(i, 1);
                        provider.dispose();
                    }
                }
            });
        });
    }

    private existsProvider(folderUri: string, fileName: string): boolean {
        return this.providers[fileName] && this.providers[fileName].some(p => !!p.uri && p.uri.toString() === folderUri);
    }

    private existsRoot(roots: FileStat[], provider: FolderPreferenceProvider): boolean {
        return roots.some(r => !!provider.uri && r.uri === provider.uri.toString());
    }

    // tslint:disable-next-line:no-any
    getPreferences(resourceUri?: string): { [p: string]: any } {
        if (!resourceUri) {
            return {};
        }

        const prefProvider = this.getProvider(resourceUri, SETTINGS_FILE_NAME);
        const prefs = prefProvider ? prefProvider.getPreferences() : {};

        const launchProvider = this.getProvider(resourceUri, LAUNCH_FILE_NAME);
        const launch = launchProvider ? launchProvider.getPreferences() : {};

        const result = Object.assign({}, prefs, launch);

        return result;
    }

    canProvide(preferenceName: string, resourceUri?: string): { priority: number, provider: PreferenceProvider } {
        if (resourceUri) {
            const resourceName = preferenceName === LAUNCH_PROPERTY_NAME ? LAUNCH_FILE_NAME : SETTINGS_FILE_NAME;
            const provider = this.getProvider(resourceUri, resourceName);
            if (provider) {
                return { priority: provider.canProvide(preferenceName, resourceUri).priority, provider };
            }
        }
        return super.canProvide(preferenceName, resourceUri);
    }

    protected getProvider(resourceUri: string, fileName: string): PreferenceProvider | undefined {
        const providers = this.providers[fileName];
        if (providers.length === 0) {
            return;
        }

        let provider: PreferenceProvider | undefined;
        let relativity = Number.MAX_SAFE_INTEGER;
        for (const p of providers) {
            if (p.uri) {
                const providerRelativity = p.uri.path.relativity(new URI(resourceUri).path);
                if (providerRelativity >= 0 && providerRelativity <= relativity) {
                    relativity = providerRelativity;
                    provider = p;
                }
            }
        }
        return provider;
    }

    protected createFolderPreferenceProvider(folder: FileStat, fileName: string): FolderPreferenceProvider {
        const provider = this.folderPreferenceProviderFactory({ folder, fileName });
        this.toDispose.push(provider);
        this.toDispose.push(provider.onDidPreferencesChanged(change => this.onDidPreferencesChangedEmitter.fire(change)));
        this.toDispose.push(provider.onDidNotValidPreferencesRead(prefs => this.onDidNotValidPreferencesReadEmitter.fire(prefs)));
        return provider;
    }

    // tslint:disable-next-line:no-any
    async setPreference(key: string, value: any, resourceUri?: string): Promise<void> {
        if (resourceUri) {
            const resourceName = key === LAUNCH_PROPERTY_NAME ? LAUNCH_FILE_NAME : SETTINGS_FILE_NAME;
            for (const provider of this.providers[resourceName]) {
                const providerResourceUri = await provider.getUri();
                if (providerResourceUri && providerResourceUri.toString() === resourceUri) {
                    return provider.setPreference(key, value);
                }
            }
            console.error(`FoldersPreferencesProvider did not find the provider for ${resourceUri} to update the preference ${key}`);
        } else {
            console.error('FoldersPreferencesProvider requires resource URI to update preferences');
        }
    }
}
