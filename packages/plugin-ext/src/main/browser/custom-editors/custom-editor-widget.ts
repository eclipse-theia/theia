/********************************************************************************
 * Copyright (c) 2021 SAP SE or an SAP affiliate company and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { FileOperation } from '@theia/filesystem/lib/common/files';
import { NavigatableWidget, Saveable, SaveableSource, SaveOptions } from '@theia/core/lib/browser';
import { Reference } from '@theia/core/lib/common/reference';
import { WebviewWidget } from '../webview/webview';
import { UndoRedoService } from './undo-redo-service';
import { CustomEditorModel } from './custom-editors-main';

@injectable()
export class CustomEditorWidget extends WebviewWidget implements SaveableSource, NavigatableWidget {
    static FACTORY_ID = 'plugin-custom-editor';

    id: string;
    resource: URI;

    protected _modelRef: Reference<CustomEditorModel>;
    get modelRef(): Reference<CustomEditorModel> {
        return this._modelRef;
    }
    set modelRef(modelRef: Reference<CustomEditorModel>) {
        this._modelRef = modelRef;
        this.doUpdateContent();
        Saveable.apply(this);
    }
    get saveable(): Saveable {
        return this._modelRef.object;
    }

    @inject(UndoRedoService)
    protected readonly undoRedoService: UndoRedoService;

    @postConstruct()
    protected init(): void {
        super.init();
        this.id = CustomEditorWidget.FACTORY_ID + ':' + this.identifier.id;
        this.toDispose.push(this.fileService.onDidRunOperation(e => {
            if (e.isOperation(FileOperation.MOVE)) {
                this.doMove(e.target.resource);
            }
        }));
    }

    undo(): void {
        this.undoRedoService.undo(this.resource);
    }

    redo(): void {
        this.undoRedoService.redo(this.resource);
    }

    async save(options?: SaveOptions): Promise<void> {
        await this._modelRef.object.saveCustomEditor(options);
    }

    async saveAs(source: URI, target: URI, options?: SaveOptions): Promise<void> {
        const result = await this._modelRef.object.saveCustomEditorAs(source, target, options);
        this.doMove(target);
        return result;
    }

    getResourceUri(): URI | undefined {
        return this.resource;
    }

    createMoveToUri(resourceUri: URI): URI | undefined {
        return this.resource.withPath(resourceUri.path);
    }

    storeState(): CustomEditorWidget.State {
        return {
            ...super.storeState(),
            strResource: this.resource.toString(),
        };
    }

    restoreState(oldState: CustomEditorWidget.State): void {
        const { strResource } = oldState;
        this.resource = new URI(strResource);
        super.restoreState(oldState);
    }

    onMove(handler: (newResource: URI) => Promise<void>): void {
        this._moveHandler = handler;
    }

    private _moveHandler?: (newResource: URI) => void;

    private doMove(target: URI): void {
        if (this._moveHandler) {
            this._moveHandler(target);
        }
    }
}

export namespace CustomEditorWidget {
    export interface State extends WebviewWidget.State {
        strResource: string
    }
}
