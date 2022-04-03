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

// eslint-disable-next-line spaced-comment
/// <reference types="reflect-metadata"/>

/* eslint-disable @typescript-eslint/no-explicit-any */

import { serviceIdentifier } from './types';

export interface Reflection {
    /**
     * Based solely on the property name return if it maps to an `Event`.
     */
    isEventName(name: string): boolean
    /**
     * Return all enumerable properties that appear to be events based on the name.
     * @param target instance or prototype to reflect on.
     */
    getEventNames(target: object): Set<string>
}
export namespace ReflectionApi {

    /**
     * @internal
     */
    export enum MetadataKeys {
        IGNORE = 'theia:rpc:ignore',
    }

    // #region decorators

    /**
     * Annotate a method or a property to be ignored by the reflection mechanism.
     */
    export function Ignore(): MethodDecorator | PropertyDecorator {
        return Reflect.metadata(MetadataKeys.IGNORE, true);
    }

    // #endregion
}
export const Reflection = Object.assign(
    serviceIdentifier<Reflection>('Reflection'),
    ReflectionApi
);

export class DefaultReflection implements Reflection {

    isEventName(name: string): boolean {
        return /^on[A-Z]/.test(name);
    }

    getEventNames(instance: object): Set<string> {
        // eslint-disable-next-line no-null/no-null
        if (typeof instance !== 'object' || instance === null) {
            throw new TypeError('instance is not an object!');
        }
        const events = new Set<string>();
        [instance, ...iterPrototypeChain(instance)].forEach(object => {
            Object.getOwnPropertyNames(object).forEach(propertyKey => {
                if (
                    this.isEventName(propertyKey)
                    && !Reflect.getOwnMetadata(Reflection.MetadataKeys.IGNORE, object, propertyKey)
                    && typeof (instance as any)[propertyKey] === 'function'
                ) {
                    events.add(propertyKey);
                }
            });
        });
        return events;
    }
}

export function* iterPrototypeChain(target: Object): IterableIterator<Object> {
    for (
        let prototype: Object = target instanceof Function
            // If target is a constructor, we start from its prototype:
            ? target.prototype
            // If target is either an instance or a prototype, this will always return the right prototype:
            : target.constructor.prototype;
        // eslint-disable-next-line no-null/no-null
        prototype !== Object.prototype && prototype !== null;
        prototype = Object.getPrototypeOf(prototype)
    ) {
        yield prototype;
    }
}
