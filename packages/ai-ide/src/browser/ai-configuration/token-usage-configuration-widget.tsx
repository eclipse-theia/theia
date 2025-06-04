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

import { ReactWidget } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { MessageService, nls } from '@theia/core';
import { TokenUsageFrontendService, ModelTokenUsageData } from '@theia/ai-core/lib/browser/token-usage-frontend-service';
import { formatDistanceToNow } from 'date-fns';

// Using the interface from the token usage service

@injectable()
export class AITokenUsageConfigurationWidget extends ReactWidget {

    static readonly ID = 'ai-token-usage-configuration-container-widget';
    static readonly LABEL = nls.localize('theia/ai/tokenUsage/label', 'Token Usage');

    // Data will be fetched from the service
    protected tokenUsageData: ModelTokenUsageData[] = [];

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(TokenUsageFrontendService)
    protected readonly tokenUsageService: TokenUsageFrontendService;

    @postConstruct()
    protected init(): void {
        this.id = AITokenUsageConfigurationWidget.ID;
        this.title.label = AITokenUsageConfigurationWidget.LABEL;
        this.title.closable = false;

        this.refreshData();

        this.tokenUsageService.onTokenUsageUpdated(data => {
            this.tokenUsageData = data;
            this.update();
        });
    }

    protected async refreshData(): Promise<void> {
        try {
            this.tokenUsageData = await this.tokenUsageService.getTokenUsageData();
            this.update();
        } catch (error) {
            this.messageService.error(`Failed to fetch token usage data: ${error}`);
        }
    }

    protected formatNumber(num: number): string {
        return num.toLocaleString();
    }

    protected formatDate(date?: Date): string {
        if (!date) {
            return nls.localize('theia/ai/tokenUsage/never', 'Never');
        }
        return formatDistanceToNow(date, { addSuffix: true });
    }

    protected hasCacheData(): boolean {
        return this.tokenUsageData.some(model =>
            model.cachedInputTokens !== undefined ||
            model.readCachedInputTokens !== undefined
        );
    }

    protected renderHeaderRow(): React.ReactNode {
        const showCacheColumns = this.hasCacheData();

        return (
            <tr className="token-usage-header">
                <th className="token-usage-model-column">{nls.localize('theia/ai/tokenUsage/model', 'Model')}</th>
                <th className="token-usage-column">{nls.localize('theia/ai/tokenUsage/inputTokens', 'Input Tokens')}</th>
                {showCacheColumns && (
                    <>
                        <th
                            className="token-usage-column"
                            title={nls.localize(
                                'theia/ai/tokenUsage/cachedInputTokensTooltip',
                                "Tracked additionally to 'Input Tokens'. Usually more expensive than non-cached tokens."
                            )}
                        >
                            {nls.localize('theia/ai/tokenUsage/cachedInputTokens', 'Input Tokens Written to Cache')}
                        </th>
                        <th
                            className="token-usage-column"
                            title={nls.localize(
                                'theia/ai/tokenUsage/readCachedInputTokensTooltip',
                                "Tracked additionally to 'Input Token'. Usually much less expensive than not cached. Usually does not count to rate limits."
                            )}
                        >
                            {nls.localize('theia/ai/tokenUsage/readCachedInputTokens', 'Input Tokens Read From Cache')}
                        </th>
                    </>
                )}
                <th className="token-usage-column">{nls.localize('theia/ai/tokenUsage/outputTokens', 'Output Tokens')}</th>
                <th
                    className="token-usage-column"
                    title={nls.localize('theia/ai/tokenUsage/totalTokensTooltip', "'Input Tokens' + 'Output Tokens'"
                    )}
                >
                    {nls.localize('theia/ai/tokenUsage/totalTokens', 'Total Tokens')}
                </th>
                <th className="token-usage-column">{nls.localize('theia/ai/tokenUsage/lastUsed', 'Last Used')}</th>
            </tr >
        );
    }

