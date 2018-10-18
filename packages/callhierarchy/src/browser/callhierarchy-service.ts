/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject, named } from 'inversify';
import { ContributionProvider } from '@theia/core/lib/common';
import { LanguageClientProvider } from '@theia/languages/lib/browser/language-client-provider';
import { CallsParams, CallsResult, CallsServerCapabilities } from '@theia/languages/lib/browser/calls/calls-protocol.proposed';
import { LspCallHierarchyService } from './lsp-callhierarchy-service';

export const CallHierarchyService = Symbol('CallHierarchyService');

export interface CallHierarchyService {
    readonly languageId: string;
    getCalls(params: CallsParams): Promise<CallsResult>;
}

@injectable()
export class CallHierarchyServiceProvider {

    @inject(ContributionProvider) @named(CallHierarchyService)
    protected readonly contributions: ContributionProvider<CallHierarchyService>;

    @inject(LanguageClientProvider)
    protected readonly languageClientProvider: LanguageClientProvider;

    async get(languageId: string): Promise<CallHierarchyService | undefined> {
        const languageClient = await this.languageClientProvider.getLanguageClient(languageId);
        if (languageClient && languageClient.initializeResult) {
            const capabilities = languageClient.initializeResult.capabilities;
            const callsProvider = (capabilities as CallsServerCapabilities).callsProvider;
            if (callsProvider) {
                return new LspCallHierarchyService(languageId, languageClient);
            }
        }
        return this.contributions.getContributions().find(service => languageId === service.languageId);
    }
}
