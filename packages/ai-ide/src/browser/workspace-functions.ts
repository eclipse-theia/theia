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
import { CancellationToken, Disposable, PreferenceService, URI, Path } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    FILE_CONTENT_FUNCTION_ID, GET_FILE_DIAGNOSTICS_ID,
    GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID,
    GET_WORKSPACE_FILE_LIST_FUNCTION_ID, FIND_FILES_BY_PATTERN_FUNCTION_ID
} from '../common/workspace-functions';
import ignore from 'ignore';
import { Minimatch } from 'minimatch';
import { OpenerService, open } from '@theia/core/lib/browser';
import { CONSIDER_GITIGNORE_PREF, USER_EXCLUDE_PATTERN_PREF } from '../common/workspace-preferences';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { ProblemManager } from '@theia/markers/lib/browser';
import { ChatToolContext } from '@theia/ai-chat';
import { DiagnosticSeverity, Range } from '@theia/core/shared/vscode-languageserver-protocol';

@injectable()
export class WorkspaceFunctionScope {
    protected readonly GITIGNORE_FILE_NAME = '.gitignore';

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    private gitignoreMatcher: ReturnType<typeof ignore> | undefined;
    private gitignoreWatcherInitialized = false;

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

    async resolveRelativePath(relativePath: string): Promise<URI> {
        const workspaceRoot = await this.getWorkspaceRoot();
        return workspaceRoot.resolve(relativePath);
    }

    isInWorkspace(uri: URI): boolean {
        try {
            const wsRoots = this.workspaceService.tryGetRoots();

            if (wsRoots.length === 0) {
                return false;
            }

            for (const root of wsRoots) {
                const rootUri = root.resource;
                if (rootUri.scheme === uri.scheme && rootUri.isEqualOrParent(uri)) {
                    return true;
                }
            }

            return false;
        } catch {
            return false;
        }
    }

    isInPrimaryWorkspace(uri: URI): boolean {
        try {
            const wsRoots = this.workspaceService.tryGetRoots();

            if (wsRoots.length === 0) {
                return false;
            }

            const primaryRoot = wsRoots[0].resource;
            return primaryRoot.scheme === uri.scheme && primaryRoot.isEqualOrParent(uri);
        } catch {
            return false;
        }
    }

    async resolveToUri(pathOrUri: string | URI): Promise<URI | undefined> {
        if (pathOrUri instanceof URI) {
            return pathOrUri;
        }

        if (!pathOrUri) {
            return undefined;
        }

        if (pathOrUri.includes('://')) {
            try {
                const uri = new URI(pathOrUri);
                return uri;
            } catch (error) {
            }
        }

        const normalizedPath = Path.normalizePathSeparator(pathOrUri);
        const path = new Path(normalizedPath);

        if (normalizedPath.includes('..')) {
            return undefined;
        }

        if (path.isAbsolute) {
            return URI.fromFilePath(normalizedPath);
        }

        return this.resolveRelativePath(normalizedPath);
    }

    private async initializeGitignoreWatcher(workspaceRoot: URI): Promise<void> {
        if (this.gitignoreWatcherInitialized) {
            return;
        }

        const gitignoreUri = workspaceRoot.resolve(this.GITIGNORE_FILE_NAME);
        this.fileService.watch(gitignoreUri);

        this.fileService.onDidFilesChange(async event => {
            if (event.contains(gitignoreUri)) {
                this.gitignoreMatcher = undefined;
            }
        });

        this.gitignoreWatcherInitialized = true;
    }

    async shouldExclude(stat: FileStat): Promise<boolean> {
        const shouldConsiderGitIgnore = this.preferences.get(CONSIDER_GITIGNORE_PREF, false);
        const userExcludePatterns = this.preferences.get<string[]>(USER_EXCLUDE_PATTERN_PREF, []);

        if (this.isUserExcluded(stat.resource.path.base, userExcludePatterns)) {
            return true;
        }
        const workspaceRoot = await this.getWorkspaceRoot();
        if (shouldConsiderGitIgnore && (await this.isGitIgnored(stat, workspaceRoot))) {
            return true;
        }

        return false;
    }

