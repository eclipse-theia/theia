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
import { nls, PreferenceService } from '@theia/core';
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

    /** Frames a pending search highlight waits for its target row to be mounted before it is dropped. */
    static readonly HIGHLIGHT_RETRY_FRAMES = 10;

    @inject(AiConfigurationCategoryRegistry)
    protected readonly registry: AiConfigurationCategoryRegistry;

    @inject(AiConfigurationSelectionModel)
    protected readonly selectionModel: AiConfigurationSelectionModel;

    @inject(AiConfigurationService)
    protected readonly aiConfigurationService: AiConfigurationService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    /** Scope every row on the page reads from and writes to; per-scope editing is not wired up yet. */
    protected scope: AiConfigurationScope = 'user';

    protected resetScroll = false;
    protected pendingHighlight?: AiConfigurationSelection['highlight'];
    /** Frames a pending highlight has already waited for its target row; see {@link applyScrollAndHighlight}. */
    protected pendingHighlightFrames = 0;

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
        // Also covers the workspace-trust transitions this service reports, which are not preference changes.
        this.toDispose.push(this.aiConfigurationService.onDidChange(() => this.update()));
        // Reflect preference changes made outside the current render pass — most notably the gear menu's
        // Reset command, which runs as a command and so never calls `ctx.update()`. Listening here rather
        // than only to `AiConfigurationService.onDidChange` (scoped to `ai-features.*`) keeps contributed
        // categories up to date too: their preferences carry no AI prefix, so a reset of one used to leave
        // the row's `modified` state stale until the page was re-rendered for some other reason.
        this.toDispose.push(this.preferenceService.onPreferenceChanged(() => this.update()));
        this.update();
    }

    protected onSelectionChanged(): void {
        this.resetScroll = true;
        this.pendingHighlight = this.selectionModel.getSelection()?.highlight;
        this.pendingHighlightFrames = 0;
        this.update();
    }

    protected createRenderContext(): AiConfigurationRenderContext {
        return {
            scope: this.scope,
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

    /**
     * Selects the category whose item just disappeared. Deferred to a microtask: this runs during render, and
     * selecting synchronously would re-enter the widget's update while React is still committing this one.
     */
    protected selectCategoryAfterItemLoss(category: AiConfigurationCategory): void {
        queueMicrotask(() => {
            const selection = this.selectionModel.getSelection();
            if (selection?.categoryId === category.id && selection.itemId) {
                this.selectionModel.select({ categoryId: category.id });
            }
        });
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
            const detail = renderer.renderItemDetail(selection.itemId, ctx);
            if (detail) {
                return detail;
            }
            // The item is gone (deleted while its page was open, e.g. an MCP server) and the renderer has
            // nothing to show, which would leave a blank pane. Fall back to the category, and move the
            // selection there so the tree and breadcrumbs agree with what is displayed.
            this.selectCategoryAfterItemLoss(category);
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
            if (!highlight) {
                return;
            }
            const element = body.querySelector<HTMLElement>(`[data-ai-config-row-id="${highlight.rowId}"]`);
            if (element) {
                this.pendingHighlight = undefined;
                this.centerInBody(body, element);
                element.classList.add('ai-configuration-row-flash');
                window.setTimeout(() => element.classList.remove('ai-configuration-row-flash'), 1200);
            } else if (this.pendingHighlightFrames < AiConfigurationDetailWidget.HIGHLIGHT_RETRY_FRAMES) {
                // Cross-category navigation renders the new page and the highlight target in the same pass,
                // but categories that resolve their rows asynchronously (agents, providers) are still empty on
                // this frame. Keep the highlight pending and look again rather than dropping it, which made
                // scroll-and-flash fire only when the row happened to be mounted already.
                this.pendingHighlightFrames++;
                this.applyScrollAndHighlight();
            } else {
                this.pendingHighlight = undefined;
            }
        });
    }

    /**
     * Vertically centers `element` within `body` by scrolling that container and nothing else.
     *
     * Deliberately not `Element.scrollIntoView`: that scrolls *every* scrollable ancestor to satisfy the
     * requested alignment, and `overflow: hidden` does not prevent programmatic scrolling. When a row cannot
     * be centered inside the body alone, it therefore nudges the `overflow: hidden` containers above this
     * widget, which have no scrollbar for the user to scroll back — shifting the whole shell, pushing the menu
     * bar out of view and leaving a gap below the status bar.
     */
    protected centerInBody(body: HTMLElement, element: HTMLElement): void {
        const bodyRect = body.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const current = elementRect.top - bodyRect.top;
        const centered = (body.clientHeight - elementRect.height) / 2;
        // Assigning `scrollTop` clamps to the scrollable range, so short pages simply do not scroll.
        body.scrollTop += current - centered;
    }
}
