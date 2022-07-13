// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import debounce from 'p-debounce';
import * as markdownit from '@theia/core/shared/markdown-it';
import * as DOMPurify from '@theia/core/shared/dompurify';
import { Emitter } from '@theia/core/lib/common/event';
import { CancellationToken, CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { HostedPluginSupport } from '@theia/plugin-ext/lib/hosted/browser/hosted-plugin';
import { VSXExtension, VSXExtensionFactory } from './vsx-extension';
import { ProgressService } from '@theia/core/lib/common/progress-service';
import { VSXExtensionsSearchModel } from './vsx-extensions-search-model';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { PreferenceInspectionScope, PreferenceService } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { RecommendedExtensions } from './recommended-extensions/recommended-extensions-preference-contribution';
import URI from '@theia/core/lib/common/uri';
import { VSXResponseError, VSXSearchParam } from '@theia/ovsx-client/lib/ovsx-types';
import { OVSXClientProvider } from '../common/ovsx-client-provider';

@injectable()
export class VSXExtensionsModel {

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    @inject(OVSXClientProvider)
    protected clientProvider: OVSXClientProvider;

    @inject(HostedPluginSupport)
    protected readonly pluginSupport: HostedPluginSupport;

    @inject(VSXExtensionFactory)
    protected readonly extensionFactory: VSXExtensionFactory;

    @inject(ProgressService)
    protected readonly progressService: ProgressService;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(VSXExtensionsSearchModel)
    readonly search: VSXExtensionsSearchModel;

    protected readonly initialized = new Deferred<void>();

    @postConstruct()
    protected async init(): Promise<void> {
        await Promise.all([
            this.initInstalled(),
            this.initSearchResult(),
            this.initRecommended(),
        ]);
        this.initialized.resolve();
    }

    protected async initInstalled(): Promise<void> {
        await this.pluginSupport.willStart;
        this.pluginSupport.onDidChangePlugins(() => this.updateInstalled());
        try {
            await this.updateInstalled();
        } catch (e) {
            console.error(e);
        }
    }

    protected async initSearchResult(): Promise<void> {
        this.search.onDidChangeQuery(() => this.updateSearchResult());
        try {
            await this.updateSearchResult();
        } catch (e) {
            console.error(e);
        }
    }

    protected async initRecommended(): Promise<void> {
        this.preferences.onPreferenceChanged(change => {
            if (change.preferenceName === 'extensions') {
                this.updateRecommended();
            }
        });
        await this.preferences.ready;
        try {
            await this.updateRecommended();
        } catch (e) {
            console.error(e);
        }
    }

    /**
     * single source of all extensions
     */
    protected readonly extensions = new Map<string, VSXExtension>();

    protected _installed = new Set<string>();
    get installed(): IterableIterator<string> {
        return this._installed.values();
    }

    isInstalled(id: string): boolean {
        return this._installed.has(id);
    }

    protected _searchError?: string;
    get searchError(): string | undefined {
        return this._searchError;
    }

    protected _searchResult = new Set<string>();
    get searchResult(): IterableIterator<string> {
        return this._searchResult.values();
    }

    protected _recommended = new Set<string>();
    get recommended(): IterableIterator<string> {
        return this._recommended.values();
    }

    getExtension(id: string): VSXExtension | undefined {
        return this.extensions.get(id);
    }

    protected setExtension(id: string): VSXExtension {
        let extension = this.extensions.get(id);
        if (!extension) {
            extension = this.extensionFactory({ id });
            this.extensions.set(id, extension);
        }
        return extension;
    }

    protected doChange<T>(task: () => Promise<T>): Promise<T>;
    protected doChange<T>(task: () => Promise<T>, token: CancellationToken): Promise<T | undefined>;
    protected doChange<T>(task: () => Promise<T>, token: CancellationToken = CancellationToken.None): Promise<T | undefined> {
        return this.progressService.withProgress('', 'extensions', async () => {
            if (token && token.isCancellationRequested) {
                return undefined;
            }
            const result = await task();
            if (token && token.isCancellationRequested) {
                return undefined;
            }
            this.onDidChangeEmitter.fire(undefined);
            return result;
        });
    }

    protected searchCancellationTokenSource = new CancellationTokenSource();
    protected updateSearchResult = debounce(() => {
        this.searchCancellationTokenSource.cancel();
        this.searchCancellationTokenSource = new CancellationTokenSource();
        const query = this.search.query;
        return this.doUpdateSearchResult({ query, includeAllVersions: true }, this.searchCancellationTokenSource.token);
    }, 500);
    protected doUpdateSearchResult(param: VSXSearchParam, token: CancellationToken): Promise<void> {
        return this.doChange(async () => {
            const searchResult = new Set<string>();
            if (!param.query) {
                this._searchResult = searchResult;
                return;
            }
            const client = await this.clientProvider();
            const result = await client.search(param);
            this._searchError = result.error;
            if (token.isCancellationRequested) {
                return;
            }
            for (const data of result.extensions) {
                const id = data.namespace.toLowerCase() + '.' + data.name.toLowerCase();
                const extension = client.getLatestCompatibleVersion(data);
                if (!extension) {
                    continue;
                }
                this.setExtension(id).update(Object.assign(data, {
                    publisher: data.namespace,
                    downloadUrl: data.files.download,
                    iconUrl: data.files.icon,
                    readmeUrl: data.files.readme,
                    licenseUrl: data.files.license,
                    version: extension.version
                }));
                searchResult.add(id);
            }
            this._searchResult = searchResult;
        }, token);
    }

    protected async updateInstalled(): Promise<void> {
        const prevInstalled = this._installed;
        return this.doChange(async () => {
            const plugins = this.pluginSupport.plugins;
            const currInstalled = new Set<string>();
            const refreshing = [];
            for (const plugin of plugins) {
                if (plugin.model.engine.type === 'vscode') {
                    const version = plugin.model.version;
                    const id = plugin.model.id;
                    this._installed.delete(id);
                    const extension = this.setExtension(id);
                    currInstalled.add(extension.id);
                    refreshing.push(this.refresh(id, version));
                }
            }
            for (const id of this._installed) {
                const extension = this.getExtension(id);
                if (!extension) { continue; }
                refreshing.push(this.refresh(id, extension.version));
            }
            const installed = new Set([...prevInstalled, ...currInstalled]);
            const installedSorted = Array.from(installed).sort((a, b) => this.compareExtensions(a, b));
            this._installed = new Set(installedSorted.values());
            await Promise.all(refreshing);
        });
    }

    protected updateRecommended(): Promise<Array<VSXExtension | undefined>> {
        return this.doChange<Array<VSXExtension | undefined>>(async () => {
            const allRecommendations = new Set<string>();
            const allUnwantedRecommendations = new Set<string>();

            const updateRecommendationsForScope = (scope: PreferenceInspectionScope, root?: URI) => {
                const { recommendations, unwantedRecommendations } = this.getRecommendationsForScope(scope, root);
                recommendations.forEach(recommendation => allRecommendations.add(recommendation));
                unwantedRecommendations.forEach(unwantedRecommendation => allUnwantedRecommendations.add(unwantedRecommendation));
            };

            updateRecommendationsForScope('defaultValue'); // In case there are application-default recommendations.
            const roots = await this.workspaceService.roots;
            for (const root of roots) {
                updateRecommendationsForScope('workspaceFolderValue', root.resource);
            }
            if (this.workspaceService.saved) {
                updateRecommendationsForScope('workspaceValue');
            }
            const recommendedSorted = new Set(Array.from(allRecommendations).sort((a, b) => this.compareExtensions(a, b)));
            allUnwantedRecommendations.forEach(unwantedRecommendation => recommendedSorted.delete(unwantedRecommendation));
            this._recommended = recommendedSorted;
            return Promise.all(Array.from(recommendedSorted, plugin => this.refresh(plugin)));
        });
    }

    protected getRecommendationsForScope(scope: PreferenceInspectionScope, root?: URI): Required<RecommendedExtensions> {
        const configuredValue = this.preferences.inspect<Required<RecommendedExtensions>>('extensions', root?.toString())?.[scope];
        return {
            recommendations: configuredValue?.recommendations ?? [],
            unwantedRecommendations: configuredValue?.unwantedRecommendations ?? [],
        };
    }

    resolve(id: string): Promise<VSXExtension> {
        return this.doChange(async () => {
            await this.initialized.promise;
            const extension = await this.refresh(id);
            if (!extension) {
                throw new Error(`Failed to resolve ${id} extension.`);
            }
            if (extension.readmeUrl) {
                try {
                    const client = await this.clientProvider();
                    const rawReadme = await client.fetchText(extension.readmeUrl);
                    const readme = this.compileReadme(rawReadme);
                    extension.update({ readme });
                } catch (e) {
                    if (!VSXResponseError.is(e) || e.statusCode !== 404) {
                        console.error(`[${id}]: failed to compile readme, reason:`, e);
                    }
                }
            }
            return extension;
        });
    }

    protected compileReadme(readmeMarkdown: string): string {
        const readmeHtml = markdownit({ html: true }).render(readmeMarkdown);
        return DOMPurify.sanitize(readmeHtml);
    }

    protected async refresh(id: string, version?: string): Promise<VSXExtension | undefined> {
        try {
            let extension = this.getExtension(id);
            if (!this.shouldRefresh(extension)) {
                return extension;
            }
            const client = await this.clientProvider();
            const data = version !== undefined
                ? await client.getExtension(id, { extensionVersion: version, includeAllVersions: true })
                : await client.getLatestCompatibleExtensionVersion(id);
            if (!data) {
                return;
            }
            if (data.error) {
                return this.onDidFailRefresh(id, data.error);
            }
            extension = this.setExtension(id);
            extension.update(Object.assign(data, {
                publisher: data.namespace,
                downloadUrl: data.files.download,
                iconUrl: data.files.icon,
                readmeUrl: data.files.readme,
                licenseUrl: data.files.license,
                version: data.version
            }));
            return extension;
        } catch (e) {
            return this.onDidFailRefresh(id, e);
        }
    }

    /**
     * Determines if the given extension should be refreshed.
     * @param extension the extension to refresh.
     */
    protected shouldRefresh(extension?: VSXExtension): boolean {
        if (extension === undefined) {
            return true;
        }
        return !extension.builtin;
    }

    protected onDidFailRefresh(id: string, error: unknown): VSXExtension | undefined {
        const cached = this.getExtension(id);
        if (cached && cached.installed) {
            return cached;
        }
        console.error(`[${id}]: failed to refresh, reason:`, error);
        return undefined;
    }

    /**
     * Compare two extensions based on their display name, and publisher if applicable.
     * @param a the first extension id for comparison.
     * @param b the second extension id for comparison.
     */
    protected compareExtensions(a: string, b: string): number {
        const extensionA = this.getExtension(a);
        const extensionB = this.getExtension(b);
        if (!extensionA || !extensionB) {
            return 0;
        }
        if (extensionA.displayName && extensionB.displayName) {
            return extensionA.displayName.localeCompare(extensionB.displayName);
        }
        if (extensionA.publisher && extensionB.publisher) {
            return extensionA.publisher.localeCompare(extensionB.publisher);
        }
        return 0;
    }

}
