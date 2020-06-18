/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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
import debounce from 'p-debounce';
import * as showdown from 'showdown';
import * as sanitize from 'sanitize-html';
import { Emitter } from '@theia/core/lib/common/event';
import { CancellationToken, CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { VSXRegistryAPI, VSXResponseError } from '../common/vsx-registry-api';
import { VSXSearchParam, VSXExtensionRaw } from '../common/vsx-registry-types';
import { VSXEnvironment } from '../common/vsx-environment';
import { HostedPluginSupport } from '@theia/plugin-ext/lib/hosted/browser/hosted-plugin';
import { VSXExtension, VSXExtensionFactory } from './vsx-extension';
import { ProgressService } from '@theia/core/lib/common/progress-service';
import { VSXExtensionsSearchModel } from './vsx-extensions-search-model';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { VSCODE_DEFAULT_API_VERSION } from '@theia/plugin-ext-vscode/lib/common/plugin-vscode-environment';
import * as semver from 'semver';

@injectable()
export class VSXExtensionsModel {

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    @inject(VSXRegistryAPI)
    protected readonly api: VSXRegistryAPI;

    @inject(HostedPluginSupport)
    protected readonly pluginSupport: HostedPluginSupport;

    @inject(VSXExtensionFactory)
    protected readonly extensionFactory: VSXExtensionFactory;

    @inject(ProgressService)
    protected readonly progressService: ProgressService;

    @inject(VSXExtensionsSearchModel)
    readonly search: VSXExtensionsSearchModel;

    @inject(VSXEnvironment)
    protected readonly environment: VSXEnvironment;

    protected readonly initialized = new Deferred<void>();

    @postConstruct()
    protected async init(): Promise<void> {
        await Promise.all([
            this.initInstalled(),
            this.initSearchResult()
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

    /**
     * single source of all extensions
     */
    protected readonly extensions = new Map<string, VSXExtension>();

    protected _installed = new Set<string>();
    get installed(): IterableIterator<string> {
        return this._installed.values();
    }

    protected _searchResult = new Set<string>();
    get searchResult(): IterableIterator<string> {
        return this._searchResult.values();
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
        return this.doUpdateSearchResult({ query }, this.searchCancellationTokenSource.token);
    }, 150);
    protected doUpdateSearchResult(param: VSXSearchParam, token: CancellationToken): Promise<void> {
        return this.doChange(async () => {
            const result = await this.api.search(param);
            if (token.isCancellationRequested) {
                return;
            }
            const searchResult = new Set<string>();
            for (const data of result.extensions) {
                const id = data.namespace.toLowerCase() + '.' + data.name.toLowerCase();
                const latestCompatibleVersion = await this.getLatestCompatibleVersion(id);
                if (!latestCompatibleVersion) {
                    // no compatible version of the extension found
                    // this extension will not be displayed in the search result
                    continue;
                }
                if (latestCompatibleVersion !== 'latest') {
                    // the latest version of the extension is not compatible with Theia
                    // update the download link to the latest compatible version
                    const apiUri = await this.environment.getRegistryApiUri();
                    const updatedDownloadLink =
                        apiUri.resolve(id.replace('.', '/')).toString() + `/${latestCompatibleVersion}/file/${id}-${latestCompatibleVersion}.vsix`;
                    data.files.download = updatedDownloadLink;
                }

                this.setExtension(id).update(Object.assign(data, {
                    publisher: data.namespace,
                    downloadUrl: data.files.download,
                    iconUrl: data.files.icon,
                    readmeUrl: data.files.readme,
                    licenseUrl: data.files.license,
                    version: latestCompatibleVersion
                }));
                searchResult.add(id);
            }
            this._searchResult = searchResult;

        }, token);
    }

    /**
     * Query all versions of the extension from open-vsx api
     * Find the latest compatible version by checking each version's 'engines.vscode' value
     */
    protected async getLatestCompatibleVersion(id: string): Promise<string | undefined> {

        const extension = await this.api.getExtension(id);
        let latestCompatibleVersion: string | undefined;

        for (const version in extension.allVersions) {
            if (version === 'latest') {
                continue;
            }

            const apiUri = await this.environment.getRegistryApiUri();
            const { engines, versionAlias }: VSXExtensionRaw = await this.api.fetchJson(apiUri.resolve(id.replace('.', '/')).toString() + `/${version}`);

            if (!engines || !engines.length) {
                // no engine tag found, return the latest version of the extension
                return latestCompatibleVersion = 'latest';
            }

            if (engines && versionAlias && this.isEngineValid(engines[0]) && versionAlias[0] === 'latest') {
                // the latest version of the extension is compatible
                return latestCompatibleVersion = 'latest';
            } else if (engines && this.isEngineValid(engines[0])) {
                return latestCompatibleVersion = version;
            }
        }

        // no compatible version of the extension found
        return latestCompatibleVersion;
    }

    // Checks if Theia's current version of 'vscode api engine' satisfy the given 'engines.vscode' range required by the extension
    protected isEngineValid(engine: string): boolean {
        const currentEngine = this.getCurrentVersion();
        const parsedEngine = engine.split('@')[1];
        return semver.satisfies(currentEngine, parsedEngine);
    }

    // Gets the current version of 'vscode api engine' that Theia's plugin system supports
    protected getCurrentVersion(): string {
        return VSCODE_DEFAULT_API_VERSION;
    }

    protected async updateInstalled(): Promise<void> {
        return this.doChange(async () => {
            const plugins = this.pluginSupport.plugins;
            const installed = new Set<string>();
            const refreshing = [];
            for (const plugin of plugins) {
                if (plugin.model.engine.type === 'vscode') {
                    const id = plugin.model.id;
                    this._installed.delete(id);
                    const extension = this.setExtension(id);
                    installed.add(extension.id);
                    refreshing.push(this.refresh(id));
                }
            }
            for (const id of this._installed) {
                refreshing.push(this.refresh(id));
            }
            Promise.all(refreshing);
            const installedSorted = Array.from(installed).sort((a, b) => this.compareExtensions(a, b));
            this._installed = new Set(installedSorted.values());
        });
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
                    const rawReadme = await this.api.fetchText(extension.readmeUrl);
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
        const markdownConverter = new showdown.Converter({
            noHeaderId: true,
            strikethrough: true,
            headerLevelStart: 2
        });

        const readmeHtml = markdownConverter.makeHtml(readmeMarkdown);
        return sanitize(readmeHtml, {
            allowedTags: sanitize.defaults.allowedTags.concat(['h1', 'h2', 'img'])
        });
    }

    protected async refresh(id: string): Promise<VSXExtension | undefined> {
        try {
            const data = await this.api.getExtension(id);
            if (data.error) {
                return this.onDidFailRefresh(id, data.error);
            }
            const extension = this.setExtension(id);
            extension.update(Object.assign(data, {
                publisher: data.namespace,
                downloadUrl: data.files.download,
                iconUrl: data.files.icon,
                readmeUrl: data.files.readme,
                licenseUrl: data.files.license,
            }));
            return extension;
        } catch (e) {
            return this.onDidFailRefresh(id, e);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected onDidFailRefresh(id: string, error: any): VSXExtension | undefined {
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
