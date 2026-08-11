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

import { LanguageInfo } from '@theia/core/lib/common/i18n/localization';
import { VSXExtensionRaw, VSXQueryOptions, VSXQueryResult, VSXSearchOptions, VSXSearchResult } from '@theia/ovsx-client/lib/ovsx-types';

export const VSX_REGISTRY_SERVICE_PATH = '/services/vsx-registry';

export const VSXRegistryService = Symbol('VSXRegistryService');
export interface VSXRegistryService {
    /**
     * Search extensions. Delegates to OVSXClient.search().
     */
    search(searchOptions?: VSXSearchOptions): Promise<VSXSearchResult>;

    /**
     * Query extensions. Delegates to OVSXClient.query().
     */
    query(queryOptions?: VSXQueryOptions): Promise<VSXQueryResult>;

    /**
     * Find the latest version of an extension that is compatible with the
     * current VS Code API version. Runs the OVSXApiFilter loop on the backend,
     * collapsing potentially many HTTP requests into a single RPC call.
     */
    findLatestCompatibleExtension(query: VSXQueryOptions): Promise<VSXExtensionRaw | undefined>;

    /**
     * Fetch an extension's readme content.
     * Returns the text content, or undefined on error/404.
     */
    fetchReadme(readmeUrl: string): Promise<string | undefined>;

    /**
     * Fetch language pack info from an extension's manifest.
     * Derives the manifest URL from the download URL, fetches and parses it.
     */
    fetchLanguagePackInfo(downloadUrl: string): Promise<LanguageInfo[]>;
}
