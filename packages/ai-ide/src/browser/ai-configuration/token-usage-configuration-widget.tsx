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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { MessageService, nls } from '@theia/core';
import { TokenUsageFrontendService, ModelTokenUsageData } from '@theia/ai-core/lib/browser/token-usage-frontend-service';
import { formatDistanceToNow } from 'date-fns';
import { AITableConfigurationWidget, TableColumn } from './base/ai-table-configuration-widget';

@injectable()
export class AITokenUsageConfigurationWidget extends AITableConfigurationWidget<ModelTokenUsageData> {

    static readonly ID = 'ai-token-usage-configuration-container-widget';
    static readonly LABEL = nls.localize('theia/ai/tokenUsage/label', 'Token Usage');

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(TokenUsageFrontendService)
    protected readonly tokenUsageService: TokenUsageFrontendService;

    @postConstruct()
    protected init(): void {
        this.id = AITokenUsageConfigurationWidget.ID;
        this.title.label = AITokenUsageConfigurationWidget.LABEL;
        this.title.closable = false;
        this.addClass('ai-configuration-widget');

        this.loadItems().then(() => this.update());

        this.toDispose.push(
            this.tokenUsageService.onTokenUsageUpdated(data => {
                this.items = data;
                this.update();
            })
        );
    }

    protected async loadItems(): Promise<void> {
        try {
            this.items = await this.tokenUsageService.getTokenUsageData();
        } catch (error) {
            this.messageService.error(nls.localize('theia/ai/tokenUsage/failedToGetTokenUsageData', 'Failed to fetch token usage data: {0}', error));
        }
    }

    protected getItemId(item: ModelTokenUsageData): string {
        return item.modelId;
    }

    protected formatNumber(num: number): string {
        return num.toLocaleString();
    }

    protected formatDate(date?: Date): string {
        if (!date) {
            return nls.localizeByDefault('Never');
        }
        return formatDistanceToNow(date, { addSuffix: true });
    }

    protected hasCacheData(): boolean {
        return this.items.some(model =>
            model.cachedInputTokens !== undefined ||
            model.readCachedInputTokens !== undefined
        );
    }

    protected getColumns(): TableColumn<ModelTokenUsageData>[] {
        const showCacheColumns = this.hasCacheData();
        const columns: TableColumn<ModelTokenUsageData>[] = [
            {
                id: 'model',
                label: nls.localize('theia/ai/tokenUsage/model', 'Model'),
                className: 'token-usage-model-column',
                renderCell: item => <span>{item.modelId}</span>
            },
            {
                id: 'input-tokens',
                label: nls.localize('theia/ai/tokenUsage/inputTokens', 'Input Tokens'),
                className: 'token-usage-column',
                renderCell: item => <span>{this.formatNumber(item.inputTokens)}</span>
            }
        ];

        if (showCacheColumns) {
            columns.push(
                {
                    id: 'cached-input-tokens',
                    label: nls.localize('theia/ai/tokenUsage/cachedInputTokens', 'Input Tokens Written to Cache'),
                    className: 'token-usage-column',
                    renderCell: item => (
                        <span title={nls.localize(
                            'theia/ai/tokenUsage/cachedInputTokensTooltip',
                            "Tracked additionally to 'Input Tokens'. Usually more expensive than non-cached tokens."
                        )}>
                            {item.cachedInputTokens !== undefined ? this.formatNumber(item.cachedInputTokens) : '-'}
                        </span>
                    )
                },
                {
                    id: 'read-cached-input-tokens',
                    label: nls.localize('theia/ai/tokenUsage/readCachedInputTokens', 'Input Tokens Read From Cache'),
                    className: 'token-usage-column',
                    renderCell: item => (
                        <span title={nls.localize(
                            'theia/ai/tokenUsage/readCachedInputTokensTooltip',
                            "Tracked additionally to 'Input Token'. Usually much less expensive than not cached. Usually does not count to rate limits."
                        )}>
                            {item.readCachedInputTokens !== undefined ? this.formatNumber(item.readCachedInputTokens) : '-'}
                        </span>
                    )
                }
            );
        }

        columns.push(
            {
                id: 'output-tokens',
                label: nls.localize('theia/ai/tokenUsage/outputTokens', 'Output Tokens'),
                className: 'token-usage-column',
                renderCell: item => <span>{this.formatNumber(item.outputTokens)}</span>
            },
            {
                id: 'total-tokens',
                label: nls.localize('theia/ai/tokenUsage/totalTokens', 'Total Tokens'),
                className: 'token-usage-column',
                renderCell: item => {
                    const totalTokens = item.inputTokens + item.outputTokens + (item.cachedInputTokens ?? 0);
                    return (
                        <span title={nls.localize('theia/ai/tokenUsage/totalTokensTooltip', "'Input Tokens' + 'Output Tokens'")}>
                            {this.formatNumber(totalTokens)}
                        </span>
                    );
                }
            },
            {
                id: 'last-used',
                label: nls.localize('theia/ai/tokenUsage/lastUsed', 'Last Used'),
                className: 'token-usage-column',
                renderCell: item => {
                    const lastUsedDate = item.lastUsed ? new Date(item.lastUsed) : undefined;
                    const exactDateString = lastUsedDate ? lastUsedDate.toLocaleString() : '';
                    return <span title={exactDateString}>{this.formatDate(lastUsedDate)}</span>;
                }
            }
        );

        return columns;
    }

    protected override renderHeader(): React.ReactNode {
        return undefined;
    }

    protected override renderFooter(): React.ReactNode {
        if (this.items.length === 0) {
            return (
                <div className="ai-empty-state-content">
                    <p>{nls.localize('theia/ai/tokenUsage/noData', 'No token usage data available yet.')}</p>
                </div>
            );
        }

        const showCacheColumns = this.hasCacheData();
        const totalInputTokens = this.items.reduce((sum, model) => sum + model.inputTokens, 0);
        const totalOutputTokens = this.items.reduce((sum, model) => sum + model.outputTokens, 0);
        const totalCachedInputTokens = this.items.reduce((sum, model) => sum + (model.cachedInputTokens || 0), 0);
        const totalReadCachedInputTokens = this.items.reduce((sum, model) => sum + (model.readCachedInputTokens || 0), 0);
        const totalTokens = totalInputTokens + totalCachedInputTokens + totalOutputTokens;

        return (
            <div className="ai-configuration-footer-total">
                <table className="ai-configuration-table">
                    <tfoot>
                        <tr className="ai-configuration-footer-total-row">
                            <td className="token-usage-model-column">{nls.localize('theia/ai/tokenUsage/total', 'Total')}</td>
                            <td className="token-usage-column">{this.formatNumber(totalInputTokens)}</td>
                            {showCacheColumns && (
                                <>
                                    <td className="token-usage-column">{this.formatNumber(totalCachedInputTokens)}</td>
                                    <td className="token-usage-column">{this.formatNumber(totalReadCachedInputTokens)}</td>
                                </>
                            )}
                            <td className="token-usage-column">{this.formatNumber(totalOutputTokens)}</td>
                            <td className="token-usage-column">{this.formatNumber(totalTokens)}</td>
                            <td className="token-usage-column"></td>
                        </tr>
                    </tfoot>
                </table>
                <div className="ai-configuration-info-box">
                    <p className="ai-configuration-info-text">
                        <i className="codicon codicon-info ai-configuration-info-icon"></i>
                        {nls.localize('theia/ai/tokenUsage/note', 'Token usage is tracked since the start of the application and is not persisted.')}
                    </p>
                </div>
            </div>
        );
    }
}
