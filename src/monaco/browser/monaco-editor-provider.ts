/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from 'inversify';
import { MonacoToProtocolConverter, ProtocolToMonacoConverter } from 'monaco-languageclient';
import URI from "../../application/common/uri";
import { SelectionService } from "../../application/common";
import { MonacoEditor } from "./monaco-editor";
import { MonacoEditorService } from "./monaco-editor-service";
import { MonacoModelResolver } from "./monaco-model-resolver";
import { MonacoContextMenuService } from "./monaco-context-menu";
import { MonacoWorkspace } from "./monaco-workspace";

export class MonacoEditorProvider {

    protected readonly editorService: MonacoEditorService;
    protected readonly monacoModelResolver: MonacoModelResolver;
    protected readonly contextMenuService: MonacoContextMenuService;
    protected readonly m2p: MonacoToProtocolConverter;
    protected readonly p2m: ProtocolToMonacoConverter;
    protected readonly workspace: MonacoWorkspace;
    protected readonly selectionService: SelectionService;

    constructor(context: interfaces.Context) {
        this.editorService = context.container.get(MonacoEditorService);
        this.monacoModelResolver = context.container.get(MonacoModelResolver);
        this.contextMenuService = context.container.get(MonacoContextMenuService);
        this.m2p = context.container.get(MonacoToProtocolConverter);
        this.p2m = context.container.get(ProtocolToMonacoConverter);
        this.workspace = context.container.get(MonacoWorkspace);
        this.selectionService = context.container.get(SelectionService);
    }

    get(uri: URI): Promise<MonacoEditor> {
        return Promise.resolve(this.monacoModelResolver.createModelReference(uri.codeUri).then(reference => {
            const node = document.createElement('div');
            const model = reference.object;
            const editor = new MonacoEditor(
                uri, node, this.m2p, this.p2m, this.workspace, this.selectionService, {
                    model: model.textEditorModel,
                    wordWrap: true,
                    folding: true,
                    theme: 'vs-dark',
                    readOnly: model.readOnly
                }, {
                    editorService: this.editorService,
                    textModelResolverService: this.monacoModelResolver,
                    contextMenuService: this.contextMenuService
                }
            );
            editor.toDispose.push(reference);
            return editor;
        }));
    }

}