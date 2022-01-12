/********************************************************************************
 * Copyright (C) 2022 TypeFox and others.
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

export type VSXExtensionVersion = number[];

export function parseVersion(versionString: string): VSXExtensionVersion | undefined {
    const array = versionString.split('.').map(e => Number(e));
    return array.some(isNaN) ? undefined : array;
}

export function compareVersion(a: VSXExtensionVersion, b: VSXExtensionVersion): (-1 | 0 | 1) {
    const length = Math.max(a.length, b.length);
    if (length > b.length) {
        b = b.concat(new Array(length - b.length).fill(0));
    } else if (length > a.length) {
        a = a.concat(new Array(length - a.length).fill(0));
    }
    for (let i = 0; i < length; i++) {
        const aPart = a[i];
        const bPart = b[i];
        if (aPart > bPart) {
            return 1;
        } else if (aPart < bPart) {
            return -1;
        }
    }
    return 0;
}
