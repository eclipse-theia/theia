// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { Command, CommandRegistry, ContributionProvider, Emitter, MaybePromise, MessageService, nls } from '@theia/core';
import { KeybindingRegistry, Widget } from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { injectable, inject, postConstruct, named } from '@theia/core/shared/inversify';
import {
    DeflatedToolbarTree,
    ToolbarContribution,
    ToolbarTreeSchema,
    ToolbarAlignment,
    ToolbarItemPosition,
} from './toolbar-interfaces';
import { ToolbarStorageProvider, TOOLBAR_BAD_JSON_ERROR_MESSAGE } from './toolbar-storage-provider';
import { ReactToolbarItemImpl, RenderedToolbarItemImpl, TabBarToolbarItem } from '@theia/core/lib/browser/shell/tab-bar-toolbar/tab-toolbar-item';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { LabelParser } from '@theia/core/lib/browser/label-parser';
import { ToolbarCommands } from './toolbar-constants';

@injectable()
export class ToolbarController {
    @inject(ToolbarStorageProvider) protected readonly storageProvider: ToolbarStorageProvider;
    @inject(FrontendApplicationStateService) protected readonly appState: FrontendApplicationStateService;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(CommandRegistry) commandRegistry: CommandRegistry;
    @inject(ContextKeyService) contextKeyService: ContextKeyService;
    @inject(KeybindingRegistry) keybindingRegistry: KeybindingRegistry;
    @inject(LabelParser) labelParser: LabelParser;

    @inject(ContributionProvider) @named(ToolbarContribution)
    protected widgetContributions: ContributionProvider<ToolbarContribution>;

    protected toolbarModelDidUpdateEmitter = new Emitter<void>();
    readonly onToolbarModelDidUpdate = this.toolbarModelDidUpdateEmitter.event;

    protected toolbarProviderBusyEmitter = new Emitter<boolean>();
    readonly onToolbarDidChangeBusyState = this.toolbarProviderBusyEmitter.event;

    readonly ready = new Deferred<void>();

    protected _toolbarItems: ToolbarTreeSchema;
    get toolbarItems(): ToolbarTreeSchema {
        return this._toolbarItems;
    }

    set toolbarItems(newTree: ToolbarTreeSchema) {
        this._toolbarItems = newTree;
        this.toolbarModelDidUpdateEmitter.fire();
    }

    protected inflateItems(schema?: DeflatedToolbarTree): ToolbarTreeSchema {
        const newTree: ToolbarTreeSchema = {
            items: {
                [ToolbarAlignment.LEFT]: [],
                [ToolbarAlignment.CENTER]: [],
                [ToolbarAlignment.RIGHT]: [],
            },
        };
        if (schema) {
            for (const column of Object.keys(schema.items)) {
                const currentColumn = schema.items[column as ToolbarAlignment];
                for (const group of currentColumn) {
                    const newGroup: TabBarToolbarItem[] = [];
                    for (const item of group) {
                        if (item.group === 'contributed') {
                            const contribution = this.getContributionByID(item.id);
                            if (contribution) {
                                newGroup.push(new ReactToolbarItemImpl(this.commandRegistry, this.contextKeyService, contribution));
                            }
                        } else {
                            newGroup.push(new RenderedToolbarItemImpl(this.commandRegistry, this.contextKeyService, this.keybindingRegistry, this.labelParser, item));
                        }
                    }
                    if (newGroup.length) {
                        newTree.items[column as ToolbarAlignment].push(newGroup);
                    }
                }
            }
        }
        return newTree;
    }

    getContributionByID(id: string): ToolbarContribution | undefined {
        return this.widgetContributions.getContributions().find(contribution => contribution.id === id);
    }

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        await this.appState.reachedState('ready');
        await this.storageProvider.ready;
        this.toolbarItems = await this.resolveToolbarItems();
        this.storageProvider.onToolbarItemsChanged(async () => {
            this.toolbarItems = await this.resolveToolbarItems(true);
        });
        this.ready.resolve();
        this.widgetContributions.getContributions().forEach(contribution => {
            if (contribution.onDidChange) {
                contribution.onDidChange(() => this.toolbarModelDidUpdateEmitter.fire());
            }
        });
    }

    protected async resolveToolbarItems(promptUserOnInvalidConfig = false): Promise<ToolbarTreeSchema> {
        await this.storageProvider.ready;

        if (!this.storageProvider.toolbarItems) {
            let restoreDefaults = true;
            if (promptUserOnInvalidConfig) {
                const resetLabel = ToolbarCommands.RESET_TOOLBAR.label!;
                const answer = await this.messageService.error(nls.localize('theia/toolbar/jsonError', TOOLBAR_BAD_JSON_ERROR_MESSAGE), resetLabel);
                restoreDefaults = answer === resetLabel;
            }
            if (restoreDefaults) {
                await this.restoreToolbarDefaults();
            }
        }
        return this.inflateItems(this.storageProvider.toolbarItems);
    }

    async swapValues(
        oldPosition: ToolbarItemPosition,
        newPosition: ToolbarItemPosition,
        direction: 'location-left' | 'location-right',
    ): Promise<boolean> {
        return this.withBusy<boolean>(async () => {
            await this.openOrCreateJSONFile(false);
            return this.storageProvider.swapValues(oldPosition, newPosition, direction);
        });
    }

    async restoreToolbarDefaults(): Promise<boolean> {
        return this.withBusy<boolean>(() => this.storageProvider.restoreToolbarDefaults());
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
