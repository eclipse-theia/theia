// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { injectable } from '@theia/core/shared/inversify';
import { TokenUsage, TokenUsageParams, TokenUsageService } from '../common/token-usage-service';
import { TokenUsageServiceClient } from '../common/protocol';

@injectable()
export class TokenUsageServiceImpl implements TokenUsageService {
    private client: TokenUsageServiceClient | undefined;

    /**
     * Sets the client to notify about token usage changes
     */
    setClient(client: TokenUsageServiceClient | undefined): void {
        this.client = client;
    }

    private readonly tokenUsages: TokenUsage[] = [];

    /**
     * Records token usage for a model interaction.
     *
     * @param model The model identifier
     * @param params Token usage parameters
     * @returns A promise that resolves when the token usage has been recorded
     */
    async recordTokenUsage(model: string, params: TokenUsageParams): Promise<void> {
        const usage: TokenUsage = {
            inputTokens: params.inputTokens,
            outputTokens: params.outputTokens,
            model,
            timestamp: new Date(),
            requestId: params.requestId
        };

        this.tokenUsages.push(usage);
        this.client?.notifyTokenUsage(usage);

        console.log(`Input Tokens: ${params.inputTokens}; Output Tokens: ${params.outputTokens}; Model: ${model}${params.requestId ? `; RequestId: ${params.requestId}` : ''}`);
        // For now we just store in memory
        // In the future, this could be persisted to disk, a database, or sent to a service
        return Promise.resolve();
    }

    /**
     * Gets all token usage records stored in this service.
     */
    async getTokenUsages(): Promise<TokenUsage[]> {
        return [...this.tokenUsages];
    }

    /**
     * Resets all stored token usage data.
     */
    async resetTokenUsage(): Promise<void> {
        this.tokenUsages.length = 0;
        // Notify the client that token usage data has been reset
        // The client will refresh its cached data when it receives this notification
        this.client?.notifyTokenUsage({
            inputTokens: 0,
            outputTokens: 0,
            model: '',
            timestamp: new Date(),
            requestId: 'reset'
        });
        console.log('Token usage data has been reset');
    }
}
