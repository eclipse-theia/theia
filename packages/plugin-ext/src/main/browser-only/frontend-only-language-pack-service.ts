// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { nls } from '@theia/core';
import { PLUGINS_BASE_PATH } from '@theia/core/lib/common/static-asset-paths';
import { LanguagePackService, LanguagePackBundle } from '../../common/language-pack-service';
import { DeployedPlugin, getPluginId } from '../../common/plugin-protocol';
import { BrowserOnlyPluginsProvider } from './browser-only-plugins-provider';

type UnprocessedL10nBundle = Record<string, string | { message: string }>;

function processL10nBundle(bundle: UnprocessedL10nBundle): Record<string, string> {
    const processed: Record<string, string> = {};
    for (const [name, value] of Object.entries(bundle)) {
        const stringValue = typeof value === 'string' ? value : value.message;
        processed[name] = stringValue;
    }
    return processed;
}

/**
 * LanguagePackService for browser-only mode: in-memory Map populated by fetching
 * l10n bundles on first use. Mirrors backend behavior (PluginLanguagePackService)
 * but loads bundle.l10n.<locale>.json from static plugin assets.
 */
@injectable()
export class FrontendOnlyLanguagePackService implements LanguagePackService {

    protected readonly storage = new Map<string, Map<string, LanguagePackBundle>>();

    private loadPromise: Promise<void> | undefined;

    constructor(
        @inject(BrowserOnlyPluginsProvider) protected readonly pluginsProvider: BrowserOnlyPluginsProvider
    ) { }

    protected async loadBundlesIfNeeded(): Promise<void> {
        if (this.loadPromise !== undefined) {
            return this.loadPromise;
        }
        this.loadPromise = this.doLoadBundles();
        return this.loadPromise;
    }

    protected async doLoadBundles(): Promise<void> {
        const locale = nls.locale ?? nls.defaultLocale;
        const plugins = await this.pluginsProvider.getPlugins();
        await Promise.all(plugins.map(plugin => this.loadPluginBundles(plugin, locale)));
    }

    protected async loadPluginBundles(plugin: DeployedPlugin, locale: string): Promise<void> {
        const l10nDir = plugin.metadata.model.l10n;
        if (!l10nDir) {
            return;
        }
        const pluginId = getPluginId(plugin.metadata.model);
        const url = `${PLUGINS_BASE_PATH}/${pluginId}/${l10nDir}/bundle.l10n.${locale}.json`;
        try {
            const res = await fetch(url);
            if (!res.ok) {
                return;
            }
            const raw = await res.json() as UnprocessedL10nBundle;
            const contents = processL10nBundle(raw);
            this.storeBundle(plugin.metadata.model.id, locale, {
                contents,
                uri: url
            });
        } catch {
            // Ignore: missing or invalid bundle
        }
    }

    storeBundle(pluginId: string, locale: string, bundle: LanguagePackBundle): void {
        if (!this.storage.has(pluginId)) {
            this.storage.set(pluginId, new Map());
        }
        this.storage.get(pluginId)!.set(locale, bundle);
    }

    deleteBundle(pluginId: string, locale?: string): void {
        if (locale !== undefined) {
            this.storage.get(pluginId)?.delete(locale);
        } else {
            this.storage.delete(pluginId);
        }
    }

    async getBundle(pluginId: string, locale: string): Promise<LanguagePackBundle | undefined> {
        await this.loadBundlesIfNeeded();
        return this.storage.get(pluginId)?.get(locale);
    }
}
