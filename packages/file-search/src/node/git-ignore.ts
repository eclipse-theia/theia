/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as parser from 'gitignore-parser';
import * as fs from "fs-extra";
import * as path from "path";

export interface GitIgnore {
    isFiltered(fileName: string): boolean;
}

export class GitIgnoreImpl implements GitIgnore {

    private positives: RegExp;
    private negatives: RegExp;

    constructor(gitIgnoreContent: string, private parent?: GitIgnore) {
        const result = parser.parse(gitIgnoreContent);
        this.negatives = new RegExp(result[0][0]);
        this.positives = new RegExp(result[1][0]);
    }

    isFiltered(fileName: string): boolean {
        if (this.positives.test(fileName)) {
            return false;
        }
        if (this.negatives.test(fileName)) {
            return true;
        }
        if (this.parent) {
            return this.parent.isFiltered(fileName);
        } else {
            return false;
        }
    }
}

export const NO_IGNORE: GitIgnore = {
    isFiltered(fileName: string): boolean { return false; }
};

export async function findContainingGitIgnore(basePath: string): Promise<GitIgnore> {
    const result = await findGitIgnore(basePath, NO_IGNORE);
    if (result !== NO_IGNORE) {
        return result;
    }
    const parent = path.resolve(basePath, '..');
    if (parent === basePath) {
        return NO_IGNORE;
    }
    return findContainingGitIgnore(parent);
}

export async function findGitIgnore(dir: string, parent: GitIgnore): Promise<GitIgnore> {
    try {
        const fullPath = path.join(dir, '.gitignore');
        const exists = await fs.pathExists(fullPath);
        if (!exists) {
            return parent;
        }
        const contents = await fs.readFile(fullPath, 'utf-8');
        return new GitIgnoreImpl(contents, parent);
    } catch {
        return parent;
    }
}
