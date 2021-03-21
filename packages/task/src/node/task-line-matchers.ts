/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import { AbstractLineMatcher } from './task-abstract-line-matcher';
import { ProblemMatcher, ProblemMatch, WatchingPattern } from '../common/problem-matcher-protocol';

export class StartStopLineMatcher extends AbstractLineMatcher {

    constructor(
        protected matcher: ProblemMatcher
    ) {
        super(matcher);
    }

    /**
     * Finds the problem identified by this line matcher.
     *
     * @param line the line of text to find the problem from
     * @return the identified problem. If the problem is not found, `undefined` is returned.
     */
    match(line: string): ProblemMatch | undefined {
        if (!this.activePattern) {
            this.resetActivePatternIndex();
        }
        if (this.activePattern) {
            const originalProblemData = Object.assign(this.getEmptyProblemData(), this.cachedProblemData);
            const foundMatch = this.doOneLineMatch(line);
            if (foundMatch) {
                if (this.isUsingTheLastPattern()) {
                    const matchResult = this.getMarkerMatch(this.cachedProblemData);
                    if (this.isLastPatternLoop()) {
                        this.cachedProblemData = originalProblemData;
                    } else {
                        this.resetCachedProblemData();
                        this.resetActivePatternIndex();
                    }
                    return matchResult;
                } else {
                    this.nextProblemPattern();
                }
            } else {
                this.resetCachedProblemData();
                if (this.activePatternIndex !== 0) { // if no match, use the first pattern to parse the same line
                    this.resetActivePatternIndex();
                    return this.match(line);
                }
            }
        }
        return undefined;
    }
}

export class WatchModeLineMatcher extends StartStopLineMatcher {

    private beginsPattern: WatchingPattern;
    private endsPattern: WatchingPattern;
    activeOnStart: boolean = false;

    constructor(
        protected matcher: ProblemMatcher
    ) {
        super(matcher);
        this.beginsPattern = matcher.watching!.beginsPattern;
        this.endsPattern = matcher.watching!.endsPattern;
        this.activeOnStart = matcher.watching!.activeOnStart === true;
        this.resetActivePatternIndex(this.activeOnStart ? 0 : -1);
    }

    /**
     * Finds the problem identified by this line matcher.
     *
     * @param line the line of text to find the problem from
     * @return the identified problem. If the problem is not found, `undefined` is returned.
     */
    match(line: string): ProblemMatch | undefined {
        if (this.activeOnStart) {
            this.activeOnStart = false;
            this.resetActivePatternIndex(0);
            this.resetCachedProblemData();
            return super.match(line);
        }

        if (this.matchBegin(line)) {
            const beginsPatternMatch = this.getMarkerMatch(this.cachedProblemData);
            this.resetCachedProblemData();
            return beginsPatternMatch;
        }
        if (this.matchEnd(line)) {
            this.resetCachedProblemData();
            return undefined;
        }
        if (this.activePattern) {
            return super.match(line);
        }
        return undefined;
    }

    matchBegin(line: string): boolean {
        const beginRegexp = new RegExp(this.beginsPattern.regexp);
        const regexMatches = beginRegexp.exec(line);
        if (regexMatches) {
            this.fillProblemData(this.cachedProblemData, this.beginsPattern, regexMatches);
            this.resetActivePatternIndex(0);
            return true;
        }
        return false;
    }

    matchEnd(line: string): boolean {
        const endRegexp = new RegExp(this.endsPattern.regexp);
        const match = endRegexp.exec(line);
        if (match) {
            this.resetActivePatternIndex(-1);
            return true;
        }
        return false;
    }
}
