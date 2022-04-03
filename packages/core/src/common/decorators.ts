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

export function ThrowIfCalledTwice(message: string = 'you cannot call this method twice!'): MethodDecorator {
    return (target, propertyKey, descriptor) => {
        if (typeof descriptor.value !== 'function') {
            throw new Error('this decorator only works on methods!');
        }
        const method = descriptor.value;
        const called = new WeakSet<object>();
        const replaced = function (this: object, ...args: unknown[]): unknown {
            if (called.has(this)) {
                throw new Error(message);
            }
            called.add(this);
            return method.apply(this, args);
        };
        Object.defineProperty(replaced, 'name', { value: method.name });
        (descriptor.value as Function) = replaced;
    };
}
