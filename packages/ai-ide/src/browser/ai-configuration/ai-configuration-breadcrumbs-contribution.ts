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

import { Disposable, Emitter, Event, nls } from '@theia/core';
import { ApplicationShell, codicon } from '@theia/core/lib/browser';
import { Breadcrumb, BreadcrumbsContribution } from '@theia/core/lib/browser/breadcrumbs/breadcrumbs-constants';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { AiConfigurationSelection } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { AiConfigurationCategoryRegistry } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category-registry';
import { AiConfigurationSelectionModel } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-selection-model';
import { AIConfigurationContainerWidget } from './ai-configuration-widget';
import { AI_CONFIGURATION_RESOURCE_SCHEME, AI_CONFIGURATION_RESOURCE_URI } from './ai-configuration-resource';

export const AI_CONFIGURATION_BREADCRUMB_TYPE = Symbol('ai-configuration-breadcrumb');

interface PopupEntry {
    readonly label: string;
    readonly iconClass?: string;
    readonly selection: AiConfigurationSelection;
    readonly selected: boolean;
}

/**
 * Contributes real Theia breadcrumbs for the AI Configuration view. The view's resource URI is
 * constant; the breadcrumb path (category › item) is derived from the shared
 * {@link AiConfigurationSelectionModel}, and clicking a segment opens a popup to jump to sibling
 * categories/items — matching the editor breadcrumb UX and honoring the `breadcrumbs.enabled` setting.
 */
@injectable()
export class AiConfigurationBreadcrumbsContribution implements BreadcrumbsContribution {

    readonly type = AI_CONFIGURATION_BREADCRUMB_TYPE;
    readonly priority = 100;

    @inject(AiConfigurationSelectionModel)
    protected readonly selectionModel: AiConfigurationSelectionModel;

    @inject(AiConfigurationCategoryRegistry)
    protected readonly registry: AiConfigurationCategoryRegistry;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    protected readonly onDidChangeBreadcrumbsEmitter = new Emitter<URI>();
    get onDidChangeBreadcrumbs(): Event<URI> {
        return this.onDidChangeBreadcrumbsEmitter.event;
    }

    @postConstruct()
    protected init(): void {
        // Recompute the breadcrumbs whenever the in-view selection changes (URI stays constant).
        this.selectionModel.onDidChangeSelection(() => this.onDidChangeBreadcrumbsEmitter.fire(AI_CONFIGURATION_RESOURCE_URI));
    }

    computeBreadcrumbs(uri: URI): Breadcrumb[] {
        if (uri.scheme !== AI_CONFIGURATION_RESOURCE_SCHEME) {
            return [];
        }
        const selection = this.selectionModel.getSelection();
        const category = selection ? this.registry.getCategory(selection.categoryId) : undefined;
        const crumbs: Breadcrumb[] = [];
        if (category) {
            crumbs.push({
                id: `category:${category.id}`,
                type: this.type,
                label: category.label,
                longLabel: category.label,
                iconClass: category.iconClass
            });
            if (selection?.itemId) {
                const item = category.renderer.getTreeChildren?.().find(child => child.id === selection.itemId);
                const label = item?.label ?? selection.itemId;
                crumbs.push({
                    id: `item:${category.id}:${selection.itemId}`,
                    type: this.type,
                    label,
                    longLabel: label,
                    iconClass: item?.iconClass ?? category.iconClass
                });
            }
        }
        if (crumbs.length === 0) {
            crumbs.push({
                id: 'ai-configuration:root',
                type: this.type,
                label: nls.localize('theia/ai/ide/aiConfiguration/breadcrumbRoot', 'AI Configuration'),
                longLabel: nls.localize('theia/ai/ide/aiConfiguration/breadcrumbRoot', 'AI Configuration'),
                iconClass: codicon('settings-gear')
            });
        }
        return crumbs;
    }

    async attachPopupContent(breadcrumb: Breadcrumb, parent: HTMLElement): Promise<Disposable | undefined> {
        if (breadcrumb.type !== this.type) {
            return undefined;
        }
        const entries = this.popupEntries(breadcrumb.id);
        if (entries.length === 0) {
            return undefined;
        }
        const list = document.createElement('ul');
        list.className = 'theia-ai-configuration-breadcrumb-popup';
        for (const entry of entries) {
            const item = document.createElement('li');
            item.className = 'theia-ai-configuration-breadcrumb-popup-item' + (entry.selected ? ' selected' : '');
            if (entry.iconClass) {
                const icon = document.createElement('span');
                icon.className = `theia-ai-configuration-breadcrumb-popup-icon ${entry.iconClass}`;
                item.appendChild(icon);
            }
            const label = document.createElement('span');
            label.textContent = entry.label;
            item.appendChild(label);
            item.onclick = () => {
                this.selectionModel.select(entry.selection);
                // Move focus back to the view so the popup blurs and closes.
                this.shell.activateWidget(AIConfigurationContainerWidget.ID);
            };
            list.appendChild(item);
        }
        parent.appendChild(list);
        return undefined;
    }

    /** Sibling categories for a category breadcrumb, or sibling items for an item breadcrumb. */
    protected popupEntries(breadcrumbId: string): PopupEntry[] {
        const selection = this.selectionModel.getSelection();
        if (breadcrumbId.startsWith('category:')) {
            return this.registry.getCategories().map(category => ({
                label: category.label,
                iconClass: category.iconClass,
                selection: { categoryId: category.id },
                selected: category.id === selection?.categoryId
            }));
        }
        if (breadcrumbId.startsWith('item:')) {
            const categoryId = breadcrumbId.split(':')[1];
            const category = this.registry.getCategory(categoryId);
            const items = category?.renderer.getTreeChildren?.() ?? [];
            return items.map(item => ({
                label: item.label,
                iconClass: item.iconClass ?? category?.iconClass,
                selection: { categoryId, itemId: item.id },
                selected: item.id === selection?.itemId
            }));
        }
        return [];
    }
}
