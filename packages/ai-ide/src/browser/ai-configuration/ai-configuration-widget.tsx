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

import { nls } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { BaseWidget, BoxLayout, codicon, Message, NavigatableWidget, Panel, SplitPanel } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { AI_CONFIGURATION_RESOURCE_URI } from './ai-configuration-resource';
import { AiConfigurationCategoryId } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { AiConfigurationCategoryRegistry } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category-registry';
import { AiConfigurationSelectionModel } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-selection-model';
import { AIConfigurationSelectionService } from './ai-configuration-service';
import { AiConfigurationTreeWidget } from './ai-configuration-tree-widget';
import { AiConfigurationDetailWidget } from './ai-configuration-detail-widget';
import { AiConfigurationSearchWidget } from './ai-configuration-search-widget';

/**
 * Maps the legacy per-tab widget ids (still accepted by the `OPEN_AI_CONFIG_VIEW`
 * command and the chat toolbar button) onto the new category ids, so those entry
 * points keep working with the master–detail shell.
 */
const LEGACY_WIDGET_TO_CATEGORY_ID: Record<string, string> = {
    'ai-agent-configuration-container-widget': AiConfigurationCategoryId.AGENTS,
    'ai-variable-configuration-container-widget': AiConfigurationCategoryId.VARIABLES,
    'ai-mcp-configuration-container-widget': AiConfigurationCategoryId.MCP_SERVERS,
    'ai-token-usage-configuration-container-widget': AiConfigurationCategoryId.TOKEN_USAGE,
    // The former prompt fragments tab listed every fragment; its variant sets are now part of the agent
    // detail, so Prompt Snippets is the closest equivalent for a link that predates the rework.
    'ai-prompt-fragments-configuration': AiConfigurationCategoryId.PROMPT_SNIPPETS,
    'ai-tools-configuration-widget': AiConfigurationCategoryId.TOOLS,
    'ai-skills-configuration-widget': AiConfigurationCategoryId.PROMPTS_AND_SKILLS,
    'ai-model-aliases-configuration-widget': AiConfigurationCategoryId.MODEL_ALIASES
};

@injectable()
export class AIConfigurationContainerWidget extends BaseWidget implements NavigatableWidget {

    static readonly ID = 'ai-configuration';
    static readonly LABEL = nls.localize('theia/ai/core/aiConfiguration/label', 'AI Configuration');

    /** Constant resource URI so the shell renders Theia breadcrumbs for this view. */
    getResourceUri(): URI | undefined {
        return AI_CONFIGURATION_RESOURCE_URI;
    }

    createMoveToUri(): URI | undefined {
        return undefined;
    }

    @inject(AiConfigurationSearchWidget)
    protected readonly searchWidget: AiConfigurationSearchWidget;
    @inject(AiConfigurationTreeWidget)
    protected readonly treeWidget: AiConfigurationTreeWidget;
    @inject(AiConfigurationDetailWidget)
    protected readonly detailWidget: AiConfigurationDetailWidget;
    @inject(AiConfigurationCategoryRegistry)
    protected readonly registry: AiConfigurationCategoryRegistry;
    @inject(AiConfigurationSelectionModel)
    protected readonly selectionModel: AiConfigurationSelectionModel;
    @inject(AIConfigurationSelectionService)
    protected readonly aiConfigurationSelectionService: AIConfigurationSelectionService;

    protected bodyPanel: SplitPanel;

    @postConstruct()
    protected init(): void {
        this.id = AIConfigurationContainerWidget.ID;
        this.title.label = AIConfigurationContainerWidget.LABEL;
        this.title.caption = AIConfigurationContainerWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = codicon('settings-gear');
        this.addClass('ai-configuration-shell');
        this.initLayout();
        this.initListeners();
    }

    protected initLayout(): void {
        const layout = this.layout = new BoxLayout({ direction: 'top-to-bottom', spacing: 0 });

        // Tree column: search box above the category tree. A plain Panel (flow layout)
        // lets CSS flexbox stack the fixed-height search box over the scrollable tree.
        // A BoxLayout would size the search box from its `fit-content` height, which
        // Lumino measures as zero, collapsing the search box on top of the tree.
        const treeColumn = new Panel();
        treeColumn.addClass('ai-configuration-tree-column');
        treeColumn.addWidget(this.searchWidget);
        treeColumn.addWidget(this.treeWidget);

        this.bodyPanel = new SplitPanel({ orientation: 'horizontal', spacing: 1 });
        this.bodyPanel.addClass('ai-configuration-body');
        this.bodyPanel.addWidget(treeColumn);
        this.bodyPanel.addWidget(this.detailWidget);
        BoxLayout.setStretch(this.bodyPanel, 1);
        layout.addWidget(this.bodyPanel);
    }

    protected initListeners(): void {
        // Bridge the legacy selection service (driven by OPEN_AI_CONFIG_VIEW) onto the new selection model.
        this.toDispose.push(this.aiConfigurationSelectionService.onDidSelectConfiguration(widgetId => {
            const categoryId = LEGACY_WIDGET_TO_CATEGORY_ID[widgetId] ?? widgetId;
            this.selectionModel.select({ categoryId });
        }));
        // The search box drives the live tree filter.
        this.toDispose.push(this.searchWidget.onDidChangeFilter(text => this.treeWidget.setFilter(text)));
        // The expand/collapse-all buttons below the search box drive the tree.
        this.toDispose.push(this.searchWidget.onDidRequestExpandAll(() => this.treeWidget.expandAll()));
        this.toDispose.push(this.searchWidget.onDidRequestCollapseAll(() => this.treeWidget.collapseAll()));
        // Keep the single expand/collapse-all toggle in sync with the tree's actual expansion state.
        const syncToolbarToggle = () => {
            const state = this.treeWidget.getExpansionSummary();
            this.searchWidget.setTreeExpansion(state !== 'none', state === 'all-expanded');
        };
        this.toDispose.push(this.treeWidget.onDidChangeExpansion(syncToolbarToggle));
        syncToolbarToggle();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.bodyPanel.setRelativeSizes([1, 3]);
        this.selectInitialCategory();
    }

    protected selectInitialCategory(): void {
        if (!this.selectionModel.getSelection()) {
            const first = this.registry.getCategories()[0];
            if (first) {
                this.selectionModel.select({ categoryId: first.id });
            }
        }
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.treeWidget.activate();
    }

}
