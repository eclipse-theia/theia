/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

/**
 * On POSIX:
 * ┌──────────────────────┬────────────┐
 * │          dir         │    base    │
 * ├──────┬               ├──────┬─────┤
 * │ root │               │ name │ ext │
 * "  /     home/user/dir / file  .txt "
 * └──────┴───────────────┴──────┴─────┘
 *
 * On Windows:
 * ┌──────────────────────┬────────────┐
 * │           dir        │    base    │
 * ├──────┬               ├──────┬─────┤
 * │ root │               │ name │ ext │
 * "  /c: / home/user/dir / file  .txt "
 * └──────┴───────────────┴──────┴─────┘
 */
export class Path {
    static separator: '/' = '/';

    static isDrive(segment: string): boolean {
        return segment.endsWith(':');
    }

    /**
     * vscode-uri always normalizes drive letters to lower case:
     * https://github.com/Microsoft/vscode-uri/blob/b1d3221579f97f28a839b6f996d76fc45e9964d8/src/index.ts#L1025
     * Theia path should be adjusted to this.
     */
    static normalizeDrive(path: string): string {
        // lower-case windows drive letters in /C:/fff or C:/fff
        if (path.length >= 3 && path.charCodeAt(0) === 47 /* '/' */ && path.charCodeAt(2) === 58 /* ':' */) {
            const code = path.charCodeAt(1);
            if (code >= 65 /* A */ && code <= 90 /* Z */) {
                path = `/${String.fromCharCode(code + 32)}:${path.substr(3)}`; // "/c:".length === 3
            }
        } else if (path.length >= 2 && path.charCodeAt(1) === 58 /* ':' */) {
            const code = path.charCodeAt(0);
            if (code >= 65 /* A */ && code <= 90 /* Z */) {
                path = `${String.fromCharCode(code + 32)}:${path.substr(2)}`; // "/c:".length === 3
            }
        }
        return path;
    }

    readonly isAbsolute: boolean;
    readonly isRoot: boolean;
    readonly root: Path | undefined;
    readonly base: string;
    readonly name: string;
    readonly ext: string;

    private _dir: Path;
    private readonly raw: string;

    /**
     * The raw should be normalized, meaning that only '/' is allowed as a path separator.
     */
    constructor(
        raw: string
    ) {
        this.raw = Path.normalizeDrive(raw);
        const firstIndex = raw.indexOf(Path.separator);
        const lastIndex = raw.lastIndexOf(Path.separator);
        this.isAbsolute = firstIndex === 0;
        this.base = lastIndex === -1 ? raw : raw.substr(lastIndex + 1);
        this.isRoot = this.isAbsolute && firstIndex === lastIndex && (!this.base || Path.isDrive(this.base));
        this.root = this.computeRoot();

        const extIndex = this.base.lastIndexOf('.');
        this.name = extIndex === -1 ? this.base : this.base.substr(0, extIndex);
        this.ext = extIndex === -1 ? '' : this.base.substr(extIndex);
    }

    protected computeRoot(): Path | undefined {
        // '/' -> '/'
        // '/c:' -> '/c:'
        if (this.isRoot) {
            return this;
        }
        // 'foo/bar' -> `undefined`
        if (!this.isAbsolute) {
            return undefined;
        }
        const index = this.raw.indexOf(Path.separator, Path.separator.length);
        if (index === -1) {
            // '/foo/bar' -> '/'
            return new Path(Path.separator);
        }
        // '/c:/foo/bar' -> '/c:'
        // '/foo/bar' -> '/'
        return new Path(this.raw.substr(0, index)).root;
    }

    get dir(): Path {
        if (this._dir === undefined) {
            this._dir = this.computeDir();
        }
        return this._dir;
    }

    protected computeDir(): Path {
        if (this.isRoot) {
            return this;
        }
        const lastIndex = this.raw.lastIndexOf(Path.separator);
        if (lastIndex === -1) {
            return this;
        }
        if (this.isAbsolute) {
            const firstIndex = this.raw.indexOf(Path.separator);
            if (firstIndex === lastIndex) {
                return new Path(this.raw.substr(0, firstIndex + 1));
            }
        }
        return new Path(this.raw.substr(0, lastIndex));
    }

    join(...paths: string[]): Path {
        const relativePath = paths.filter(s => !!s).join(Path.separator);
        if (!relativePath) {
            return this;
        }
        if (this.raw.endsWith(Path.separator)) {
            return new Path(this.raw + relativePath);
        }
        return new Path(this.raw + Path.separator + relativePath);
    }

    toString(): string {
        return this.raw;
    }

    relative(path: Path): Path | undefined {
        if (this.raw === path.raw) {
            return new Path('');
        }
        if (!this.raw || !path.raw) {
            return undefined;
        }
        const raw = this.base ? this.raw + Path.separator : this.raw;
        if (!path.raw.startsWith(raw)) {
            return undefined;
        }
        const relativePath = path.raw.substr(raw.length);
        return new Path(relativePath);
    }

    isEqualOrParent(path: Path): boolean {
        return !!this.relative(path);
    }

    relativity(path: Path): number {
        const relative = this.relative(path);
        if (relative) {
            const relativeStr = relative.toString();
            if (relativeStr === '') {
                return 0;
            }
            return relativeStr.split(Path.separator).length;
        }
        return -1;
    }
}
