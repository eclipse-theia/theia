/********************************************************************************
 * Copyright (C) 2022 Ericsson and others.
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

import { Command, ContributionProvider, deepClone, Emitter, MaybePromise, MessageService, Prioritizeable } from '@theia/core';
import { Widget } from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { TabBarToolbarItem } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { injectable, inject, postConstruct, named } from '@theia/core/shared/inversify';
import { MainToolbarDefaultsFactory } from './main-toolbar-defaults';
import {
    DeflatedMainToolbarTreeSchema,
    ReactTabBarToolbarContribution,
    MainToolbarTreeSchema,
    ValidMainToolbarItem,
    ToolbarAlignment,
    ToolbarItemPosition,
} from './main-toolbar-interfaces';
import { MainToolbarStorageProvider, TOOLBAR_BAD_JSON_ERROR_MESSAGE } from './main-toolbar-storage-provider';

@injectable()
export class MainToolbarController {
    @inject(MainToolbarStorageProvider) protected readonly storageProvider: MainToolbarStorageProvider;
    @inject(FrontendApplicationStateService) protected readonly appState: FrontendApplicationStateService;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(MainToolbarDefaultsFactory) protected readonly defaultsFactory: () => MainToolbarTreeSchema;
    @inject(ContributionProvider) @named(ReactTabBarToolbarContribution)
    protected widgetContributions: ContributionProvider<ReactTabBarToolbarContribution>;

    protected toolbarModelDidUpdateEmitter = new Emitter<void>();
    readonly onToolbarModelDidUpdate = this.toolbarModelDidUpdateEmitter.event;

    protected toolbarProviderBusyEmitter = new Emitter<boolean>();
    readonly onToolbarDidChangeBusyState = this.toolbarProviderBusyEmitter.event;

    readonly ready = new Deferred<void>();

    protected _toolbarItems: MainToolbarTreeSchema;
    get toolbarItems(): MainToolbarTreeSchema {
        return this._toolbarItems;
    }

    set toolbarItems(newTree: MainToolbarTreeSchema) {
        this._toolbarItems = newTree;
        this.toolbarModelDidUpdateEmitter.fire();
    }

    protected inflateItems(schema: DeflatedMainToolbarTreeSchema): MainToolbarTreeSchema {
        const newTree: MainToolbarTreeSchema = {
            items: {
                [ToolbarAlignment.LEFT]: [],
                [ToolbarAlignment.CENTER]: [],
                [ToolbarAlignment.RIGHT]: [],
            },
        };
        for (const column of Object.keys(schema.items)) {
            const currentColumn = schema.items[column as ToolbarAlignment];
            for (const group of currentColumn) {
                const newGroup: ValidMainToolbarItem[] = [];
                for (const item of group) {
                    if (item.group === 'contributed') {
                        const contribution = this.getContributionByID(item.id);
                        if (contribution) {
                            newGroup.push(contribution);
                        }
                    } else if (TabBarToolbarItem.is(item)) {
                        newGroup.push({ ...item });
                    }
                }
                if (newGroup.length) {
                    newTree.items[column as ToolbarAlignment].push(newGroup);
                }
            }
        }
        return newTree;
    }

    getContributionByID(id: string): ReactTabBarToolbarContribution | undefined {
        return this.widgetContributions.getContributions().find(contribution => contribution.id === id);
    }

    @postConstruct()
    async init(): Promise<void> {
        await this.appState.reachedState('ready');
        await this.storageProvider.ready;
        this.toolbarItems = await this.resolveToolbarItems();
        this.storageProvider.onToolbarItemsChanged(async () => {
            this.toolbarItems = await this.resolveToolbarItems();
        });
        this.ready.resolve();
        this.widgetContributions.getContributions().forEach(contribution => {
            if (contribution.onDidChange) {
                contribution.onDidChange(() => this.toolbarModelDidUpdateEmitter.fire());
            }
        });
    }

    protected async resolveToolbarItems(): Promise<MainToolbarTreeSchema> {
        await this.storageProvider.ready;
        if (this.storageProvider.toolbarItems) {
            try {
                return this.inflateItems(this.storageProvider.toolbarItems);
            } catch (e) {
                this.messageService.error(TOOLBAR_BAD_JSON_ERROR_MESSAGE);
            }
        }
        return this.getDefaultItemsAndContributions();
    }

    protected async getDefaultItemsAndContributions(): Promise<MainToolbarTreeSchema> {
        let defaultToolbarTree = this.defaultsFactory();
        const toolbarContributions = this.widgetContributions.getContributions();
        const prioritizedItems = await this.sortAndPrioritizeContributions(toolbarContributions);
        defaultToolbarTree = this.groupAndAppendContributions(defaultToolbarTree, prioritizedItems);
        return defaultToolbarTree;
    }

    protected async sortAndPrioritizeContributions(
        contributions: ReactTabBarToolbarContribution[],
    ): Promise<Array<[ToolbarAlignment, ReactTabBarToolbarContribution[]]>> {
        const prioritizedContributionsPromise: Array<Promise<[ToolbarAlignment, ReactTabBarToolbarContribution[]]>> = [];
        [ToolbarAlignment.LEFT, ToolbarAlignment.CENTER, ToolbarAlignment.RIGHT].forEach(column => {
            prioritizedContributionsPromise.push(this.prioritizeContributionsPerColumn(contributions, column));
        });
        return Promise.all(prioritizedContributionsPromise);
    }

    protected async prioritizeContributionsPerColumn(
        contributions: ReactTabBarToolbarContribution[],
        column: ToolbarAlignment,
    ): Promise<[ToolbarAlignment, ReactTabBarToolbarContribution[]]> {
        const filteredContributions = contributions.filter(contribution => contribution.column === column);
        const prioritized = (await Prioritizeable.prioritizeAll(filteredContributions, contribution => contribution.priority))
            .map(p => p.value);
        return [column, prioritized];
    }

    protected groupAndAppendContributions(
        toolbarDefaults: MainToolbarTreeSchema,
        prioritizedItems: Array<[ToolbarAlignment, ReactTabBarToolbarContribution[]]>,
    ): MainToolbarTreeSchema {
        const toolbarDefaultsCopy = deepClone(toolbarDefaults);
        prioritizedItems.forEach(([column, prioritizedContributions]) => {
            const currentColumn = toolbarDefaultsCopy.items[column];
            const indexOfLastGroupInColumn = toolbarDefaultsCopy.items[column].length - 1;
            let currentGroup = currentColumn[indexOfLastGroupInColumn];
            prioritizedContributions.forEach(contribution => {
                if (!contribution.newGroup) {
                    currentGroup.push(contribution);
                } else {
                    currentGroup = [contribution];
                    currentColumn.push(currentGroup);
                }
            });
        });
        return toolbarDefaultsCopy;
    }

    async swapValues(
        oldPosition: ToolbarItemPosition,
        newPosition: ToolbarItemPosition,
        direction: 'location-left' | 'location-right',
    ): Promise<boolean> {
        await this.openOrCreateJSONFile(false);
        this.toolbarProviderBusyEmitter.fire(true);
        const success = this.storageProvider.swapValues(oldPosition, newPosition, direction);
        this.toolbarProviderBusyEmitter.fire(false);
        return success;
    }

    async clearAll(): Promise<boolean> {
        return this.withBusy<boolean>(() => this.storageProvider.clearAll());
    }

    async openOrCreateJSONFile(doOpen = false): Promise<Widget | undefined> {
        return this.storageProvider.openOrCreateJSONFile(this.toolbarItems, doOpen);
    }

    async addItem(command: Command, area: ToolbarAlignment): Promise<boolean> {
        return this.withBusy<boolean>(async () => {
            await this.openOrCreateJSONFile(false);
            return this.storageProvider.addItem(command, area);
        });
    }

    async removeItem(position: ToolbarItemPosition, id?: string): Promise<boolean> {
        return this.withBusy<boolean>(async () => {
            await this.openOrCreateJSONFile(false);
            return this.storageProvider.removeItem(position);
        });
    }

    async moveItemToEmptySpace(
        draggedItemPosition: ToolbarItemPosition,
        column: ToolbarAlignment,
        centerPosition?: 'left' | 'right',
    ): Promise<boolean> {
        return this.withBusy<boolean>(async () => {
            await this.openOrCreateJSONFile(false);
            return this.storageProvider.moveItemToEmptySpace(draggedItemPosition, column, centerPosition);
        });
    }

    async insertGroup(position: ToolbarItemPosition, insertDirection: 'left' | 'right'): Promise<boolean> {
        return this.withBusy<boolean>(async () => {
            await this.openOrCreateJSONFile(false);
            return this.storageProvider.insertGroup(position, insertDirection);
        });
    }

    async withBusy<T = unknown>(action: () => MaybePromise<T>): Promise<T> {
        this.toolbarProviderBusyEmitter.fire(true);
        const toReturn = await action();
        this.toolbarProviderBusyEmitter.fire(false);
        return toReturn;
    }
}
