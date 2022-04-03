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

import type { interfaces } from 'inversify';

export function getOptional<T>(container: interfaces.Container, serviceIdentifier: interfaces.ServiceIdentifier<T>): T | undefined {
    if (container.isBound(serviceIdentifier)) {
        return container.get(serviceIdentifier);
    }
}

export function getNamedOptional<T>(container: interfaces.Container, serviceIdentifier: interfaces.ServiceIdentifier<T>, name: string | number | symbol): T | undefined {
    if (container.isBoundNamed(serviceIdentifier, name)) {
        return container.getNamed(serviceIdentifier, name);
    }
}

export function getAllOptional<T>(container: interfaces.Container, serviceIdentifier: interfaces.ServiceIdentifier<T>): T[] {
    if (container.isBound(serviceIdentifier)) {
        return container.getAll(serviceIdentifier);
    }
    return [];
}

export function getAllNamedOptional<T>(container: interfaces.Container, serviceIdentifier: interfaces.ServiceIdentifier<T>, name: string | number | symbol): T[] {
    if (container.isBoundNamed(serviceIdentifier, name)) {
        return container.getAllNamed(serviceIdentifier, name);
    }
    return [];
}

/**
 * Go through the chain of parent containers while collecting bindings.
 * @param container
 * @param test Callback invoked while `container` is disconnected from its parent.
 * @param collect Callback invoked only if {@link test} returned `true`.
 */
export function collectRecursive<T>(
    container: interfaces.Container,
    test: (container: interfaces.Container) => boolean,
    collect: (container: interfaces.Container) => T[]
): T[] {
    const parent = container.parent;
    // eslint-disable-next-line no-null/no-null
    container.parent = null;
    const shouldCollect = test(container);
    container.parent = parent;
    const collected = shouldCollect ? collect(container) : [];
    if (parent) {
        return collected.concat(collectRecursive(parent, test, collect));
    }
    return collected;
}
