/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { MarkerManager } from '../marker-manager';
import { PROBLEM_KIND } from '../../common/problem-marker';
import { Marker } from '../../common/marker';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { FileSystemWatcher } from '@theia/filesystem/lib/browser/filesystem-watcher';
import URI from '@theia/core/lib/common/uri';
import { Diagnostic } from "vscode-languageserver-types";

export interface ProblemStat {
    errors: number;
    warnings: number;
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

    getProblemStat(): ProblemStat {
        const allMarkers: Marker<Diagnostic>[] = [];
        for (const uri of this.getUris()) {
            allMarkers.push(...this.findMarkers({ uri: new URI(uri) }));
        }

        const errors = allMarkers.filter(m => m.data.severity === 1).length;
        const warnings = allMarkers.filter(m => m.data.severity === 2).length;

        return { errors, warnings };
    }

}
