// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { LanguageModelBackendService, LanguageModelChatMessage, LanguageModelClient, LanguageModelProvider } from '../common';

@injectable()
export class LanguageModelServiceImpl implements LanguageModelBackendService {
    @inject(LanguageModelProvider) modelProvider: LanguageModelProvider;

    private client: LanguageModelClient;

    setClient(client: LanguageModelClient): void {
        this.client = client;
    }
    async sendRequest(messages: LanguageModelChatMessage[]): Promise<void> {
        const result = await this.modelProvider.sendRequest(messages);
        for await (const value of result.stream) {
            this.client.nextQueryResultToken(value);
        }
        this.client.queryResultFinished();
    }
}
