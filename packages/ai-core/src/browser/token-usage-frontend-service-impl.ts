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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core';
import { ModelTokenUsageData, TokenUsageFrontendService } from './token-usage-frontend-service';
import { TokenUsage, TokenUsageService } from '../common/token-usage-service';
import { TokenUsageServiceClient } from '../common/protocol';

@injectable()
export class TokenUsageServiceClientImpl implements TokenUsageServiceClient {
    private readonly _onTokenUsageUpdated = new Emitter<TokenUsage>();
    readonly onTokenUsageUpdated = this._onTokenUsageUpdated.event;

    notifyTokenUsage(usage: TokenUsage): void {
        this._onTokenUsageUpdated.fire(usage);
    }

}

@injectable()
export class TokenUsageFrontendServiceImpl implements TokenUsageFrontendService {

    @inject(TokenUsageServiceClient)
    protected readonly tokenUsageServiceClient: TokenUsageServiceClient;

    @inject(TokenUsageService)
    protected readonly tokenUsageService: TokenUsageService;

    private readonly _onTokenUsageUpdated = new Emitter<ModelTokenUsageData[]>();
    readonly onTokenUsageUpdated = this._onTokenUsageUpdated.event;

    private cachedUsageData: ModelTokenUsageData[] = [];

    @postConstruct()
    protected init(): void {
        this.tokenUsageServiceClient.onTokenUsageUpdated(() => {
            this.getTokenUsageData().then(data => {
                this._onTokenUsageUpdated.fire(data);
            });
        });
    }

    /**
     * Gets the current token usage data for all models
     */
    async getTokenUsageData(): Promise<ModelTokenUsageData[]> {
        try {
            const usages = await this.tokenUsageService.getTokenUsages();
            this.cachedUsageData = this.aggregateTokenUsages(usages);
            return this.cachedUsageData;
        } catch (error) {
            console.error('Failed to get token usage data:', error);
            return [];
        }
    }

    /**
     * Aggregates token usages by model
     */
    private aggregateTokenUsages(usages: TokenUsage[]): ModelTokenUsageData[] {
        // Group by model
        const modelMap = new Map<string, {
            inputTokens: number;
            outputTokens: number;
            cachedInputTokens: number;
            readCachedInputTokens: number;
            lastUsed?: Date;
        }>();

        // Process each usage record
        for (const usage of usages) {
            const existing = modelMap.get(usage.model);

            if (existing) {
                existing.inputTokens += usage.inputTokens;
                existing.outputTokens += usage.outputTokens;

                // Add cached tokens if they exist
                if (usage.cachedInputTokens !== undefined) {
                    existing.cachedInputTokens += usage.cachedInputTokens;
                }

                // Add read cached tokens if they exist
                if (usage.readCachedInputTokens !== undefined) {
                    existing.readCachedInputTokens += usage.readCachedInputTokens;
                }

                // Update last used if this usage is more recent
                if (!existing.lastUsed || (usage.timestamp && usage.timestamp > existing.lastUsed)) {
                    existing.lastUsed = usage.timestamp;
                }
            } else {
                modelMap.set(usage.model, {
                    inputTokens: usage.inputTokens,
                    outputTokens: usage.outputTokens,
                    cachedInputTokens: usage.cachedInputTokens || 0,
                    readCachedInputTokens: usage.readCachedInputTokens || 0,
                    lastUsed: usage.timestamp
                });
            }
        }

        // Convert map to array of model usage data
        const result: ModelTokenUsageData[] = [];

        for (const [modelId, data] of modelMap.entries()) {
            const modelData: ModelTokenUsageData = {
                modelId,
                inputTokens: data.inputTokens,
                outputTokens: data.outputTokens,
                lastUsed: data.lastUsed
            };

            // Only include cache-related fields if they have non-zero values
            if (data.cachedInputTokens > 0) {
                modelData.cachedInputTokens = data.cachedInputTokens;
            }

            if (data.readCachedInputTokens > 0) {
                modelData.readCachedInputTokens = data.readCachedInputTokens;
            }

            result.push(modelData);
        }

        return result;
    }
}
