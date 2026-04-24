// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

/**
 * Recursively merges two object types, combining nested object properties
 * rather than overwriting them. Non-object properties from `U` take precedence
 * over those from `T`.
 *
 * This is used to compose the `typeof theia` API shape from multiple contributions
 * where several contributions provide properties under the same namespace key
 * (e.g., both the editor and terminal contributions add to `window`).
 */
export type DeepMerge<T, U> = {
    [K in keyof T | keyof U]:
    K extends keyof U
    ? K extends keyof T
    ? T[K] extends Record<string, unknown>
    ? U[K] extends Record<string, unknown>
    ? DeepMerge<T[K], U[K]>
    : U[K]
    : U[K]
    : U[K]
    : K extends keyof T ? T[K] : never;
};

/**
 * Variadic version of {@link DeepMerge} that merges an arbitrary number of types
 * left-to-right.
 */
export type DeepMergeAll<T extends unknown[]> =
    T extends [infer First, infer Second, ...infer Rest]
    ? DeepMergeAll<[DeepMerge<First, Second>, ...Rest]>
    : T extends [infer Only]
    ? Only
    : {};

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object'
        && value !== null
        && !Array.isArray(value)
        // Exclude class instances (Event emitters, URI, Position, etc.) —
        // only merge bare object literals (namespace bags like `window`, `workspace`).
        && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Deep-merges two API namespace objects, recursively combining nested plain objects
 * (namespace bags like `window`, `workspace`, `env`) while letting later values
 * override earlier ones for non-object properties.
 *
 * Only *plain* objects (whose prototype is `Object.prototype`) are recursively merged.
 * Class instances, arrays, functions, and other values are treated as leaves and
 * overwritten by the second argument.
 */
export function deepMergeApiNamespaces<T extends object, U extends object>(target: T, source: U): DeepMerge<T, U>;
export function deepMergeApiNamespaces<T extends object, U extends object, V extends object>(target: T, source1: U, source2: V): DeepMerge<DeepMerge<T, U>, V>;
export function deepMergeApiNamespaces<T extends object, U extends object, V extends object, W extends object>(
    target: T, source1: U, source2: V, source3: W): DeepMerge<DeepMerge<DeepMerge<T, U>, V>, W>;
export function deepMergeApiNamespaces(...sources: object[]): object {
    if (sources.length === 0) {
        return {};
    }
    let result = sources[0];
    for (let i = 1; i < sources.length; i++) {
        result = mergeTwo(result, sources[i]);
    }
    return result;
}

function mergeTwo<T extends object, U extends object>(
    target: T,
    source: U
): DeepMerge<T, U> {
    // Use Object.defineProperty rather than spread/Object.assign to preserve
    // getters and setters. Spread invokes getters and copies the returned value,
    // which would evaluate lazy getters like `activeTerminal` at merge time
    // instead of when the plugin accesses them.
    const result: Record<string, unknown> = {};

    // Pass 1: copy all target descriptors into result
    const targetDescs = Object.getOwnPropertyDescriptors(target);
    for (const key of Object.keys(targetDescs)) {
        Object.defineProperty(result, key, targetDescs[key]);
    }

    // Pass 2: merge source descriptors into result
    const sourceDescs = Object.getOwnPropertyDescriptors(source);
    for (const key of Object.keys(sourceDescs)) {
        const sourceDesc = sourceDescs[key];
        const existingDesc = Object.getOwnPropertyDescriptor(result, key);

        // Only recurse when both sides are data properties holding plain objects
        // (namespace bags like `window`, `workspace`). Getters, class instances,
        // arrays, and functions are treated as leaves — source wins.
        const existingVal = existingDesc && 'value' in existingDesc ? existingDesc.value : undefined;
        const sourceVal = 'value' in sourceDesc ? sourceDesc.value : undefined;

        if (isPlainObject(existingVal) && isPlainObject(sourceVal)) {
            Object.defineProperty(result, key, {
                value: mergeTwo(existingVal, sourceVal),
                enumerable: true,
                configurable: true,
                writable: true,
            });
        } else {
            Object.defineProperty(result, key, sourceDesc);
        }
    }

    return result as DeepMerge<T, U>;
}
