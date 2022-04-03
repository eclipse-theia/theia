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

import * as Route from 'route-parser';
import { Handler } from './routing';
import { serviceIdentifier } from './types';

export type RouteMatch<T extends object> = {
    [K in keyof T]: string
};

export interface RouteMatcher<T extends object> {
    match(path: string): RouteMatch<T> | false | null | undefined
}

export interface RouteHandlerParams<P extends object> {
    params: RouteMatch<P>
}

/**
 * Utility to create {@link Handler}s that match a route like `/path/:param`.
 *
 * It will extract the path to match as `params.path`.
 */
export const RouteHandlerProvider = serviceIdentifier<RouteHandlerProvider>('RouteHandlerProvider');
export interface RouteHandlerProvider {
    createRouteHandler<T, P extends object = any>(spec: string, handler: Handler<T, { path: string, route: RouteHandlerParams<P> }>): Handler<T, { path?: string }>;
    createRouteHandler<T, P extends object = any>(route: RouteMatcher<P>, handler: Handler<T, { path: string, route: RouteHandlerParams<P> }>): Handler<T, { path?: string }>;
}

export class DefaultRouteHandlerProvider {

    createRouteHandler<T, P extends object = any>(
        specOrRoute: string | RouteMatcher<P>,
        handler: Handler<T, { path: string, route: RouteHandlerParams<P> }>
    ): Handler<T, { path?: string }> {
        const route = typeof specOrRoute === 'string'
            ? this.createRouteMatcher<P>(specOrRoute)
            : specOrRoute;
        return (params, accept, next) => {
            if (!this.paramsContainsPath(params)) {
                return next();
            }
            const routeParams = route.match(params.path);
            if (!routeParams) {
                return next();
            }
            handler({
                ...params,
                route: {
                    params: routeParams
                }
            }, accept, next);
        };
    }

    protected createRouteMatcher<P extends object>(spec: string): RouteMatcher<P> {
        return new Route(spec);
    }

    protected paramsContainsPath(params: any): params is { path: string } {
        return typeof params.path === 'string';
    }
}
