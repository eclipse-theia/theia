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

import { Emitter } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { Disposable } from '@theia/core/shared/vscode-languageserver-protocol';

interface MessageToSend {
    editorId: string;
    rendererId: string;
    message: unknown
};

export interface ScopedRendererMessaging extends Disposable {
    /**
     * Method called when a message is received. Should return a boolean
     * indicating whether a renderer received it.
     */
    receiveMessageHandler?: (rendererId: string, message: unknown) => Promise<boolean>;

    /**
     * Sends a message to an extension from a renderer.
     */
    postMessage(rendererId: string, message: unknown): void;
}

@injectable()
export class NotebookRendererMessagingService implements Disposable {

    private readonly postMessageEmitter = new Emitter<MessageToSend>();
    readonly onShouldPostMessage = this.postMessageEmitter.event;

    private readonly activations = new Map<string /* rendererId */, undefined | MessageToSend[]>();
    private readonly scopedMessaging = new Map<string /* editorId */, ScopedRendererMessaging>();

    receiveMessage(editorId: string | undefined, rendererId: string, message: unknown): Promise<boolean> {
        if (editorId === undefined) {
            const sends = [...this.scopedMessaging.values()].map(e => e.receiveMessageHandler?.(rendererId, message));
            return Promise.all(sends).then(values => values.some(value => !!value));
        }

        return this.scopedMessaging.get(editorId)?.receiveMessageHandler?.(rendererId, message) ?? Promise.resolve(false);
    }

    prepare(rendererId: string): void {
        if (this.activations.has(rendererId)) {
            return;
        }

        const queue: MessageToSend[] = [];
        this.activations.set(rendererId, queue);

        // activate renderer
        // this.extensionService.activateByEvent(`onRenderer:${rendererId}`).then(() => {
        //     for (const message of queue) {
        //         this.postMessageEmitter.fire(message);
        //     }
        //     this.activations.set(rendererId, undefined);
        // });
    }

    public getScoped(editorId: string): ScopedRendererMessaging {
        const existing = this.scopedMessaging.get(editorId);
        if (existing) {
            return existing;
        }

        const messaging: ScopedRendererMessaging = {
            postMessage: (rendererId, message) => this.postMessage(editorId, rendererId, message),
            dispose: () => this.scopedMessaging.delete(editorId),
        };

        this.scopedMessaging.set(editorId, messaging);
        return messaging;
    }

    private postMessage(editorId: string, rendererId: string, message: unknown): void {
        if (!this.activations.has(rendererId)) {
            this.prepare(rendererId);
        }

        const activation = this.activations.get(rendererId);
        const toSend = { rendererId, editorId, message };
        if (activation === undefined) {
            this.postMessageEmitter.fire(toSend);
        } else {
            activation.push(toSend);
        }
    }

    dispose(): void {
        this.postMessageEmitter.dispose();
    }
}
