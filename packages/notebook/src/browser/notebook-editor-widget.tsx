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
import { CommandRegistry, MenuModelRegistry, URI } from '@theia/core';
import { ReactWidget, Navigatable, SaveableSource, Message, DelegatingSaveable } from '@theia/core/lib/browser';
import { ReactNode } from '@theia/core/shared/react';
import { CellKind } from '../common';
import { CellRenderer as CellRenderer, NotebookCellListView } from './view/notebook-cell-list-view';
import { NotebookCodeCellRenderer } from './view/notebook-code-cell-view';
import { NotebookMarkdownCellRenderer } from './view/notebook-markdown-cell-view';
import { NotebookModel } from './view-model/notebook-model';
import { NotebookCellToolbarFactory } from './view/notebook-cell-toolbar-factory';
import { inject, injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/shared/vscode-languageserver-protocol';
import { NotebookEditorWidgetService } from './service/notebook-editor-widget-service';
import { NotebookMainToolbarRenderer } from './view/notebook-main-toolbar';
import { Deferred } from '@theia/core/lib/common/promise-util';

export const NotebookEditorWidgetContainerFactory = Symbol('NotebookEditorWidgetContainerFactory');

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
    notebookData: Promise<NotebookModel>
}
export const NOTEBOOK_EDITOR_ID_PREFIX = 'notebook:';

@injectable()
export class NotebookEditorWidget extends ReactWidget implements Navigatable, SaveableSource {
    static readonly ID = 'notebook';

    readonly saveable = new DelegatingSaveable();

    @inject(NotebookCellToolbarFactory)
    protected readonly cellToolbarFactory: NotebookCellToolbarFactory;

    @inject(CommandRegistry)
    protected commandRegistry: CommandRegistry;

    @inject(MenuModelRegistry)
    protected menuRegistry: MenuModelRegistry;

    @inject(NotebookEditorWidgetService)
    protected notebookEditorService: NotebookEditorWidgetService;

    @inject(NotebookMainToolbarRenderer)
    protected notebookMainToolbarRenderer: NotebookMainToolbarRenderer;

    @inject(NotebookCodeCellRenderer)
    protected codeCellRenderer: NotebookCodeCellRenderer;
    @inject(NotebookMarkdownCellRenderer)
    protected markdownCellRenderer: NotebookMarkdownCellRenderer;
    @inject(NotebookEditorProps)
    protected readonly props: NotebookEditorProps;

    protected readonly onDidChangeModelEmitter = new Emitter<void>();
    readonly onDidChangeModel = this.onDidChangeModelEmitter.event;

    protected readonly renderers = new Map<CellKind, CellRenderer>();
    protected _model?: NotebookModel;
    protected _ready: Deferred<NotebookModel> = new Deferred();

    get notebookType(): string {
        return this.props.notebookType;
    }

    get ready(): Promise<NotebookModel> {
        return this._ready.promise;
    }

    get model(): NotebookModel | undefined {
        return this._model;
    }

    @postConstruct()
    protected init(): void {
        this.id = NOTEBOOK_EDITOR_ID_PREFIX + this.props.uri.toString();
        this.node.tabIndex = -1;

        this.title.closable = true;
        this.update();

        this.toDispose.push(this.onDidChangeModelEmitter);

        this.renderers.set(CellKind.Markup, this.markdownCellRenderer);
        this.renderers.set(CellKind.Code, this.codeCellRenderer);
        this._ready.resolve(this.waitForData());
    }

    protected async waitForData(): Promise<NotebookModel> {
        this._model = await this.props.notebookData;
        this.saveable.delegate = this._model;
        this.toDispose.push(this._model);
        // Ensure that the model is loaded before adding the editor
        this.notebookEditorService.addNotebookEditor(this);
        this.update();
        return this._model;
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    getResourceUri(): URI | undefined {
        return this.props.uri;
    }

    createMoveToUri(resourceUri: URI): URI | undefined {
        return this.props.uri;
    }

    undo(): void {
        this._model?.undo();
    }

    redo(): void {
        this._model?.redo();
    }

    protected render(): ReactNode {
        if (this._model) {
            return <div>
                {this.notebookMainToolbarRenderer.render(this._model)}
                <NotebookCellListView renderers={this.renderers}
                    notebookModel={this._model}
                    toolbarRenderer={this.cellToolbarFactory}
                    commandRegistry={this.commandRegistry} />
            </div>;
        } else {
            return <div></div>;
        }
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
    }

    protected override onAfterDetach(msg: Message): void {
        super.onAfterDetach(msg);
        this.notebookEditorService.removeNotebookEditor(this);
    }
}
