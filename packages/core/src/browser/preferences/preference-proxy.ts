/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Disposable, Event, MaybePromise } from '../../common';
import { PreferenceService } from './preference-service';
import { PreferenceSchema, OverridePreferenceName } from './preference-contribution';
import { PreferenceScope } from './preference-scope';

/**
 * It is worth explaining the type for `PreferenceChangeEvent`:
 *
 * // Given T:
 * type T = { a: string, b: number }
 *
 * // We construct a new type such as:
 * type U = {
 *     a: {
 *         preferenceName: 'a'
 *         newValue: string
 *         oldValue?: string
 *     }
 *     b: {
 *        preferenceName: 'b'
 *        newValue: number
 *        oldValue?: number
 *     }
 * }
 *
 * // Then we get the union of all values of U by selecting by `keyof T`:
 * type V = U[keyof T]
 *
 * // Implementation:
 * type PreferenceChangeEvent<T> = {
 *     // Create a mapping where each key is a key from T,
 *     // -? normalizes optional typings to avoid getting
 *     // `undefined` as part of the final union:
 *     [K in keyof T]-?: {
 *         // In this object, K will take the value of each
 *         // independent key from T:
 *         preferenceName: K
 *         newValue: T[K]
 *         oldValue?: T[K]
 *     // Finally we create the union by doing so:
 *     }[keyof T]
 * }
 */

/**
 * Union of all possible key/value pairs for a type `T`
 */
export type PreferenceChangeEvent<T> = {
    affects(resourceUri?: string, overrideIdentifier?: string): boolean;
} & {
    [K in keyof T]-?: {
        readonly preferenceName: K;
        readonly newValue: T[K];
        /**
         * Undefined if the preference is set for the first time.
         */
        // TODO: Use the default value instead of undefined?
        readonly oldValue?: T[K];
    }
}[keyof T];

export interface PreferenceEventEmitter<T> {
    readonly onPreferenceChanged: Event<PreferenceChangeEvent<T>>;
    readonly ready: Promise<void>;
}

/**
 * Generic interface to declare a typesafe get function based on the given
 * configuration type.
 *
 * ### Illustration
 *
 * ```ts
 * interface PreferenceConfiguration {
 *  'myext.enabled': boolean,
 * }
 * const enabled : boolean = prefs.get('myext.enabled'); // valid
 * const debug : string = prefs.get('myext.enabled'); // invalid
 * prefs.get('foobar'); // invalid
 * ```
 */
export interface PreferenceRetrieval<T> {
    get<K extends keyof T>(preferenceName: K | {
        preferenceName: K,
        overrideIdentifier?: string
    }, defaultValue?: T[K], resourceUri?: string): T[K];
}

/**
 * Typesafe schema-based preferences utility based on the {@link PreferenceService}.
 * Can be used to get preferences as well as listen to preference changes.
 *
 * See {@link createPreferenceProxy} on how to instantiate preference proxies.
 *
 * ### Example usage
 *
 * ```ts
 * preferences.onPreferenceChanged(({ preferenceName, newValue }) => { ... });
 * const enabled = preferences['myext.enabled'];
 * ```
 */
export type PreferenceProxy<T> = Readonly<T> & Disposable & PreferenceEventEmitter<T> & PreferenceRetrieval<T>;
/**
 * Proxy configuration parameters.
 */
export interface PreferenceProxyOptions {
    /**
     * Prefix which is transparently added to all preference identifiers.
     */
    prefix?: string;
    /**
     * The default resourceUri to use if none was specified when calling "set" or "get".
     */
    resourceUri?: string;
    /**
     * The overrideIdentifier to use with the underlying preferenceService.
     * Useful to potentially override existing values while keeping both values in store.
     *
     * For example to store different editor settings, e.g. "[markdown].editor.autoIndent",
     * "[json].editor.autoIndent" and "editor.autoIndent"
     */
    overrideIdentifier?: string;
    /**
     * Indicates whether '.' in schema properties shall be interpreted as regular names (flat),
     * as declaring nested objects (deep) or both. Default is flat.
     *
     * When 'deep' or 'both' is given, nested preference proxies can be retrieved.
     */
    style?: 'flat' | 'deep' | 'both';
}

/**
 * Creates a preference proxy for typesafe preference handling.
 *
 * @param preferences the underlying preference service to use for preference handling.
 * @param promisedSchema the JSON Schema which describes which preferences are available including types and descriptions. Can be a promise.
 * @param options configuration options.
 *
 * @returns the created preference proxy.
 *
 * ### Usage
 *
 *  1. Create JSON Schema specifying your preferences
 *  2. Create Configuration type based on the JSON Schema
 *  3. Bind the return value of `createPreferenceProxy` to make your preferences available wherever needed.
 *
 * See {@link CorePreferences} for an example.
 *
 * Note that if `schema` is a Promise, most actions will be no-ops until the promise is resolved.
 */
