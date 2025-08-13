// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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

import { interfaces, Container } from 'inversify';

/**
 * This utility creates a factory function that accepts runtime arguments which are bound as constant
 * values in a child container, allowing for dependency injection of both static dependencies
 * (resolved as usual from the factory's container) and dynamic parameters (provided at factory invocation time).
 *
 * @example
 * ```typescript
 * // Factory interface
 * interface UserPreferenceProviderFactory {
 *     (uri: URI, section: string): UserPreferenceProvider;
 * }
 * // Factory symbol
 * const UserPreferenceProviderFactory = Symbol('UserPreferenceProviderFactory');
 *
 * // Bind the factory
 * bindFactory(
 *     bind,
 *     UserPreferenceProviderFactory,   // Service identifier of the factory
 *     UserPreferenceProvider,          // Service identifier of the entity to be constructed
 *     SectionPreferenceProviderUri,    // The first factory argument will be bound to this identifier (uri)
 *     SectionPreferenceProviderSection // The second factory argument will be bound to this identifier  (section)
 * );
 *
 * // Usage: factory(uri, section) creates UserPreferenceProvider with injected dependencies
 * const factory = container.get(UserPreferenceProviderFactory);
 * const provider = factory(myUri, 'settings');
 * ```
 */

export function bindFactory<F, C>(bind: interfaces.Bind,
    factoryId: interfaces.ServiceIdentifier<F>,
    constructor: interfaces.Newable<C>,
    ...parameterBindings: interfaces.ServiceIdentifier<unknown>[]): void {
    bind(factoryId).toFactory(ctx =>
        (...args: unknown[]) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            for (let i = 0; i < parameterBindings.length; i++) {
                child.bind(parameterBindings[i]).toConstantValue(args[i]);
            }
            child.bind(constructor).to(constructor);
            return child.get(constructor);
        }
    );
}
