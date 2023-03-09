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
import { WidgetFactory, NavigatableWidgetOptions } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { NotebookEditorWidget } from './notebook-editor-widget';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { NotebookService } from './service/notebook-service';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { NotebookModelResolverService } from './service/notebook-model-resolver-service';

@injectable()
export class NotebookEditorWidgetFactory implements WidgetFactory {
    readonly id: string = NotebookEditorWidget.ID;

    @inject(FileService)
    protected fileService: FileService;

    @inject(NotebookService)
    protected notebookService: NotebookService;

    @inject(MarkdownRenderer)
    protected markdownRenderer: MarkdownRenderer;

    @inject(MonacoEditorProvider)
    protected editorProvider: MonacoEditorProvider;

    @inject(NotebookModelResolverService)
    protected notebookModelResolver: NotebookModelResolverService;

    async createWidget(options?: NavigatableWidgetOptions & { notebookType: string }): Promise<NotebookEditorWidget> {
        if (!options) {
            throw new Error('no options found for widget. Need at least uri and notebookType');
        }

        return new NotebookEditorWidget(new URI(options.uri),
            options.notebookType,
            await this.notebookModelResolver.resolve(new URI(options.uri), options.notebookType),
            this.markdownRenderer,
            this.editorProvider
        );
    }

}
