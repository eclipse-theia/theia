/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { Event, Emitter } from '@theia/core';
import { MonacoEditorModel, WillSaveMonacoModelEvent } from '@theia/monaco/lib/browser/monaco-editor-model';
import { injectable, inject } from 'inversify';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { Schemes } from '../../common/uri-components';

export const EditorModelService = Symbol('EditorModelService');
export interface EditorModelService {
    onModelAdded: Event<MonacoEditorModel>;
    onModelRemoved: Event<MonacoEditorModel>;
    onModelModeChanged: Event<{ model: MonacoEditorModel, oldModeId: string }>;

    onModelWillSave: Event<WillSaveMonacoModelEvent>;
    onModelDirtyChanged: Event<MonacoEditorModel>;
    onModelSaved: Event<MonacoEditorModel>;

    getModels(): MonacoEditorModel[];
    saveAll(includeUntitled?: boolean): Promise<boolean>;
}

@injectable()
export class EditorModelServiceImpl implements EditorModelService {

    private monacoModelService: MonacoTextModelService;
    private modelModeChangedEmitter = new Emitter<{ model: MonacoEditorModel, oldModeId: string }>();
    private onModelRemovedEmitter = new Emitter<MonacoEditorModel>();
    private modelDirtyEmitter = new Emitter<MonacoEditorModel>();
    private modelSavedEmitter = new Emitter<MonacoEditorModel>();
    private onModelWillSavedEmitter = new Emitter<WillSaveMonacoModelEvent>();

    onModelDirtyChanged: Event<MonacoEditorModel> = this.modelDirtyEmitter.event;
    onModelSaved: Event<MonacoEditorModel> = this.modelSavedEmitter.event;
    onModelModeChanged = this.modelModeChangedEmitter.event;
    onModelRemoved = this.onModelRemovedEmitter.event;
    onModelWillSave = this.onModelWillSavedEmitter.event;

    constructor(@inject(MonacoTextModelService) monacoModelService: MonacoTextModelService,
        @inject(MonacoWorkspace) monacoWorkspace: MonacoWorkspace) {

        this.monacoModelService = monacoModelService;
        monacoModelService.models.forEach(model => this.modelCreated(model));
        monacoModelService.onDidCreate(this.modelCreated, this);
        monacoWorkspace.onDidCloseTextDocument(model => {
            setTimeout(() => {
                this.onModelRemovedEmitter.fire(model);
            }, 1);
        });
    }

    private modelCreated(model: MonacoEditorModel): void {
        model.textEditorModel.onDidChangeLanguage(e => {
            this.modelModeChangedEmitter.fire({ model, oldModeId: e.oldLanguage });
        });

        model.onDidSaveModel(_ => {
            this.modelSavedEmitter.fire(model);
        });

        model.onDirtyChanged(_ => {
            this.modelDirtyEmitter.fire(model);
        });
        model.onWillSaveModel(willSaveModelEvent => {
            this.onModelWillSavedEmitter.fire(willSaveModelEvent);
        });
    }

    get onModelAdded(): Event<MonacoEditorModel> {
        return this.monacoModelService.onDidCreate;
    }

    getModels(): MonacoEditorModel[] {
        return this.monacoModelService.models;
    }

    async saveAll(includeUntitled?: boolean): Promise<boolean> {
        const saves = [];
        for (const model of this.monacoModelService.models) {
            const { uri } = model.textEditorModel;
            if (model.dirty && (includeUntitled || uri.scheme !== Schemes.UNTITLED)) {
                saves.push((async () => {
                    try {
                        await model.save();
                        return true;
                    } catch (e) {
                        console.error('Failed to save ', uri.toString(), e);
                        return false;
                    }
                })());
            }
        }
        const results = await Promise.all(saves);
        return results.reduce((a, b) => a && b, true);
    }

}