    protected isUserExcluded(fileName: string, userExcludePatterns: string[]): boolean {
        return userExcludePatterns.some(pattern => new Minimatch(pattern, { dot: true }).match(fileName));
    }

    protected async isGitIgnored(stat: FileStat, workspaceRoot: URI): Promise<boolean> {
        await this.initializeGitignoreWatcher(workspaceRoot);

        const gitignoreUri = workspaceRoot.resolve(this.GITIGNORE_FILE_NAME);

        try {
            const fileStat = await this.fileService.resolve(gitignoreUri);
            if (fileStat) {
                if (!this.gitignoreMatcher) {
                    const gitignoreContent = await this.fileService.read(gitignoreUri);
                    this.gitignoreMatcher = ignore().add(gitignoreContent.value);
                }
                const relativePath = workspaceRoot.relative(stat.resource);
                if (relativePath) {
                    const relativePathStr = relativePath.toString() + (stat.isDirectory ? '/' : '');
                    if (this.gitignoreMatcher.ignores(relativePathStr)) {
                        return true;
                    }
                }
            }
        } catch {
            // If .gitignore does not exist or cannot be read, continue without error
        }

        return false;
    }
}

@injectable()
export class GetWorkspaceDirectoryStructure implements ToolProvider {
    static ID = GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID;

