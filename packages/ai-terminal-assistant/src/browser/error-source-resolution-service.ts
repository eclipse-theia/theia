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
import { inject, injectable } from '@theia/core/shared/inversify';
import { ErrorDetail, ErrorLines, Summary } from './terminal-output-analysis-agent';
import { MonacoEditorService } from '@theia/monaco/lib/browser/monaco-editor-service';
import * as monaco from '@theia/monaco-editor-core/esm/vs/editor/editor.api';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { LocalFileLinkProvider } from '@theia/terminal/lib/browser/terminal-file-link-provider';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { URI } from '@theia/core';
import { IEditorDecorationsCollection } from '@theia/monaco-editor-core/esm/vs/editor/common/editorCommon';

@injectable()
export class ErrorSourceResolutionService {

    @inject(MonacoEditorService)
    protected readonly monacoEditorService: MonacoEditorService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(FileSearchService)
    protected readonly fileSearchService: FileSearchService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(LocalFileLinkProvider)
    protected readonly fileLinkProvider: LocalFileLinkProvider;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    protected decorationsCollection: IEditorDecorationsCollection;

    async enrichErrorsWithFileContent(summary: Summary): Promise<Summary> {
        const enrichedErrors = await Promise.all(summary.errors.map(async error => {
            const errorLines = await this.getErrorLines(error);
            return {
                ...error,
                errorLines,
            };
        }));
        console.log('Enriched errors with file content:', enrichedErrors);
        return {
            ...summary,
            errors: enrichedErrors,
        };
    }

    async openErrorInEditor(error: ErrorDetail): Promise<void> {
        if (!error.file) {
            throw new Error('Error does not contain file information.');
        };
        const terminal = this.terminalService.lastUsedTerminal;
        if (!terminal) {
            throw new Error('No active terminal found.');
        }
        const terminalLinks = await this.fileLinkProvider.provideLinks(`${error.file}${error.line ? ':' + error.line.toString() : ''}`, terminal);
        const termminalLink = terminalLinks[0];
        if (!termminalLink) {
            throw new Error(`Could not find file link for ${error.file}`);
        }
        await termminalLink.handle();

        const monacoEditor = this.monacoEditorService.getActiveCodeEditor();
        if (monacoEditor) {
            if (this.decorationsCollection) {
                this.decorationsCollection.clear();
            }
            this.decorationsCollection = monacoEditor.createDecorationsCollection([{
                range: new monaco.Range(error.line || 1, 1, error.line || 1, 1),
                options: {
                    className: 'error-line-decoration',
                    description: 'error-line-decoration',
                    hoverMessage: { value: `**Error**: ${error.fixSteps.join(' ')}` },
                    isWholeLine: true,
                }
            }]);
        }
    }

    protected async getErrorLines(error: ErrorDetail): Promise<ErrorLines | undefined> {
        if (!error.file || !error.line) {
            console.log('Error does not contain file or line information:', error);
            return undefined;
        }
        const fileUri = await this.getFileUriFromError(error);
        if (!fileUri) {
            console.log('Could not find file URI for error:', error);
            return undefined;
        }
        const uri: URI = new URI(fileUri);
        const fileContent = await this.fileService.read(uri);
        const lines = fileContent.value.split('\n');
        console.log('Fetched file content for error lines:', lines);

        const start = Math.max(0, error.line - 2);
        const end = Math.min(lines.length, error.line + 1);
        if (error.line && error.line > 0 && error.line <= lines.length) {
            const errorLines = lines.slice(start, end);
            const numberedLines = errorLines.map((line, index) => `${start + index + 1}: ${line}`);
            return {
                errorLines: numberedLines,
                errorLinesStart: start + 1
            };
        }
        return undefined;
    }

    protected async getFileUriFromError(error: ErrorDetail): Promise<string | undefined> {
        if (!error.file) {
            return undefined;
        }
        const searchTerm = error.file.replace(/`/g, '');
        console.log('Searching for file URI with term:', searchTerm);
        const roots = this.workspaceService.tryGetRoots().map(root => root.resource.toString());
        const opts: FileSearchService.Options = {
            rootUris: roots,
            fuzzyMatch: true,
            limit: 1,
        };

        const results = await this.fileSearchService.find(searchTerm, opts);

        return results.length > 0 ? results[0] : undefined;
    }
}
