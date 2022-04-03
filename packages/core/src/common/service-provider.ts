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

import type { interfaces } from 'inversify';
import type Route = require('route-parser');
import { ContributionFilterRegistry } from './contribution-filter';
import { Disposable, DisposableCollection, Owned } from './disposable';
import { Emitter, Event } from './event';
import { collectRecursive, getOptional } from './inversify-utils';
import { Rc } from './reference-counter';
import { serviceIdentifier } from './types';

export type ServiceParams = Record<string, any>;
/**
 * Serialized version of {@link ServiceParams}, every value is a string.
 */
export type StringifiedParams<T extends ServiceParams> = { [K in keyof T]: string };

/**
 * Represents the `serviceId` string referencing a given service type `T`.
 * @template T the service type
 * @template P the parameters for the service
 */
export type ServicePath<T, P extends ServiceParams = any> = string & { __staticOnly: [T, P] & never };
export function servicePath<T, P extends ServiceParams = {}>(path: string): ServicePath<T, P> {
    return path as ServicePath<T, P>;
}

export interface ServiceRoute<T, P extends ServiceParams = any> {

    /**
     * Try to match {@link serviceId} and return the parsed parameters.
     * @param serviceId
     */
    match(serviceId: string): StringifiedParams<P> | false | null | undefined

    /**
     * Create an identifier matching this route according to {@link params}
     * @param params
     */
    resolve(params: P): string
}
export function serviceRoute(): void { }

/**
 * Call the `dispose` function when you no longer need the service. The service
 * may or may not be actually disposed, this will depend on how the service
 * contributions decided to handle the lifecycle of the provided service.
 */
export type ServiceResult<T> = [service: Owned<T> | undefined, dispose: () => void];
/**
 * Part of Theia's Service Layer.
 *
 * Whenever a remote wants to use a service over RPC, a request will go through the `ServiceProvider` to find the instance to proxy.
 */
export const ServiceProvider = serviceIdentifier<ServiceProvider>('ServiceProvider');
export interface ServiceProvider {
    getService<T extends object, P extends ServiceParams = any>(serviceId: string | ServicePath<T, P>, params?: StringifiedParams<P>): ServiceResult<T>;
}

export function bindServiceProvider(bind: interfaces.Bind, contributionName: string | number | symbol): void {
    bind(ServiceProvider)
        .toDynamicValue(ctx => {
            const contributionFilter = getOptional(ctx.container, ContributionFilterRegistry);
            const contributions = collectRecursive(
                ctx.container,
                container => container.isBoundNamed(ServiceContribution, contributionName),
                container => container.getAllNamed(ServiceContribution, contributionName)
            );
            return new DefaultServiceProvider(
                contributionFilter?.applyFilters(contributions, ServiceContribution) ?? contributions,
                ctx.container.get(Rc.Tracker)
            );
        })
        .inSingletonScope()
        .whenTargetNamed(contributionName);
}

/**
 * Part of Theia's Service Layer.
 *
 * Requested services to offer over RPC are fetched through a `ServiceProvider` that will source from `ServiceContribution` bindings.
 *
 * ## Usage Examples
 *
 * ### Record
 *
 * ```ts
 * bind(ServiceContribution)
 *     .toDynamicValue(ctx => ServiceContribution.record(
 *         [PATH1, () => ctx.container.get(Service1)],
 *         [PATH2, () => ctx.container.get(Service2)],
 *         [PATH3, params => ctx.container.get(params.yourParam ? Service3 : Service4)],
 *         // ...
 *     ))
 *     .inSingletonScope()
 *     .whenTargetNamed(YourServiceNamespace);
 * ```
 *
 * ### Function
 *
 * ```ts
 * bind(ServiceContribution)
 *     .toDynamicValue(ctx => (serviceId, params) => {
 *         // process arguments...
 *         return resolvedServiceOrUndefined;
 *     }))
 *     .inSingletonScope()
 *     .whenTargetNamed(YourServiceNamespace);
 * ```
 */
export type ServiceContribution = ServiceContributionFunction | ServiceContributionRecord;
/**
 * Handle to some lifecycle events for the given service.
 */
