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

import { nls } from '@theia/core';
import * as React from '@theia/core/shared/react';
import {
    AiConfigurationAddDescriptor,
    AiConfigurationCategoryRenderer,
    AiConfigurationRenderContext,
    AiConfigurationTreeItem
} from '../ai-configuration-category';

// The descriptor moved to the contribution point (the tree renders the action too); re-exported so the
// categories that build one keep importing it from the base class they extend.
export { AiConfigurationAddDescriptor };
import {
    AiConfigurationAddAction,
    AiConfigurationEmptyState,
    AiConfigurationItemDetailHeader,
    AiConfigurationSection
} from '../components/ai-configuration-primitives';
import { AiConfigurationItemRow } from '../components/ai-configuration-item-row';

/** Describes the overview's "Add …" affordance. */
/**
 * Convenience base for `collection` categories. Renders the overview (category
 * settings slot + item card grid + add action + empty state) and the per-item
 * detail frame (header + sections). Subclasses provide the items, the item
 * sections, and optionally category-level settings and an add action.
 */
export abstract class CollectionCategoryRenderer implements AiConfigurationCategoryRenderer {

    /** The owning category id, used to build navigation targets for the cards. */
    protected abstract get categoryId(): string;

    /** Ids already reported as duplicated, so the warning is logged once rather than on every render. */
    protected readonly reportedDuplicateIds = new Set<string>();

    abstract getTreeChildren(): AiConfigurationTreeItem[];

    renderOverview(ctx: AiConfigurationRenderContext): React.ReactNode {
        const items = this.addressableItems(this.getTreeChildren());
        const add = this.getAddAction(ctx);
        const addAction = add && <AiConfigurationAddAction label={add.label} iconClass={add.iconClass} onClick={() => add.run()} />;
        const body = items.length === 0
            ? <AiConfigurationEmptyState message={this.getEmptyMessage()} action={addAction} />
            : <>
                <div className='ai-configuration-item-list'>
                    {items.map(item => <AiConfigurationItemRow
                        key={item.id}
                        label={item.label}
                        iconClass={item.iconClass}
                        description={item.description}
                        tags={item.tags}
                        origins={item.origins}
                        status={item.status}
                        onSelect={() => ctx.navigate({ categoryId: this.categoryId, itemId: item.id })}
                    />)}
                </div>
                {addAction && <div className='ai-configuration-overview-actions'>{addAction}</div>}
            </>;
        const listTitle = this.overviewListTitle;
        return <div className='ai-configuration-page'>
            {this.renderCategorySettings(ctx)}
            {listTitle !== undefined
                // Foldable with its size on the header once there is a list to fold; an empty state stays plain.
                ? <AiConfigurationSection
                    title={listTitle}
                    count={items.length > 0 ? items.length : undefined}
                    collapsible={items.length > 0}
                >{body}</AiConfigurationSection>
                : body}
        </div>;
    }

    /**
     * The items this page can actually address, i.e. one per id. Everything downstream keys on the id — the
     * tree node, the navigation target, the detail lookup and the per-item settings — so an item repeating an
     * id could neither be opened nor configured on its own; it is dropped here and logged once. Representing
     * such a clash properly is a separate concern from this view (it starts where the items are registered).
     */
    protected addressableItems(items: AiConfigurationTreeItem[]): AiConfigurationTreeItem[] {
        const byId = new Map<string, AiConfigurationTreeItem>();
        for (const item of items) {
            if (byId.has(item.id)) {
                this.warnAboutDuplicateId(item.id);
                continue;
            }
            byId.set(item.id, item);
        }
        return [...byId.values()];
    }

    /**
     * Warns once per id, since the overview re-renders and would otherwise repeat itself indefinitely.
     * `console` rather than an `ILogger`: this base class is not injectable, so it has no injection context
     * of its own; subclasses that want their named logger can override this.
     */
    protected warnAboutDuplicateId(id: string): void {
        if (this.reportedDuplicateIds.has(id)) {
            return;
        }
        this.reportedDuplicateIds.add(id);
        console.warn(`More than one entry of the AI configuration category "${this.categoryId}" declares the id "${id}". `
            + 'Only the first is shown, since everything (navigation, settings) is keyed by that id. Give each entry a unique id.');
    }

    /** Optional heading shown above the item list (e.g. "Agents"), like the Providers page. None by default. */
    protected get overviewListTitle(): string | undefined {
        return undefined;
    }

    renderItemDetail(itemId: string, ctx: AiConfigurationRenderContext): React.ReactNode {
        const item = this.getTreeChildren().find(child => child.id === itemId);
        if (!item) {
            return undefined;
        }
        return <div className='ai-configuration-page'>
            {this.renderItemHeader(item, ctx)}
            {this.renderItemSections(item, ctx)}
        </div>;
    }

    /** Category-level settings shown above the card grid; nothing by default. */
    protected renderCategorySettings(ctx: AiConfigurationRenderContext): React.ReactNode {
        return undefined;
    }

    /** Header of an item detail page; icon/title/subtitle/origins from the item by default. */
    protected renderItemHeader(item: AiConfigurationTreeItem, ctx: AiConfigurationRenderContext): React.ReactNode {
        return <AiConfigurationItemDetailHeader
            title={item.label}
            iconClass={item.iconClass}
            subtitle={item.description}
            status={item.status}
            origins={item.origins}
        />;
    }

    /** Body of an item detail page: typically {@link AiConfigurationSection}s of rows. */
    protected abstract renderItemSections(item: AiConfigurationTreeItem, ctx: AiConfigurationRenderContext): React.ReactNode;

    /** The overview "Add …" affordance; none by default. */
    getAddAction(ctx: AiConfigurationRenderContext): AiConfigurationAddDescriptor | undefined {
        return undefined;
    }

    protected getEmptyMessage(): string {
        return nls.localize('theia/ai/core/aiConfiguration/collectionEmpty', 'No items to configure yet.');
    }
}
