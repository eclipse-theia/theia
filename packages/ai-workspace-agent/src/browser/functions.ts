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
import { FILE_CONTENT_FUNCTION_ID, GET_WORKSPACE_FILE_LIST_FUNCTION_ID } from '../common/functions';

/**
 * A Function that can read the contents of a File from the Workspace.
 */
@injectable()
export class FileContentFunction implements ToolProvider {
    static ID = FILE_CONTENT_FUNCTION_ID;

    getTool(): ToolRequest {
        return {
            id: FileContentFunction.ID,
            name: FileContentFunction.ID,
            description: 'Get the content of the file',
            parameters: {
                type: 'object',
                properties: {
                    file: {
                        type: 'string',
                        description: 'The path of the file to retrieve content for',
                    }
                }
            },
            handler: (arg_string: string) => {
                const file = this.parseArg(arg_string);
                return this.getFileContent(file);
            }
        };
    }

    @inject(WorkspaceService)
    protected workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    private parseArg(arg_string: string): string {
        const result = JSON.parse(arg_string);
        return result.file;
    }

    private async getFileContent(file: string): Promise<string> {
        const uri = new URI(file);
        const fileContent = await this.fileService.read(uri);
        return fileContent.value;
    }
}

/**
 * A Function that lists all files in the workspace.
 */
@injectable()
export class GetWorkspaceFileList implements ToolProvider {
    static ID = GET_WORKSPACE_FILE_LIST_FUNCTION_ID;

    getTool(): ToolRequest {
        return {
            id: GetWorkspaceFileList.ID,
            name: GetWorkspaceFileList.ID,
            description: 'List all files in the workspace',

            handler: () => this.getProjectFileList()
        };
    }

    @inject(WorkspaceService)
    protected workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    async getProjectFileList(): Promise<string[]> {
        // Get all files from the workspace service as a flat list of qualified file names
        const wsRoots = await this.workspaceService.roots;
        const result: string[] = [];
        for (const root of wsRoots) {
            result.push(...await this.listFilesRecursively(root.resource));
        }
        return result;
    }

    private async listFilesRecursively(uri: URI): Promise<string[]> {
        const stat = await this.fileService.resolve(uri);
        const result: string[] = [];
        if (stat && stat.isDirectory) {
            if (this.exclude(stat)) {
                return result;
            }
            const children = await this.fileService.resolve(uri);
            if (children.children) {
                for (const child of children.children) {
                    result.push(child.resource.toString());
                    result.push(...await this.listFilesRecursively(child.resource));
                }
            }
        }
        return result;
    }

    // Exclude folders which are not relevant to the AI Agent
    private exclude(stat: FileStat): boolean {
        if (stat.resource.path.base.startsWith('.')) {
            return true;
        }
        if (stat.resource.path.base === 'node_modules') {
            return true;
        }
        if (stat.resource.path.base === 'lib') {
            return true;
        }
        return false;
    }
}
