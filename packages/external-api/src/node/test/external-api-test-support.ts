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

import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import * as express from '@theia/core/shared/express';
import { ExternalApiContribution } from '../external-api-contribution';
import { ExternalApiEventStream, ExternalApiEventStreamFactory, ExternalApiEventStreamImpl, ExternalApiEventStreamOptions } from '../external-api-event-stream';
import { ExternalApiResponseWriter } from '../external-api-response-writer';
import { ExternalApiRouter, ExternalApiRouterFactory, ExternalApiRouterImpl } from '../external-api-router';

function assign(target: object, property: string, value: unknown): void {
    (target as Record<string, unknown>)[property] = value;
}

/**
 * Wires the external API endpoint infrastructure for tests, without a DI container.
 */
export namespace ExternalApiTestSupport {

    /** Creates an event stream factory backed by a mock logger. */
    export function createEventStreamFactory(): ExternalApiEventStreamFactory {
        return <T>(options: ExternalApiEventStreamOptions<T>): ExternalApiEventStream<T> => {
            const stream = new ExternalApiEventStreamImpl<T>();
            assign(stream, 'logger', new MockLogger());
            assign(stream, 'options', options);
            return stream;
        };
    }

    /** Creates a router factory backed by a mock logger and the default response writer. */
    export function createRouterFactory(): ExternalApiRouterFactory {
        return options => {
            const router = new ExternalApiRouterImpl();
            assign(router, 'logger', new MockLogger());
            assign(router, 'options', options);
            assign(router, 'responseWriter', new ExternalApiResponseWriter());
            assign(router, 'eventStreamFactory', createEventStreamFactory());
            return router;
        };
    }

    /**
     * Configures the contribution on the given express application the way the external API
     * server does — mounted at the contribution's path, with the fallback error handling,
     * but without token verification. An `isAuthorized` check may be given to test the
     * `authorized` flag of typed route requests. Returns the contribution's router, e.g. to
     * dispose it as a routing rebuild would.
     */
    export function mountContribution(app: express.Application, contribution: ExternalApiContribution,
        isAuthorized?: (request: express.Request) => boolean): ExternalApiRouter {
        const router = express.Router();
        const contributionRouter = createRouterFactory()({ contributionPath: contribution.path, router, isAuthorized });
        contribution.configure(contributionRouter);
        contributionRouter.finalize();
        app.use(contribution.path, router);
        return contributionRouter;
    }

    /** Incrementally reads server-sent events from a fetch response. */
    export interface SseReader {
        /** The next event block, without its trailing blank line; `undefined` once the stream ends. */
        next(): Promise<string | undefined>;
        cancel(): Promise<void>;
    }

    /** Creates an {@link SseReader} on the body of a fetch response. */
    export function sseReader(response: Response): SseReader {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffered = '';
        return {
            async next(): Promise<string | undefined> {
                for (;;) {
                    const separator = buffered.indexOf('\n\n');
                    if (separator >= 0) {
                        const event = buffered.substring(0, separator);
                        buffered = buffered.substring(separator + 2);
                        return event;
                    }
                    const { done, value } = await reader.read();
                    if (done) {
                        return undefined;
                    }
                    buffered += decoder.decode(value, { stream: true });
                }
            },
            cancel: () => reader.cancel()
        };
    }
}
