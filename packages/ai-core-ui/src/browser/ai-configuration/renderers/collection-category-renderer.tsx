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
import { AiConfigurationCategoryRenderer, AiConfigurationRenderContext, AiConfigurationTreeItem } from '../ai-configuration-category';
import {
    AiConfigurationAddAction,
    AiConfigurationEmptyState,
    AiConfigurationItemDetailHeader,
    AiConfigurationSection
} from '../components/ai-configuration-primitives';
import { AiConfigurationItemRow } from '../components/ai-configuration-item-row';

/** Describes the overview's "Add …" affordance. */
export interface AiConfigurationAddDescriptor {
    readonly label: string;
    readonly iconClass?: string;
    run(): void;
}

/**
 * Convenience base for `collection` categories. Renders the overview (category
 * settings slot + item card grid + add action + empty state) and the per-item
 * detail frame (header + sections). Subclasses provide the items, the item
 * sections, and optionally category-level settings and an add action.
 */
export abstract class CollectionCategoryRenderer implements AiConfigurationCategoryRenderer {

    /** The owning category id, used to build navigation targets for the cards. */
    protected abstract get categoryId(): string;

    abstract getTreeChildren(): AiConfigurationTreeItem[];

    renderOverview(ctx: AiConfigurationRenderContext): React.ReactNode {
        const items = this.getTreeChildren();
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
                        status={item.status}
                        onSelect={() => ctx.navigate({ categoryId: this.categoryId, itemId: item.id })}
                    />)}
                </div>
                {addAction && <div className='ai-configuration-overview-actions'>{addAction}</div>}
            </>;
        const listTitle = this.overviewListTitle;
        return <div className='ai-configuration-page'>
            {this.renderCategorySettings(ctx)}
            {listTitle !== undefined ? <AiConfigurationSection title={listTitle}>{body}</AiConfigurationSection> : body}
        </div>;
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

    /** Header of an item detail page; icon/title/subtitle from the item by default. */
    protected renderItemHeader(item: AiConfigurationTreeItem, ctx: AiConfigurationRenderContext): React.ReactNode {
        return <AiConfigurationItemDetailHeader title={item.label} iconClass={item.iconClass} subtitle={item.description} status={item.status} />;
    }

    /** Body of an item detail page: typically {@link AiConfigurationSection}s of rows. */
    protected abstract renderItemSections(item: AiConfigurationTreeItem, ctx: AiConfigurationRenderContext): React.ReactNode;

    /** The overview "Add …" affordance; none by default. */
    protected getAddAction(ctx: AiConfigurationRenderContext): AiConfigurationAddDescriptor | undefined {
        return undefined;
    }

    protected getEmptyMessage(): string {
        return nls.localize('theia/ai/core/aiConfiguration/collectionEmpty', 'No items to configure yet.');
    }
}
