/********************************************************************************
 * Copyright (C) 2021 TypeFox and others.
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

import { URI, Utils } from 'vscode-uri';

/**
 * Contains various utility functions related to the URI class
 */
export namespace Uri {

    export function isEqual(a: URI, b: URI, caseSensitive = true): boolean {
        return isSchemeAndAuthorityEqual(a, b) && Path.isEqual(a.path, b.path, caseSensitive);
    }

    export function isEqualOrParent(path: URI, candidate: URI, caseSensitive = true): boolean {
        return isSchemeAndAuthorityEqual(path, candidate) && Path.isEqualOrParent(path.path, candidate.path, caseSensitive);
    }

    function isSchemeAndAuthorityEqual(a: URI, b: URI): boolean {
        return a.scheme === b.scheme && a.authority === b.authority;
    }

    export function getDistinctParents(uris: URI[]): URI[] {
        const result: URI[] = [];
        uris.forEach((uri, i) => {
            if (!uris.some((otherUri, index) => index !== i && isEqualOrParent(otherUri, uri))) {
                result.push(uri);
            }
        });
        return result;
    }

    export function allLocations(uri: URI): URI[] {
        const locations = [];
        let location: URI = uri;
        while (!Path.isRoot(location.path) && Path.hasDir(location.path)) {
            locations.push(location);
            location = Uri.dirname(location);
        }
        locations.push(location);
        return locations;
    }

    export function displayName(uri: URI): string {
        const base = basename(uri);
        if (base) {
            return base;
        }
        if (Path.isAbsolute(uri.path)) {
            return uri.path;
        }
        return '';
    }

    export function fsPath(uri: string | URI, isFile = false): string {
        if (typeof uri === 'string') {
            uri = Path.normalize(uri);
            uri = isFile ? URI.file(uri) : URI.parse(uri);
        }
        return uri.fsPath.replace(/\\/g, '/');
    }

    export function getRoot(uri: URI): URI {
        return URI.parse(Path.getRoot(uri.toString()));
    }

    export function joinPath(uri: URI, ...paths: string[]): URI {
        return Utils.joinPath(uri, ...paths);
    }

    export function resolvePath(uri: URI, ...paths: string[]): URI {
        return Utils.resolvePath(uri, ...paths);
    }

    export function dirname(uri: URI): URI {
        return Utils.dirname(uri);
    }

    export function basename(uri: URI): string {
        return Utils.basename(uri);
    }

    export function name(uri: URI): string {
        const base = basename(uri);
        const ext = extname(uri);
        return base.substring(0, base.length - ext.length);
    }

    export function extname(uri: URI): string {
        return Utils.extname(uri);
    }
}

/**
 * Contains various utility functions related to path strings
 */
export namespace Path {

    export const separator = '/';

    export function isEqual(pathA: string, pathB: string, caseSensitive = true): boolean {
        return caseSensitive
            ? pathA === pathB
            : pathA.toLowerCase() === pathB.toLowerCase();
    }

    export function isEqualOrParent(path: string, candidate: string, caseSensitive = true): boolean {
        if (!caseSensitive) {
            path = path.toLowerCase();
            candidate = candidate.toLowerCase();
        }
        return relative(path, candidate) !== undefined;
    }

    /**
     * Tildify path, replacing `home` with `~` if user's `home` is present at the beginning of the path.
     * This is a non-operation for Windows.
     *
     * @param resourcePath
     * @param home
     */
    export function tildify(resourcePath: string, home: string): string {
        const isWindows = isDrive(resourcePath);
        if (!isWindows && home && resourcePath.indexOf(`${home}/`) === 0) {
            return resourcePath.replace(`${home}/`, '~/');
        }

        return resourcePath;
    }

    /**
     * Untildify path, replacing `~` with `home` if `~` present at the beginning of the path.
     * This is a non-operation for Windows.
     *
     * @param resourcePath
     * @param home
     */
    export function untildify(resourcePath: string, home: string): string {
        if (resourcePath.startsWith('~')) {
            const untildifiedResource = resourcePath.replace(/^~/, home);
            const isWindows = isDrive(untildifiedResource);
            if (!isWindows && home && untildifiedResource.startsWith(`${home}`)) {
                return untildifiedResource;
            }
        }
        return resourcePath;
    }

    export function isPathSeparator(code: number): boolean {
        return code === 47 || code === 92;
    }

    /**
     * Takes a Windows OS path and changes backward slashes to forward slashes.
     * This should only be done for OS paths from Windows (or user provided paths potentially from Windows).
     * Using it on a Linux or MaxOS path might change it.
     */
    export function toSlashes(osPath: string): string {
        return osPath.replace(/[\\/]/g, separator);
    }

