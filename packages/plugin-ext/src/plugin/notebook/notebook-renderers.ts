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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookRenderersExt, NotebookRenderersMain, PLUGIN_RPC_CONTEXT } from '../../common';
import { RPCProtocol } from '../../common/rpc-protocol';
import { NotebooksExtImpl } from './notebooks';
import * as theia from '@theia/plugin';
import { NotebookEditor } from './notebook-editor';
import { Emitter } from '@theia/core';

export class NotebookRenderersExtImpl implements NotebookRenderersExt {
    private readonly rendererMessageEmitters = new Map<string /* rendererId */, Emitter<{ editor: theia.NotebookEditor; message: unknown }>>();
    private readonly proxy: NotebookRenderersMain;

    constructor(rpc: RPCProtocol, private readonly notebooksExt: NotebooksExtImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.NOTEBOOK_RENDERERS_MAIN);
    }

    public $postRendererMessage(editorId: string, rendererId: string, message: unknown): void {
        const editor = this.notebooksExt.getEditorById(editorId);
        this.rendererMessageEmitters.get(rendererId)?.fire({ editor: editor.apiEditor, message });
    }

    public createRendererMessaging(rendererId: string): theia.NotebookRendererMessaging {

        const messaging: theia.NotebookRendererMessaging = {
            onDidReceiveMessage: (listener, thisArg, disposables) => this.getOrCreateEmitterFor(rendererId).event(listener, thisArg, disposables),
            postMessage: (message, editorOrAlias) => {
                const extHostEditor = editorOrAlias && NotebookEditor.apiEditorsToExtHost.get(editorOrAlias);
                return this.proxy.$postMessage(extHostEditor?.id, rendererId, message);
            },
        };

        return messaging;
    }

    private getOrCreateEmitterFor(rendererId: string): Emitter<{ editor: theia.NotebookEditor, message: unknown }> {
        let emitter = this.rendererMessageEmitters.get(rendererId);
        if (emitter) {
            return emitter;
        }

        emitter = new Emitter({
            onLastListenerRemove: () => {
                emitter?.dispose();
                this.rendererMessageEmitters.delete(rendererId);
            }
        });

        this.rendererMessageEmitters.set(rendererId, emitter);

        return emitter;
    }
}
