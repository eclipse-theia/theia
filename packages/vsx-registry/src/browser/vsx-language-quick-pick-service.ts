// *****************************************************************************
// Copyright (C) 2022 TypeFox and others.
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

import { LanguageQuickPickItem, LanguageQuickPickService } from '@theia/core/lib/browser/i18n/language-quick-pick-service';
import { RequestContext, RequestService } from '@theia/core/shared/@theia/request';
import { inject, injectable } from '@theia/core/shared/inversify';
import { LanguageInfo } from '@theia/core/lib/common/i18n/localization';
import { PluginPackage, PluginServer } from '@theia/plugin-ext';
import { OVSXClientProvider } from '../common/ovsx-client-provider';
import { VSXSearchEntry } from '@theia/ovsx-client';
import { VSXExtensionUri } from '../common/vsx-extension-uri';

@injectable()
export class VSXLanguageQuickPickService extends LanguageQuickPickService {

    @inject(OVSXClientProvider)
    protected readonly clientProvider: OVSXClientProvider;

    @inject(RequestService)
    protected readonly requestService: RequestService;

    @inject(PluginServer)
    protected readonly pluginServer: PluginServer;

    protected override async getAvailableLanguages(): Promise<LanguageQuickPickItem[]> {
        const client = await this.clientProvider();
        const searchResult = await client.search({
            category: 'Language Packs',
            sortBy: 'downloadCount',
            sortOrder: 'desc',
            size: 20
        });
        if (searchResult.error) {
            throw new Error('Error while loading available languages: ' + searchResult.error);
        }

        const extensionLanguages = await Promise.all(
            searchResult.extensions.map(async extension => ({
                extension,
                languages: await this.loadExtensionLanguages(extension)
            }))
        );

        const languages = new Map<string, { language: LanguageInfo, extensionUri: string }>();

        for (const extension of extensionLanguages) {
            for (const localizationContribution of extension.languages) {
                if (!languages.has(localizationContribution.languageId)) {
                    languages.set(localizationContribution.languageId, {
                        language: localizationContribution,
                        extensionUri: VSXExtensionUri.toUri(extension.extension.name, extension.extension.namespace).toString()
                    });
                }
            }
        }
        const items: LanguageQuickPickItem[] = [];

        for (const { language, extensionUri } of Array.from(languages.values())) {
            const item: LanguageQuickPickItem = {
                ...this.createLanguageQuickPickItem(language),
                execute: async () => {
                    await this.pluginServer.deploy(extensionUri);
                }
            };
            items.push(item);
        }
        return items;
    }

    protected async loadExtensionLanguages(extension: VSXSearchEntry): Promise<LanguageInfo[]> {
        // When searching for extensions on ovsx, we don't receive the `manifest` property.
        // This property is only set when querying a specific extension.
        // To improve performance, we assume that a manifest exists at `/package.json`.
        const downloadUrl = extension.files.download;
        const parentUrl = downloadUrl.substring(0, downloadUrl.lastIndexOf('/'));
        const manifestUrl = parentUrl + '/package.json';
        const manifestRequest = await this.requestService.request({ url: manifestUrl });
        const manifestContent = RequestContext.asJson<PluginPackage>(manifestRequest);
        const localizations = manifestContent.contributes?.localizations;
        if (localizations) {
            return localizations.map(e => ({
                languageId: e.languageId,
                languageName: e.languageName,
                localizedLanguageName: e.localizedLanguageName,
                languagePack: true
            }));
        }
        return [];
    }
}
