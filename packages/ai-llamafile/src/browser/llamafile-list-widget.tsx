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
import * as React from '@theia/core/shared/react';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser';
import { LanguageModelRegistry } from '@theia/ai-core';
import { LlamafileLanguageModel } from '../common/llamafile-language-model';
import { NewLlamafileEntryInput } from './llamafile-command-contribution';
import { CommandService } from '@theia/core';
import { LlamafileServerManager } from '../common/llamafile-server-manager';

export interface LlamafileListItem {
    name: string;
    path: string;
    port: number;
    started: boolean;
    active: boolean;
}

// TODO: Improve UI
@injectable()
export class LlamafileListWidget extends ReactWidget {

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    @inject(LlamafileServerManager) llamafileServerManager: LlamafileServerManager;

    @inject(CommandService) private commandService: CommandService;

    static readonly ID = 'llamafile:list-view';
    static readonly LABEL = 'Llamafile list view';

    private items: LlamafileListItem[] = [];

    constructor() {
        super();
        this.id = LlamafileListWidget.ID;
        this.title.label = LlamafileListWidget.LABEL;
        this.title.caption = LlamafileListWidget.LABEL;
        this.title.closable = true;
        this.update();
    }

    protected render(): React.ReactNode {
        return (
            <div>
                {
                    this.items.map(item => (
                        <div key={item.name} style={{ border: '1px solid white', padding: '10px' }}>
                            <div>
                                <div>
                                    <span style={{ fontWeight: 'bold' }}>Name:</span> {item.name}
                                </div>
                                <div>
                                    <span style={{ fontWeight: 'bold' }}>Path:</span> {item.path}
                                </div>
                                <div>
                                    <span style={{ fontWeight: 'bold' }}>Port:</span> {item.port}
                                </div>
                                <div>
                                    <span style={{ fontWeight: 'bold' }}>Active:</span> {item.active ? 'Yes' : 'No'}
                                </div>
                                <div>
                                    <span style={{ fontWeight: 'bold' }}>Started:</span> {item.started ? 'Yes' : 'No'}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', marginTop: '10px' }}>
                                <button onClick={() => this.startServer(item.name)}>Start</button>
                                <button onClick={() => this.activateServer(item.name)}>Set as active</button>
                                <button onClick={() => this.killServer(item.name)}>Kill</button>
                            </div>
                        </div>
                    ))}
                <button onClick={() => this.addItem()}> Add Item </button>
            </div>
        );
    }

    addItem(): void {
        // Popup dialog to get the name and path
        let needsToBeActive = false;
        if (this.items.length === 0) {
            needsToBeActive = true;
        }
        this.commandService.executeCommand(NewLlamafileEntryInput.id).then(async (newItem: LlamafileListItem) => {
            this.items.push(newItem);
            this.languageModelRegistry.addLanguageModels(
                [LlamafileLanguageModel.createNewLlamafileLanguageModel(newItem.name, newItem.path, newItem.port, this.llamafileServerManager)]);
            this.update();
            if (needsToBeActive) {
                this.activateServer(this.items[0].name);
            }
        });
    }

    async getLanguageModelForItem(name: string): Promise<LlamafileLanguageModel | undefined> {
        const result = await this.languageModelRegistry.getLanguageModel(name);
        if (result instanceof LlamafileLanguageModel) {
            return result;
        } else {
            return undefined;
        }
    }

    private startServer(name: string): void {
        this.getLanguageModelForItem(name)?.then(model => model?.startServer());
        this.items.find(item => item.name === name)!.started = true;
        this.update();
    }
    private activateServer(name: string): void {
        this.getLanguageModelForItem(name)?.then(model => model?.setAsActive());
        this.items.find(item => item.name === name)!.active = true;
        this.items.find(item => item.name !== name)!.active = false;
        this.update();
    }
    private killServer(name: string): void {
        this.getLanguageModelForItem(name)?.then(model => model?.killServer());
        this.items.find(item => item.name === name)!.started = false;
        this.items.find(item => item.name === name)!.active = false;
        this.update();
    }
}
