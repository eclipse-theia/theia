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

import * as jsoncParser from 'jsonc-parser';
import { Command, deepClone, Disposable, DisposableCollection, Emitter, MessageService, nls } from '@theia/core';
import { injectable, postConstruct, inject, interfaces } from '@theia/core/shared/inversify';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import * as monaco from '@theia/monaco-editor-core';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { EditorManager } from '@theia/editor/lib/browser';
import { Widget } from '@theia/core/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { Deferred } from '@theia/core/lib/common/promise-util';
import URI from '@theia/core/lib/common/uri';
import {
    DeflatedToolbarTree,
    ToolbarTreeSchema,
    ToolbarItem,
    ToolbarItemDeflated,
    ToolbarAlignment,
    ToolbarItemPosition,
    LateInjector,
} from './toolbar-interfaces';
import { UserToolbarURI } from './toolbar-constants';
import { isToolbarPreferences } from './toolbar-preference-schema';
import { ToolbarDefaultsFactory } from './toolbar-defaults';

export const TOOLBAR_BAD_JSON_ERROR_MESSAGE = 'There was an error reading your toolbar.json file. Please check if it is corrupt'
    + ' by right-clicking the toolbar and selecting "Customize Toolbar". You can also reset it to its defaults by selecting'
    + ' "Restore Toolbar Defaults"';

@injectable()
export class ToolbarStorageProvider implements Disposable {
    @inject(FrontendApplicationStateService) protected readonly appState: FrontendApplicationStateService;
    @inject(MonacoTextModelService) protected readonly textModelService: MonacoTextModelService;
    @inject(FileService) protected readonly fileService: FileService;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(LateInjector) protected lateInjector: <T>(id: interfaces.ServiceIdentifier<T>) => T;
    @inject(UserToolbarURI) protected readonly USER_TOOLBAR_URI: URI;
    @inject(ToolbarDefaultsFactory) protected readonly defaultsFactory: () => DeflatedToolbarTree;

    get ready(): Promise<void> {
        return this._ready.promise;
    }

    protected readonly _ready = new Deferred<void>();

    // Injecting this directly causes a circular dependency, so we're using a custom utility
    // to inject this after the application has started up
    protected monacoWorkspace: MonacoWorkspace;
    protected editorManager: EditorManager;
    protected model: MonacoEditorModel | undefined;
    protected toDispose = new DisposableCollection();
    protected toolbarItemsUpdatedEmitter = new Emitter<void>();
    readonly onToolbarItemsChanged = this.toolbarItemsUpdatedEmitter.event;

    protected _toolbarItems: DeflatedToolbarTree | undefined;

