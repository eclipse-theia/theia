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
import { ReactWidget, Navigatable, SaveableSource, Message, DelegatingSaveable, lock, unlock } from '@theia/core/lib/browser';
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
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { NotebookContextManager } from './service/notebook-context-manager';
import { NotebookViewportService } from './view/notebook-viewport-service';
import { NotebookCellCommands } from './contributions/notebook-cell-actions-contribution';
const PerfectScrollbar = require('react-perfect-scrollbar');

export const NotebookEditorWidgetContainerFactory = Symbol('NotebookEditorWidgetContainerFactory');

export function createNotebookEditorWidgetContainer(parent: interfaces.Container, props: NotebookEditorProps): interfaces.Container {
    const child = parent.createChild();

    child.bind(NotebookEditorProps).toConstantValue(props);

    child.bind(NotebookContextManager).toSelf().inSingletonScope();
    child.bind(NotebookMainToolbarRenderer).toSelf().inSingletonScope();
    child.bind(NotebookCellToolbarFactory).toSelf().inSingletonScope();
    child.bind(NotebookCodeCellRenderer).toSelf().inSingletonScope();
    child.bind(NotebookMarkdownCellRenderer).toSelf().inSingletonScope();
    child.bind(NotebookViewportService).toSelf().inSingletonScope();

    child.bind(NotebookEditorWidget).toSelf();

    return child;
}

export const NotebookEditorProps = Symbol('NotebookEditorProps');

interface RenderMessage {
    rendererId: string;
    message: unknown;
}

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

    @inject(NotebookContextManager)
    protected notebookContextManager: NotebookContextManager;

    @inject(NotebookCodeCellRenderer)
    protected codeCellRenderer: NotebookCodeCellRenderer;
    @inject(NotebookMarkdownCellRenderer)
    protected markdownCellRenderer: NotebookMarkdownCellRenderer;
    @inject(NotebookEditorProps)
    protected readonly props: NotebookEditorProps;

    @inject(NotebookViewportService)
    protected readonly viewportService: NotebookViewportService;

    protected readonly onDidChangeModelEmitter = new Emitter<void>();
    readonly onDidChangeModel = this.onDidChangeModelEmitter.event;

    protected readonly onDidChangeReadOnlyEmitter = new Emitter<boolean | MarkdownString>();
    readonly onDidChangeReadOnly = this.onDidChangeReadOnlyEmitter.event;

    protected readonly onPostKernelMessageEmitter = new Emitter<unknown>();
    readonly onPostKernelMessage = this.onPostKernelMessageEmitter.event;

    protected readonly onDidPostKernelMessageEmitter = new Emitter<unknown>();
    readonly onDidPostKernelMessage = this.onDidPostKernelMessageEmitter.event;

    protected readonly onPostRendererMessageEmitter = new Emitter<RenderMessage>();
    readonly onPostRendererMessage = this.onPostRendererMessageEmitter.event;

    protected readonly onDidReceiveKernelMessageEmitter = new Emitter<unknown>();
    readonly onDidRecieveKernelMessage = this.onDidReceiveKernelMessageEmitter.event;

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

        this.scrollOptions = {
            suppressScrollY: true
        };

        this.title.closable = true;
        this.update();

        this.toDispose.push(this.onDidChangeModelEmitter);
        this.toDispose.push(this.onDidChangeReadOnlyEmitter);

        this.renderers.set(CellKind.Markup, this.markdownCellRenderer);
        this.renderers.set(CellKind.Code, this.codeCellRenderer);
        this._ready.resolve(this.waitForData());
        this.ready.then(model => {
            if (model.cells.length === 1 && model.cells[0].source === '') {
                this.commandRegistry.executeCommand(NotebookCellCommands.EDIT_COMMAND.id, model, model.cells[0]);
                model.setSelectedCell(model.cells[0]);
            }
        });
    }

    protected async waitForData(): Promise<NotebookModel> {
        this._model = await this.props.notebookData;
        this.saveable.delegate = this._model;
        this.toDispose.push(this._model);
        this.toDispose.push(this._model.onDidChangeReadOnly(readOnly => {
            if (readOnly) {
                lock(this.title);
            } else {
                unlock(this.title);
            }
            this.onDidChangeReadOnlyEmitter.fire(readOnly);
            this.update();
        }));
        if (this._model.readOnly) {
            lock(this.title);
        }
        // Ensure that the model is loaded before adding the editor
        this.notebookEditorService.addNotebookEditor(this);
        this.update();
        this.notebookContextManager.init(this);
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
        return this.model?.uri.withPath(resourceUri.path);
    }

    undo(): void {
        this._model?.undo();
    }

    redo(): void {
        this._model?.redo();
    }

    protected render(): ReactNode {
        if (this._model) {
            return <div className='theia-notebook-main-container'>
                {this.notebookMainToolbarRenderer.render(this._model, this.node)}
                <div className='theia-notebook-viewport' ref={(ref: HTMLDivElement) => this.viewportService.viewportElement = ref}>
                    <PerfectScrollbar className='theia-notebook-scroll-container'
                        onScrollY={(e: HTMLDivElement) => this.viewportService.onScroll(e)}>
                        <NotebookCellListView renderers={this.renderers}
                            notebookModel={this._model}
                            toolbarRenderer={this.cellToolbarFactory}
                            commandRegistry={this.commandRegistry} />
                    </PerfectScrollbar>
                </div>
            </div >;
        } else {
            return <div></div>;
        }
    }

    protected override onCloseRequest(msg: Message): void {
        super.onCloseRequest(msg);
        this.notebookEditorService.removeNotebookEditor(this);
    }

    postKernelMessage(message: unknown): void {
        this.onDidPostKernelMessageEmitter.fire(message);
    }

    postRendererMessage(rendererId: string, message: unknown): void {
        this.onPostRendererMessageEmitter.fire({ rendererId, message });
    }

    recieveKernelMessage(message: unknown): void {
        this.onDidReceiveKernelMessageEmitter.fire(message);
    }

    override dispose(): void {
        this.notebookContextManager.dispose();
        this.onDidChangeModelEmitter.dispose();
        this.onDidPostKernelMessageEmitter.dispose();
        this.onDidReceiveKernelMessageEmitter.dispose();
        this.onPostRendererMessageEmitter.dispose();
        this.viewportService.dispose();
        super.dispose();
    }

    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.notebookEditorService.notebookEditorFocusChanged(this, true);
    }

    protected override onAfterHide(msg: Message): void {
        super.onAfterHide(msg);
        this.notebookEditorService.notebookEditorFocusChanged(this, false);
    }
}
