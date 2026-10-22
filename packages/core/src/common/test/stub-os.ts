// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import * as os from '../os.js';

export interface OSStub {
    /** Changes the value of the stubbed property. */
    value(value: boolean): OSStub;
    /** Restores the value the property had before it was stubbed. */
    restore(): void;
}

/**
 * Stubs `isWindows` or `isOSX` of the `os` module, similar to `sinon.stub(os, property).value(value)`,
 * which is not possible for the exports of ES modules.
 */
export function stubOS(property: 'isWindows' | 'isOSX', value: boolean): OSStub {
    const original = os[property];
    os.OS.override(property, value);
    const stub: OSStub = {
        value: newValue => {
            os.OS.override(property, newValue);
            return stub;
        },
        restore: () => os.OS.override(property, original)
    };
    return stub;
}
