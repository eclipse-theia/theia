/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

// file copied from https://github.com/wjordan/browser-path/blob/master/src/node_path.ts
// Original license:
/*
====

Copyright (c) 2015 John Vilk and other contributors.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

====
*/

import { sep } from '@theia/callhierarchy/lib/common/paths';

const replaceRegex = new RegExp('//+', 'g');

export function resolve(...paths: string[]): string {
    let processed: string[] = [];
    for (const p of paths) {
        if (typeof p !== 'string') {
            throw new TypeError('Invalid argument type to path.join: ' + (typeof p));
        } else if (p !== '') {
            if (p.charAt(0) === sep) {
                processed = [];
            }
            processed.push(p);
        }
    }

    const resolved = normalize(processed.join(sep));
    if (resolved.length > 1 && resolved.charAt(resolved.length - 1) === sep) {
        return resolved.substr(0, resolved.length - 1);
    }

    return resolved;
}

export function relative(from: string, to: string): string {
    let i: number;

    from = resolve(from);
    to = resolve(to);
    const fromSegments = from.split(sep);
    const toSegments = to.split(sep);

    toSegments.shift();
    fromSegments.shift();

    let upCount = 0;
    let downSegments: string[] = [];

    for (i = 0; i < fromSegments.length; i++) {
        const seg = fromSegments[i];
        if (seg === toSegments[i]) {
            continue;
        }

        upCount = fromSegments.length - i;
        break;
    }

    downSegments = toSegments.slice(i);

    if (fromSegments.length === 1 && fromSegments[0] === '') {
        upCount = 0;
    }

    if (upCount > fromSegments.length) {
        upCount = fromSegments.length;
    }

    let rv = '';
    for (i = 0; i < upCount; i++) {
        rv += '../';
    }
    rv += downSegments.join(sep);

    if (rv.length > 1 && rv.charAt(rv.length - 1) === sep) {
        rv = rv.substr(0, rv.length - 1);
    }
    return rv;
}
export function normalize(p: string): string {

    if (p === '') {
        p = '.';
    }

    const absolute = p.charAt(0) === sep;

    p = removeDuplicateSeparators(p);

    const components = p.split(sep);
    const goodComponents: string[] = [];
    for (const c of components) {
        if (c === '.') {
            continue;
        } else if (c === '..' && (absolute || (!absolute && goodComponents.length > 0 && goodComponents[0] !== '..'))) {
            goodComponents.pop();
        } else {
            goodComponents.push(c);
        }
    }

    if (!absolute && goodComponents.length < 2) {
        switch (goodComponents.length) {
            case 1:
                if (goodComponents[0] === '') {
                    goodComponents.unshift('.');
                }
                break;
            default:
                goodComponents.push('.');
        }
    }
    p = goodComponents.join(sep);
    if (absolute && p.charAt(0) !== sep) {
        p = sep + p;
    }
    return p;
}

function removeDuplicateSeparators(p: string): string {
    p = p.replace(replaceRegex, sep);
    return p;
}
