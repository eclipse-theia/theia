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
import { ExternalApiResponseWriterImpl } from '../external-api-response-writer';
import { ExternalApiRouter, ExternalApiRouterFactory, ExternalApiRouterImpl } from '../external-api-router';

/**
 * Wires the external API endpoint infrastructure for tests, without a DI container.
 */
export namespace ExternalApiTestSupport {

    /**
     * Assigns the injected fields of a service instance, standing in for the DI container.
     * The field names are not type-checked, as the injected fields are `protected`.
     */
    export function inject<T extends object>(target: T, fields: Record<string, unknown>): T {
        Object.assign(target, fields);
        return target;
    }

    /** Creates an event stream factory backed by a mock logger. */
    export function createEventStreamFactory(): ExternalApiEventStreamFactory {
        return <T>(options: ExternalApiEventStreamOptions<T>): ExternalApiEventStream<T> =>
            inject(new ExternalApiEventStreamImpl<T>(), {
                logger: new MockLogger(),
                options
            });
    }

    /** Creates a router factory backed by a mock logger and the default response writer. */
    export function createRouterFactory(): ExternalApiRouterFactory {
        return options => inject(new ExternalApiRouterImpl(), {
            logger: new MockLogger(),
            options,
            responseWriter: new ExternalApiResponseWriterImpl(),
            eventStreamFactory: createEventStreamFactory()
        });
    }

    /**
     * Configures the contribution on the given express application the way the external API
     * server does, i.e. mounted at the contribution's path, with the fallback error handling,
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
