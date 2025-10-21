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

import { injectable, inject } from '@theia/core/shared/inversify';
import { URI, Path } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

/**
 * Validates files added to the AI Chat context, to avoid misleading users when the LLM
 * hallucinates a file that doesn't exist (or is outside of the workspace).
 */
@injectable()
export class ContextFileValidationService {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    /**
     * Validates if a file exists in the filesystem and is within the workspace.
     * @param pathOrUri The path string or URI of the file to validate
     * @returns true if the file exists within the workspace, false otherwise
     */
    async validateFile(pathOrUri: string | URI): Promise<boolean> {
        const resolvedUri = await this.resolveUri(pathOrUri);

        if (!resolvedUri) {
            return false;
        }

        // Check if the URI is within the workspace
        if (!this.isInWorkspace(resolvedUri)) {
            return false;
        }

        try {
            const exists = await this.fileService.exists(resolvedUri);
            return exists;
        } catch (error) {
            // If we can't check existence (e.g., no provider), assume invalid
            return false;
        }
    }

    /**
     * Checks if the given URI is within any of the workspace roots.
     * @param uri The URI to check
     * @returns true if the URI is within the workspace, false otherwise
     */
    protected isInWorkspace(uri: URI): boolean {
        const workspaceRoots = this.workspaceService.tryGetRoots();

        // If no workspace is open, reject all files
        if (workspaceRoots.length === 0) {
            return false;
        }

        // Check if the URI is under any workspace root
        for (const root of workspaceRoots) {
            const rootUri = root.resource;
            if (rootUri.scheme === uri.scheme && rootUri.isEqualOrParent(uri)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Resolves a path string or URI to an absolute URI.
     * Handles three formats:
     * - Relative paths: 'src/index.tsx'
     * - Absolute file paths: '/home/user/workspace/src/index.tsx'
     * - File URIs: 'file:///home/user/workspace/src/index.tsx'
     */
    protected async resolveUri(pathOrUri: string | URI): Promise<URI | undefined> {
        if (pathOrUri instanceof URI) {
            return pathOrUri;
        }

        if (!pathOrUri) {
            return undefined;
        }

        // Try to parse as a URI first (handles file:// and other URI schemes)
        // Only treat it as a URI if it explicitly has a scheme in the input string
        if (pathOrUri.includes('://')) {
            try {
                const uri = new URI(pathOrUri);
                return uri;
            } catch (error) {
                // Not a valid URI string, continue with path-based resolution
            }
        }

        // At this point, it's either an absolute file path or a relative path
        const normalizedPath = Path.normalizePathSeparator(pathOrUri);
        const path = new Path(normalizedPath);

        // Reject paths with parent directory references for security and clarity
        if (normalizedPath.includes('..')) {
            return undefined;
        }

        // Check if the path is absolute (starts with / or a drive letter on Windows)
        if (path.isAbsolute) {
            // It's an absolute file path without scheme, convert to file:// URI
            return URI.fromFilePath(normalizedPath);
        }

        // For relative paths, try to resolve against workspace roots
        const workspaceRoots = this.workspaceService.tryGetRoots();
        for (const root of workspaceRoots) {
            const uri = root.resource.resolve(normalizedPath);
            try {
                if (await this.fileService.exists(uri)) {
                    return uri;
                }
            } catch (error) {
                // Continue to next workspace root if this one fails
                continue;
            }
        }

        // If not found in any workspace root, return first workspace root + path
        // (file doesn't exist, but we need a URI for validation)
        if (workspaceRoots.length > 0) {
            return workspaceRoots[0].resource.resolve(normalizedPath);
        }

        // No workspace roots available
        return undefined;
    }
}
