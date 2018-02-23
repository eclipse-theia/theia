/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { MonacoToProtocolConverter } from "monaco-languageclient";
import URI from "@theia/core/lib/common/uri";
import { OpenerService, open, WidgetOpenMode } from '@theia/core/lib/browser';
import { EditorWidget, EditorOpenerOptions } from '@theia/editor/lib/browser';
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
        const openerOptions = this.createEditorOpenerOptions(input);
        return monaco.Promise.wrap(open(this.openerService, uri, openerOptions).then(widget => {
            if (widget instanceof EditorWidget && widget.editor instanceof MonacoEditor) {
                return widget.editor;
            }
            return undefined;
        }));
    }

    protected createEditorOpenerOptions(input: IResourceInput, sideBySide?: boolean | undefined): EditorOpenerOptions {
        const mode = this.getEditorOpenMode(input);
        const selection = input.options && this.m2p.asRange(input.options.selection);
        return { mode, selection };
    }
    protected getEditorOpenMode(input: IResourceInput): WidgetOpenMode {
        const options = {
            preserveFocus: false,
            revealIfVisible: true,
            ...input.options
        };
        if (options.preserveFocus) {
            return 'reveal';
        }
        return options.revealIfVisible ? 'activate' : 'open';
    }

}
