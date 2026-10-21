// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { CancellationError, CancellationToken, isObject } from '@theia/core';
import { timeout } from '@theia/core/lib/common/promise-util';

function streamError(event: unknown): Error | undefined {
    if (!isObject(event)) {
        return undefined;
    }
    const error = event.type === 'response.failed' && isObject(event.response) ? event.response.error
        : event.type === 'error' ? event : undefined;
    if (!isObject(error)) {
        return event.type === 'response.failed' ? new Error('OpenAI response failed.') : undefined;
    }
    return Object.assign(new Error(typeof error.message === 'string' ? error.message : 'OpenAI response failed.'), {
        code: error.code,
        type: error.type === 'error' ? undefined : error.type,
        param: error.param
    });
}

function isTransientStreamError(error: unknown): boolean {
    if (!isObject(error)) {
        return false;
    }
    if (error.code === 'insufficient_quota' || error.code === 'billing_hard_limit_reached') {
        return false;
    }
    if (typeof error.status === 'number') {
        return error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
    }
    const transientCodes = ['server_error', 'rate_limit_exceeded', 'overloaded_error', 'server_overloaded', 'engine_overloaded', 'model_overloaded'];
    return transientCodes.includes(String(error.code)) || transientCodes.includes(String(error.type))
        || (!error.code && !error.type && typeof error.message === 'string' && /\b(overloaded|too busy)\b/i.test(error.message));
}

/** Retries stream failures only before output/tool activity. Opening failures are already retried by the SDK. */
export async function* retryOpenAiStream<T>(
    open: (signal: AbortSignal) => Promise<AsyncIterable<T>>,
    maxRetries: number,
    canRetryAfter: (event: T) => boolean,
    cancellationToken: CancellationToken = CancellationToken.None
): AsyncIterable<T> {
    const controller = new AbortController();
    const listener = cancellationToken.onCancellationRequested(() => controller.abort());
    let retries = 0;
    let safeToRetry = true;
    try {
        while (true) {
            if (cancellationToken.isCancellationRequested) {
                throw new CancellationError();
            }
            // Keep this outside the catch: don't multiply the SDK's HTTP/connection retry budget.
            const stream = await open(controller.signal);
            try {
                for await (const event of stream) {
                    if (cancellationToken.isCancellationRequested) {
                        throw new CancellationError();
                    }
                    const error = streamError(event);
                    if (error) {
                        throw error;
                    }
                    safeToRetry = safeToRetry && canRetryAfter(event);
                    yield event;
                }
                if (cancellationToken.isCancellationRequested) {
                    throw new CancellationError();
                }
                return;
            } catch (error) {
                if (cancellationToken.isCancellationRequested) {
                    throw new CancellationError();
                }
                if (!safeToRetry || retries >= maxRetries || !isTransientStreamError(error)) {
                    throw error;
                }
                const delay = Math.min(500 * 2 ** retries++, 8000) * (1 - 0.25 * Math.random());
                await timeout(delay, cancellationToken);
            }
        }
    } catch (error) {
        if (cancellationToken.isCancellationRequested) {
            throw new CancellationError();
        }
        throw error;
    } finally {
        listener.dispose();
        controller.abort();
    }
}
