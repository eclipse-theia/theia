// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FILE_CONTENT_FUNCTION_ID, GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID, GET_WORKSPACE_FILE_LIST_FUNCTION_ID } from '../common/functions';

@injectable()
export class WorkspaceUtils {
    @inject(WorkspaceService)
    protected workspaceService: WorkspaceService;

    async getWorkspaceRoot(): Promise<URI> {
        const wsRoots = await this.workspaceService.roots;
        if (wsRoots.length === 0) {
            throw new Error('No workspace has been opened yet');
        }
        return wsRoots[0].resource;
    }

    ensureWithinWorkspace(targetUri: URI, workspaceRootUri: URI): void {
        if (!targetUri.toString().startsWith(workspaceRootUri.toString())) {
            throw new Error('Access outside of the workspace is not allowed');
        }
    }
    /**
     * Determines whether a given file or directory should be excluded from workspace operations.
     *
     * @param stat - The `FileStat` object representing the file or directory to check.
     * @returns `true` if the file or directory should be excluded, `false` otherwise.
     */
    shouldExclude(stat: FileStat): boolean {
        const excludedFolders = ['node_modules', 'lib'];
        return stat.resource.path.base.startsWith('.') || excludedFolders.includes(stat.resource.path.base);
    }
}

@injectable()
export class GetWorkspaceDirectoryStructure implements ToolProvider {
    static ID = GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID;

    getTool(): ToolRequest {
        return {
            id: GetWorkspaceDirectoryStructure.ID,
            name: GetWorkspaceDirectoryStructure.ID,
            description: `Retrieve the complete directory structure of the workspace, listing only directories (no file contents). This structure excludes specific directories,
            such as node_modules and hidden files, ensuring paths are within workspace boundaries.`,
            handler: () => this.getDirectoryStructure()
        };
    }

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceUtils)
    protected workspaceUtils: WorkspaceUtils;

    private async getDirectoryStructure(): Promise<string[]> {
        let workspaceRoot;
        try {
            workspaceRoot = await this.workspaceUtils.getWorkspaceRoot();
        } catch (error) {
            return [`Error: ${error.message}`];
        }

        return this.buildDirectoryStructure(workspaceRoot);
    }

    private async buildDirectoryStructure(uri: URI, prefix: string = ''): Promise<string[]> {
        const stat = await this.fileService.resolve(uri);
        const result: string[] = [];

        if (stat && stat.isDirectory && stat.children) {
            for (const child of stat.children) {
                if (!child.isDirectory || this.workspaceUtils.shouldExclude(child)) { continue; };
                const path = `${prefix}${child.resource.path.base}/`;
                result.push(path);
                result.push(...await this.buildDirectoryStructure(child.resource, `${path}`));
            }
        }

        return result;
    }
}

@injectable()
export class FileContentFunction implements ToolProvider {
    static ID = FILE_CONTENT_FUNCTION_ID;

    getTool(): ToolRequest {
        return {
            id: FileContentFunction.ID,
            name: FileContentFunction.ID,
            description: `The relative path to the target file within the workspace. This path is resolved from the workspace root, and only files within the workspace boundaries
             are accessible. Attempting to access paths outside the workspace will result in an error.`,
            parameters: {
                type: 'object',
                properties: {
                    file: {
                        type: 'string',
                        description: `Return the content of a specified file within the workspace. The file path must be provided relative to the workspace root. Only files within
                         workspace boundaries are accessible; attempting to access files outside the workspace will return an error.`,
                    }
                }
            },
            handler: (arg_string: string) => {
                const file = this.parseArg(arg_string);
                return this.getFileContent(file);
            }
        };
    }

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceUtils)
    protected readonly workspaceUtils: WorkspaceUtils;

    private parseArg(arg_string: string): string {
        const result = JSON.parse(arg_string);
        return result.file;
    }

    private async getFileContent(file: string): Promise<string> {
        let workspaceRoot;
        try {
            workspaceRoot = await this.workspaceUtils.getWorkspaceRoot();
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }

        const targetUri = workspaceRoot.resolve(file);
        this.workspaceUtils.ensureWithinWorkspace(targetUri, workspaceRoot);

        try {
            const fileStat = await this.fileService.resolve(targetUri);

            if (!fileStat || fileStat.isDirectory) {
                return JSON.stringify({ error: 'File not found' });
            }

            const fileContent = await this.fileService.read(targetUri);
            return fileContent.value;

        } catch (error) {
            return JSON.stringify({ error: 'File not found' });
        }
    }
}

@injectable()
export class GetWorkspaceFileList implements ToolProvider {
    static ID = GET_WORKSPACE_FILE_LIST_FUNCTION_ID;

    getTool(): ToolRequest {
        return {
            id: GetWorkspaceFileList.ID,
            name: GetWorkspaceFileList.ID,
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: `Optional relative path to a directory within the workspace. If no path is specified, the function lists contents directly in the workspace
                         root. Paths are resolved within workspace boundaries only; paths outside the workspace or unvalidated paths will result in an error.`
                    }
                }
            },
            description: `List files and directories within a specified workspace directory. Paths are relative to the workspace root, and only workspace-contained paths are
             allowed. If no path is provided, the root contents are listed. Paths outside the workspace will result in an error.`,
            handler: (arg_string: string) => {
                const args = JSON.parse(arg_string);
                return this.getProjectFileList(args.path);
            }
        };
    }

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceUtils)
    protected workspaceUtils: WorkspaceUtils;

    async getProjectFileList(path?: string): Promise<string[]> {
        let workspaceRoot;
        try {
            workspaceRoot = await this.workspaceUtils.getWorkspaceRoot();
        } catch (error) {
            return [`Error: ${error.message}`];
        }

        const targetUri = path ? workspaceRoot.resolve(path) : workspaceRoot;
        this.workspaceUtils.ensureWithinWorkspace(targetUri, workspaceRoot);

        try {
            const stat = await this.fileService.resolve(targetUri);
            if (!stat || !stat.isDirectory) {
                return ['Error: Directory not found'];
            }
            return await this.listFilesDirectly(targetUri, workspaceRoot);

        } catch (error) {
            return ['Error: Directory not found'];
        }
    }

    private async listFilesDirectly(uri: URI, workspaceRootUri: URI): Promise<string[]> {
        const stat = await this.fileService.resolve(uri);
        const result: string[] = [];

        if (stat && stat.isDirectory) {
            if (this.workspaceUtils.shouldExclude(stat)) {
                return result;
            }
            const children = await this.fileService.resolve(uri);
            if (children.children) {
                for (const child of children.children) {
                    const relativePath = workspaceRootUri.relative(child.resource);
                    if (relativePath) {
                        result.push(relativePath.toString());
                    }
                }
            }
        }

        return result;
    }
}
