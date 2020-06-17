/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject } from 'inversify';
import {
    QuickOpenModel, QuickOpenHandler, QuickOpenOptions, QuickOpenItem,
    QuickOpenMode, QuickOpenContribution, QuickOpenHandlerRegistry, QuickOpenGroupItem
} from './quick-open';
import { Disposable } from '../common/disposable';
import { ContextKeyService } from './context-key-service';
import * as fuzzy from 'fuzzy';

export interface QuickViewItem {
    readonly label: string;
    readonly when?: string;
    readonly type?: 'view container' | 'view';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly open: () => any;
}

export type QuickViewItemType = (QuickOpenItem & { when?: string, type?: 'view container' | 'view' });

@injectable()
export class QuickViewService implements QuickOpenModel, QuickOpenHandler, QuickOpenContribution {

    readonly prefix: string = 'view ';

    readonly description: string = 'Open View';

    /**
     * The collection of registered items.
     */
    protected readonly registeredItems: QuickViewItemType[] = [];
    /**
     * The collection of items for display purposes.
     */
    protected items: QuickViewItemType[] = [];

    @inject(ContextKeyService)
    protected readonly contextKexService: ContextKeyService;

    registerItem(item: QuickViewItem): Disposable {
        const quickOpenItem = this.toItem(item);
        this.registeredItems.push(quickOpenItem);
        this.updateItems();
        return Disposable.create(() => {
            const index = this.registeredItems.indexOf(quickOpenItem);
            if (index !== -1) {
                this.registeredItems.splice(index, 1);
            }
        });
    }

    getModel(): QuickOpenModel {
        return this;
    }

    getOptions(): QuickOpenOptions {
        return {
            skipPrefix: this.prefix.length,
            fuzzyMatchLabel: true
        };
    }

    onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
        this.updateItems(lookFor);
        const items = this.items.filter(item =>
            item.when === undefined || this.contextKexService.match(item.when)
        );
        acceptor(items);
    }

    registerQuickOpenHandlers(handlers: QuickOpenHandlerRegistry): void {
        handlers.registerHandler(this);
    }

    /**
     * Updated the display list of items grouped by their type.
     * @param lookFor the search term if available.
     */
    protected updateItems(lookFor?: string): void {
        const viewContainerItems = this.getViewContainerItems(lookFor);
        const viewItems = this.getViewItems(lookFor);
        const otherItems = this.getOtherItems(lookFor);

        const updatedItems: QuickViewItemType[] = [];

        updatedItems.push(
            ...viewContainerItems.map((a: QuickViewItemType, index: number) => {
                const groupItem: QuickOpenGroupItem = new QuickOpenGroupItem({
                    label: a.getLabel(),
                    run: mode => a.run(mode),
                    groupLabel: index === 0 ? a.type : ''
                });
                return Object.assign(groupItem, { when: a.when, type: a.type });
            }),
            ...viewItems.map((a: QuickViewItemType, index: number) => {
                const groupItem: QuickOpenGroupItem = new QuickOpenGroupItem({
                    label: a.getLabel(),
                    run: mode => a.run(mode),
                    groupLabel: index === 0 ? a.type : '',
                    showBorder: viewContainerItems.length <= 0
                        ? false
                        : index === 0 ? true : false
                });
                return Object.assign(groupItem, { when: a.when, type: a.type });
            }),
            ...otherItems.map((a: QuickViewItemType, index: number) => {
                const groupItem: QuickOpenGroupItem = new QuickOpenGroupItem({
                    label: a.getLabel(),
                    run: mode => a.run(mode),
                    groupLabel: index === 0 ? 'Other' : '',
                    showBorder: viewContainerItems.length <= 0 && viewItems.length <= 0
                        ? false
                        : index === 0 ? true : false
                });
                return Object.assign(groupItem, { when: a.when, type: a.type });
            }),
        );
        this.items = updatedItems;
    }

    /**
     * Get the list of `view containers` which satisfy the search term.
     * - If no search term is present, all the view containers are returned.
     * @param lookFor the search term if available.
     */
    protected getViewContainerItems(lookFor?: string): QuickViewItemType[] {
        const items = this.registeredItems.filter((item: QuickViewItemType) => item.type === 'view container').sort((a, b) => this.sortLabel(a, b));
        if (lookFor && lookFor.length > 0) {
            return items.filter((item: QuickViewItemType) => fuzzy.match(lookFor, item.getLabel()!));
        }
        return items;
    }

    /**
     * Get the list of `views` which satisfy the search term.
     * - If no search term is present, all the views are returned.
     * @param lookFor the search term if available.
     */
    protected getViewItems(lookFor?: string): QuickViewItemType[] {
        const items = this.registeredItems.filter((item: QuickViewItemType) => item.type === 'view').sort((a, b) => this.sortLabel(a, b));
        if (lookFor && lookFor.length > 0) {
            return items.filter((item: QuickViewItemType) => fuzzy.match(lookFor, item.getLabel()!));
        }
        return items;
    }

    /**
     * Get the list of `other` items which satisfy the search term.
     * - If no search term is present, all the other items are returned.
     * @param lookFor the search term if available.
     */
    protected getOtherItems(lookFor?: string): QuickOpenItem[] {
        const items = this.registeredItems.filter((item: QuickViewItemType) => item.type === undefined).sort((a, b) => this.sortLabel(a, b));
        if (lookFor && lookFor.length > 0) {
            return items.filter((item: QuickViewItemType) => fuzzy.match(lookFor, item.getLabel()!));
        }
        return items;
    }

    protected sortLabel(a: QuickViewItemType, b: QuickViewItemType): number {
        return a.getLabel()!.localeCompare(b.getLabel()!);
    }

    protected toItem(item: QuickViewItem): QuickViewItemType {
        return Object.assign(new QuickOpenGroupItem({
            label: item.label,
            run: mode => {
                if (mode !== QuickOpenMode.OPEN) {
                    return false;
                }
                item.open();
                return true;
            }
        }), { when: item.when, type: item.type });
    }
}
