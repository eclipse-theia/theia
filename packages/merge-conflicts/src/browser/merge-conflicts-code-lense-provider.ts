/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable } from 'inversify';
import { CodeLensProvider, CodeLensParams, CodeLens, CancellationToken } from '@theia/languages/lib/browser';
import { MergeConflictsProvider } from './merge-conflicts-provider';
import { MergeConflict, MergeConflictsCommands as Commands, MergeConflictCommandArgument } from './merge-conflict';

@injectable()
export class MergeConflictsCodeLensProvider implements CodeLensProvider {

    @inject(MergeConflictsProvider)
    protected readonly mergeConflictsProvider: MergeConflictsProvider;

    async provideCodeLenses(params: CodeLensParams, token: CancellationToken): Promise<CodeLens[]> {
        const uri = params.textDocument.uri;
        const mergeConflicts = await this.mergeConflictsProvider.get(uri);
        const result: CodeLens[] = [];
        if (mergeConflicts) {
            mergeConflicts.forEach(mergeConflict => result.push(...this.toCodeLense(uri, mergeConflict)));
        }
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
