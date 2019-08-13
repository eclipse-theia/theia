/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { ILanguageClient } from '@theia/languages/lib/browser';
import { LanguageClientProvider } from '@theia/languages/lib/browser/language-client-provider';
import {
    TypeHierarchyItem,
    TypeHierarchyParams,
    TypeHierarchyRequest,
    ResolveTypeHierarchyRequest,
    TypeHierarchyServerCapabilities,
    ResolveTypeHierarchyItemParams
} from '@theia/languages/lib/browser/typehierarchy/typehierarchy-protocol';

@injectable()
export class TypeHierarchyServiceProvider {

    @inject(LanguageClientProvider)
    protected readonly clientProvider: LanguageClientProvider;

    async get(languageId: string | undefined): Promise<TypeHierarchyService | undefined> {
        if (languageId) {
            const client = await this.clientProvider.getLanguageClient(languageId);
            if (client && client.initializeResult) {
                const { typeHierarchyProvider } = client.initializeResult.capabilities as TypeHierarchyServerCapabilities;
                if (!!typeHierarchyProvider) {
                    return new TypeHierarchyService(client, languageId);
                }
            }
        }
        return undefined;
    }

}

export class TypeHierarchyService {

    constructor(protected readonly client: ILanguageClient, readonly languageId: string) {
    }

    /**
     * Performs the `textDocument/typeHierarchy` LS method invocations.
     */
    async get(params: TypeHierarchyParams): Promise<TypeHierarchyItem | undefined> {
        const item: TypeHierarchyItem = await this.client.sendRequest(TypeHierarchyRequest.type.method, params);
        return item ? item : undefined;
    }

    /**
     * Performs the `typeHierarchy/resolve` LS method call.
     */
    async resolve(params: ResolveTypeHierarchyItemParams): Promise<TypeHierarchyItem | undefined> {
        const item: TypeHierarchyItem = await this.client.sendRequest(ResolveTypeHierarchyRequest.type.method, params);
        return item ? item : undefined;
    }

}
