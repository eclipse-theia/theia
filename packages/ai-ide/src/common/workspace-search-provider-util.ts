// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { LinePreview, SearchInWorkspaceResult } from '@theia/search-in-workspace/lib/common/search-in-workspace-interface';
import { URI } from '@theia/core';

/**
 * Optimizes search results for token efficiency while preserving all information.
 * - Groups matches by file to reduce repetition
 * - Trims leading/trailing whitespace from line text
 * - Uses relative file paths
 * - Preserves all line numbers and content
 */
export function optimizeSearchResults(results: SearchInWorkspaceResult[], workspaceRoot: URI): Array<{ file: string; matches: Array<{ line: number; text: string }> }> {
    return results.map(result => {
        const fileUri = new URI(result.fileUri);
        const relativePath = workspaceRoot.relative(fileUri);

        return {
            file: relativePath ? relativePath.toString() : result.fileUri,
            matches: result.matches.map(match => {
                let lineText: string;
                if (typeof match.lineText === 'string') {
                    lineText = match.lineText;
                } else {
                    const linePreview = match.lineText as LinePreview;
                    lineText = linePreview.text || '';
                }

                return {
                    line: match.line,
                    text: lineText.trim()
                };
            })
        };
    });
}
