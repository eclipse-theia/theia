// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

export type Mutable<T> = { -readonly [P in keyof T]: T[P] };

export type Deferred<T> = {
    [P in keyof T]: Promise<T[P]>
};
export type RecursivePartial<T> = {
    [P in keyof T]?: T[P] extends Array<infer I>
    ? Array<RecursivePartial<I>>
    : RecursivePartial<T[P]>;
};
export type MaybeArray<T> = T | T[];
export type MaybePromise<T> = T | PromiseLike<T>;

export interface Prioritizeable<T> {
    readonly priority: number;
    readonly value: T;
}
export namespace Prioritizeable {
    export type GetPriority<T> = (value: T) => MaybePromise<number>;
    export type GetPrioritySync<T> = (value: T) => number;
    export async function toPrioritizeable<T>(rawValue: MaybePromise<T>, getPriority: GetPriority<T>): Promise<Prioritizeable<T>>;
    export async function toPrioritizeable<T>(rawValue: MaybePromise<T>[], getPriority: GetPriority<T>): Promise<Prioritizeable<T>[]>;
    export async function toPrioritizeable<T>(rawValue: MaybeArray<MaybePromise<T>>, getPriority: GetPriority<T>): Promise<MaybeArray<Prioritizeable<T>>> {
        if (rawValue instanceof Array) {
            return Promise.all(
                rawValue.map(v => toPrioritizeable(v, getPriority))
            );
        }
        const value = await rawValue;
        const priority = await getPriority(value);
        return { priority, value };
    }
    export function toPrioritizeableSync<T>(rawValue: T[], getPriority: GetPrioritySync<T>): Prioritizeable<T>[] {
        return rawValue.map(v => ({
            value: v,
            priority: getPriority(v)
        }));
    }
    export function prioritizeAllSync<T>(values: T[], getPriority: GetPrioritySync<T>): Prioritizeable<T>[] {
        const prioritizeable = toPrioritizeableSync(values, getPriority);
        return prioritizeable.filter(isValid).sort(compare);
    }
    export async function prioritizeAll<T>(values: MaybePromise<T>[], getPriority: GetPriority<T>): Promise<Prioritizeable<T>[]> {
        const prioritizeable = await toPrioritizeable(values, getPriority);
        return prioritizeable.filter(isValid).sort(compare);
    }
    export function isValid<T>(p: Prioritizeable<T>): boolean {
        return p.priority > 0;
    }
    export function compare<T>(p: Prioritizeable<T>, p2: Prioritizeable<T>): number {
        return p2.priority - p.priority;
    }
}

export namespace ArrayUtils {
    export interface Head<T> extends Array<T> {
        head(): T;
    }

    export interface Tail<T> extends Array<T> {
        tail(): T;
    }

    export interface Children<T> extends Array<T> {
        children(): Tail<T>
    }

    export const TailImpl = {
        tail<T>(this: Array<T>): T {
            return this[this.length - 1];
        },
    };

    export const HeadAndChildrenImpl = {
        head<T>(this: Array<T>): T {
            return this[0];
        },

        children<T>(this: Array<T>): Tail<T> {
            return Object.assign(this.slice(1), TailImpl);
        }
    };

    export interface HeadAndTail<T> extends Head<T>, Tail<T>, Children<T> { }

    export function asTail<T>(array: Array<T>): Tail<T> {
        return Object.assign(array, TailImpl);
    }

    export function asHeadAndTail<T>(array: Array<T>): HeadAndTail<T> {
        return Object.assign(array, HeadAndChildrenImpl, TailImpl);
    }
}

/**
 * Throws when called and statically makes sure that all variants of a type were consumed.
 */
export function unreachable(_never: never, message: string = 'unhandled case'): never {
    throw new Error(message);
}

export function newableFactory<T, A extends unknown[]>(newable: new (...args: A) => T): (...args: A) => T {
    return (...args) => new newable(...args);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MethodNames<T> = { [K in keyof T]: T[K] extends Function ? K : never }[keyof T];
export function postConstructFactory<T, K extends MethodNames<T> = never>(
    factory: () => T,
    postConstructMethodName?: K
): (...args: T[K] extends (...args2: infer A) => void ? A : never) => T {
    return (...args) => {
        const instance = factory();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (instance as any)[postConstructMethodName ?? 'initialize'](...args);
        return instance;
    };
}

const a = postConstructFactory(() => ({
    initialize(aaa: string, bbb: number): void { }
} as const), 'initialize');

a('1', 2);

export interface FromFactory<F extends (...args: unknown[]) => unknown> {
    new(...args: Parameters<F>): ReturnType<F>
}

/**
 * Easy coercion function, because TypeScript doesn't provide such a mechanism out of the box...
 */
export function is<T>(what: unknown, whatIsT: boolean): what is T;
export function is<T>(unknown: unknown, predicate: (unknown: Partial<T>) => boolean): unknown is T;
export function is<T>(arg1: unknown, arg2: boolean | ((unknown: Partial<T>) => boolean)): boolean {
    return typeof arg2 === 'function' ? arg2(arg1 as Partial<T>) : Boolean(arg2);
}

export function serviceIdentifier<T>(name: string): interfaces.ServiceIdentifier<T> {
    return Symbol(name);
}
