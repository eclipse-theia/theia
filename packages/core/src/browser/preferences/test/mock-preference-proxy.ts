/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { Emitter } from '../../../common';
import { PreferenceChange } from '../preference-service';

// tslint:disable:no-any
export function createMockPreferenceProxy(preferences: { [p: string]: any }) {
    const unsupportedOperation = (_: any, __: string) => {
        throw new Error('Unsupported operation');
    };
    return new Proxy({}, {
        get: (_, property: string) => {
            if (property === 'onPreferenceChanged') {
                return new Emitter<PreferenceChange>().event;
            }
            if (property === 'dispose') {
                return () => { };
            }
            if (property === 'ready') {
                return Promise.resolve();
            }
            if (preferences[property] !== undefined && preferences[property] !== null) {
                return preferences[property];
            }
            return undefined;
        },
        ownKeys: () => [],
        getOwnPropertyDescriptor: (_, property: string) => ({}),
        set: unsupportedOperation,
        deleteProperty: unsupportedOperation,
        defineProperty: unsupportedOperation
    });
}
