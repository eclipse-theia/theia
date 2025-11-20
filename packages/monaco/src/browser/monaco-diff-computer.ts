// *****************************************************************************
// Copyright (C) 2025 1C-Soft LLC and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { Diff, DiffComputer } from '@theia/core/lib/common/diff';
import URI from '@theia/core/lib/common/uri';
import { Range } from '@theia/core/shared/vscode-languageserver-protocol';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { IEditorWorkerService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/editorWorker';

@injectable()
export class MonacoDiffComputer implements DiffComputer {

    async computeDiff(left: URI, right: URI): Promise<Diff | undefined> {
        const diff = await StandaloneServices.get(IEditorWorkerService).computeDiff(
            left['codeUri'],
            right['codeUri'],
            {
                ignoreTrimWhitespace: false,
                maxComputationTimeMs: 0,
                computeMoves: false,
            },
            'advanced'
        );

        if (!diff) {
            return undefined;
        }

        const convertLineRange = (r: { startLineNumber: number; endLineNumberExclusive: number }) => ({
            start: r.startLineNumber - 1,
            end: r.endLineNumberExclusive - 1
        });

        const convertRange = (r: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }) =>
            Range.create(r.startLineNumber - 1, r.startColumn - 1, r.endLineNumber - 1, r.endColumn - 1);

        const changes = diff.changes.map(c => ({
            left: convertLineRange(c.original),
            right: convertLineRange(c.modified),
            innerChanges: c.innerChanges?.map(ic => ({
                left: convertRange(ic.originalRange),
                right: convertRange(ic.modifiedRange)
            }))
        }));

        return { changes };
    }
}
