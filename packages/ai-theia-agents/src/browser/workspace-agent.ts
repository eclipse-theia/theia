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
import { ChatAgent, ChatMessage, ChatRequestParser, DefaultChatAgent } from '@theia/ai-chat/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { template } from '../common/template';
import { LanguageModel, LanguageModelResponse, PromptService, ToolRequest } from '@theia/ai-core';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { URI } from '@theia/core';
import { FileStat } from '@theia/filesystem/lib/common/files';

@injectable()
export class TheiaWorkspaceAgent extends DefaultChatAgent implements ChatAgent {
    override id = 'TheiaWorkspaceAgent';
    override name = 'Workspace Agent';
    override description = 'An AI Agent that can access the current Theia Workspace contents';
    override promptTemplates = [template];

    @inject(PromptService)
    protected promptService: PromptService;

    @inject(ChatRequestParser)
    protected chatRequestParser: ChatRequestParser;

    protected override getSystemMessage(): Promise<string | undefined> {
        return this.promptService.getPrompt(template.id);
    }

    @inject(WorkspaceService)
    protected workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    protected override callLlm(languageModel: LanguageModel, messages: ChatMessage[]): Promise<LanguageModelResponse> {
        const tools: ToolRequest<object>[] = [
            {
                id: 'getProjectFileList',
                name: 'getProjectFileList',
                description: 'Get the list of files in the current project',
                handler: () => this.getProjectFileList()
            },
            {
                id: 'getFileContent',
                name: 'getFileContent',
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
                handler: arg_string => {
                    const file = this.parseFileContentArg(arg_string);
                    return this.getFileContent(file);
                }
            }
        ];

        const languageModelResponse = languageModel.request({ messages, tools });
        return languageModelResponse;
    }

    parseFileContentArg(arg_string: string): string {
        const result = JSON.parse(arg_string);
        return result.file;
    }

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

    async getFileContent(file: string): Promise<string> {
        const uri = new URI(file);
        const fileContent = await this.fileService.read(uri);
        return fileContent.value;
    }

}
