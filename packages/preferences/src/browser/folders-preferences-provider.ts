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
                    const provider = await this.createFolderPreferenceProvider(root);
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

        this.workspaceService.onWorkspaceChanged(async roots => {
            for (const root of roots) {
                if (!this.existsProvider(root.uri)) {
                    const provider = this.createFolderPreferenceProvider(root);
                    await provider.ready;
                    if (!this.existsProvider(root.uri)) { // prevent a second provider gets created while waiting on `provider.ready`
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

    getPreferences(resourceUri?: string): { [p: string]: any } {
        const numProviders = this.providers.length;
        if (!resourceUri || numProviders === 0) {
            return {};
        }
        const res = this.providers.sort(p => {
            if (p.uri) {
                return p.uri.path.relativity(new URI(resourceUri).path);
            }
            return -1;
        })[numProviders - 1].getPreferences();
        return res;
    }

    canProvide(preferenceName: string, resourceUri?: string): number {
        if (resourceUri &&
            this.providers.length > 0 &&
            Math.max(...this.providers.map(p => p.canProvide(preferenceName, resourceUri))) >= 0) {
            return 3;
        }
        return super.canProvide(preferenceName, resourceUri);
    }

    protected createFolderPreferenceProvider(folder: FileStat): FolderPreferenceProvider {
        const provider = this.folderPreferenceProviderFactory({ folder });
        this.toDispose.push(provider);
        this.toDispose.push(provider.onDidPreferencesChanged(change => this.onDidPreferencesChangedEmitter.fire(change)));
        return provider;
    }
}
