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

import * as React from '@theia/core/shared/react';
import { nls } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { codicon, Message, ReactWidget } from '@theia/core/lib/browser';
import { AiConfigurationService } from '@theia/ai-core';
import { AiConfigurationCategoryRegistry } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category-registry';
import { AiConfigurationSelectionModel } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-selection-model';
import { AiConfigurationItemDetailHeader } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-primitives';
import {
    AiConfigurationCategory, AiConfigurationRenderContext, AiConfigurationScope, AiConfigurationSelection
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';

@injectable()
export class AiConfigurationDetailWidget extends ReactWidget {

    static readonly ID = 'ai-configuration-detail';

    @inject(AiConfigurationCategoryRegistry)
    protected readonly registry: AiConfigurationCategoryRegistry;

    @inject(AiConfigurationSelectionModel)
    protected readonly selectionModel: AiConfigurationSelectionModel;

    @inject(AiConfigurationService)
    protected readonly aiConfigurationService: AiConfigurationService;

    /** Render-only in this iteration; per-scope read/write is wired later (T3). */
    protected scope: AiConfigurationScope = 'user';
    /** Per-view filter text; slot only in this iteration (T5). */
    protected filter = '';

    protected resetScroll = false;
    protected pendingHighlight?: AiConfigurationSelection['highlight'];

    @postConstruct()
    protected init(): void {
        this.id = AiConfigurationDetailWidget.ID;
        this.addClass('ai-configuration-detail-widget');
        // The page scrolls in its own inner `.ai-configuration-detail-body` (driven by
        // `applyScrollAndHighlight`). Clear the default `ReactWidget` scroll options so that
        // `BaseWidget` does not attach a PerfectScrollbar to the outer node, whose forced
        // `overflow: hidden` and wheel handling would otherwise swallow the inner body's scroll.
        this.scrollOptions = undefined;
        this.toDispose.push(this.selectionModel.onDidChangeSelection(() => this.onSelectionChanged()));
        this.toDispose.push(this.registry.onDidChange(() => this.update()));
        // Reflect AI preference changes made outside the current render pass — most notably the gear menu's
        // Reset command, which is the Settings UI's own command and does not call `ctx.update()`.
        this.toDispose.push(this.aiConfigurationService.onDidChange(() => this.update()));
        this.update();
    }

    protected onSelectionChanged(): void {
        this.resetScroll = true;
        this.pendingHighlight = this.selectionModel.getSelection()?.highlight;
        this.update();
    }

    protected createRenderContext(): AiConfigurationRenderContext {
        return {
            scope: this.scope,
            filter: this.filter,
            navigate: selection => this.selectionModel.select(selection),
            update: () => this.update()
        };
    }

    protected render(): React.ReactNode {
        const selection = this.selectionModel.getSelection();
        const category = selection && this.registry.getCategory(selection.categoryId);
        if (!selection || !category) {
            return this.renderPlaceholder();
        }
        const ctx = this.createRenderContext();
        // The category/item path is shown as real Theia breadcrumbs in the shell tab bar
        // (see AiConfigurationBreadcrumbsContribution), so no in-pane breadcrumb is rendered here.
        return <div className='ai-configuration-detail-container'>
            {this.scope !== 'user' && this.renderScopeBanner()}
            <div className='ai-configuration-detail-body'>
                {this.renderBody(category, selection, ctx)}
            </div>
        </div>;
    }

    protected renderScopeBanner(): React.ReactNode {
        return <div className='ai-configuration-detail-scope-banner'>
            <span className={codicon('info')}></span>
            <span>{nls.localize('theia/ai/core/aiConfiguration/scopeBanner', 'Editing the {0} scope.', this.scope)}</span>
        </div>;
    }

    protected renderBody(category: AiConfigurationCategory, selection: AiConfigurationSelection, ctx: AiConfigurationRenderContext): React.ReactNode {
        const renderer = category.renderer;
        // Item detail pages render their own header (id/status/actions), so they are returned as-is.
        if (selection.itemId && renderer.renderItemDetail) {
            return renderer.renderItemDetail(selection.itemId, ctx);
        }
        // Category-level pages/overviews get a shared header showing the category name, so the page is
        // titled in-pane (not only in the breadcrumb tab bar).
        let content: React.ReactNode;
        if (category.kind === 'collection' && renderer.renderOverview) {
            content = renderer.renderOverview(ctx);
        } else if (renderer.renderPage) {
            content = renderer.renderPage(ctx);
        } else {
            content = this.renderComingSoon(category);
        }
        return <>
            {this.renderCategoryHeader(category)}
            {content}
        </>;
    }

    /** Shared in-pane header for a category-level page: the category icon, name and optional description. */
    protected renderCategoryHeader(category: AiConfigurationCategory): React.ReactNode {
        return <div className='ai-configuration-category-header'>
            <AiConfigurationItemDetailHeader title={category.label} iconClass={category.iconClass} subtitle={category.description} />
        </div>;
    }

    protected renderComingSoon(category: AiConfigurationCategory): React.ReactNode {
        return <div className='ai-configuration-detail-placeholder'>
            {nls.localize('theia/ai/core/aiConfiguration/categoryComingSoon', '{0} configuration is not available yet.', category.label)}
        </div>;
    }

    protected renderPlaceholder(): React.ReactNode {
        return <div className='ai-configuration-detail-placeholder'>
            {nls.localize('theia/ai/core/aiConfiguration/selectCategory', 'Select a category to configure.')}
        </div>;
    }

    protected override onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        this.applyScrollAndHighlight();
    }

    protected applyScrollAndHighlight(): void {
        if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
            return;
        }
        window.requestAnimationFrame(() => {
            const body = this.node.querySelector<HTMLElement>('.ai-configuration-detail-body');
            if (!body) {
                return;
            }
            if (this.resetScroll && !this.pendingHighlight) {
                body.scrollTop = 0;
            }
            this.resetScroll = false;
            const highlight = this.pendingHighlight;
            if (highlight) {
                this.pendingHighlight = undefined;
                const rowSelector = `[data-ai-config-row-id="${highlight.rowId}"]`;
                const selector = highlight.subId ? `${rowSelector} [data-ai-config-sub-id="${highlight.subId}"]` : rowSelector;
                const element = body.querySelector<HTMLElement>(selector);
                if (element) {
                    element.scrollIntoView({ block: 'center' });
                    element.classList.add('ai-configuration-row-flash');
                    window.setTimeout(() => element.classList.remove('ai-configuration-row-flash'), 1200);
                }
            }
        });
    }
}
