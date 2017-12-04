/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Disposable } from "vscode-jsonrpc";

export interface GitLocateOptions {
    readonly maxCount?: number;
}

export const GitLocator = Symbol('GitLocator');
export interface GitLocator extends Disposable {

    /**
     * Resolves repositoriy paths under the given absolute path.
     */
    locate(path: string, options: GitLocateOptions): Promise<string[]>;

}