    getTool(): ToolRequest {
        return {
            id: GetWorkspaceDirectoryStructure.ID,
            name: GetWorkspaceDirectoryStructure.ID,
            description: 'Retrieves the complete directory tree structure of the workspace as a nested JSON object. ' +
                'Lists only directories (no files), excluding common non-essential directories (node_modules, hidden files, etc.). ' +
                'Useful for getting a high-level overview of project organization. ' +
                'For listing files within a specific directory, use getWorkspaceFileList instead. ' +
                'For finding specific files, use findFilesByPattern.',
            parameters: {
                type: 'object',
                properties: {},
            },
            handler: (_: string, ctx: ChatToolContext) => {
                const cancellationToken = ctx.response.cancellationToken;
                return this.getDirectoryStructure(cancellationToken);
            },
        };
    }

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceFunctionScope)
    protected workspaceScope: WorkspaceFunctionScope;

    private async getDirectoryStructure(cancellationToken?: CancellationToken): Promise<Record<string, unknown>> {
        if (cancellationToken?.isCancellationRequested) {
            return { error: 'Operation cancelled by user' };
        }

        let workspaceRoot;
        try {
            workspaceRoot = await this.workspaceScope.getWorkspaceRoot();
        } catch (error) {
            return { error: error.message };
        }

        return this.buildDirectoryStructure(workspaceRoot, cancellationToken);
    }

    private async buildDirectoryStructure(uri: URI, cancellationToken?: CancellationToken): Promise<Record<string, unknown>> {
        if (cancellationToken?.isCancellationRequested) {
            return { error: 'Operation cancelled by user' };
        }

        const stat = await this.fileService.resolve(uri);
        const result: Record<string, unknown> = {};

        if (stat && stat.isDirectory && stat.children) {
            for (const child of stat.children) {
                if (cancellationToken?.isCancellationRequested) {
                    return { error: 'Operation cancelled by user' };
                }

                if (!child.isDirectory || (await this.workspaceScope.shouldExclude(child))) {
                    continue;
                }
                const dirName = child.resource.path.base;
                result[dirName] = await this.buildDirectoryStructure(child.resource, cancellationToken);
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
            description: 'Returns the content of a specified file within the workspace as a raw string. ' +
                'The file path must be provided relative to the workspace root. Only files within ' +
                'workspace boundaries are accessible; attempting to access files outside the workspace will return an error. ' +
                'If the file is currently open in an editor with unsaved changes, returns the editor\'s current content (not the saved file on disk). ' +
                'Binary files may not be readable and will return an error. ' +
                'Use this tool to read file contents before making any edits with replacement functions. ' +
                'Do NOT use this for files you haven\'t located yet - use findFilesByPattern or searchInWorkspace first.',
            parameters: {
                type: 'object',
                properties: {
                    file: {
                        type: 'string',
                        description: 'The relative path to the target file within the workspace (e.g., "src/index.ts", "package.json"). ' +
                            'Must be relative to the workspace root. Absolute paths and paths outside the workspace will result in an error.',
                    }
                },
                required: ['file']
            },
            handler: (arg_string: string, ctx: ChatToolContext) => {
                const file = this.parseArg(arg_string);
                const cancellationToken = ctx.response.cancellationToken;
                return this.getFileContent(file, cancellationToken);
            },
        };
    }

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceScope: WorkspaceFunctionScope;

    @inject(MonacoWorkspace)
    protected readonly monacoWorkspace: MonacoWorkspace;

    private parseArg(arg_string: string): string {
        const result = JSON.parse(arg_string);
        return result.file;
    }

    private async getFileContent(file: string, cancellationToken?: CancellationToken): Promise<string> {
        if (cancellationToken?.isCancellationRequested) {
            return JSON.stringify({ error: 'Operation cancelled by user' });
        }

        let targetUri: URI | undefined;
        try {
            const workspaceRoot = await this.workspaceScope.getWorkspaceRoot();
            targetUri = workspaceRoot.resolve(file);
            this.workspaceScope.ensureWithinWorkspace(targetUri, workspaceRoot);
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }

        try {
            if (cancellationToken?.isCancellationRequested) {
                return JSON.stringify({ error: 'Operation cancelled by user' });
            }

            const openEditorValue = this.monacoWorkspace.getTextDocument(targetUri.toString())?.getText();
            if (openEditorValue !== undefined) {
                return openEditorValue;
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
                        description: 'Relative path to a directory within the workspace (e.g., "src", "src/components"). ' +
                            'Use "" or "." to list the workspace root. Paths outside the workspace will result in an error.'
                    }
                },
                required: ['path']
            },
            description: 'Lists files and directories within a specified workspace directory. ' +
                'Returns an array of names where directories are suffixed with "/" (e.g., ["src/", "package.json", "README.md"]). ' +
                'Use this to explore directory structure step by step. ' +
                'For finding specific files by pattern, use findFilesByPattern instead. ' +
                'For searching file contents, use searchInWorkspace instead.',
            handler: (arg_string: string, ctx: ChatToolContext) => {
                const args = JSON.parse(arg_string);
                const cancellationToken = ctx.response.cancellationToken;
                return this.getProjectFileList(args.path, cancellationToken);
            },
        };
    }

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceFunctionScope)
    protected workspaceScope: WorkspaceFunctionScope;

    async getProjectFileList(path?: string, cancellationToken?: CancellationToken): Promise<string | string[]> {
        if (cancellationToken?.isCancellationRequested) {
            return JSON.stringify({ error: 'Operation cancelled by user' });
        }

        let workspaceRoot;
        try {
            workspaceRoot = await this.workspaceScope.getWorkspaceRoot();
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }

        const targetUri = path ? workspaceRoot.resolve(path) : workspaceRoot;
        this.workspaceScope.ensureWithinWorkspace(targetUri, workspaceRoot);

        try {
            if (cancellationToken?.isCancellationRequested) {
                return JSON.stringify({ error: 'Operation cancelled by user' });
            }

            const stat = await this.fileService.resolve(targetUri);
            if (!stat || !stat.isDirectory) {
                return JSON.stringify({ error: 'Directory not found' });
            }
            return await this.listFilesDirectly(targetUri, workspaceRoot, cancellationToken);
        } catch (error) {
            return JSON.stringify({ error: 'Directory not found' });
        }
    }

    private async listFilesDirectly(uri: URI, workspaceRootUri: URI, cancellationToken?: CancellationToken): Promise<string | string[]> {
        if (cancellationToken?.isCancellationRequested) {
            return JSON.stringify({ error: 'Operation cancelled by user' });
        }

        const stat = await this.fileService.resolve(uri);
        const result: string[] = [];

        if (stat && stat.isDirectory) {
            if (await this.workspaceScope.shouldExclude(stat)) {
                return result;
            }
            const children = await this.fileService.resolve(uri);
            if (children.children) {
                for (const child of children.children) {
                    if (cancellationToken?.isCancellationRequested) {
                        return JSON.stringify({ error: 'Operation cancelled by user' });
                    }

                    if (await this.workspaceScope.shouldExclude(child)) {
                        continue;
                    }
                    const itemName = child.resource.path.base;
                    result.push(child.isDirectory ? `${itemName}/` : itemName);
                }
            }
        }

        return result;
    }
}

