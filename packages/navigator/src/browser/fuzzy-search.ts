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

import * as fuzzy from 'fuzzy';
import { injectable } from 'inversify';

@injectable()
export class FuzzySearch {

    private static readonly PRE = '\x01';
    private static readonly POST = '\x02';

    /**
     * Filters the input and returns with an array that contains all items that match the pattern.
     */
    async filter<T>(input: FuzzySearch.Input<T>): Promise<FuzzySearch.Match<T>[]> {
        return fuzzy.filter(input.pattern, input.items.slice(), {
            pre: FuzzySearch.PRE,
            post: FuzzySearch.POST,
            extract: input.transform
        }).sort(this.sortResults.bind(this)).map(this.mapResult.bind(this));
    }

    protected sortResults<T>(left: fuzzy.FilterResult<T>, right: fuzzy.FilterResult<T>): number {
        return left.index - right.index;
    }

    protected mapResult<T>(result: fuzzy.FilterResult<T>): FuzzySearch.Match<T> {
        return {
            item: result.original,
            ranges: this.mapRanges(result.string)
        };
    }

    protected mapRanges(input: string): ReadonlyArray<FuzzySearch.Range> {
        const copy = input.split('').filter(s => s !== '');
        const ranges: FuzzySearch.Range[] = [];
        const validate = (pre: number, post: number) => {
            if (preIndex > postIndex || (preIndex === -1) !== (postIndex === -1)) {
                throw new Error(`Error when trying to map ranges. Escaped string was: '${input}. [${[...input].join('|')}]'`);
            }
        };
        let preIndex = copy.indexOf(FuzzySearch.PRE);
        let postIndex = copy.indexOf(FuzzySearch.POST);
        validate(preIndex, postIndex);
        while (preIndex !== -1 && postIndex !== -1) {
            ranges.push({
                offset: preIndex,
                length: postIndex - preIndex - 1
            });
            copy.splice(postIndex, 1);
            copy.splice(preIndex, 1);
            preIndex = copy.indexOf(FuzzySearch.PRE);
            postIndex = copy.indexOf(FuzzySearch.POST);
        }
        if (ranges.length === 0) {
            throw new Error(`Unexpected zero ranges for match-string: ${input}.`);
        }
        return ranges;
    }

}

/**
 * Fuzzy searcher.
 */
export namespace FuzzySearch {

    /**
     * A range representing the match region.
     */
    export interface Range {

        /**
         * The zero based offset of the match region.
         */
        readonly offset: number;

        /**
         * The length of the match region.
         */
        readonly length: number;
    }

    /**
     * A fuzzy search match.
     */
    export interface Match<T> {

        /**
         * The original item.
         */
        readonly item: T;

        /**
         * An array of ranges representing the match regions.
         */
        readonly ranges: ReadonlyArray<Range>;
    }

    /**
     * The fuzzy search input.
     */
    export interface Input<T> {

        /**
         * The pattern to match.
         */
        readonly pattern: string;

        /**
         * The items to filter based on the `pattern`.
         */
        readonly items: ReadonlyArray<T>;

        /**
         * Function that extracts the string from the inputs which will be used to evaluate the fuzzy matching filter.
         */
        readonly transform: (item: T) => string;

    }

}
