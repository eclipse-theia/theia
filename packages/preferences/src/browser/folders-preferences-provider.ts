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

@injectable()
export class FoldersPreferencesProvider extends PreferenceProvider {

    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(FileSystem) protected readonly fileSystem: FileSystem;
    @inject(FolderPreferenceProviderFactory) protected readonly folderPreferenceProviderFactory: FolderPreferenceProviderFactory;

    private providers: FolderPreferenceProvider[] = [];

    @postConstruct()
    protected async init(): Promise<void> {
        await this.workspaceService.roots;
        if (this.workspaceService.saved) {
            for (const root of this.workspaceService.tryGetRoots()) {
                if (await this.fileSystem.exists(root.uri)) {
                    const provider = this.createFolderPreferenceProvider(root);
                    this.providers.push(provider);
                }
            }
        }

        // Try to read the initial content of the preferences.  The provider
        // becomes ready even if we fail reading the preferences, so we don't
        // hang the preference service.
        Promise.all(this.providers.map(p => p.ready))
            .then(() => this._ready.resolve())
            .catch(() => this._ready.resolve());

        this.workspaceService.onWorkspaceChanged(roots => {
            for (const root of roots) {
                if (!this.existsProvider(root.uri)) {
                    const provider = this.createFolderPreferenceProvider(root);
                    if (!this.existsProvider(root.uri)) {
                        this.providers.push(provider);
                    } else {
                        provider.dispose();
                    }
                }
            }

            const numProviders = this.providers.length;
            for (let ind = numProviders - 1; ind >= 0; ind--) {
                const provider = this.providers[ind];
                if (roots.findIndex(r => !!provider.uri && r.uri === provider.uri.toString()) < 0) {
                    this.providers.splice(ind, 1);
                    provider.dispose();
                }
            }
        });
    }

    private existsProvider(folderUri: string): boolean {
        return this.providers.findIndex(p => !!p.uri && p.uri.toString() === folderUri) >= 0;
    }

    // tslint:disable-next-line:no-any
    getPreferences(resourceUri?: string): { [p: string]: any } {
        const numProviders = this.providers.length;
        if (resourceUri && numProviders > 0) {
            const provider = this.getProvider(resourceUri);
            if (provider) {
                return provider.getPreferences();
            }
        }
        return {};
    }

    canProvide(preferenceName: string, resourceUri?: string): { priority: number, provider: PreferenceProvider } {
        if (resourceUri && this.providers.length > 0) {
            const provider = this.getProvider(resourceUri);
            if (provider) {
                return { priority: provider.canProvide(preferenceName, resourceUri).priority, provider };
            }
        }
        return super.canProvide(preferenceName, resourceUri);
    }

    protected getProvider(resourceUri: string): PreferenceProvider | undefined {
        let provider: PreferenceProvider | undefined;
        let relativity = Number.MAX_SAFE_INTEGER;
        for (const p of this.providers) {
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

    protected createFolderPreferenceProvider(folder: FileStat): FolderPreferenceProvider {
        const provider = this.folderPreferenceProviderFactory({ folder });
        this.toDispose.push(provider);
        this.toDispose.push(provider.onDidPreferencesChanged(change => this.onDidPreferencesChangedEmitter.fire(change)));
        return provider;
    }

    // tslint:disable-next-line:no-any
    async setPreference(key: string, value: any, resourceUri?: string): Promise<void> {
        if (resourceUri) {
            for (const provider of this.providers) {
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
