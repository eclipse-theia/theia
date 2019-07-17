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
import { ProblemMatcher, ProblemMatch } from '../common/problem-matcher-protocol';
import { StartStopLineMatcher, WatchModeLineMatcher } from './task-line-matchers';

export class ProblemCollector {

    private lineMatchers: AbstractLineMatcher[] = [];

    constructor(
        protected problemMatchers: ProblemMatcher[]
    ) {
        for (const matcher of problemMatchers) {
            if (ProblemMatcher.isWatchModeWatcher(matcher)) {
                this.lineMatchers.push(new WatchModeLineMatcher(matcher));
            } else {
                this.lineMatchers.push(new StartStopLineMatcher(matcher));
            }
        }
    }

    processLine(line: string): ProblemMatch[] {
        const markers: ProblemMatch[] = [];
        this.lineMatchers.forEach(lineMatcher => {
            const match = lineMatcher.match(line);
            if (match) {
                markers.push(match);
            }
        });
        return markers;
    }
}
