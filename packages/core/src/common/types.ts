/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

export type Mutable<T> = { -readonly [P in keyof T]: T[P] };

export type Deferred<T> = {
    [P in keyof T]: Promise<T[P]>
};
export type RecursivePartial<T> = {
    [P in keyof T]?: RecursivePartial<T[P]>;
};
export type MaybeArray<T> = T | T[];
export type MaybePromise<T> = T | Promise<T> | PromiseLike<T>;

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
