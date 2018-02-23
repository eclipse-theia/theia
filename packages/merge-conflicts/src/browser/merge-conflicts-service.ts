/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Workspace } from "@theia/languages/lib/browser";
import { MergeConflictsParser } from "./merge-conflicts-parser";
import { MergeConflict } from "./merge-conflict";
import { Emitter, Event } from '@theia/core/lib/common/event';

@injectable()
export class MergeConflictsService {

    private onMergeConflictUpdateEmitter = new Emitter<MergeConflictUpdateParams>();

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(MergeConflictsParser) protected readonly mergeConflictParser: MergeConflictsParser,
    ) { }

    get(uri: string): MergeConflict[] {
        const mergeConflicts = this.getMergeConflicts(uri);
        this.onMergeConflictUpdateEmitter.fire({ uri, mergeConflicts });
        return mergeConflicts;
    }

    protected getMergeConflicts(uri: string): MergeConflict[] {
        const document = this.workspace.textDocuments.find(d => d.uri === uri);
        if (!document) {
            return [];
        }
        const mergeConflicts: MergeConflict[] = this.mergeConflictParser.parse(document.getText());
        return mergeConflicts;
    }

    get onMergeConflictUpdate(): Event<MergeConflictUpdateParams> {
        return this.onMergeConflictUpdateEmitter.event;
    }

}

export interface MergeConflictUpdateParams {
    uri: string,
    mergeConflicts: MergeConflict[]
}
