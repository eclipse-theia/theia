// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Disposable } from './disposable';

export interface Middleware<P extends object = any> {
    (params: P, next: (error?: Error) => void): void
}

export interface Handler<T, P extends object = any> {
    (params: P, accept: () => T, next: (error?: Error) => void): void
}

export interface Router<T, P extends object = any> {
    route(params: P, accepted: () => T, unhandled: (error?: Error) => void): void
}

/**
 * A broker first runs all middlewares, then runs handlers in sequence until
 * one accepts the value being dispatched and stops.
 *
 * Brokers usually are routers.
 */
export interface Broker<T, P extends object = any> {
    use(middleware: Middleware<P>): Disposable
    listen(handler: Handler<T, P>): Disposable
}

export class DefaultRouter<T, P extends object = any> implements Router<T, P>, Broker<T, P> {

    protected middlewares = new Set<Middleware<P>>();
    protected handlers = new Set<Handler<T, P>>();

    use(middleware: Middleware<P>): Disposable {
        this.middlewares.add(middleware);
        return { dispose: () => this.middlewares.delete(middleware) };
    }

    listen(handler: Handler<T, P>): Disposable {
        this.handlers.add(handler);
        return { dispose: () => this.handlers.delete(handler) };
    }

    route(params: P, accepted: () => T, unhandled: (error?: Error) => void): void {
        this.runMiddlewares(params, error => {
            if (error) {
                unhandled(error);
            } else {
                this.runHandlers(params, accepted, unhandled);
            }
        });
    }

    protected runMiddlewares(params: P, done: (error?: Error) => void): void {
        const iterator = this.middlewares.values();
        const run = async () => {
            const result = iterator.next();
            if (result.done) {
                return done();
            }
            const settle = this.createSettleFunction();
            const next = (error?: Error) => {
                settle();
                if (error) {
                    done(error);
                } else {
                    queueMicrotask(run);
                }
            };
            try {
                await Promise.resolve(result.value(params, next));
            } catch (error) {
                console.error(error);
                next(error);
            }
        };
        run();
    }

    protected runHandlers(params: P, accepted: () => T, unhandled: (error?: Error) => void): void {
        const iterator = this.handlers.values();
        const run = async () => {
            const result = iterator.next();
            if (result.done) {
                return unhandled();
            }
            const settle = this.createSettleFunction();
            const accept = () => {
                settle();
                return accepted();
            };
            const next = (error?: Error) => {
                settle();
                if (error) {
                    unhandled(error);
                } else {
                    queueMicrotask(run);
                }
            };
            try {
                await Promise.resolve(result.value(params, accept, next));
            } catch (error) {
                console.error(error);
                next(); // ignore error and continue
            }
        };
        run();
    }

    protected createSettleFunction(): () => void {
        let settled = false;
        return () => {
            if (settled) {
                throw new Error('cannot call this callback anymore!');
            }
            settled = true;
        };
    }
}
