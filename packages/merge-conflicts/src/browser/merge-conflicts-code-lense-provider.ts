/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { CodeLensProvider, CodeLensParams, CodeLens, CancellationToken } from '@theia/languages/lib/common';
import { MergeConflict, MergeConflictsCommands as Commands, MergeConflictCommandArgument } from "./merge-conflict";
import { MergeConflictsService } from "./merge-conflicts-service";

@injectable()
export class MergeConflictsCodeLensProvider implements CodeLensProvider {

    constructor(
        @inject(MergeConflictsService) protected readonly mergeConflictsService: MergeConflictsService,
    ) { }

    provideCodeLenses(params: CodeLensParams, token: CancellationToken): Promise<CodeLens[]> {
        const uri = params.textDocument.uri;
        const mergeConflicts: MergeConflict[] = this.mergeConflictsService.get(uri);
        const result: CodeLens[] = [];
        mergeConflicts.forEach(mergeConflict => result.push(...this.toCodeLense(uri, mergeConflict)));
        return Promise.resolve(result);
    }

    protected toCodeLense(uri: string, conflict: MergeConflict): CodeLens[] {
        const result: CodeLens[] = [];
        for (const cmd of [Commands.AcceptCurrent, Commands.AcceptIncoming, Commands.AcceptBoth]) {
            result.push({
                command: {
                    command: cmd.id,
                    title: cmd.label || '',
                    arguments: [<MergeConflictCommandArgument>{ uri, conflict }]
                },
                range: conflict.current.marker!
            });
        }
        return result;
    }
}
