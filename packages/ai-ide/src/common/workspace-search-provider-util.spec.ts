// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { expect } from 'chai';
import { OS, URI } from '@theia/core';
import { SearchInWorkspaceResult } from '@theia/search-in-workspace/lib/common/search-in-workspace-interface';
import { optimizeSearchResults, WorkspacePathResolver } from './workspace-search-provider-util';

const result = (fileUri: string): SearchInWorkspaceResult => ({
    root: 'file:///workspace',
    fileUri,
    matches: [{ line: 3, character: 1, length: 4, lineText: '    hit  ' }]
});

/** Resolves paths below `file:///workspace` and treats everything else as external. */
const workspaceResolver: WorkspacePathResolver = {
    toWorkspaceRelativePath: (uri: URI) => {
        const relative = new URI('file:///workspace').relative(uri)?.toString();
        return relative === undefined ? undefined : `workspace/${relative}`;
    }
};

describe('optimizeSearchResults', () => {

    it('returns root-prefixed relative paths and trimmed line text for workspace hits', () => {
        expect(optimizeSearchResults([result('file:///workspace/src/a.ts')], workspaceResolver)).to.deep.equal([
            { file: 'workspace/src/a.ts', matches: [{ line: 3, text: 'hit' }] }
        ]);
    });

    describe('paths outside the workspace roots', () => {
        let originalIsWindows: boolean;
        beforeEach(() => { originalIsWindows = OS.backend.isWindows; });
        afterEach(() => { OS.backend.isWindows = originalIsWindows; });

        it('falls back to the native path, so it can be passed back to the file tools', () => {
            OS.backend.isWindows = true;
            const [optimized] = optimizeSearchResults([result('file:///c%3A/external/data/x.ts')], workspaceResolver);
            expect(optimized.file).to.equal('C:\\external\\data\\x.ts');
        });

        it('falls back to the absolute path on POSIX', () => {
            OS.backend.isWindows = false;
            const [optimized] = optimizeSearchResults([result('file:///external/data/x.ts')], workspaceResolver);
            expect(optimized.file).to.equal('/external/data/x.ts');
        });
    });
});
