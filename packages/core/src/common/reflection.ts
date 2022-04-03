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

import { injectable } from 'inversify';
import { serviceIdentifier } from './types';

export const Reflection = serviceIdentifier<Reflection>('Reflection');
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

@injectable()
export class DefaultReflection implements Reflection {

    isEventName(name: string): boolean {
        return /^on[A-Z]/.test(name);
    }

    getEventNames(instance: object): Set<string> {
        if (typeof instance !== 'object') {
            throw new TypeError('instance is not an object!');
        }
        // Start with the passed instance, then recursively get methods of parent prototypes
        const events = new Set<string>();
        let current: object | null = instance;
        do {
            for (const property of Object.getOwnPropertyNames(current)) {
                if (this.isEventName(property) && typeof (instance as any)[property] === 'function') {
                    events.add(property);
                }
            }
        } while (
            current = Object.getPrototypeOf(current)
        );
        return events;
    }
}
