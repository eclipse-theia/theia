// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import { ExtensionLike, OVSXClient, OVSXClientProvider, VSXExtensionRaw, VSXQueryOptions, VSXQueryResult, VSXSearchEntry, VSXSearchOptions, VSXSearchResult } from './ovsx-types';
import type { MaybePromise } from './types';

export interface OVSXRouterFilter {
    filterSearchOptions?(searchOptions?: VSXSearchOptions): MaybePromise<unknown>;
    filterQueryOptions?(queryOptions?: VSXQueryOptions): MaybePromise<unknown>;
    filterExtension?(extension: ExtensionLike): MaybePromise<unknown>;
}

/**
 * @param conditions key/value mapping of condition statements that rules may process
 * @param remainingKeys keys left to be processed, remove items from it when you handled them
 */
export type OVSXRouterFilterFactory = (conditions: Readonly<Record<string, unknown>>, remainingKeys: Set<string>) => MaybePromise<OVSXRouterFilter | undefined>;

/**
 * Helper function to create factories that handle a single condition key.
 */
export function createFilterFactory(conditionKey: string, factory: (conditionValue: unknown) => OVSXRouterFilter | undefined): OVSXRouterFilterFactory {
    return (conditions, remainingKeys) => {
        if (conditionKey in conditions) {
            const filter = factory(conditions[conditionKey]);
            if (filter) {
                remainingKeys.delete(conditionKey);
                return filter;
            }
        }
    };
}

export interface OVSXRouterConfig {
    /**
     * Registry aliases that will be used for routing.
     */
    registries?: {
        [alias: string]: string
    }
    /**
     * The registry/ies to use by default.
     */
    use: string | string[]
    /**
     * Filters for the different phases of interfacing with a registry.
     */
    rules?: OVSXRouterRule[]
}

export interface OVSXRouterRule {
    [condition: string]: unknown
    use?: string | string[] | null
}

/**
 * @internal
 */
export interface OVSXRouterParsedRule {
    filters: OVSXRouterFilter[]
    use: string[]
}

/**
 * Route and agglomerate queries according to {@link routerConfig}.
 * {@link ruleFactories} is the actual logic used to evaluate the config.
 * Each rule implementation will be ran sequentially over each configured rule.
 */
export class OVSXRouterClient implements OVSXClient {

    static async FromConfig(routerConfig: OVSXRouterConfig, clientProvider: OVSXClientProvider, filterFactories: OVSXRouterFilterFactory[]): Promise<OVSXRouterClient> {
        const rules = routerConfig.rules ? await this.ParseRules(routerConfig.rules, filterFactories, routerConfig.registries) : [];
        return new this(
            this.ParseUse(routerConfig.use, routerConfig.registries),
            clientProvider,
            rules
        );
    }

    protected static async ParseRules(rules: OVSXRouterRule[], filterFactories: OVSXRouterFilterFactory[], aliases?: Record<string, string>): Promise<OVSXRouterParsedRule[]> {
        return Promise.all(rules.map(async ({ use, ...conditions }) => {
            const remainingKeys = new Set(Object.keys(conditions));
            const filters = removeNullValues(await Promise.all(filterFactories.map(filterFactory => filterFactory(conditions, remainingKeys))));
            if (remainingKeys.size > 0) {
                throw new Error(`unknown conditions: ${Array.from(remainingKeys).join(', ')}`);
            }
            return {
                filters,
                use: this.ParseUse(use, aliases)
            };
        }));
    }

    protected static ParseUse(use: string | string[] | null | undefined, aliases?: Record<string, string>): string[] {
        if (typeof use === 'string') {
            return [alias(use)];
        } else if (Array.isArray(use)) {
            return use.map(alias);
        } else {
            return [];
        }
        function alias(aliasOrUri: string): string {
            return aliases?.[aliasOrUri] ?? aliasOrUri;
        }
    }

    constructor(
        protected readonly useDefault: string[],
        protected readonly clientProvider: OVSXClientProvider,
        protected readonly rules: OVSXRouterParsedRule[],
    ) { }

    async search(searchOptions?: VSXSearchOptions): Promise<VSXSearchResult> {
        return this.runRules(
            filter => filter.filterSearchOptions?.(searchOptions),
            rule => rule.use.length > 0
                ? this.mergedSearch(rule.use, searchOptions)
                : this.emptySearchResult(searchOptions),
            () => this.mergedSearch(this.useDefault, searchOptions)
        );
    }

