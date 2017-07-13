/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
    public static separator: '/' = '/';

    public static isDrive(segment: string): boolean {
        return segment.endsWith(':');
    }

    readonly isAbsolute: boolean;
    readonly isRoot: boolean;
    readonly root: Path | undefined;
    readonly base: string;
    readonly name: string;
    readonly ext: string;

    private _dir: Path;

    /**
     * The raw should be normalized, meaning that only '/' is allowed as a path separator.
     */
    constructor(
        private raw: string
    ) {
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
}