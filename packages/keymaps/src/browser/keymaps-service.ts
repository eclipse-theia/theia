// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { OpenerService, open, WidgetOpenerOptions, Widget } from '@theia/core/lib/browser';
import { KeybindingRegistry, KeybindingScope, ScopedKeybinding } from '@theia/core/lib/browser/keybinding';
import { Keybinding, RawKeybinding } from '@theia/core/lib/common/keybinding';
import { UserStorageUri } from '@theia/userstorage/lib/browser';
import * as jsoncparser from 'jsonc-parser';
import { Emitter } from '@theia/core/lib/common/event';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { Deferred } from '@theia/core/lib/common/promise-util';
import URI from '@theia/core/lib/common/uri';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { MessageService } from '@theia/core/lib/common/message-service';
import { MonacoJSONCEditor } from '@theia/preferences/lib/browser/monaco-jsonc-editor';

@injectable()
export class KeymapsService {

    @inject(MonacoWorkspace)
    protected readonly workspace: MonacoWorkspace;

    @inject(MonacoTextModelService)
    protected readonly textModelService: MonacoTextModelService;

    @inject(KeybindingRegistry)
    protected readonly keybindingRegistry: KeybindingRegistry;

    @inject(OpenerService)
    protected readonly opener: OpenerService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(MonacoJSONCEditor)
    protected readonly jsoncEditor: MonacoJSONCEditor;

    protected readonly changeKeymapEmitter = new Emitter<void>();
    readonly onDidChangeKeymaps = this.changeKeymapEmitter.event;

    protected model: MonacoEditorModel | undefined;
    protected readonly deferredModel = new Deferred<MonacoEditorModel>();

    /**
     * Initialize the keybinding service.
     */
    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        const reference = await this.textModelService.createModelReference(UserStorageUri.resolve('keymaps.json'));
        this.model = reference.object;
        this.deferredModel.resolve(this.model);

        this.reconcile();
        this.model.onDidChangeContent(() => this.reconcile());
        this.model.onDirtyChanged(() => this.reconcile());
        this.model.onDidChangeValid(() => this.reconcile());
        this.keybindingRegistry.onKeybindingsChanged(() => this.changeKeymapEmitter.fire(undefined));
    }

    /**
     * Reconcile all the keybindings, registering them to the registry.
     */
    protected reconcile(): void {
        const model = this.model;
        if (!model || model.dirty) {
            return;
        }
        try {
            const keybindings: Keybinding[] = [];
            if (model.valid) {
                const content = model.getText();
                const json = jsoncparser.parse(content, undefined, { disallowComments: false });
                if (Array.isArray(json)) {
                    for (const value of json) {
                        if (Keybinding.is(value)) {
                            keybindings.push(value);
                        } else if (RawKeybinding.is(value)) {
                            keybindings.push(Keybinding.apiObjectify(value));
                        }
                    }
                }
            }
            this.keybindingRegistry.setKeymap(KeybindingScope.USER, keybindings);
        } catch (e) {
            console.error(`Failed to load keymaps from '${model.uri}'.`, e);
        }
    }

    /**
     * Open the keybindings widget.
     * @param ref the optional reference for opening the widget.
     */
    async open(ref?: Widget): Promise<void> {
        const model = await this.deferredModel.promise;
        const options: WidgetOpenerOptions = {
            widgetOptions: ref ? { area: 'main', mode: 'split-right', ref } : { area: 'main' },
            mode: 'activate'
        };
        if (!model.valid) {
            await model.save();
        }
        await open(this.opener, new URI(model.uri), options);
    }

    /**
     * Set the keybinding in the JSON.
     * @param newKeybinding the new JSON keybinding
     * @param oldKeybinding the old JSON keybinding
     */
    async setKeybinding(newKeybinding: Keybinding, oldKeybinding: ScopedKeybinding | undefined): Promise<void> {
        return this.updateKeymap(() => {
            const keybindings: Keybinding[] = [...this.keybindingRegistry.getKeybindingsByScope(KeybindingScope.USER)];
            if (!oldKeybinding) {
                Keybinding.addKeybinding(keybindings, newKeybinding);
                return keybindings;
            } else if (oldKeybinding.scope === KeybindingScope.DEFAULT) {
                Keybinding.addKeybinding(keybindings, newKeybinding);
                const disabledBinding = {
                    ...oldKeybinding,
                    command: '-' + oldKeybinding.command
                };
                Keybinding.addKeybinding(keybindings, disabledBinding);
                return keybindings;
            } else if (Keybinding.replaceKeybinding(keybindings, oldKeybinding, newKeybinding)) {
                return keybindings;
            }
        });
    }

    /**
     * Unset the given keybinding in the JSON.
     * If the given keybinding has a default scope, it will be disabled in the JSON.
     * Otherwise, it will be removed from the JSON.
     * @param keybinding the keybinding to unset
     */
    unsetKeybinding(keybinding: ScopedKeybinding): Promise<void> {
        return this.updateKeymap(() => {
            const keybindings = this.keybindingRegistry.getKeybindingsByScope(KeybindingScope.USER);
            if (keybinding.scope === KeybindingScope.DEFAULT) {
                const result: Keybinding[] = [...keybindings];
                const disabledBinding = {
                    ...keybinding,
                    command: '-' + keybinding.command
                };
                Keybinding.addKeybinding(result, disabledBinding);
                return result;
            } else {
                const filtered = keybindings.filter(a => !Keybinding.equals(a, keybinding, false, true));
                if (filtered.length !== keybindings.length) {
                    return filtered;
                }
            }
        });
    }

    /**
     * Whether there is a keybinding with the given command id in the JSON.
     * @param commandId the keybinding command id
     */
    hasKeybinding(commandId: string): boolean {
        const keybindings = this.keybindingRegistry.getKeybindingsByScope(KeybindingScope.USER);
        return keybindings.some(a => a.command === commandId);
    }

    /**
     * Remove the keybindings with the given command id from the JSON.
     * This includes disabled keybindings.
     * @param commandId the keybinding command id.
     */
    removeKeybinding(commandId: string): Promise<void> {
        return this.updateKeymap(() => {
            const keybindings = this.keybindingRegistry.getKeybindingsByScope(KeybindingScope.USER);
            const removedCommand = '-' + commandId;
            const filtered = keybindings.filter(a => a.command !== commandId && a.command !== removedCommand);
            if (filtered.length !== keybindings.length) {
                return filtered;
            }
        });
    }

    protected async updateKeymap(op: () => Keybinding[] | void): Promise<void> {
        const model = await this.deferredModel.promise;
        try {
            const keybindings = op();
            if (keybindings && this.model) {
                await this.jsoncEditor.setValue(this.model, [], keybindings.map(binding => Keybinding.apiObjectify(binding)));
            }
        } catch (e) {
            const message = `Failed to update a keymap in '${model.uri}'.`;
            this.messageService.error(`${message} Please check if it is corrupted.`);
            console.error(`${message}`, e);
        }
    }

}