export function createPreferenceProxy<T>(preferences: PreferenceService, promisedSchema: MaybePromise<PreferenceSchema>, options?: PreferenceProxyOptions): PreferenceProxy<T> {
    const opts = options || {};
    const prefix = opts.prefix || '';
    const style = opts.style || 'flat';
    const isDeep = style === 'deep' || style === 'both';
    const isFlat = style === 'both' || style === 'flat';
    let schema: PreferenceSchema | undefined;
    if (PreferenceSchema.is(promisedSchema)) {
        schema = promisedSchema;
    } else {
        promisedSchema.then(s => schema = s);
    }
    const onPreferenceChanged = (listener: (e: PreferenceChangeEvent<T>) => any, thisArgs?: any, disposables?: Disposable[]) => preferences.onPreferencesChanged(changes => {
        if (schema) {
            for (const key of Object.keys(changes)) {
                const e = changes[key];
                const overridden = preferences.overriddenPreferenceName(e.preferenceName);
                const preferenceName: any = overridden ? overridden.preferenceName : e.preferenceName;
                if (preferenceName.startsWith(prefix) && (!overridden || !opts.overrideIdentifier || overridden.overrideIdentifier === opts.overrideIdentifier)) {
                    if (schema.properties[preferenceName]) {
                        const { newValue, oldValue } = e;
                        listener({
                            newValue, oldValue, preferenceName,
                            affects: (resourceUri, overrideIdentifier) => {
                                if (overrideIdentifier !== undefined) {
                                    if (overridden && overridden.overrideIdentifier !== overrideIdentifier) {
                                        return false;
                                    }
                                }
                                return e.affects(resourceUri);
                            }
                        });
                    }
                }
            }
        }
    }, thisArgs, disposables);

    const unsupportedOperation = (_: any, __: string) => {
        throw new Error('Unsupported operation');
    };

    const getValue: PreferenceRetrieval<any>['get'] = (arg, defaultValue, resourceUri) => {
        const preferenceName = OverridePreferenceName.is(arg) ?
            preferences.overridePreferenceName(arg) :
            <string>arg;
        return preferences.get(preferenceName, defaultValue, resourceUri || opts.resourceUri);
    };

    const ownKeys: () => string[] = () => {
        const properties = [];
        if (schema) {
            for (const p of Object.keys(schema.properties)) {
                if (p.startsWith(prefix)) {
                    const idx = p.indexOf('.', prefix.length);
                    if (idx !== -1 && isDeep) {
                        const pre = p.substr(prefix.length, idx - prefix.length);
                        if (properties.indexOf(pre) === -1) {
                            properties.push(pre);
                        }
                    }
                    const prop = p.substr(prefix.length);
                    if (isFlat || prop.indexOf('.') === -1) {
                        properties.push(prop);
                    }
                }
            }
        }
        return properties;
    };

    const set: (target: any, prop: string, value: any, receiver: any) => boolean = (_, property: string | symbol | number, value: any) => {
        if (typeof property !== 'string') {
            throw new Error(`unexpected property: ${String(property)}`);
        }
        if (style === 'deep' && property.indexOf('.') !== -1) {
            return false;
        }
        if (schema) {
            const fullProperty = prefix ? prefix + property : property;
            if (schema.properties[fullProperty]) {
                preferences.set(fullProperty, value, PreferenceScope.Default);
                return true;
            }
            const newPrefix = fullProperty + '.';
            for (const p of Object.keys(schema.properties)) {
                if (p.startsWith(newPrefix)) {
                    const subProxy: { [k: string]: any } = createPreferenceProxy(preferences, schema, {
                        prefix: newPrefix,
                        resourceUri: opts.resourceUri,
                        overrideIdentifier: opts.overrideIdentifier,
                        style
                    });
                    for (const k of Object.keys(value)) {
                        subProxy[k] = value[k];
                    }
                }
            }
        }
        return false;
    };

    const get: (target: any, prop: string) => any = (_, property: string | symbol | number) => {
        if (typeof property !== 'string') {
            throw new Error(`unexpected property: ${String(property)}`);
        }
        const fullProperty = prefix ? prefix + property : property;
        if (schema) {
            if (isFlat || property.indexOf('.') === -1) {
                if (schema.properties[fullProperty]) {
                    let value;
                    if (opts.overrideIdentifier) {
                        value = preferences.get(preferences.overridePreferenceName({
                            overrideIdentifier: opts.overrideIdentifier,
                            preferenceName: fullProperty
                        }), undefined, opts.resourceUri);
                    }
                    if (value === undefined) {
                        value = preferences.get(fullProperty, undefined, opts.resourceUri);
                    }
                    return value;
                }
            }
        }
        if (property === 'onPreferenceChanged') {
            return onPreferenceChanged;
        }
        if (property === 'dispose') {
            return () => { /* do nothing */ };
        }
        if (property === 'ready') {
            return preferences.ready;
        }
        if (property === 'get') {
            return getValue;
        }
        if (property === 'toJSON') {
            return toJSON();
        }
        if (schema && isDeep) {
            const newPrefix = fullProperty + '.';
            for (const p of Object.keys(schema.properties)) {
                if (p.startsWith(newPrefix)) {
                    return createPreferenceProxy(preferences, schema, { prefix: newPrefix, resourceUri: opts.resourceUri, overrideIdentifier: opts.overrideIdentifier, style });
                }
            }

            let value;
            let parentSegment = fullProperty;
            const segments = [];
            do {
                const index = parentSegment.lastIndexOf('.');
                segments.push(parentSegment.substring(index + 1));
                parentSegment = parentSegment.substring(0, index);
                if (parentSegment in schema.properties) {
                    value = get(_, parentSegment);
                }
            } while (parentSegment && value === undefined);

            let segment;
            while (typeof value === 'object' && (segment = segments.pop())) {
                value = value[segment];
            }
            return segments.length ? undefined : value;
        }
        return undefined;
    };

    const toJSON = () => {
        const result: any = {};
        for (const k of ownKeys()) {
            result[k] = get(undefined, k);
        }
        return result;
    };

    return new Proxy({}, {
        get,
        ownKeys,
        getOwnPropertyDescriptor: (_, property: string) => {
            if (ownKeys().indexOf(property) !== -1) {
                return {
                    enumerable: true,
                    configurable: true
                };
            }
            return {};
        },
        set,
        deleteProperty: unsupportedOperation,
        defineProperty: unsupportedOperation
    });
}
