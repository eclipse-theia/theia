// *****************************************************************************
// Copyright (C) 2023 Red Hat, Inc. and others.
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

import { Disposable, URI } from '@theia/core';
import { Emitter } from '@theia/core/shared/vscode-languageserver-protocol';
import { Saveable, SaveOptions } from '@theia/core/lib/browser';
import { CellDto, NotebookData } from '../../common';
import { NotebookSerializer } from '../service/notebook-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';

export class NotebookModel implements Saveable, Disposable {

    private readonly dirtyChangedEmitter = new Emitter<void>();
    readonly onDirtyChanged = this.dirtyChangedEmitter.event;

    private readonly saveEmitter = new Emitter<void>();
    readonly onDidSaveNotebook = this.dirtyChangedEmitter.event;

    readonly autoSave: 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';

    dirty: boolean;
    private dirtyCells: CellDto[] = [];

    constructor(public data: NotebookData,
        public uri: URI,
        public viewType: string,
        private serializer: NotebookSerializer,
        private fileService: FileService) {
        this.dirty = false;
    }

    dispose(): void {

    }

    async save(options: SaveOptions): Promise<void> {
        this.dirtyCells = [];

        const serializedNotebook = await this.serializer.notebookToData(this.data);
        this.fileService.writeFile(this.uri, serializedNotebook);

        this.saveEmitter.fire();
    }

    isDirty(): boolean {
        return this.dirty;
    }

    cellDirtyChanged(cell: CellDto, dirtyState: boolean): void {
        if (dirtyState) {
            this.dirtyCells.push(cell);
        } else {
            this.dirtyCells.splice(this.dirtyCells.indexOf(cell), 1);
        }

        const oldDirtyState = this.dirty;
        this.dirty = this.dirtyCells.length > 0;
        if (this.dirty !== oldDirtyState) {
            this.dirtyChangedEmitter.fire();
        }
    }

}
