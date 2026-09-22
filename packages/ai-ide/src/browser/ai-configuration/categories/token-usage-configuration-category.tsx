// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { ModelTokenUsageData, TokenUsageFrontendService } from '@theia/ai-core/lib/browser/token-usage-frontend-service';
import { Emitter, Event, MessageService, nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { DisposableCollection } from '@theia/core/lib/common';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { formatDistanceToNow } from 'date-fns';
import {
    AiConfigurationCategory,
    AiConfigurationCategoryId,
    AiConfigurationCategoryOrder,
    AiConfigurationSearchItem,
    AiConfigurationSearchProvider
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { SinglePageCategoryRenderer } from '@theia/ai-core-ui/lib/browser/ai-configuration/renderers/single-page-category-renderer';

/**
 * The Token Usage category: a read-only `single-page` category showing per-model token usage
 * (input / cache write / cache read / output / total / last-used) with totals. Data is cached and
 * refreshed on the token-usage service updates.
 */
@injectable()
export class TokenUsageConfigurationCategory extends SinglePageCategoryRenderer implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = AiConfigurationCategoryId.TOKEN_USAGE;
    readonly label = nls.localize('theia/ai/tokenUsage/label', 'Token Usage');
    readonly description = nls.localize('theia/ai/tokenUsage/description',
        'Review token consumption across providers and models.');
    readonly iconClass = codicon('graph');
    readonly order = AiConfigurationCategoryOrder.TOKEN_USAGE;
    readonly kind = 'single-page' as const;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(TokenUsageFrontendService)
    protected readonly tokenUsageService: TokenUsageFrontendService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    protected items: ModelTokenUsageData[] = [];

    get renderer(): this {
        return this;
    }

    get search(): AiConfigurationSearchProvider {
        return this;
    }

    @postConstruct()
    protected init(): void {
        this.load();
        this.toDispose.push(this.tokenUsageService.onTokenUsageUpdated(data => {
            this.items = [...data].sort((a, b) => a.modelId.localeCompare(b.modelId));
            this.onDidChangeEmitter.fire();
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected async load(): Promise<void> {
        try {
            this.items = (await this.tokenUsageService.getTokenUsageData()).sort((a, b) => a.modelId.localeCompare(b.modelId));
            this.onDidChangeEmitter.fire();
        } catch (error) {
            this.messageService.error(nls.localize('theia/ai/tokenUsage/failedToGetTokenUsageData', 'Failed to fetch token usage data: {0}', String(error)));
        }
    }

    protected formatNumber(value: number): string {
        return value.toLocaleString();
    }

    protected formatDate(date?: Date): string {
        return date ? formatDistanceToNow(date, { addSuffix: true }) : nls.localizeByDefault('Never');
    }

    protected hasCacheData(): boolean {
        return this.items.some(model => model.cachedInputTokens !== undefined || model.readCachedInputTokens !== undefined);
    }

    protected renderSections(): React.ReactNode {
        if (this.items.length === 0) {
            return <div className='ai-empty-state-content'>
                <p>{nls.localize('theia/ai/tokenUsage/noData', 'No token usage data available yet.')}</p>
            </div>;
        }
        const showCache = this.hasCacheData();
        return <div className='ai-configuration-page'>
            <table className='ai-configuration-table'>
                <thead>
                    <tr>
                        <th className='token-usage-model-column'>{nls.localizeByDefault('Model')}</th>
                        <th className='token-usage-column'>{nls.localize('theia/ai/tokenUsage/inputTokens', 'Input Tokens')}</th>
                        {showCache && <>
                            <th className='token-usage-column'>{nls.localize('theia/ai/tokenUsage/cachedInputTokens', 'Input Tokens Written to Cache')}</th>
                            <th className='token-usage-column'>{nls.localize('theia/ai/tokenUsage/readCachedInputTokens', 'Input Tokens Read From Cache')}</th>
                        </>}
                        <th className='token-usage-column'>{nls.localize('theia/ai/tokenUsage/outputTokens', 'Output Tokens')}</th>
                        <th className='token-usage-column'>{nls.localizeByDefault('Total Tokens')}</th>
                        <th className='token-usage-column'>{nls.localize('theia/ai/tokenUsage/lastUsed', 'Last Used')}</th>
                    </tr>
                </thead>
                <tbody>
                    {this.items.map(item => this.renderRow(item, showCache))}
                </tbody>
                {this.renderTotals(showCache)}
            </table>
            <div className='ai-configuration-info-box'>
                <p className='ai-configuration-info-text'>
                    <i className={`${codicon('info')} ai-configuration-info-icon`}></i>
                    {nls.localize('theia/ai/tokenUsage/note', 'Token usage is tracked since the start of the application and is not persisted.')}
                </p>
            </div>
        </div>;
    }

    protected renderRow(item: ModelTokenUsageData, showCache: boolean): React.ReactNode {
        const total = item.inputTokens + item.outputTokens + (item.cachedInputTokens ?? 0);
        const lastUsedDate = item.lastUsed ? new Date(item.lastUsed) : undefined;
        return <tr key={item.modelId}>
            <td className='token-usage-model-column'>{item.modelId}</td>
            <td className='token-usage-column'>{this.formatNumber(item.inputTokens)}</td>
            {showCache && <>
                <td className='token-usage-column'>{item.cachedInputTokens !== undefined ? this.formatNumber(item.cachedInputTokens) : '-'}</td>
                <td className='token-usage-column'>{item.readCachedInputTokens !== undefined ? this.formatNumber(item.readCachedInputTokens) : '-'}</td>
            </>}
            <td className='token-usage-column'>{this.formatNumber(item.outputTokens)}</td>
            <td className='token-usage-column'>{this.formatNumber(total)}</td>
            <td className='token-usage-column' title={lastUsedDate ? lastUsedDate.toLocaleString() : undefined}>{this.formatDate(lastUsedDate)}</td>
        </tr>;
    }

    protected renderTotals(showCache: boolean): React.ReactNode {
        const sum = (pick: (model: ModelTokenUsageData) => number): number => this.items.reduce((total, model) => total + pick(model), 0);
        const totalInput = sum(model => model.inputTokens);
        const totalOutput = sum(model => model.outputTokens);
        const totalCached = sum(model => model.cachedInputTokens ?? 0);
        const totalRead = sum(model => model.readCachedInputTokens ?? 0);
        return <tfoot>
            <tr className='ai-configuration-footer-total-row'>
                <td className='token-usage-model-column'>{nls.localizeByDefault('Total')}</td>
                <td className='token-usage-column'>{this.formatNumber(totalInput)}</td>
                {showCache && <>
                    <td className='token-usage-column'>{this.formatNumber(totalCached)}</td>
                    <td className='token-usage-column'>{this.formatNumber(totalRead)}</td>
                </>}
                <td className='token-usage-column'>{this.formatNumber(totalOutput)}</td>
                <td className='token-usage-column'>{this.formatNumber(totalInput + totalCached + totalOutput)}</td>
                <td className='token-usage-column'></td>
            </tr>
        </tfoot>;
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        return [{
            label: this.label,
            typeLabel: nls.localize('theia/ai/ide/aiConfiguration/pageTypeLabel', 'Page'),
            categoryId: this.id,
            target: { categoryId: this.id },
            keywords: 'token usage tokens cost'
        }];
    }
}
