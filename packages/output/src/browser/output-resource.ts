/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

import URI from '@theia/core/lib/common/uri';
import { Event, Resource, ResourceReadOptions, DisposableCollection, Emitter } from '@theia/core/lib/common';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { IReference } from '@theia/monaco/lib/browser/monaco-text-model-service';

export class OutputResource implements Resource {

    protected _textModel: monaco.editor.ITextModel | undefined;
    protected onDidChangeContentsEmitter = new Emitter<void>();
    protected toDispose = new DisposableCollection(
        this.onDidChangeContentsEmitter
    );

    constructor(readonly uri: URI, readonly editorModelRef: Deferred<IReference<MonacoEditorModel>>) {
        this.editorModelRef.promise.then(modelRef => {
            if (this.toDispose.disposed) {
                modelRef.dispose();
                return;
            }
            const textModel = modelRef.object.textEditorModel;
            this._textModel = textModel;
            this.toDispose.push(modelRef);
            this.toDispose.push(this._textModel!.onDidChangeContent(() => this.onDidChangeContentsEmitter.fire()));
        });
    }

    get textModel(): monaco.editor.ITextModel | undefined {
        return this._textModel;
    }

    get onDidChangeContents(): Event<void> {
        return this.onDidChangeContentsEmitter.event;
    }

    async readContents(options?: ResourceReadOptions): Promise<string> {
        if (this._textModel) {
            const modelRef = await this.editorModelRef.promise;
            return modelRef.object.textEditorModel.getValue();
        }
        return '';
    }

    dispose(): void {
        this.toDispose.dispose();
    }

}
