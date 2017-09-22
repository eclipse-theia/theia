/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Marker, MarkerManager } from '../marker-manager';
import { Diagnostic } from "vscode-languageserver-types";
import { injectable, inject } from 'inversify';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { FileSystemWatcher } from '@theia/filesystem/lib/common';

export const PROBLEM_KIND = 'problem';

export interface ProblemMarker extends Marker<Diagnostic> {
    kind: 'problem';
}

export namespace ProblemMarker {
    export function is(node: Marker<object>): node is ProblemMarker {
        return 'kind' in node && node.kind === PROBLEM_KIND;
    }
}

@injectable()
export class ProblemManager extends MarkerManager<Diagnostic> {

    public getKind() {
        return PROBLEM_KIND;
    }

    constructor(
        @inject(StorageService) storageService: StorageService,
        @inject(FileSystemWatcher) protected fileWatcher?: FileSystemWatcher) {
        super(storageService, fileWatcher);
    }

}