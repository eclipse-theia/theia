// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';

export async function openTranscriptWorkspaceFile(
    filePath: string,
    workspaceService: WorkspaceService,
    editorManager: EditorManager,
): Promise<void> {
    const trimmed = filePath.trim();
    if (!trimmed) {
        return;
    }
    const uri = resolveTranscriptWorkspaceFileUri(trimmed, workspaceService);
    await editorManager.open(uri, { mode: 'reveal' });
}

export function resolveTranscriptWorkspaceFileUri(filePath: string, workspaceService: WorkspaceService): URI {
    const trimmed = filePath.trim();
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
        return new URI(trimmed);
    }
    const roots = workspaceService.tryGetRoots();
    if (roots.length > 0) {
        const root = roots[0].resource;
        if (trimmed.startsWith('/')) {
            const rootPath = FileUri.fsPath(root.toString());
            if (trimmed.startsWith(rootPath)) {
                return FileUri.create(trimmed);
            }
        }
        return root.resolve(trimmed.replace(/^\.?\//, ''));
    }
    return trimmed.startsWith('/')
        ? FileUri.create(trimmed)
        : new URI(trimmed);
}
