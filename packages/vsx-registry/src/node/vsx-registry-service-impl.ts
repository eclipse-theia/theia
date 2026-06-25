// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { ILogger } from '@theia/core/lib/common/logger';
import { LanguageInfo } from '@theia/core/lib/common/i18n/localization';
import { RequestContext, RequestService } from '@theia/core/shared/@theia/request';
import { OVSXApiFilterProvider } from '@theia/ovsx-client';
import { VSXExtensionRaw, VSXQueryOptions, VSXQueryResult, VSXSearchOptions, VSXSearchResult } from '@theia/ovsx-client/lib/ovsx-types';
import { OVSXClientProvider } from '../common/ovsx-client-provider';
import { VSXEnvironment } from '../common/vsx-environment';
import { VSXRegistryService } from '../common/vsx-registry-service';

@injectable()
export class VSXRegistryServiceImpl implements VSXRegistryService {

    @inject(OVSXClientProvider)
    protected readonly clientProvider: OVSXClientProvider;

    @inject(OVSXApiFilterProvider)
    protected readonly filterProvider: OVSXApiFilterProvider;

    @inject(RequestService)
    protected readonly requestService: RequestService;

    @inject(VSXEnvironment)
    protected readonly vsxEnvironment: VSXEnvironment;

    @inject(ILogger)
    protected readonly logger: ILogger;

    async search(searchOptions?: VSXSearchOptions): Promise<VSXSearchResult> {
        const client = await this.clientProvider();
        return client.search(searchOptions);
    }

    async query(queryOptions?: VSXQueryOptions): Promise<VSXQueryResult> {
        const client = await this.clientProvider();
        return client.query(queryOptions);
    }

    async findLatestCompatibleExtension(query: VSXQueryOptions): Promise<VSXExtensionRaw | undefined> {
        const filter = await this.filterProvider();
        return filter.findLatestCompatibleExtension(query);
    }

    async fetchReadme(readmeUrl: string): Promise<string | undefined> {
        if (!await this.validateRegistryOrigin(readmeUrl)) {
            return undefined;
        }
        try {
            const response = await this.requestService.request({ url: readmeUrl });
            const statusCode = response.res.statusCode;
            if (statusCode === 404) {
                // If the readme doesn't exist, simply ignore the error and return undefined
                return undefined;
            }
            return RequestContext.asText(response);
        } catch (e) {
            this.logger.error(`Failed to fetch readme from '${readmeUrl}':`, e);
            return undefined;
        }
    }

    async fetchLanguagePackInfo(downloadUrl: string): Promise<LanguageInfo[]> {
        if (!await this.validateRegistryOrigin(downloadUrl)) {
            return [];
        }
        const parentUrl = downloadUrl.substring(0, downloadUrl.lastIndexOf('/'));
        const manifestUrl = parentUrl + '/package.json';
        try {
            const response = await this.requestService.request({ url: manifestUrl });
            const manifest = RequestContext.asJson<{ contributes?: { localizations?: Array<{ languageId: string; languageName?: string; localizedLanguageName?: string }> } }>(
                response
            );
            const localizations = manifest.contributes?.localizations ?? [];
            return localizations.map(e => ({
                languageId: e.languageId,
                languageName: e.languageName,
                localizedLanguageName: e.localizedLanguageName,
                languagePack: true
            }));
        } catch {
            return [];
        }
    }

    protected async validateRegistryOrigin(url: string): Promise<boolean> {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            return false;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return false;
        }

        const allowedOrigins = new Set<string>();

        const registryUri = await this.vsxEnvironment.getRegistryUri();
        try {
            allowedOrigins.add(new URL(registryUri).origin);
        } catch {
            // skip invalid registry URI
        }

        const routerConfig = await this.vsxEnvironment.getOvsxRouterConfig?.();
        if (routerConfig?.registries) {
            for (const registryUrl of Object.values(routerConfig.registries)) {
                try {
                    allowedOrigins.add(new URL(registryUrl).origin);
                } catch {
                    // skip invalid URLs in config
                }
            }
        }

        if (!allowedOrigins.has(parsed.origin)) {
            this.logger.warn(`Rejected fetch request to '${url}': origin does not match any configured OVSX registry.`);
            return false;
        }
        return true;
    }
}
