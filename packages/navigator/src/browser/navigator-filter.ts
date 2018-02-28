/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { Minimatch } from 'minimatch';
import { MaybePromise } from '@theia/core/lib/common/types';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { PreferenceChangeEvent } from '@theia/core/lib/browser/preferences';
import { FileNavigatorPreferences, FileNavigatorConfiguration } from './navigator-preferences';

/**
 * Filter for omitting elements from the navigator. For more details on the exclusion patterns,
 * one should check either the manual with `man 5 gitignore` or just [here](https://git-scm.com/docs/gitignore).
 */
@injectable()
export class FileNavigatorFilter {

    protected readonly emitter: Emitter<void>;

    protected filterPredicate: FileNavigatorFilter.Predicate;

    constructor(@inject(FileNavigatorPreferences) protected readonly preferences: FileNavigatorPreferences) {
        this.emitter = new Emitter<void>();
        this.filterPredicate = this.createFilterPredicate(this.preferences['navigator.exclude']);
        preferences.onPreferenceChanged(this.onPreferenceChanged.bind(this));
    }

    async filter<T extends { id: string }>(items: MaybePromise<T[]>): Promise<T[]> {
        return (await items).filter(item => this.filterItem(item));
    }

    get onFilterChanged(): Event<void> {
        return this.emitter.event;
    }

    protected filterItem(item: { id: string }): boolean {
        return this.filterPredicate.filter(item);
    }

    protected fireFilterChanged() {
        this.emitter.fire(undefined);
    }

    protected onPreferenceChanged(event: PreferenceChangeEvent<FileNavigatorConfiguration>): void {
        let hasChanged = false;
        const { preferenceName, newValue } = event;
        if (preferenceName === 'navigator.exclude') {
            this.filterPredicate = this.createFilterPredicate(newValue || {});
            hasChanged = true;
        }
        if (hasChanged) {
            this.fireFilterChanged();
        }
    }

    protected createFilterPredicate(exclusions: FileNavigatorFilter.Exclusions): FileNavigatorFilter.Predicate {
        return new FileNavigatorFilterPredicate(exclusions);
    }

}

export namespace FileNavigatorFilter {

    /**
     * File navigator filter predicate.
     */
    export interface Predicate {

        /**
         * Returns `true` if the item should filtered our from the navigator. Otherwise, `true`.
         *
         * @param item the identifier of a tree node.
         */
        filter(item: { id: string }): boolean;

    }

    export namespace Predicate {

        /**
         * Wraps a bunch of predicates and returns with a new one that evaluates to `true` if
         * each of the wrapped predicates evaluates to `true`. Otherwise, `false`.
         */
        export function and(...predicates: Predicate[]): Predicate {
            return {
                filter: id => predicates.every(predicate => predicate.filter(id))
            };
        }

    }

    /**
     * Type for the exclusion patterns. The property keys are the patterns, values are whether the exclusion is enabled or not.
     */
    export interface Exclusions {
        [key: string]: boolean;
    }

}

/**
 * Concrete filter navigator filter predicate that is decoupled from the preferences.
 */
export class FileNavigatorFilterPredicate implements FileNavigatorFilter.Predicate {

    private readonly delegate: FileNavigatorFilter.Predicate;

    constructor(exclusions: FileNavigatorFilter.Exclusions) {
        const patterns = Object.keys(exclusions).map(pattern => ({ pattern, enabled: exclusions[pattern] })).filter(object => object.enabled).map(object => object.pattern);
        this.delegate = FileNavigatorFilter.Predicate.and(...patterns.map(pattern => this.createDelegate(pattern)));
    }

    filter(item: { id: string }): boolean {
        return this.delegate.filter(item);
    }

    protected createDelegate(pattern: string): FileNavigatorFilter.Predicate {
        const delegate = new Minimatch(pattern, { matchBase: true });
        return {
            filter: item => !delegate.match(item.id)
        };
    }

}
