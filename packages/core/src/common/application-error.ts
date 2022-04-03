// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

export interface ApplicationError<C extends number, D> extends Error {
    readonly message: string
    readonly code: C
    readonly data: D
}
export namespace ApplicationError {

    const DEFINED_CODES = new Set<number>();

    export interface Literal<D> {
        message: string
        data: D
        stack?: string
    }

    export interface Constructor<C extends number, D> {
        new(...args: any[]): ApplicationError<C, D>
        (...args: any[]): ApplicationError<C, D>;
        readonly code: C;
        is(value?: object): value is ApplicationError<C, D>
    }

    export type Type<T extends Constructor<number, any>> = T extends Constructor<infer C, infer D> ? ApplicationError<C, D> : never;

    function validateCode(code: number): void {
        if (DEFINED_CODES.has(code)) {
            throw new Error(`An application error for '${code}' code is already declared`);
        }
        DEFINED_CODES.add(code);
    }

    export function declare<C extends number, D>(code: C, factory: (...args: any[]) => Literal<D>): Constructor<C, D> {
        validateCode(code);
        // use es5-style class definition to construct with or without using `new`
        function ImplExt(this: never, ...args: any[]): any {
            if (new.target === undefined) {
                // ImplExt was called without new, so we'll call with new:
                return new (ImplExt as any)(...args);
            }
            // constructor "super" call
            const self = Reflect.construct(Impl, [code, factory(...args)], ImplExt);
            Object.setPrototypeOf(self, ImplExt.prototype);
            return self;
        }
        // setup proper prototype chain
        Object.setPrototypeOf(ImplExt, Impl);
        Object.setPrototypeOf(ImplExt.prototype, Impl.prototype);
        // static methods
        function isExtImpl(value: any): value is ApplicationError<C, D> {
            // eslint-disable-next-line no-null/no-null
            return typeof value === 'object' && value !== null && typeof value.message === 'string' && value.code === code;
        }
        Object.defineProperties(ImplExt, {
            [Symbol.hasInstance]: {
                value: isExtImpl
            },
            code: {
                value: code
            },
            is: {
                value: isExtImpl
            }
        });
        return ImplExt as Constructor<C, D>;
    }

    export function is<C extends number, D>(arg: object | undefined): arg is ApplicationError<C, D> {
        return arg instanceof Impl;
    }

    export function toJson<C extends number, D>(error: ApplicationError<C, D>): Literal<D> {
        const { message, data, stack } = error;
        return { message, data, stack };
    }

    export function fromJson<C extends number, D>(code: C, literal: Literal<D>): ApplicationError<C, D> {
        return new Impl(code, literal);
    }

    class Impl<C extends number, D> extends Error implements ApplicationError<C, D>  {

        data: D;

        constructor(
            readonly code: C,
            literal: ApplicationError.Literal<D>,
            constructorOpt?: Function
        ) {
            super(literal.message);
            this.data = literal.data;
            Object.setPrototypeOf(this, Impl.prototype);
            if (literal.stack) {
                this.stack = literal.stack;
            } else if (Error.captureStackTrace && constructorOpt) {
                Error.captureStackTrace(this, constructorOpt);
            }
        }
    }
}
