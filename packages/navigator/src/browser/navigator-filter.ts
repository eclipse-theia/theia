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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Path, PreferenceChangeEvent } from '@theia/core';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { SiblingClause } from '@theia/core/lib/common/glob';
import { MaybePromise } from '@theia/core/lib/common/types';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { FileStatNode } from '@theia/filesystem/lib/browser';
import { FileSystemPreferences, FileSystemConfiguration } from '@theia/filesystem/lib/common/filesystem-preferences';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { Minimatch } from 'minimatch';
import { FileNavigatorPreferences, FileNavigatorConfiguration } from '../common/navigator-preferences.js';

/**
 * Filter for omitting elements from the navigator. For more details on the exclusion patterns,
 * one should check either the manual with `man 5 gitignore` or just [here](https://git-scm.com/docs/gitignore).
 */
@injectable()
export class FileNavigatorFilter {
    protected readonly emitter: Emitter<void> = new Emitter<void>();

    protected filterPredicate: FileNavigatorFilter.Predicate;
    protected showHiddenFiles: boolean;

    @inject(FileSystemPreferences)
    protected readonly filesPreferences: FileSystemPreferences;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    constructor(
        @inject(FileNavigatorPreferences) protected readonly preferences: FileNavigatorPreferences
    ) { }

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        this.filterPredicate = this.createFilterPredicate(this.filesPreferences['files.exclude']);
        this.filesPreferences.onPreferenceChanged(event => this.onFilesPreferenceChanged(event));
        this.preferences.onPreferenceChanged(event => this.onPreferenceChanged(event));
    }

    async filter<T extends { id: string }>(items: MaybePromise<T[]>): Promise<T[]> {
        const resolvedItems = await items;
        const siblingNames = new Set<string>();
        for (const item of resolvedItems) {
            if (FileStatNode.is(item)) {
                siblingNames.add(item.fileStat.name);
            }
        }
        const hasSibling = (name: string) => siblingNames.has(name);
        return resolvedItems.filter(item => this.filterItem(item, hasSibling));
    }

    get onFilterChanged(): Event<void> {
        return this.emitter.event;
    }

    protected filterItem(item: { id: string }, hasSibling?: (name: string) => boolean): boolean {
        let relativePath: string | undefined;
        if (FileStatNode.is(item)) {
            const workspaceRoot = this.workspaceService.getWorkspaceRootUri(item.uri);
            relativePath = workspaceRoot?.relative(item.uri)?.toString();
        }
        return this.filterPredicate.filter({ id: relativePath ?? item.id }, hasSibling);
    }

    protected fireFilterChanged(): void {
        this.emitter.fire(undefined);
    }

    protected onFilesPreferenceChanged(event: PreferenceChangeEvent<FileSystemConfiguration>): void {
        const { preferenceName } = event;
        if (preferenceName === 'files.exclude') {
            const filesExcludes = this.filesPreferences['files.exclude'];
            this.filterPredicate = this.createFilterPredicate(filesExcludes);
            this.fireFilterChanged();
        }
    }

    protected onPreferenceChanged(event: PreferenceChangeEvent<FileNavigatorConfiguration>): void {
    }

    protected createFilterPredicate(exclusions: FileNavigatorFilter.Exclusions): FileNavigatorFilter.Predicate {
        return new FileNavigatorFilterPredicate(this.interceptExclusions(exclusions));
    }

    toggleHiddenFiles(): void {
        this.showHiddenFiles = !this.showHiddenFiles;
        const filesExcludes = this.filesPreferences['files.exclude'];

        this.filterPredicate = this.createFilterPredicate(filesExcludes || {});
        this.fireFilterChanged();
    }

    protected interceptExclusions(exclusions: FileNavigatorFilter.Exclusions): FileNavigatorFilter.Exclusions {
        return {
            ...exclusions,
            '**/.*': this.showHiddenFiles
        };
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
         * @param hasSibling checks whether a file with the given name exists next to the item. Required to evaluate sibling clauses.
         */
        filter(item: { id: string }, hasSibling?: (name: string) => boolean): boolean;

    }

    export namespace Predicate {

        /**
         * Wraps a bunch of predicates and returns with a new one that evaluates to `true` if
         * each of the wrapped predicates evaluates to `true`. Otherwise, `false`.
         */
        export function and(...predicates: Predicate[]): Predicate {
            return {
                filter: (id, hasSibling) => predicates.every(predicate => predicate.filter(id, hasSibling))
            };
        }

    }

    /**
     * Type for the exclusion patterns. The property keys are the patterns, values are whether the exclusion is enabled or not,
     * or a sibling clause that enables the exclusion only if a matching sibling exists (e.g. `{ "when": "$(basename).ts" }`).
     */
    export interface Exclusions {
        [key: string]: boolean | SiblingClause;
    }

}

/**
 * Concrete filter navigator filter predicate that is decoupled from the preferences.
 */
export class FileNavigatorFilterPredicate implements FileNavigatorFilter.Predicate {

    private readonly delegate: FileNavigatorFilter.Predicate;

    constructor(exclusions: FileNavigatorFilter.Exclusions) {
        const delegates = Object.keys(exclusions)
            .filter(pattern => !!exclusions[pattern])
            .map(pattern => this.createDelegate(pattern, exclusions[pattern]));
        this.delegate = FileNavigatorFilter.Predicate.and(...delegates);
    }

    filter(item: { id: string }, hasSibling?: (name: string) => boolean): boolean {
        return this.delegate.filter(item, hasSibling);
    }

    protected createDelegate(pattern: string, value: boolean | SiblingClause = true): FileNavigatorFilter.Predicate {
        const delegate = new Minimatch(pattern);
        const when = typeof value === 'object' && typeof value.when === 'string' ? value.when : undefined;
        return {
            filter: (item, hasSibling) => {
                if (!delegate.match(item.id)) {
                    return true;
                }
                if (when === undefined) {
                    return false;
                }
                if (typeof hasSibling !== 'function') {
                    return true;
                }
                const name = new Path(item.id).name;
                return !hasSibling(when.replace('$(basename)', name));
            }
        };
    }

}