    protected renderModelRow(model: ModelTokenUsageData): React.ReactNode {
        const lastUsedDate = model.lastUsed ? new Date(model.lastUsed) : undefined;
        const exactDateString = lastUsedDate ? lastUsedDate.toLocaleString() : '';
        const showCacheColumns = this.hasCacheData();
        const totalTokens = model.inputTokens + model.outputTokens + (model.cachedInputTokens ?? 0);

        return (
            <tr key={model.modelId} className="token-usage-row">
                <td className="token-usage-model-cell">{model.modelId}</td>
                <td className="token-usage-cell">{this.formatNumber(model.inputTokens)}</td>
                {showCacheColumns && (
                    <>
                        <td className="token-usage-cell">{model.cachedInputTokens !== undefined ? this.formatNumber(model.cachedInputTokens) : '-'}</td>
                        <td className="token-usage-cell">{model.readCachedInputTokens !== undefined ? this.formatNumber(model.readCachedInputTokens) : '-'}</td>
                    </>
                )}
                <td className="token-usage-cell">{this.formatNumber(model.outputTokens)}</td>
                <td className="token-usage-cell">{this.formatNumber(totalTokens)}</td>
                <td className="token-usage-cell" title={exactDateString}>{this.formatDate(lastUsedDate)}</td>
            </tr>
        );
    }

    protected renderSummaryRow(): React.ReactNode {
        // Only show summary row if there is data
        if (this.tokenUsageData.length === 0) {
            return undefined;
        }

        const totalInputTokens = this.tokenUsageData.reduce((sum, model) => sum + model.inputTokens, 0);
        const totalOutputTokens = this.tokenUsageData.reduce((sum, model) => sum + model.outputTokens, 0);
        const totalCachedInputTokens = this.tokenUsageData.reduce(
            (sum, model) => sum + (model.cachedInputTokens || 0), 0
        );
        const totalReadCachedInputTokens = this.tokenUsageData.reduce(
            (sum, model) => sum + (model.readCachedInputTokens || 0), 0
        );
        const totalTokens = totalInputTokens + totalCachedInputTokens + totalOutputTokens;

        const showCacheColumns = this.hasCacheData();

        return (
            <tr className="token-usage-summary-row">
                <td className="token-usage-model-cell"><strong>{nls.localize('theia/ai/tokenUsage/total', 'Total')}</strong></td>
                <td className="token-usage-cell"><strong>{this.formatNumber(totalInputTokens)}</strong></td>
                {showCacheColumns && (
                    <>
                        <td className="token-usage-cell"><strong>{this.formatNumber(totalCachedInputTokens)}</strong></td>
                        <td className="token-usage-cell"><strong>{this.formatNumber(totalReadCachedInputTokens)}</strong></td>
                    </>
                )}
                <td className="token-usage-cell"><strong>{this.formatNumber(totalOutputTokens)}</strong></td>
                <td className="token-usage-cell"><strong>{this.formatNumber(totalTokens)}</strong></td>
                <td className="token-usage-cell"></td>
            </tr>
        );
    }

    protected render(): React.ReactNode {
        return (
            <div className="token-usage-configuration-container">
                <h2 className="token-usage-configuration-title">{nls.localize('theia/ai/tokenUsage/title', 'AI Model Token Usage')}</h2>

                <div className="token-usage-table-container">
                    {this.tokenUsageData.length > 0 ? (
                        <table className="token-usage-table">
                            <thead>
                                {this.renderHeaderRow()}
                            </thead>
                            <tbody>
                                {this.tokenUsageData.map(model => this.renderModelRow(model))}
                                {this.renderSummaryRow()}
                            </tbody>
                        </table>
                    ) : (
                        <div className="token-usage-empty">
                            <p>{nls.localize('theia/ai/tokenUsage/noData', 'No token usage data available yet.')}</p>
                        </div>
                    )}
                </div>

                <div className="token-usage-notes">
                    <p className="token-usage-note">
                        <i className="codicon codicon-info"></i>
                        {nls.localize('theia/ai/tokenUsage/note', 'Token usage is tracked since the start of the application and is not persisted.')}
                    </p>
                </div>
            </div>
        );
    }
}
