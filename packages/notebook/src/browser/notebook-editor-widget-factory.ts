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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls, URI } from '@theia/core';
import { WidgetFactory, NavigatableWidgetOptions, LabelProvider } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { NotebookEditorWidget, NotebookEditorWidgetContainerFactory, NotebookEditorProps } from './notebook-editor-widget';
import { NotebookService } from './service/notebook-service';
import { NotebookModelResolverService } from './service/notebook-model-resolver-service';

export interface NotebookEditorWidgetOptions extends NavigatableWidgetOptions {
    notebookType: string;
}

@injectable()
export class NotebookEditorWidgetFactory implements WidgetFactory {
    readonly id: string = NotebookEditorWidget.ID;

    @inject(NotebookService)
    protected readonly notebookService: NotebookService;

    @inject(NotebookModelResolverService)
    protected readonly notebookModelResolver: NotebookModelResolverService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(NotebookEditorWidgetContainerFactory)
    protected readonly createNotebookEditorWidget: (props: NotebookEditorProps) => NotebookEditorWidget;

    async createWidget(options?: NotebookEditorWidgetOptions): Promise<NotebookEditorWidget> {
        if (!options) {
            throw new Error('no options found for widget. Need at least uri and notebookType');
        }
        const uri = new URI(options.uri);

        await this.notebookService.willOpenNotebook(options.notebookType);

        const editor = await this.createEditor(uri, options.notebookType);

        this.setLabels(editor, uri);
        const labelListener = this.labelProvider.onDidChange(event => {
            if (event.affects(uri)) {
                this.setLabels(editor, uri);
            }
        });
        editor.onDidDispose(() => labelListener.dispose());
        return editor;
    }

    protected async createEditor(uri: URI, notebookType: string): Promise<NotebookEditorWidget> {
        return this.createNotebookEditorWidget({
            uri,
            notebookType,
            notebookData: this.notebookModelResolver.resolve(uri, notebookType),
        });
    }

    protected setLabels(editor: NotebookEditorWidget, uri: URI): void {
        editor.title.caption = uri.path.fsPath();
        if (editor.model?.readOnly) {
            editor.title.caption += ` • ${nls.localizeByDefault('Read-only')}`;
        }
        const icon = this.labelProvider.getIcon(uri);
        editor.title.label = this.labelProvider.getName(uri);
        editor.title.iconClass = icon + ' file-icon';
    }

}
