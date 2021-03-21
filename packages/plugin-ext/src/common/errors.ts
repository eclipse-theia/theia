/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

export function illegalArgument(message?: string): Error {
    if (message) {
        return new Error(`Illegal argument: ${message}`);
    } else {
        return new Error('Illegal argument');
    }
}

export function readonly(name?: string): Error {
    if (name) {
        return new Error(`readonly property '${name} cannot be changed'`);
    } else {
        return new Error('readonly property cannot be changed');
    }
}

export function disposed(what: string): Error {
    const result = new Error(`${what} has been disposed`);
    result.name = 'DISPOSED';
    return result;
}
