// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { URI } from '@theia/core';
import { WidgetFactory, NavigatableWidgetOptions, LabelProvider } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { NotebookEditorWidget } from './notebook-editor-widget';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { NotebookService } from './service/notebook-service';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { NotebookModelResolverService } from './service/notebook-model-resolver-service';
import { NotebookCellToolbarFactory } from './view/notebook-cell-toolbar-factory';

export interface NotebookEditorWidgetOptions extends NavigatableWidgetOptions {
    notebookType: string;
}

@injectable()
export class NotebookEditorWidgetFactory implements WidgetFactory {
    readonly id: string = NotebookEditorWidget.ID;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(NotebookService)
    protected readonly notebookService: NotebookService;

    @inject(MarkdownRenderer)
    protected readonly markdownRenderer: MarkdownRenderer;

    @inject(MonacoEditorProvider)
    protected readonly editorProvider: MonacoEditorProvider;

    @inject(NotebookModelResolverService)
    protected readonly notebookModelResolver: NotebookModelResolverService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(NotebookCellToolbarFactory)
    protected readonly toolbarFactory: NotebookCellToolbarFactory;

    async createWidget(options?: NotebookEditorWidgetOptions): Promise<NotebookEditorWidget> {
        if (!options) {
            throw new Error('no options found for widget. Need at least uri and notebookType');
        }
        const uri = new URI(options.uri);

        await this.notebookService.willOpenNotebook(options.notebookType);

        const editor = await this.createEditor(uri, options.notebookType);

        const icon = this.labelProvider.getIcon(uri);
        editor.title.label = this.labelProvider.getName(uri);
        editor.title.iconClass = icon + ' file-icon';

        return editor;
    }

    private async createEditor(uri: URI, notebookType: string): Promise<NotebookEditorWidget> {

        return new NotebookEditorWidget(uri,
            notebookType,
            await this.notebookModelResolver.resolve(uri, notebookType),
            this.markdownRenderer,
            this.editorProvider,
            this.toolbarFactory
        );
    }

}