@injectable()
export class FileDiagnosticProvider implements ToolProvider {
    static ID = GET_FILE_DIAGNOSTICS_ID;

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceScope: WorkspaceFunctionScope;

    @inject(ProblemManager)
    protected readonly problemManager: ProblemManager;

    @inject(MonacoTextModelService)
    protected readonly modelService: MonacoTextModelService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    getTool(): ToolRequest {
        return {
            id: FileDiagnosticProvider.ID,
            name: FileDiagnosticProvider.ID,
            description:
                'Retrieves Error and Warning level diagnostics for a specific file in the workspace (Info and Hint level are filtered out). ' +
                'Returns a list of problems including: surrounding source code context (at least 3 lines), the error/warning message, ' +
                'and optionally a diagnostic code with description. ' +
                'Note: If the file was not recently opened, diagnostics may take a few seconds to appear as language services initialize. ' +
                'If no diagnostics are returned, the file may be error-free OR language services may not be active for this file type. ' +
                'Use this after making code changes to verify they compile correctly.',
            parameters: {
                type: 'object',
                properties: {
                    file: {
                        type: 'string',
                        description: 'The relative path to the target file within the workspace (e.g., "src/index.ts"). ' +
                            'Must be relative to the workspace root.'
                    }
                },
                required: ['file']
            },
            handler: async (arg: string, ctx: ChatToolContext) => {
                try {
                    const { file } = JSON.parse(arg);
                    const workspaceRoot = await this.workspaceScope.getWorkspaceRoot();
                    const targetUri = workspaceRoot.resolve(file);
                    this.workspaceScope.ensureWithinWorkspace(targetUri, workspaceRoot);

                    // Safely extract cancellation token with type checks
                    const cancellationToken = ctx.response.cancellationToken;

                    return this.getDiagnosticsForFile(targetUri, cancellationToken);
                } catch (error) {
                    return JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error.' });
                }
            }
        };
    }

    protected async getDiagnosticsForFile(uri: URI, cancellationToken?: CancellationToken): Promise<string> {
        const toDispose: Disposable[] = [];
        try {
            // Check for early cancellation
            if (cancellationToken?.isCancellationRequested) {
                return JSON.stringify({ error: 'Operation cancelled by user' });
            }

            let markers = this.problemManager.findMarkers({ uri });
            if (markers.length === 0) {
                // Open editor to ensure that the language services are active.
                await open(this.openerService, uri);

                // Give some time to fetch problems in a newly opened editor.
                await new Promise<void>((res, rej) => {
                    const timeout = setTimeout(res, 5000);

                    // Give another moment for additional markers to come in from different sources.
                    const listener = this.problemManager.onDidChangeMarkers(changed => changed.isEqual(uri) && setTimeout(res, 500));
                    toDispose.push(listener);

                    // Handle cancellation
                    if (cancellationToken) {
                        const cancelListener =
                            cancellationToken.onCancellationRequested(() => {
                                clearTimeout(timeout);
                                listener.dispose();
                                rej(new Error('Operation cancelled by user'));
                            });
                        toDispose.push(cancelListener);
                    }
                });

                markers = this.problemManager.findMarkers({ uri });
            }

            if (cancellationToken?.isCancellationRequested) {
                return JSON.stringify({ error: 'Operation cancelled by user' });
            }

            if (markers.length) {
                const editor = await this.modelService.createModelReference(uri);
                toDispose.push(editor);
                return JSON.stringify(markers.filter(marker => marker.data.severity !== DiagnosticSeverity.Information && marker.data.severity !== DiagnosticSeverity.Hint)
                    .map(marker => {
                        const contextRange = this.atLeastNLines(3, marker.data.range, editor.object.lineCount);
                        const text = editor.object.getText(contextRange);
                        const message = marker.data.message;
                        const code = marker.data.code;
                        const codeDescription = marker.data.codeDescription;
                        return { text, message, code, codeDescription };
                    })
                );
            }
            return JSON.stringify({
                error: 'No diagnostics were found. The file may contain no problems, or language services may not be available. Retrying may return fresh results.'
            });
        } catch (err) {
            if (err.message === 'Operation cancelled by user') {
                return JSON.stringify({ error: 'Operation cancelled by user' });
            }
            console.warn('Error when fetching markers for', uri.toString(), err);
            return JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error when fetching for problems for ' + uri.toString() });
        } finally {
            toDispose.forEach(disposable => disposable.dispose());
        }
    }