    async query(queryOptions: VSXQueryOptions = {}): Promise<VSXQueryResult> {
        return this.runRules(
            filter => filter.filterQueryOptions?.(queryOptions),
            rule => rule.use.length > 0
                ? this.mergedQuery(rule.use, queryOptions)
                : this.emptyQueryResult(queryOptions),
            () => this.mergedQuery(this.useDefault, queryOptions)
        );
    }

    protected emptySearchResult(searchOptions?: VSXSearchOptions): VSXSearchResult {
        return {
            extensions: [],
            offset: searchOptions?.offset ?? 0
        };
    }

    protected emptyQueryResult(queryOptions?: VSXQueryOptions): VSXQueryResult {
        return {
            offset: 0,
            totalSize: 0,
            extensions: []
        };
    }

    protected async mergedQuery(registries: string[], queryOptions?: VSXQueryOptions): Promise<VSXQueryResult> {
        return this.mergeQueryResults(await createMapping(registries, async registry => (await this.clientProvider(registry)).query(queryOptions)));
    }

    protected async mergedSearch(registries: string[], searchOptions?: VSXSearchOptions): Promise<VSXSearchResult> {
        return this.mergeSearchResults(await createMapping(registries, async registry => (await this.clientProvider(registry)).search(searchOptions)));
    }

    protected async mergeSearchResults(results: Map<string, VSXSearchResult>): Promise<VSXSearchResult> {
        const filtering = [] as Promise<VSXSearchEntry[]>[];
        results.forEach((result, sourceUri) => {
            filtering.push(Promise
                .all(result.extensions.map(extension => this.filterExtension(sourceUri, extension)))
                .then(removeNullValues)
            );
        });
        return {
            extensions: interleave(await Promise.all(filtering)),
            offset: Math.min(...Array.from(results.values(), result => result.offset))
        };
    }

    protected async mergeQueryResults(results: Map<string, VSXQueryResult>): Promise<VSXQueryResult> {
        const filtering = [] as Promise<VSXExtensionRaw | undefined>[];
        results.forEach((result, sourceUri) => {
            result.extensions.forEach(extension => filtering.push(this.filterExtension(sourceUri, extension)));
        });
        const extensions = removeNullValues(await Promise.all(filtering));
        return {
            offset: 0,
            totalSize: extensions.length,
            extensions
        };
    }

    protected async filterExtension<T extends ExtensionLike>(sourceUri: string, extension: T): Promise<T | undefined> {
        return this.runRules(
            filter => filter.filterExtension?.(extension),
            rule => rule.use.includes(sourceUri) ? extension : undefined,
            () => extension
        );
    }

    protected runRules<T>(runFilter: (filter: OVSXRouterFilter) => unknown, onRuleMatched: (rule: OVSXRouterParsedRule) => T): Promise<T | undefined>;
    protected runRules<T, U>(runFilter: (filter: OVSXRouterFilter) => unknown, onRuleMatched: (rule: OVSXRouterParsedRule) => T, onNoRuleMatched: () => U): Promise<T | U>;
    protected async runRules<T, U>(
        runFilter: (filter: OVSXRouterFilter) => unknown,
        onRuleMatched: (rule: OVSXRouterParsedRule) => T,
        onNoRuleMatched?: () => U
    ): Promise<T | U | undefined> {
        for (const rule of this.rules) {
            const results = removeNullValues(await Promise.all(rule.filters.map(filter => runFilter(filter))));
            if (results.length > 0 && results.every(value => value)) {
                return onRuleMatched(rule);
            }
        }
        return onNoRuleMatched?.();
    }
}

function nonNullable<T>(value: T | null | undefined): value is T {
    // eslint-disable-next-line no-null/no-null
    return typeof value !== 'undefined' && value !== null;
}

function removeNullValues<T>(values: (T | null | undefined)[]): T[] {
    return values.filter(nonNullable);
}

/**
 * Create a map where the keys are each element from {@link values} and the
 * values are the result of a mapping function applied on the key.
 */
async function createMapping<T, U>(values: T[], map: (value: T, index: number) => MaybePromise<U>, thisArg?: unknown): Promise<Map<T, U>> {
    return new Map(await Promise.all(values.map(async (value, index) => [value, await map.call(thisArg, value, index)] as [T, U])));
}

/**
 * @example
 * interleave([[1, 2, 3], [4, 5], [6, 7, 8]]) === [1, 4, 6, 2, 5, 7, 3, 8]
 */
function interleave<T>(arrays: T[][]): T[] {
    const interleaved: T[] = [];
    const length = Math.max(...arrays.map(array => array.length));
    for (let i = 0; i < length; i++) {
        for (const array of arrays) {
            if (i < array.length) {
                interleaved.push(array[i]);
            }
        }
    }
    return interleaved;
}
