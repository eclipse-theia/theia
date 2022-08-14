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

export interface ParameterOptions<T> {
    default?: T
    validator?: (value: unknown) => boolean
}

export class Parameter<T> {

    protected default?: T;
    protected validator?: (value: unknown) => boolean;

    constructor(
        readonly key: number | string | symbol,
        options?: ParameterOptions<T>
    ) {
        this.default = options?.default;
        this.validator = options?.validator;
    }

    get(record: Record<number | string | symbol, T>): T | undefined {
        const value = record[this.key];
        if (value !== undefined && this.validator?.(value) === false) {
            throw new TypeError(`invalid value for key=${this.key.toString()}`);
        }
        return value as T | undefined ?? this.default;
    }

    set<R extends Record<number | string | symbol, T>>(record: R, value: T): R {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (record as any)[this.key] = value;
        return record;
    }

    create(value: T): Record<number | string | symbol, T> {
        return { [this.key]: value };
    }
}