    /**
     * Expands the range provided until it contains at least {@link desiredLines} lines or reaches the end of the document
     *  to attempt to provide the agent sufficient context to understand the diagnostic.
     */
    protected atLeastNLines(desiredLines: number, range: Range, documentLineCount: number): Range {
        let startLine = range.start.line;
        let endLine = range.end.line;
        const desiredDifference = desiredLines - 1;

        while (endLine - startLine < desiredDifference && (startLine > 0 || endLine < documentLineCount - 1)) {
            if (startLine > 0) {
                startLine--;
            } else if (endLine < documentLineCount - 1) {
                endLine++;
            }
            if (endLine < documentLineCount - 1) {
                endLine++;
            } else if (startLine > 0) {
                startLine--;
            }
        }
        return { end: { character: Number.MAX_SAFE_INTEGER, line: endLine }, start: { character: 0, line: startLine } };
    }
}

@injectable()
export class FindFilesByPattern implements ToolProvider {
    static ID = FIND_FILES_BY_PATTERN_FUNCTION_ID;

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceScope: WorkspaceFunctionScope;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    getTool(): ToolRequest {
        return {
            id: FindFilesByPattern.ID,
            name: FindFilesByPattern.ID,
            description: 'Find files in the workspace that match a given glob pattern. ' +
                'This function allows efficient discovery of files using patterns like \'**/*.ts\' for all TypeScript files or ' +
                '\'src/**/*.js\' for JavaScript files in the src directory. The function respects gitignore patterns and user exclusions, ' +
                'returns relative paths from the workspace root, and limits results to 200 files maximum. ' +
                'Performance note: This traverses directories recursively which may be slow in large workspaces. ' +
                'For better performance, use specific subdirectory patterns (e.g., \'src/**/*.ts\' instead of \'**/*.ts\'). ' +
                'Use this to find files by name/extension. Do NOT use this for searching file contents - use searchInWorkspace instead.',
            parameters: {
                type: 'object',
                properties: {
                    pattern: {
                        type: 'string',
                        description: 'Glob pattern to match files against. ' +
                            'Examples: \'**/*.ts\' (all TypeScript files), \'src/**/*.js\' (JS files in src), ' +
                            '\'**/*.{js,ts}\' (JS or TS files), \'**/test/**/*.spec.ts\' (test files). ' +
                            'Use specific subdirectory prefixes for better performance (e.g., \'packages/core/**/*.ts\' instead of \'**/*.ts\').'
                    },
                    exclude: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Optional glob patterns to exclude. ' +
                            'Examples: [\'**/*.spec.ts\', \'**/node_modules/**\']. ' +
                            'Common exclusions (node_modules, .git) are applied automatically via gitignore.'
                    }
                },
                required: ['pattern']
            },
            handler: (arg_string: string, ctx: ChatToolContext) => {
                const args = JSON.parse(arg_string);
                const cancellationToken = ctx.response.cancellationToken;
                return this.findFiles(args.pattern, args.exclude, cancellationToken);
            },
        };
    }

    private async findFiles(pattern: string, excludePatterns?: string[], cancellationToken?: CancellationToken): Promise<string> {
        if (cancellationToken?.isCancellationRequested) {
            return JSON.stringify({ error: 'Operation cancelled by user' });
        }

        let workspaceRoot;
        try {
            workspaceRoot = await this.workspaceScope.getWorkspaceRoot();
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }

        try {
            // Build ignore patterns from gitignore and user preferences
            const ignorePatterns = await this.buildIgnorePatterns(workspaceRoot);

            const allExcludes = [...ignorePatterns];
            if (excludePatterns && excludePatterns.length > 0) {
                allExcludes.push(...excludePatterns);
            }

            if (cancellationToken?.isCancellationRequested) {
                return JSON.stringify({ error: 'Operation cancelled by user' });
            }

            const patternMatcher = new Minimatch(pattern, { dot: false });
            const excludeMatchers = allExcludes.map(excludePattern => new Minimatch(excludePattern, { dot: true }));
            const files: string[] = [];
            const maxResults = 200;

            await this.traverseDirectory(workspaceRoot, workspaceRoot, patternMatcher, excludeMatchers, files, maxResults, cancellationToken);

            if (cancellationToken?.isCancellationRequested) {
                return JSON.stringify({ error: 'Operation cancelled by user' });
            }

            const result: { files: string[]; totalFound?: number; truncated?: boolean } = {
                files: files.slice(0, maxResults)
            };

            if (files.length > maxResults) {
                result.totalFound = files.length;
                result.truncated = true;
            }

            return JSON.stringify(result);

        } catch (error) {
            return JSON.stringify({ error: `Failed to find files: ${error.message}` });
        }
    }

    private async buildIgnorePatterns(workspaceRoot: URI): Promise<string[]> {
        const patterns: string[] = [];

        // Get user exclude patterns from preferences
        const userExcludePatterns = this.preferences.get<string[]>(USER_EXCLUDE_PATTERN_PREF, []);
        patterns.push(...userExcludePatterns);

        // Add gitignore patterns if enabled
        const shouldConsiderGitIgnore = this.preferences.get(CONSIDER_GITIGNORE_PREF, false);
        if (shouldConsiderGitIgnore) {
            try {
                const gitignoreUri = workspaceRoot.resolve('.gitignore');
                const gitignoreContent = await this.fileService.read(gitignoreUri);
                const gitignoreLines = gitignoreContent.value
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'));
                patterns.push(...gitignoreLines);
            } catch {
                // Gitignore file doesn't exist or can't be read, continue without it
            }
        }

        return patterns;
    }

    private async traverseDirectory(
        currentUri: URI,
        workspaceRoot: URI,
        patternMatcher: Minimatch,
        excludeMatchers: Minimatch[],
        results: string[],
        maxResults: number,
        cancellationToken?: CancellationToken
    ): Promise<void> {
        if (cancellationToken?.isCancellationRequested || results.length >= maxResults) {
            return;
        }

        try {
            const stat = await this.fileService.resolve(currentUri);
            if (!stat || !stat.isDirectory || !stat.children) {
                return;
            }

            for (const child of stat.children) {
                if (cancellationToken?.isCancellationRequested || results.length >= maxResults) {
                    break;
                }

                const relativePath = workspaceRoot.relative(child.resource)?.toString();
                if (!relativePath) {
                    continue;
                }

                const shouldExclude = excludeMatchers.some(matcher => matcher.match(relativePath)) ||
                    (await this.workspaceScope.shouldExclude(child));

                if (shouldExclude) {
                    continue;
                }

                if (child.isDirectory) {
                    await this.traverseDirectory(child.resource, workspaceRoot, patternMatcher, excludeMatchers, results, maxResults, cancellationToken);
                } else if (patternMatcher.match(relativePath)) {
                    results.push(relativePath);
                }
            }
        } catch {
            // If we can't access a directory, skip it
        }
    }
}