    /**
     * Computes the _root_ this path, like `getRoot('c:\files') === c:\`,
     * `getRoot('files:///files/path') === files:///`,
     * or `getRoot('\\server\shares\path') === \\server\shares\`
     */
    export function getRoot(path: string): string {

        if (!path) {
            return '';
        }

        const len = path.length;
        const firstLetter = path.charCodeAt(0);
        if (isPathSeparator(firstLetter)) {
            if (isPathSeparator(path.charCodeAt(1))) {
                // UNC candidate \\localhost\shares\ddd
                //               ^^^^^^^^^^^^^^^^^^^
                if (!isPathSeparator(path.charCodeAt(2))) {
                    let pos = 3;
                    const start = pos;
                    for (; pos < len; pos++) {
                        if (isPathSeparator(path.charCodeAt(pos))) {
                            break;
                        }
                    }
                    if (start !== pos && !isPathSeparator(path.charCodeAt(pos + 1))) {
                        pos += 1;
                        for (; pos < len; pos++) {
                            if (isPathSeparator(path.charCodeAt(pos))) {
                                return toSlashes(path.slice(0, pos + 1)); // consume this separator
                            }
                        }
                    }
                }
            }

            // /user/far
            // ^
            return separator;

        } else if (isWindowsDriveLetter(firstLetter)) {
            // check for windows drive letter c:\ or c:

            if (path.charCodeAt(1) === 58) {
                if (isPathSeparator(path.charCodeAt(2))) {
                    // C:\fff
                    // ^^^
                    return path.slice(0, 2) + separator;
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
        let index = path.indexOf('://');
        if (index !== -1) {
            index += 3; // 3 -> "://".length
            for (; index < len; index++) {
                if (isPathSeparator(path.charCodeAt(index))) {
                    return path.slice(0, index + 1); // consume this separator
                }
            }
        }

        return '';
    }

    export function hasDir(path: string): boolean {
        return !isRoot(path) && path.lastIndexOf(separator) !== -1;
    }

    const driveRegex = /^\/?[a-zA-Z]:\/?/;
    const onlyDriveRegex = new RegExp(`${driveRegex.source}$`);

    export function isDrive(path: string): boolean {
        return driveRegex.test(path);
    }

    function isWindowsDriveLetter(char0: number): boolean {
        return char0 >= 65 /* A */ && char0 <= 90 /* Z */ || char0 >= 97 /* a */ && char0 <= 122 /* z */;
    }

    export function isAbsolute(path: string): boolean {
        return path.charCodeAt(0) === 47 || isDrive(path);
    }

    export function normalize(parts: string | string[]): string {
        const path = typeof parts === 'string' ? toSlashes(parts) : parts.join(separator);
        const trailingSlash = path.endsWith(separator);
        const pathArray = path.split(separator);
        const resultArray: string[] = [];
        for (const value of pathArray) {
            if (!value || value === '.') {
                continue;
            }
            if (value === '..') {
                if (resultArray.length && resultArray[resultArray.length - 1] !== '..') {
                    resultArray.pop();
                } else if (!isAbsolute(path)) {
                    resultArray.push('..');
                }
            } else {
                resultArray.push(value);
            }
        }
        if (resultArray.length === 0) {
            if (isRoot(path)) {
                return separator;
            } else {
                return '.';
            }
        }
        return (isAbsolute(path) ? separator : '') + resultArray.join(separator) + (trailingSlash ? separator : '');
    }

    export function relative(pathA: string, pathB: string): string | undefined {
        pathA = normalize(pathA);
        pathB = normalize(pathB);
        if (pathA === pathB) {
            return '';
        }
        if (!pathA || !pathB) {
            return undefined;
        }
        if (!pathA.endsWith(separator)) {
            pathA += separator;
        }
        if (!pathB.startsWith(pathA)) {
            return undefined;
        }
        let relativePath = pathB.substr(pathA.length);
        if (isAbsolute(relativePath) && relativePath.length > 1) {
            relativePath = relativePath.substring(1);
        }
        return relativePath;
    }

    export function isRoot(path: string): boolean {
        return isAbsolute(path) && (path.length === 1 || onlyDriveRegex.test(path));
    }

    export function relativity(pathA: string, pathB: string): number {
        const relativePath = relative(pathA, pathB);
        if (relativePath !== undefined) {
            if (relativePath === '') {
                return 0;
            }
            return relativePath.split(separator).length;
        }
        return -1;
    }
}
