// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { interfaces } from 'inversify';
import { ContributionFilterRegistry } from './contribution-filter';

export const ContributionProvider = Symbol('ContributionProvider');

export interface ContributionProvider<T extends object> {

    /**
     * @param recursive `true` if the contributions should be collected from the parent containers as well. Otherwise, `false`. It is `false` by default.
     */
    getContributions(recursive?: boolean): T[]
}

class ContainerBasedContributionProvider<T extends object> implements ContributionProvider<T> {

    protected services: T[] | undefined;
    protected container: interfaces.Container | undefined;

    constructor(
        protected readonly serviceIdentifier: interfaces.ServiceIdentifier<T>,
        container: interfaces.Container
    ) {
        this.container = container;
    }

    getContributions(recursive?: boolean): T[] {
        if (this.services === undefined) {
            const currentServices: T[] = [];
            let filterRegistry: ContributionFilterRegistry | undefined;
            let currentContainer = this.container;
            while (currentContainer) {
                if (currentContainer.isBound(this.serviceIdentifier)) {
                    try {
                        currentServices.push(...currentContainer.getAll(this.serviceIdentifier));
                    } catch (error) {
                        console.error(error);
                    }
                }
                if (filterRegistry === undefined && currentContainer.isBound(ContributionFilterRegistry)) {
                    filterRegistry = currentContainer.get(ContributionFilterRegistry);
                }
                currentContainer = recursive === true ? currentContainer.parent ?? undefined : undefined;
            }

            this.services = filterRegistry ? filterRegistry.applyFilters(currentServices, this.serviceIdentifier) : currentServices;
            this.container = undefined;
        }
        return this.services;
    }
}

export type Bindable = interfaces.Bind | interfaces.Container;
export namespace Bindable {
    export function isContainer(arg: Bindable): arg is interfaces.Container {
        return typeof arg !== 'function'
            // https://github.com/eclipse-theia/theia/issues/3204#issue-371029654
            // In InversifyJS `4.14.0` containers no longer have a property `guid`.
            && ('guid' in arg || 'parent' in arg);
    }
}

/**
 * Binds a {@link ContributionProvider} for the given service identifier.
 *
 * **In most cases, prefer {@link bindRootContributionProvider} instead.** This variant retains a reference
 * to whichever container first resolves the provider. If that container is a short-lived child (e.g. a widget
 * container), the provider will keep the child — and everything cached in it — alive for the lifetime of the
 * application, causing a memory leak.
 *
 * Use `bindContributionProvider` only when you are certain that some or all of the relevant services are
 * scoped to a child container rather than the root container — for example, inside a
 * {@link ConnectionContainerModule} (connection-scoped child containers).
 *
 * @param bindable - A `Container` or `Bind` function to register the provider in.
 * @param id - The service identifier symbol whose contributions the provider collects.
 */
export function bindContributionProvider(bindable: Bindable, id: symbol): void {
    const bindingToSyntax = (Bindable.isContainer(bindable) ? bindable.bind(ContributionProvider) : bindable(ContributionProvider));
    bindingToSyntax
        .toDynamicValue(ctx => new ContainerBasedContributionProvider(id, ctx.container))
        .inSingletonScope().whenTargetNamed(id);
}

/**
 * Binds a {@link ContributionProvider} for the given service identifier, resolving contributions
 * from the **root** (top-level) Inversify container.
 *
 * **This is the recommended default** for binding contribution providers in module-level `ContainerModule`
 * definitions. It walks up from whichever container first resolves the provider to the root container,
 * ensuring the provider does not permanently retain a reference to a short-lived child container.
 *
 * Use this function when contributions are registered at the application level (the common case for
 * `FrontendApplicationContribution`, `CommandContribution`, `MenuContribution`, `KeybindingContribution`,
 * and similar top-level contribution points).
 *
 * If you need contributions that are scoped to a child container (e.g. connection-scoped), use {@link bindContributionProvider} instead.
 *
 * See {@link https://github.com/eclipse-theia/theia/issues/10877#issuecomment-1107000223}
 *
 * @param bindable - A `Container` or `Bind` function to register the provider in.
 * @param id - The service identifier symbol whose contributions the provider collects.
 */
export function bindRootContributionProvider(bindable: Bindable, id: symbol): void {
    const bindingToSyntax = (Bindable.isContainer(bindable) ? bindable.bind(ContributionProvider) : bindable(ContributionProvider));
    bindingToSyntax
        .toDynamicValue(ctx => {
            let container = ctx.container;
            while (container.parent) {
                container = container.parent;
            }
            return new ContainerBasedContributionProvider(id, container);
        })
        .inSingletonScope().whenTargetNamed(id);
}

/**
 * Helper function to bind a service to a list of contributions easily.
 * @param bindable a Container or the bind function directly.
 * @param service an already bound service to refer the contributions to.
 * @param contributions array of contribution identifiers to bind the service to.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function bindContribution(bindable: Bindable, service: interfaces.ServiceIdentifier<any>, contributions: interfaces.ServiceIdentifier<any>[]): void {
    const bind: interfaces.Bind = Bindable.isContainer(bindable) ? bindable.bind.bind(bindable) : bindable;
    for (const contribution of contributions) {
        bind(contribution).toService(service);
    }
}
