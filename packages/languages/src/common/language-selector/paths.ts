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

// copied from https://github.com/Microsoft/vscode/blob/bf7ac9201e7a7d01741d4e6e64b5dc9f3197d97b/src/vs/base/common/paths.ts
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-void */
/* eslint-disable no-null/no-null */
'use strict';
import { isWindows } from '@theia/core/lib/common/os';
import { startsWithIgnoreCase } from '@theia/core/lib/common/strings';
import { CharCode } from '@theia/core/lib/common/char-code';

/**
 * The forward slash path separator.
 */
export const sep = '/';

/**
 * The native path separator depending on the OS.
 */
export const nativeSep = isWindows ? '\\' : '/';

const _posixBadPath = /(\/\.\.?\/)|(\/\.\.?)$|^(\.\.?\/)|(\/\/+)|(\\)/;
const _winBadPath = /(\\\.\.?\\)|(\\\.\.?)$|^(\.\.?\\)|(\\\\+)|(\/)/;

function _isNormal(path: string, win: boolean): boolean {
    return win
        ? !_winBadPath.test(path)
        : !_posixBadPath.test(path);
}

/**
 * @returns the base name of a path.
 */
export function basename(path: string): string {
    const idx = ~path.lastIndexOf('/') || ~path.lastIndexOf('\\');
    if (idx === 0) {
        return path;
    } else if (~idx === path.length - 1) {
        return basename(path.substring(0, path.length - 1));
    } else {
        return path.substr(~idx + 1);
    }
}

/**
 * @returns `.far` from `boo.far` or the empty string.
 */
export function extname(path: string): string {
    path = basename(path);
    const idx = ~path.lastIndexOf('.');
    return idx ? path.substring(~idx) : '';
}

export function normalize(path: string, toOSPath?: boolean): string {
    if (path === null || path === void 0) {
        return path;
    }

    const len = path.length;
    if (len === 0) {
        return '.';
    }

    const wantsBackslash = isWindows && toOSPath;
    if (_isNormal(path, wantsBackslash!)) {
        return path;
    }

    // eslint-disable-next-line no-shadow
    const sep = wantsBackslash ? '\\' : '/';
    const root = getRoot(path, sep);

    // skip the root-portion of the path
    let start = root.length;
    let skip = false;
    let res = '';

    for (let end = root.length; end <= len; end++) {

        // either at the end or at a path-separator character
        if (end === len || path.charCodeAt(end) === CharCode.Slash || path.charCodeAt(end) === CharCode.Backslash) {

            if (streql(path, start, end, '..')) {
                // skip current and remove parent (if there is already something)
                const prev_start = res.lastIndexOf(sep);
                const prev_part = res.slice(prev_start + 1);
                if ((root || prev_part.length > 0) && prev_part !== '..') {
                    res = prev_start === -1 ? '' : res.slice(0, prev_start);
                    skip = true;
                }
            } else if (streql(path, start, end, '.') && (root || res || end < len - 1)) {
                // skip current (if there is already something or if there is more to come)
                skip = true;
            }

            if (!skip) {
                const part = path.slice(start, end);
                if (res !== '' && res[res.length - 1] !== sep) {
                    res += sep;
                }
                res += part;
            }
            start = end + 1;
            skip = false;
        }
    }

    return root + res;
}
function streql(value: string, start: number, end: number, other: string): boolean {
    return start + other.length === end && value.indexOf(other, start) === start;
}

/**
 * Computes the _root_ this path, like `getRoot('c:\files') === c:\`,
 * `getRoot('files:///files/path') === files:///`,
 * or `getRoot('\\server\shares\path') === \\server\shares\`
 */
// eslint-disable-next-line no-shadow
export function getRoot(path: string, sep: string = '/'): string {

    if (!path) {
        return '';
    }

    const len = path.length;
    let code = path.charCodeAt(0);
    if (code === CharCode.Slash || code === CharCode.Backslash) {

        code = path.charCodeAt(1);
        if (code === CharCode.Slash || code === CharCode.Backslash) {
            // UNC candidate \\localhost\shares\ddd
            //               ^^^^^^^^^^^^^^^^^^^
            code = path.charCodeAt(2);
            if (code !== CharCode.Slash && code !== CharCode.Backslash) {
                // eslint-disable-next-line no-shadow
                let pos = 3;
                const start = pos;
                for (; pos < len; pos++) {
                    code = path.charCodeAt(pos);
                    if (code === CharCode.Slash || code === CharCode.Backslash) {
                        break;
                    }
                }
                code = path.charCodeAt(pos + 1);
                if (start !== pos && code !== CharCode.Slash && code !== CharCode.Backslash) {
                    pos += 1;
                    for (; pos < len; pos++) {
                        code = path.charCodeAt(pos);
                        if (code === CharCode.Slash || code === CharCode.Backslash) {
                            return path.slice(0, pos + 1) // consume this separator
                                .replace(/[\\/]/g, sep);
                        }
                    }
                }
            }
        }

        // /user/far
        // ^
        return sep;

    } else if ((code >= CharCode.A && code <= CharCode.Z) || (code >= CharCode.a && code <= CharCode.z)) {
        // check for windows drive letter c:\ or c:

        if (path.charCodeAt(1) === CharCode.Colon) {
            code = path.charCodeAt(2);
            if (code === CharCode.Slash || code === CharCode.Backslash) {
                // C:\fff
                // ^^^
                return path.slice(0, 2) + sep;
            } else {
                // C:
                // ^^
                return path.slice(0, 2);
            }
        }
    }

    // check for URI
    // scheme://authority/path
    // ^^^^^^^^^^^^^^^^^^^
    let pos = path.indexOf('://');
    if (pos !== -1) {
        pos += 3; // 3 -> "://".length
        for (; pos < len; pos++) {
            code = path.charCodeAt(pos);
            if (code === CharCode.Slash || code === CharCode.Backslash) {
                return path.slice(0, pos + 1); // consume this separator
            }
        }
    }

    return '';
}

export function isEqualOrParent(path: string, candidate: string, ignoreCase?: boolean): boolean {
    if (path === candidate) {
        return true;
    }

    if (!path || !candidate) {
        return false;
    }

    if (candidate.length > path.length) {
        return false;
    }

    if (ignoreCase) {
        const beginsWith = startsWithIgnoreCase(path, candidate);
        if (!beginsWith) {
            return false;
        }

        if (candidate.length === path.length) {
            return true; // same path, different casing
        }

        let sepOffset = candidate.length;
        if (candidate.charAt(candidate.length - 1) === nativeSep) {
            sepOffset--; // adjust the expected sep offset in case our candidate already ends in separator character
        }

        return path.charAt(sepOffset) === nativeSep;
    }

    if (candidate.charAt(candidate.length - 1) !== nativeSep) {
        candidate += nativeSep;
    }

    return path.indexOf(candidate) === 0;
}
