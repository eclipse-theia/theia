// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { LanguageModelStreamResponsePart } from '@theia/ai-core';
import { Disposable, DisposableCollection } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';

type IterResult = IteratorResult<LanguageModelStreamResponsePart>;

/**
 * Base class for async iterators that deliver {@link LanguageModelStreamResponsePart}s produced
 * asynchronously from some upstream source. It implements the producer/consumer queue: subclasses
 * push parts via {@link handleIncoming} as they arrive and signal completion by setting
 * {@link terminalError} (for failures) and/or calling {@link dispose}. Parts produced before the
 * consumer asks for them are buffered, and requests made before parts are available are queued.
 */
export abstract class AbstractStreamingResponseIterator implements AsyncIterableIterator<LanguageModelStreamResponsePart>, Disposable {
    protected readonly requestQueue = new Array<Deferred<IterResult>>();
    protected readonly messageCache = new Array<LanguageModelStreamResponsePart>();
    protected done = false;
    protected terminalError: Error | undefined = undefined;
    protected readonly toDispose = new DisposableCollection();

    [Symbol.asyncIterator](): AsyncIterableIterator<LanguageModelStreamResponsePart> {
        return this;
    }

    next(): Promise<IterResult> {
        if (this.messageCache.length && this.requestQueue.length) {
            throw new Error('Assertion error: cache and queue should not both be populated.');
        }
        // Deliver all the messages we got, even if we've since terminated.
        if (this.messageCache.length) {
            return Promise.resolve({ done: false, value: this.messageCache.shift()! });
        } else if (this.terminalError) {
            return Promise.reject(this.terminalError);
        } else if (this.done) {
            return Promise.resolve({ done: true, value: undefined });
        } else {
            const toQueue = new Deferred<IterResult>();
            this.requestQueue.push(toQueue);
            return toQueue.promise;
        }
    }

    protected handleIncoming(message: LanguageModelStreamResponsePart): void {
        if (this.messageCache.length && this.requestQueue.length) {
            throw new Error('Assertion error: cache and queue should not both be populated.');
        }
        if (this.requestQueue.length) {
            this.requestQueue.shift()!.resolve({ done: false, value: message });
        } else {
            this.messageCache.push(message);
        }
    }

    dispose(): void {
        this.done = true;
        this.toDispose.dispose();
        // No more messages will arrive; resolve or reject any outstanding requests.
        if (this.terminalError) {
            this.requestQueue.forEach(request => request.reject(this.terminalError));
        } else {
            this.requestQueue.forEach(request => request.resolve({ done: true, value: undefined }));
        }
        // Leave the message cache intact: if it is populated the request queue was empty, and we
        // still want to deliver those messages when asked.
        this.requestQueue.length = 0;
    }
}
