/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { Event, Emitter } from "@theia/core";
import { MonacoEditorModel } from "@theia/monaco/lib/browser/monaco-editor-model";
import { injectable, inject } from "inversify";
import { MonacoTextModelService } from "@theia/monaco/lib/browser/monaco-text-model-service";
import { MonacoWorkspace } from "@theia/monaco/lib/browser/monaco-workspace";

export const EditorModelService = Symbol('EditorModelService');
export interface EditorModelService {
    onModelAdded: Event<MonacoEditorModel>;
    onModelRemoved: Event<MonacoEditorModel>;
    onModelModeChanged: Event<{ model: MonacoEditorModel, oldModeId: string }>;

    onModelDirtyChanged: Event<MonacoEditorModel>;
    onModelSaved: Event<MonacoEditorModel>;

    getModels(): MonacoEditorModel[];
}

@injectable()
export class EditorModelServiceImpl implements EditorModelService {

    private monacoModelService: MonacoTextModelService;
    private modelModeChangedEmitter = new Emitter<{ model: MonacoEditorModel, oldModeId: string }>();
    private onModelRemovedEmitter = new Emitter<MonacoEditorModel>();
    private modelDirtyEmitter = new Emitter<MonacoEditorModel>();
    private modelSavedEmitter = new Emitter<MonacoEditorModel>();

    onModelDirtyChanged: Event<MonacoEditorModel> = this.modelDirtyEmitter.event;
    onModelSaved: Event<MonacoEditorModel> = this.modelSavedEmitter.event;
    onModelModeChanged = this.modelModeChangedEmitter.event;
    onModelRemoved = this.onModelRemovedEmitter.event;

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
    }

    get onModelAdded(): Event<MonacoEditorModel> {
        return this.monacoModelService.onDidCreate;
    }

    getModels(): MonacoEditorModel[] {
        return this.monacoModelService.models;
    }

}
