/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * ┌─────────────────────┬────────────┐
 * │          dir        │    base    │
 * ├──────┬              ├──────┬─────┤
 * │ root │              │ name │ ext │
 * "  /    home/user/dir / file  .txt "
 * └──────┴──────────────┴──────┴─────┘
 */
export class Path {
    public static separator: '/' = '/';
    public static root = new Path(Path.separator);

    readonly absolute: boolean;
    readonly root: boolean;
    private _dir: Path;
    readonly base: string;
    readonly name: string;
    readonly ext: string;

    constructor(
        private raw: string
    ) {
        this.absolute = raw.startsWith(Path.separator);
        const sepIndex = raw.lastIndexOf(Path.separator);
        this.root = sepIndex === 0;
        this.base = sepIndex === -1 ? raw : raw.substr(sepIndex + 1);
        const extIndex = this.base.lastIndexOf('.');
        this.name = extIndex === -1 ? this.base : this.base.substr(0, extIndex);
        this.ext = extIndex === -1 ? '' : this.base.substr(extIndex);
    }

    get dir(): Path {
        if (this._dir === undefined) {
            if (this.root) {
                this._dir = Path.root;
            } else {
                const sepIndex = this.raw.lastIndexOf(Path.separator);
                this._dir = sepIndex !== -1 ? new Path(this.raw.substr(0, sepIndex)) : this;
            }
        }
        return this._dir;
    }

    join(...segments: string[]): Path {
        const relativePath = segments.filter(s => !!s).join(Path.separator);
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