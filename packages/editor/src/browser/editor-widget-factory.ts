/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, } from "inversify";
import URI from "@theia/core/lib/common/uri";
import { SelectionService } from '@theia/core/lib/common';
import { WidgetFactory, LabelProvider } from "@theia/core/lib/browser";
import { EditorWidget } from "./editor-widget";
import { TextEditorProvider } from "./editor";

@injectable()
export class EditorWidgetFactory implements WidgetFactory {

    static ID = "code-editor-opener";

    readonly id = EditorWidgetFactory.ID;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(TextEditorProvider)
    protected readonly editorProvider: TextEditorProvider;

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;

    createWidget(uriAsString: string): Promise<EditorWidget> {
        const uri = new URI(uriAsString);
        return this.createEditor(uri);
    }

    protected async createEditor(uri: URI): Promise<EditorWidget> {
        const icon = await this.labelProvider.getIcon(uri);
        return this.editorProvider(uri).then(textEditor => {
            const newEditor = new EditorWidget(textEditor, this.selectionService);
            newEditor.id = this.id + ":" + uri.toString();
            newEditor.title.closable = true;
            newEditor.title.label = this.labelProvider.getName(uri);
            newEditor.title.iconClass = icon + ' file-icon';
            newEditor.title.caption = this.labelProvider.getLongName(uri);
            return newEditor;
        });
    }
}
