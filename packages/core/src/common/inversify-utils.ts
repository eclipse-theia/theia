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

export function collectRecursive<T>(container: interfaces.Container, collect: (container: interfaces.Container) => T[]): T[] {
    let result: T[] = [];
    let current: interfaces.Container | null = container;
    do {
        result = result.concat(collect(current));
    } while (
        current = current.parent
    );
    return result;
}
