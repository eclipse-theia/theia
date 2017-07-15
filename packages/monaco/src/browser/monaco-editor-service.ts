/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { MonacoToProtocolConverter } from "monaco-languageclient";
import URI from "@theia/core/lib/common/uri";
import { OpenerService, open } from '@theia/core/lib/browser';
import { EditorInput, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from './monaco-editor';

import IEditorService = monaco.editor.IEditorService;
import IResourceInput = monaco.editor.IResourceInput;
import IEditorReference = monaco.editor.IEditorReference;

@injectable()
export class MonacoEditorService implements IEditorService {

    constructor(
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(MonacoToProtocolConverter) protected readonly m2p: MonacoToProtocolConverter
    ) { }

    openEditor(input: IResourceInput, sideBySide?: boolean | undefined): monaco.Promise<IEditorReference | undefined> {
        const uri = new URI(input.resource.toString());
        const editorInput = this.createEditorInput(input);
        return monaco.Promise.wrap(open(this.openerService, uri, editorInput).then(widget => {
            if (widget instanceof EditorWidget && widget.editor instanceof MonacoEditor) {
                return widget.editor;
            }
            return undefined;
        }));
    }

    protected createEditorInput(input: IResourceInput, sideBySide?: boolean | undefined): EditorInput {
        const revealIfVisible = !input.options || input.options.revealIfVisible === undefined || input.options.revealIfVisible;
        const selection = !input.options ? undefined : this.m2p.asRange(input.options.selection);
        return {
            revealIfVisible,
            selection
        };
    }

}
