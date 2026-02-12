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
import * as React from '@theia/core/shared/react';
import { injectable } from '@theia/core/shared/inversify';
import { nls } from '@theia/core/lib/common/nls';
import { AIConfigurationBaseWidget } from './ai-configuration-base-widget';

/**
 * Base class for AI configuration widgets that follow the list-detail pattern:
 * - Left panel: Tree list of items
 * - Right panel: Detail view of selected item
 *
 * This pattern is used by agents, variables, and model aliases widgets.
 */
@injectable()
export abstract class AIListDetailConfigurationWidget<T> extends AIConfigurationBaseWidget {
    protected selectedItem: T | undefined;
    protected items: T[] = [];

    /**
     * Get unique identifier for an item. Used for selection tracking.
     */
    protected abstract getItemId(item: T): string;

    /**
     * Get display label for an item in the list.
     */
    protected abstract getItemLabel(item: T): string;

    /**
     * Render the detail panel for the selected item.
     */
    protected abstract renderItemDetail(item: T): React.ReactNode;

    /**
     * Load items to display in the list. Called during initialization.
     */
    protected abstract loadItems(): Promise<void>;

    /**
     * Get the message to display when no item is selected.
     */
    protected getEmptySelectionMessage(): string {
        return nls.localize('theia/ai/configuration/selectItem', 'Please select an item.');
    }

    /**
     * Optional: Additional CSS classes for list items.
     */
    protected getItemClassName(item: T): string {
        return '';
    }

    /**
     * Optional: Render additional content before the item label.
     */
    protected renderItemPrefix(item: T): React.ReactNode {
        return undefined;
    }

    /**
     * Optional: Render additional content after the item label.
     */
    protected renderItemSuffix(item: T): React.ReactNode {
        return undefined;
    }

    protected handleItemSelect = (item: T): void => {
        this.selectedItem = item;
        this.update();
    };

    /**
     * Public method to programmatically select an item.
     * Useful for navigation from other widgets.
     */
    public selectItem(item: T): void {
        this.handleItemSelect(item);
    }

    protected renderContent(): React.ReactNode {
        return (
            <div className="ai-list-detail-configuration-main">
                {this.renderList()}
                {this.renderDetail()}
            </div>
        );
    }

    protected renderList(): React.ReactNode {
        return (
            <div className="ai-configuration-list preferences-tree-widget theia-TreeContainer">
                <ul>
                    {this.items.map(item => {
                        const itemId = this.getItemId(item);
                        const isSelected = this.selectedItem && this.getItemId(this.selectedItem) === itemId;
                        return (
                            <li
                                key={itemId}
                                className={`theia-TreeNode theia-CompositeTreeNode${isSelected ? ' theia-mod-selected' : ''} ${this.getItemClassName(item)}`}
                                onClick={() => this.handleItemSelect(item)}
                            >
                                {this.renderItemPrefix(item)}
                                <span className="ai-configuration-list-item-label">{this.getItemLabel(item)}</span>
                                {this.renderItemSuffix(item)}
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    }

    protected renderDetail(): React.ReactNode {
        return (
            <div className="ai-configuration-detail preferences-editor-widget">
                {this.selectedItem ? (
                    this.renderItemDetail(this.selectedItem)
                ) : (
                    <div className="ai-configuration-empty-state">
                        <span className="ai-empty-state-message">{this.getEmptySelectionMessage()}</span>
                    </div>
                )}
            </div>
        );
    }
}
