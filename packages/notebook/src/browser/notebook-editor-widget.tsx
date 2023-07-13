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

import * as React from '@theia/core/shared/react';
import { CommandRegistry, URI } from '@theia/core';
import { ReactWidget, Navigatable, SaveableSource, Saveable, Message } from '@theia/core/lib/browser';
import { ReactNode } from '@theia/core/shared/react';
import { CellKind } from '../common';
import { Cellrenderer as CellRenderer, NotebookCellListView } from './view/notebook-cell-list-view';
import { NotebookCodeCellRenderer } from './view/notebook-code-cell-view';
import { NotebookMarkdownCellRenderer } from './view/notebook-markdown-cell-view';
import { NotebookModel } from './view-model/notebook-model';
import { NotebookCellToolbarFactory } from './view/notebook-cell-toolbar-factory';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/shared/vscode-languageserver-protocol';
import { NotebookEditorWidgetService } from './service/notebook-editor-service';

export const NotebookEditorContainerFactory = Symbol('NotebookModelFactory');

export function createNotebookEditorWidgetContainer(parent: interfaces.Container, props: NotebookEditorProps): interfaces.Container {
    const child = parent.createChild();

    child.bind(NotebookEditorProps).toConstantValue(props);
    child.bind(NotebookEditorWidget).toSelf();

    return child;
}

const NotebookEditorProps = Symbol('NotebookEditorProps');

export interface NotebookEditorProps {
    uri: URI,
    readonly notebookType: string,
    notebookData: NotebookModel
}
export const NOTEBOOK_EDITOR_ID_PREFIX = 'notebook:';
@injectable()
export class NotebookEditorWidget extends ReactWidget implements Navigatable, SaveableSource {
    static readonly ID = 'notebook';

    readonly saveable: Saveable;

    @inject(NotebookCellToolbarFactory)
    protected readonly cellToolbarFactory: NotebookCellToolbarFactory;

    @inject(CommandRegistry)
    protected commandRegistry: CommandRegistry;

    @inject(NotebookEditorWidgetService)
    protected notebookEditorService: NotebookEditorWidgetService;

    private readonly onDidChangeModelEmitter = new Emitter<void>();
    readonly onDidChangeModel = this.onDidChangeModelEmitter.event;

    private readonly renderers = new Map<CellKind, CellRenderer>();

    get notebookType(): string {
        return this.props.notebookType;
    }

    get model(): NotebookModel {
        return this.props.notebookData;
    }

    constructor(
        @inject(NotebookCodeCellRenderer) codeCellRenderer: NotebookCodeCellRenderer,
        @inject(NotebookMarkdownCellRenderer) markdownCellRenderer: NotebookMarkdownCellRenderer,
        @inject(NotebookEditorProps) private readonly props: NotebookEditorProps) {
        super();
        this.saveable = this.props.notebookData;
        this.id = NOTEBOOK_EDITOR_ID_PREFIX + this.props.uri.toString();

        this.title.closable = true;
        this.update();

        this.renderers.set(CellKind.Markup, markdownCellRenderer);
        this.renderers.set(CellKind.Code, codeCellRenderer);
    }

    getResourceUri(): URI | undefined {
        return this.props.uri;
    }
    createMoveToUri(resourceUri: URI): URI | undefined {
        return this.props.uri;
    }

    protected render(): ReactNode {
        return <div>
            <NotebookCellListView renderers={this.renderers}
                notebookModel={this.props.notebookData}
                toolbarRenderer={this.cellToolbarFactory}
                commandRegistry={this.commandRegistry}/>
        </div>;
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.notebookEditorService.addNotebookEditor(this);
    }

    protected override onAfterDetach(msg: Message): void {
        super.onAfterDetach(msg);
        this.notebookEditorService.removeNotebookEditor(this);
    }
}
