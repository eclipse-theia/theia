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

export function* split(s: string, splitter: string): IterableIterator<string> {
    let start = 0;
    while (start < s.length) {
        let end = s.indexOf(splitter, start);
        if (end === -1) {
            end = s.length;
        }

        yield s.substring(start, end);
        start = end + splitter.length;
    }
}

export function escapeInvisibleChars(value: string): string {
    return value.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

export function unescapeInvisibleChars(value: string): string {
    return value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
}

export function escapeRegExpCharacters(value: string): string {
    return value.replace(/[\-\\\{\}\*\+\?\|\^\$\.\[\]\(\)\#]/g, '\\$&');
}

/**
 * Format string by replacing the '{n}' pattern with given string(s).
 * @param value string to format
 * @param args strings for replacements
 */
// tslint:disable-next-line:no-any
export function format(value: string, ...args: string[]): string {
    if (args.length !== 0) {
        return value.replace(/{(\d+)}/g, (found, n) => {
            const i = parseInt(n);
            return isNaN(i) || i < 0 || i >= args.length ? found : args[i];
        });
    }
    return value;
}