    get toolbarItems(): DeflatedToolbarTree | undefined {
        return this._toolbarItems;
    }

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        const reference = await this.textModelService.createModelReference(this.USER_TOOLBAR_URI);
        this.model = reference.object;
        this.toDispose.push(reference);
        this.toDispose.push(Disposable.create(() => this.model = undefined));
        this.readConfiguration();
        if (this.model) {
            this.toDispose.push(this.model.onDidChangeContent(() => this.readConfiguration()));
            this.toDispose.push(this.model.onDirtyChanged(() => this.readConfiguration()));
            this.toDispose.push(this.model.onDidChangeValid(() => this.readConfiguration()));
        }
        this.toDispose.push(this.toolbarItemsUpdatedEmitter);
        await this.appState.reachedState('ready');
        this.monacoWorkspace = this.lateInjector(MonacoWorkspace);
        this.editorManager = this.lateInjector(EditorManager);
        this._ready.resolve();
    }

    protected readConfiguration(): void {
        if (!this.model || this.model.dirty) {
            return;
        }
        try {
            if (this.model.valid) {
                const content = this.model.getText();
                this._toolbarItems = this.parseContent(content);
            } else {
                this._toolbarItems = undefined;
            }
            this.toolbarItemsUpdatedEmitter.fire();
        } catch (e) {
            console.error(`Failed to load toolbar config from '${this.USER_TOOLBAR_URI}'.`, e);
        }
    }

    async removeItem(position: ToolbarItemPosition): Promise<boolean> {
        if (this.toolbarItems) {
            const { alignment, groupIndex, itemIndex } = position;
            const modifiedConfiguration = deepClone(this.toolbarItems);
            modifiedConfiguration.items[alignment][groupIndex].splice(itemIndex, 1);
            const sanitizedConfiguration = this.removeEmptyGroupsFromToolbar(modifiedConfiguration);
            return this.writeToFile([], sanitizedConfiguration);
        }
        return false;
    }

    async addItem(command: Command, alignment: ToolbarAlignment): Promise<boolean> {
        if (this.toolbarItems) {
            const itemFromCommand: ToolbarItem = {
                id: command.id,
                command: command.id,
                icon: command.iconClass,
            };
            const groupIndex = this.toolbarItems?.items[alignment].length;
            if (groupIndex) {
                const lastItemIndex = this.toolbarItems?.items[alignment][groupIndex - 1].length;
                const modifiedConfiguration = deepClone(this.toolbarItems);
                modifiedConfiguration.items[alignment][groupIndex - 1].push(itemFromCommand);
                return !!lastItemIndex && this.writeToFile([], modifiedConfiguration);
            }
            return this.addItemToEmptyColumn(itemFromCommand, alignment);
        }
        return false;
    }

    async swapValues(
        oldPosition: ToolbarItemPosition,
        newPosition: ToolbarItemPosition,
        direction: 'location-left' | 'location-right',
    ): Promise<boolean> {
        if (this.toolbarItems) {
            const { alignment, groupIndex, itemIndex } = oldPosition;
            const draggedItem = this.toolbarItems?.items[alignment][groupIndex][itemIndex];
            const newItemIndex = direction === 'location-right' ? newPosition.itemIndex + 1 : newPosition.itemIndex;
            const modifiedConfiguration = deepClone(this.toolbarItems);
            if (newPosition.alignment === oldPosition.alignment && newPosition.groupIndex === oldPosition.groupIndex) {
                modifiedConfiguration.items[newPosition.alignment][newPosition.groupIndex].splice(newItemIndex, 0, draggedItem);
                if (newPosition.itemIndex > oldPosition.itemIndex) {
                    modifiedConfiguration.items[oldPosition.alignment][oldPosition.groupIndex].splice(oldPosition.itemIndex, 1);
                } else {
                    modifiedConfiguration.items[oldPosition.alignment][oldPosition.groupIndex].splice(oldPosition.itemIndex + 1, 1);
                }
            } else {
                modifiedConfiguration.items[oldPosition.alignment][oldPosition.groupIndex].splice(oldPosition.itemIndex, 1);
                modifiedConfiguration.items[newPosition.alignment][newPosition.groupIndex].splice(newItemIndex, 0, draggedItem);
            }
            const sanitizedConfiguration = this.removeEmptyGroupsFromToolbar(modifiedConfiguration);
            return this.writeToFile([], sanitizedConfiguration);
        }
        return false;
    }

    async addItemToEmptyColumn(item: ToolbarItemDeflated, alignment: ToolbarAlignment): Promise<boolean> {
        if (this.toolbarItems) {
            const modifiedConfiguration = deepClone(this.toolbarItems);
            modifiedConfiguration.items[alignment].push([item]);
            return this.writeToFile([], modifiedConfiguration);
        }
        return false;
    }

    async moveItemToEmptySpace(
        oldPosition: ToolbarItemPosition,
        newAlignment: ToolbarAlignment,
        centerPosition?: 'left' | 'right',
    ): Promise<boolean> {
        const { alignment: oldAlignment, itemIndex: oldItemIndex } = oldPosition;
        let oldGroupIndex = oldPosition.groupIndex;
        if (this.toolbarItems) {
            const draggedItem = this.toolbarItems.items[oldAlignment][oldGroupIndex][oldItemIndex];
            const newGroupIndex = this.toolbarItems.items[oldAlignment].length;
            const modifiedConfiguration = deepClone(this.toolbarItems);
            if (newAlignment === ToolbarAlignment.LEFT) {
                modifiedConfiguration.items[newAlignment].push([draggedItem]);
            } else if (newAlignment === ToolbarAlignment.CENTER) {
                if (centerPosition === 'left') {
                    modifiedConfiguration.items[newAlignment].unshift([draggedItem]);
                    if (newAlignment === oldAlignment) {
                        oldGroupIndex = oldGroupIndex + 1;
                    }
                } else if (centerPosition === 'right') {
                    modifiedConfiguration.items[newAlignment].splice(newGroupIndex + 1, 0, [draggedItem]);
                }
            } else if (newAlignment === ToolbarAlignment.RIGHT) {
                modifiedConfiguration.items[newAlignment].unshift([draggedItem]);
                if (newAlignment === oldAlignment) {
                    oldGroupIndex = oldGroupIndex + 1;
                }
            }
            modifiedConfiguration.items[oldAlignment][oldGroupIndex].splice(oldItemIndex, 1);
            const sanitizedConfiguration = this.removeEmptyGroupsFromToolbar(modifiedConfiguration);
            return this.writeToFile([], sanitizedConfiguration);
        }
        return false;
    }

    async insertGroup(position: ToolbarItemPosition, insertDirection: 'left' | 'right'): Promise<boolean> {
        if (this.toolbarItems) {
            const { alignment, groupIndex, itemIndex } = position;
            const modifiedConfiguration = deepClone(this.toolbarItems);
            const originalColumn = modifiedConfiguration.items[alignment];
            if (originalColumn) {
                const existingGroup = originalColumn[groupIndex];
                const existingGroupLength = existingGroup.length;
                let poppedGroup: ToolbarItemDeflated[] = [];
                let numItemsToRemove: number;
                if (insertDirection === 'left' && itemIndex !== 0) {
                    numItemsToRemove = existingGroupLength - itemIndex;
                    poppedGroup = existingGroup.splice(itemIndex, numItemsToRemove);
                    originalColumn.splice(groupIndex, 1, existingGroup, poppedGroup);
                } else if (insertDirection === 'right' && itemIndex !== existingGroupLength - 1) {
                    numItemsToRemove = itemIndex + 1;
                    poppedGroup = existingGroup.splice(0, numItemsToRemove);
                    originalColumn.splice(groupIndex, 1, poppedGroup, existingGroup);
                }
                const sanitizedConfiguration = this.removeEmptyGroupsFromToolbar(modifiedConfiguration);
                return this.writeToFile([], sanitizedConfiguration);
            }
        }
        return false;
    }

    protected removeEmptyGroupsFromToolbar(
        toolbarItems: DeflatedToolbarTree | undefined,
    ): DeflatedToolbarTree | undefined {
        if (toolbarItems) {
            const modifiedConfiguration = deepClone(toolbarItems);
            const columns = [ToolbarAlignment.LEFT, ToolbarAlignment.CENTER, ToolbarAlignment.RIGHT];
            columns.forEach(column => {
                const groups = toolbarItems.items[column];
                groups.forEach((group, index) => {
                    if (group.length === 0) {
                        modifiedConfiguration.items[column].splice(index, 1);
                    }
                });
            });
            return modifiedConfiguration;
        }
        return undefined;
    }

    async restoreToolbarDefaults(): Promise<boolean> {
        this._toolbarItems = this.defaultsFactory();
        return this.writeToFile([], this._toolbarItems);
    }

    protected async writeToFile(path: jsoncParser.JSONPath, value: unknown, insertion = false): Promise<boolean> {
        if (this.model) {
            try {
                const content = this.model.getText().trim();
                const textModel = this.model.textEditorModel;
                const editOperations: monaco.editor.IIdentifiedSingleEditOperation[] = [];
                const { insertSpaces, tabSize, defaultEOL } = textModel.getOptions();
                for (const edit of jsoncParser.modify(content, path, value, {
                    isArrayInsertion: insertion,
                    formattingOptions: {
                        insertSpaces,
                        tabSize,
                        eol: defaultEOL === monaco.editor.DefaultEndOfLine.LF ? '\n' : '\r\n',
                    },
                })) {
                    const start = textModel.getPositionAt(edit.offset);
                    const end = textModel.getPositionAt(edit.offset + edit.length);
                    editOperations.push({
                        range: monaco.Range.fromPositions(start, end),
                        // eslint-disable-next-line no-null/no-null
                        text: edit.content || null,
                        forceMoveMarkers: false,
                    });
                }
                await this.monacoWorkspace.applyBackgroundEdit(this.model, editOperations, false);
                await this.model.save();
                return true;
            } catch (e) {
                const message = nls.localize('theia/toolbar/failedUpdate', "Failed to update the value of '{0}' in '{1}'.", path.join('.'), this.USER_TOOLBAR_URI.path.toString());
                this.messageService.error(nls.localize('theia/toolbar/jsonError', TOOLBAR_BAD_JSON_ERROR_MESSAGE));
                console.error(`${message}`, e);
                return false;
            }
        }
        return false;
    }

    protected parseContent(fileContent: string): DeflatedToolbarTree | undefined {
        const rawConfig = this.parse(fileContent);
        if (!isToolbarPreferences(rawConfig)) {
            return undefined;
        }
        return rawConfig;
    }

    protected parse(fileContent: string): DeflatedToolbarTree | undefined {
        let strippedContent = fileContent.trim();
        if (!strippedContent) {
            return undefined;
        }
        strippedContent = jsoncParser.stripComments(strippedContent);
        return jsoncParser.parse(strippedContent);
    }

    async openOrCreateJSONFile(state: ToolbarTreeSchema, doOpen = false): Promise<Widget | undefined> {
        const fileExists = await this.fileService.exists(this.USER_TOOLBAR_URI);
        let doWriteStateToFile = false;
        if (fileExists) {
            const fileContent = await this.fileService.read(this.USER_TOOLBAR_URI);
            if (fileContent.value.trim() === '') {
                doWriteStateToFile = true;
            }
        } else {
            await this.fileService.create(this.USER_TOOLBAR_URI);
            doWriteStateToFile = true;
        }
        if (doWriteStateToFile) {
            await this.writeToFile([], state);
        }
        this.readConfiguration();
        if (doOpen) {
            const widget = await this.editorManager.open(this.USER_TOOLBAR_URI);
            return widget;
        }
        return undefined;
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
