/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { OpenerService, open, WidgetOpenerOptions, Widget } from '@theia/core/lib/browser';
import { KeybindingRegistry, KeybindingScope } from '@theia/core/lib/browser/keybinding';
import { Keybinding } from '@theia/core/lib/common/keybinding';
import { UserStorageUri } from '@theia/userstorage/lib/browser';
import * as jsoncparser from 'jsonc-parser';
import { Emitter } from '@theia/core/lib/common/event';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { Deferred } from '@theia/core/lib/common/promise-util';
import URI from '@theia/core/lib/common/uri';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { MessageService } from '@theia/core/lib/common/message-service';

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

    protected readonly changeKeymapEmitter = new Emitter<void>();
    readonly onDidChangeKeymaps = this.changeKeymapEmitter.event;

    protected model: MonacoEditorModel | undefined;
    protected readonly deferredModel = new Deferred<MonacoEditorModel>();

    /**
     * Initialize the keybinding service.
     */
    @postConstruct()
    protected async init(): Promise<void> {
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
     * @param newKeybinding the JSON keybindings.
     */
    async setKeybinding(newKeybinding: Keybinding, oldKeybinding: string | undefined): Promise<void> {
        return this.updateKeymap(() => {
            let newAdded = false;
            let oldRemoved = false;
            const keybindings = [];
            for (let keybinding of this.keybindingRegistry.getKeybindingsByScope(KeybindingScope.USER)) {
                if (Keybinding.equals(keybinding, newKeybinding, true, true)) {
                    newAdded = true;
                    keybinding = {
                        ...keybinding,
                        keybinding: newKeybinding.keybinding
                    };
                }
                if (oldKeybinding && Keybinding.equals(keybinding, { ...newKeybinding, keybinding: oldKeybinding, command: '-' + newKeybinding.command }, false, true)) {
                    oldRemoved = true;
                }
                keybindings.push(keybinding);
            }
            if (!newAdded) {
                keybindings.push({
                    command: newKeybinding.command,
                    keybinding: newKeybinding.keybinding,
                    context: newKeybinding.context,
                    when: newKeybinding.when,
                    args: newKeybinding.args
                });
                newAdded = true;
            }
            if (!oldRemoved && oldKeybinding) {
                const disabledBinding = {
                    command: '-' + newKeybinding.command,
                    // TODO key: oldKeybinding, see https://github.com/eclipse-theia/theia/issues/6879
                    keybinding: oldKeybinding,
                    context: newKeybinding.context,
                    when: newKeybinding.when,
                    args: newKeybinding.args
                };
                // Add disablement of the old keybinding if it isn't already disabled in the list to avoid duplicate disabled entries
                if (!keybindings.some(binding => Keybinding.equals(binding, disabledBinding, true, true))) {
                    keybindings.push(disabledBinding);
                }
                oldRemoved = true;
            }
            if (newAdded || oldRemoved) {
                return keybindings;
            }
        });
    }

    /**
     * Remove the given keybinding with the given command id from the JSON.
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
            if (keybindings) {
                const content = model.getText().trim();
                const textModel = model.textEditorModel;
                const { insertSpaces, tabSize, defaultEOL } = textModel.getOptions();
                const editOperations: monaco.editor.IIdentifiedSingleEditOperation[] = [];
                for (const edit of jsoncparser.modify(content, [], keybindings.map(binding => Keybinding.apiObjectify(binding)), {
                    formattingOptions: {
                        insertSpaces,
                        tabSize,
                        eol: defaultEOL === monaco.editor.DefaultEndOfLine.LF ? '\n' : '\r\n'
                    }
                })) {
                    const start = textModel.getPositionAt(edit.offset);
                    const end = textModel.getPositionAt(edit.offset + edit.length);
                    editOperations.push({
                        range: monaco.Range.fromPositions(start, end),
                        text: edit.content,
                        forceMoveMarkers: false
                    });
                }
                await this.workspace.applyBackgroundEdit(model, editOperations);
            }
        } catch (e) {
            const message = `Failed to update a keymap in '${model.uri}'.`;
            this.messageService.error(`${message} Please check if it is corrupted.`);
            console.error(`${message}`, e);
        }
    }

}