export interface ServiceLifecycle {
    /**
     * This event is fired when the caller wants to dispose of the service.
     */
    onDispose: Event<void>
    /**
     * Dispose of {@link disposable} when {@link onDispose} is fired.
     *
     * This method is reference-aware: it will only dispose the instance once
     * all references to it are disposed. You should not dispose the instance
     * yourself.
     */
    track<T extends Disposable>(disposable: T): Owned<Rc<T>>;
}
export type ServiceContributionFunction = (serviceId: string, params: any, lifecycle: ServiceLifecycle) => any;
export interface ServiceContributionRecord { [serviceId: string]: (params: any, lifecycle: ServiceLifecycle) => any };
/**
 * @internal
 *
 * This type allows {@link ServiceContribution.fromEntries} to provide accurate
 * typings when using {@link ServicePath} keys.
 */
export type ServiceContributionEntries<T extends string[]> = {
    [K in keyof T]: [
        T[K],
        T[K] extends ServicePath<infer S, infer P>
        ? ((params: P, lifecycle: ServiceLifecycle) => Owned<S>)
        : ((params: any, lifecycle: ServiceLifecycle) => any)
    ]
};
export namespace ServiceContributionApi {
    /**
     * TypeScript has trouble understanding object typings, but it seems to do fine
     * with this superb function. This function will ensure that given a
     * {@link ServicePath} the associated factory returns the right type.
     *
     * @example
     *
     * const id1 = servicePath<MyType>('/some/path/id1');
     * const id2 = servicePath<MyType>('/some/path/id2');
     * bind(ServiceContribution)
     *     .toDynamicValue(ctx => ServiceContribution.record(
     *         [id1, () => new MyType()], // OK
     *         [id2, () => 'wrong type: string'], // error: ts(2322)
     *         ['/arbitrary/string', () => new ArbitraryType()] // OK (anything would work)
     *     ))
     *     .inSingletonScope()
     *     .whenTargetNamed(...);
     */
    export function fromEntries<T extends string[]>(...entries: ServiceContributionEntries<T>): ServiceContributionRecord {
        const result: ServiceContributionRecord = {};
        entries.forEach(([key, value]) => result[key] = value);
        return result;
    }

    export function fromRoute<P extends ServiceParams>(
        route: Route<P>,
        handler: (matched: string, params: StringifiedParams<P>, lifecycle: ServiceLifecycle) => any
    ): ServiceContributionFunction {
        return (serviceId, params, lifecycle) => {
            const match = route.match(serviceId);
            if (match) {
                return handler(serviceId, match, lifecycle);
            }
        };
    }
}
export const ServiceContribution = Object.assign(
    serviceIdentifier<ServiceContribution>('ServiceContribution'),
    ServiceContributionApi
);

/**
 * @internal
 *
 * This implementation dispatches a service request to its service contributions.
 */
export class DefaultServiceProvider implements ServiceProvider {

    constructor(
        protected serviceContributions: ServiceContribution[],
        protected rcTracker: Rc.Tracker
    ) { }

    getService(serviceId: string, params = {}): [any, any] {
        for (const contribution of this.serviceContributions) {
            try {
                let service: any;
                const lifecycle = new ServiceLifecycleImpl(this.rcTracker);
                if (typeof contribution === 'function') {
                    service = contribution(serviceId, params, lifecycle);
                } else if (typeof contribution === 'object' && !Array.isArray(contribution)) {
                    service = contribution[serviceId]?.(params, lifecycle);
                } else {
                    console.error(`unexpected contribution type: ${typeof contribution}`);
                    continue;
                }
                if (service) {
                    return [service, () => { lifecycle.dispose(); }];
                }
                lifecycle.dispose();
            } catch (error) {
                console.error(error);
            }
        }
        throw new Error(`no service found for "${serviceId}"`);
    }
}

export class ServiceLifecycleImpl implements ServiceLifecycle, Disposable {

    protected disposables = new DisposableCollection();
    protected onDisposeEmitter = this.disposables.pushThru(new Emitter<void>());

    constructor(
        protected rcTracker: Rc.Tracker
    ) { }

    get onDispose(): Event<void> {
        return this.onDisposeEmitter.event;
    }

    track<T extends Disposable>(disposable: T): Owned<Rc<T>> {
        const rc = this.rcTracker.track(disposable);
        this.disposables.push(rc);
        return rc;
    }

    dispose(): void {
        this.disposables.dispose();
        this.onDisposeEmitter.fire();
    }
}
