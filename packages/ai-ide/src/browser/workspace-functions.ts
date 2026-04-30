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
import { ToolInvocationContext, ToolProvider, ToolRequest } from '@theia/ai-core';
import { TrustAwarePreferenceReader } from '@theia/ai-core/lib/browser/trust-aware-preference-reader';
import { CancellationToken, Disposable, PreferenceService, URI, Path } from '@theia/core';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileStat, FileOperationError, FileOperationResult } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    FILE_CONTENT_FUNCTION_ID, GET_FILE_DIAGNOSTICS_ID,
    GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID,
    GET_WORKSPACE_FILE_LIST_FUNCTION_ID, FIND_FILES_BY_PATTERN_FUNCTION_ID
} from '../common/workspace-functions';
import { extractJsonStringField } from '@theia/ai-chat-ui/lib/browser/chat-response-renderer/toolcall-utils';
import ignore from 'ignore';
import { Minimatch } from 'minimatch';
import {
    ALLOWED_EXTERNAL_PATHS_PREF,
    CONSIDER_GITIGNORE_PREF,
    FILE_CONTENT_MAX_SIZE_KB_PREF,
    USER_EXCLUDE_PATTERN_PREF
} from '../common/workspace-preferences';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { ProblemManager } from '@theia/markers/lib/browser';
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

    @inject(TrustAwarePreferenceReader)
    protected readonly trustAwarePreferences: TrustAwarePreferenceReader;

    @inject(EnvVariablesServer)
    protected readonly envVariablesServer: EnvVariablesServer;

    private gitignoreMatcher: ReturnType<typeof ignore> | undefined;
    private gitignoreWatcherInitialized = false;
    private homeDirUri: Promise<URI | undefined> | undefined;

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
     * Asserts the target URI is reachable by AI tools that honor the external
     * allow-list. Allowed when the URI is inside any workspace root, or when it
     * is covered by an entry of the `ai-features.workspaceFunctions.allowedExternalPaths`
     * preference. Workspace-scoped overrides of that preference are dropped when
     * the workspace is not trusted.
     *
     * Note: symlinks within allow-listed directories are NOT canonicalized
     * before the check. Only allow-list directories whose contents you trust.
     */
    async ensureAccessible(targetUri: URI): Promise<void> {
        const roots = (await this.workspaceService.roots) ?? [];
        for (const root of roots) {
            if (root.resource.scheme === targetUri.scheme && root.resource.isEqualOrParent(targetUri)) {
                return;
            }
        }
        const allowed = await this.getAllowedExternalUris();
        if (allowed.some(allowedUri => allowedUri.isEqualOrParent(targetUri))) {
            return;
        }
        throw new Error(
            `Access to '${targetUri.path.toString()}' is not allowed. ` +
            `Path is outside the workspace and not covered by the '${ALLOWED_EXTERNAL_PATHS_PREF}' preference.`
        );
    }

    /**
     * Resolves the configured external allow-list to URIs. Reads via the
     * trust-aware preference reader so workspace-scoped overrides are dropped
     * when the workspace is untrusted. Invalid entries (empty strings, paths
     * containing `..`) are filtered out.
     */
    async getAllowedExternalUris(resourceUri?: string): Promise<URI[]> {
        const raw = this.trustAwarePreferences.get<string[]>(ALLOWED_EXTERNAL_PATHS_PREF, [], resourceUri) ?? [];
        const result: URI[] = [];
        for (const entry of raw) {
            if (typeof entry !== 'string') {
                continue;
            }
            const trimmed = entry.trim();
            if (!trimmed || trimmed.includes('..')) {
                continue;
            }
            const uri = await this.toExternalUri(trimmed);
            if (uri) {
                result.push(uri);
            }
        }
        return result;
    }

    /**
     * Converts a user-supplied allow-list entry (absolute POSIX path, Windows
     * drive path, `~`-prefixed path, or `file://` URI) into a normalized URI.
     * Returns undefined for invalid input (relative paths, malformed URIs).
     */
    protected async toExternalUri(entry: string): Promise<URI | undefined> {
        if (entry.includes('://')) {
            try {
                return new URI(entry);
            } catch {
                return undefined;
            }
        }
        if (entry === '~' || entry.startsWith('~/') || entry.startsWith('~\\')) {
            const home = await this.getHomeDirUri();
            if (!home) {
                return undefined;
            }
            if (entry === '~') {
                return home;
            }
            // Resolve the remainder in URI space to avoid Windows drive-letter
            // round-tripping issues with URI.fromFilePath.
            const remainder = Path.normalizePathSeparator(entry.substring(2));
            return home.resolve(remainder);
        }
        const normalized = Path.normalizePathSeparator(entry);
        if (!WorkspaceFunctionScope.isAbsolutePath(normalized)) {
            return undefined;
        }
        return URI.fromFilePath(normalized);
    }

    /**
     * Whether an already-separator-normalized path is absolute on either
     * platform: POSIX `/foo`, UNC `//host/share`, or Windows drive `C:/foo`.
     */
    static isAbsolutePath(normalized: string): boolean {
        if (normalized.startsWith('/')) {
            return true;
        }
        return /^[A-Za-z]:\//.test(normalized);
    }

    protected getHomeDirUri(): Promise<URI | undefined> {
        if (!this.homeDirUri) {
            this.homeDirUri = this.envVariablesServer.getHomeDirUri()
                .then(value => value ? new URI(value) : undefined)
                .catch(() => undefined);
        }
        return this.homeDirUri;
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

        if (normalizedPath.includes('..')) {
            return undefined;
        }

        if (WorkspaceFunctionScope.isAbsolutePath(normalizedPath)) {
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
            description: 'Retrieves the directory tree structure as a nested JSON object. ' +
                'By default operates on the workspace; pass `root` to inspect a directory listed in the ' +
                '`ai-features.workspaceFunctions.allowedExternalPaths` preference instead. ' +
                'Lists only directories (no files), excluding common non-essential directories (node_modules, hidden files, etc.). ' +
                'Useful for getting a high-level overview of project organization. ' +
                'For listing files within a specific directory, use getWorkspaceFileList instead. ' +
                'For finding specific files, use findFilesByPattern.',
            parameters: {
                type: 'object',
                properties: {
                    root: {
                        type: 'string',
                        description: 'Optional absolute path or `file://` URI to inspect instead of the workspace. ' +
                            'Must be inside, or equal to, an entry of the `allowedExternalPaths` preference. ' +
                            'When omitted, the workspace root is used.'
                    }
                },
            },
            handler: (arg_string: string, ctx?: ToolInvocationContext) => {
                let root: string | undefined;
                if (arg_string) {
                    try {
                        root = JSON.parse(arg_string).root;
                    } catch {
                        // tolerate empty or non-JSON input — keep prior behavior
                    }
                }
                return this.getDirectoryStructure(root, ctx?.cancellationToken);
            },
        };
    }

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceFunctionScope)
    protected workspaceScope: WorkspaceFunctionScope;

    private async getDirectoryStructure(root?: string, cancellationToken?: CancellationToken): Promise<Record<string, unknown>> {
        if (cancellationToken?.isCancellationRequested) {
            return { error: 'Operation cancelled by user' };
        }

        let rootUri: URI;
        try {
            if (root) {
                const resolved = await this.workspaceScope.resolveToUri(root);
                if (!resolved) {
                    return { error: `Invalid root: '${root}'` };
                }
                rootUri = resolved;
                await this.workspaceScope.ensureAccessible(rootUri);
            } else {
                rootUri = await this.workspaceScope.getWorkspaceRoot();
            }
        } catch (error) {
            return { error: error.message };
        }

        return this.buildDirectoryStructure(rootUri, cancellationToken);
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
            description: 'Returns the content of a specified file as a raw string. ' +
                'Relative paths resolve against the workspace root. ' +
                'Absolute paths and `file://` URIs are accepted only when the target is inside the workspace ' +
                'or covered by the `ai-features.workspaceFunctions.allowedExternalPaths` preference; otherwise an error is returned. ' +
                'If the file is currently open in an editor with unsaved changes, returns the editor\'s current content (not the saved file on disk). ' +
                'Binary files may not be readable and will return an error. ' +
                'Use this tool to read file contents before making any edits with replacement functions. ' +
                'Do NOT use this for files you haven\'t located yet - use findFilesByPattern or searchInWorkspace first. ' +
                'Files exceeding the configured size limit will return an error. ' +
                'It is recommended to read the whole file by not providing offset or limit parameters, ' +
                'unless you expect it to be very large. ' +
                'If the size limit is hit, do NOT attempt to read the full file in chunks using offset and limit — ' +
                'this wastes context window. Use searchInWorkspace to find the specific content you need instead.',
            parameters: {
                type: 'object',
                properties: {
                    file: {
                        type: 'string',
                        description: 'Path to the target file. May be relative to the workspace root (e.g., "src/index.ts"), ' +
                            'an absolute path, or a `file://` URI. Absolute / URI forms must point inside the workspace ' +
                            'or inside a directory listed in the `allowedExternalPaths` preference.',
                    },
                    offset: {
                        type: 'number',
                        description: 'Zero-based line offset to start reading from (default: 0). ' +
                            'Use together with limit to page through large files.'
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of lines to return. Defaults to the rest of the file.'
                    }
                },
                required: ['file']
            },
            handler: (arg_string: string, ctx?: ToolInvocationContext) => {
                const { file, offset, limit } = this.parseArg(arg_string);
                return this.getFileContent(file, ctx?.cancellationToken, offset, limit);
            },
            providerName: undefined,
            getArgumentsShortLabel: (args: string): { label: string; hasMore: boolean } | undefined => {
                try {
                    const parsed = JSON.parse(args);
                    if (parsed && typeof parsed === 'object' && 'file' in parsed) {
                        const hasMore = 'offset' in parsed || 'limit' in parsed;
                        return { label: String(parsed.file), hasMore };
                    }
                } catch {
                    const file = extractJsonStringField(args, 'file');
                    if (file) {
                        return { label: file, hasMore: false };
                    }
                }
                return undefined;
            },
        };
    }

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceScope: WorkspaceFunctionScope;

    @inject(MonacoWorkspace)
    protected readonly monacoWorkspace: MonacoWorkspace;

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    private parseArg(arg_string: string): { file: string; offset?: number; limit?: number } {
        const result = JSON.parse(arg_string);
        return { file: result.file, offset: result.offset, limit: result.limit };
    }

    private async getFileContent(file: string, cancellationToken?: CancellationToken, offset?: number, limit?: number): Promise<string> {
        if (cancellationToken?.isCancellationRequested) {
            return JSON.stringify({ error: 'Operation cancelled by user' });
        }

        if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
            return JSON.stringify({ error: 'offset must be a non-negative integer.' });
        }
        if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
            return JSON.stringify({ error: 'limit must be a positive integer.' });
        }

        let targetUri: URI | undefined;
        try {
            const resolved = await this.workspaceScope.resolveToUri(file);
            if (!resolved) {
                return JSON.stringify({ error: `Invalid file path: '${file}'` });
            }
            targetUri = resolved;
            await this.workspaceScope.ensureAccessible(targetUri);
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }

        if (cancellationToken?.isCancellationRequested) {
            return JSON.stringify({ error: 'Operation cancelled by user' });
        }

        const openEditorValue = this.monacoWorkspace.getTextDocument(targetUri.toString())?.getText();
        const maxSizeKB = this.preferences.get<number>(FILE_CONTENT_MAX_SIZE_KB_PREF, 256);
        const isEditorOpen = openEditorValue !== undefined;
        const isPaginated = offset !== undefined || limit !== undefined;

        if (isEditorOpen) {
            return this.handleEditorContent(openEditorValue!, maxSizeKB, offset, limit);
        } else if (isPaginated) {
            return this.readStreamedSlice(targetUri, maxSizeKB, offset, limit);
        } else {
            return this.handleFullDiskRead(targetUri, maxSizeKB);
        }
    }

    private handleEditorContent(content: string, maxSizeKB: number, offset?: number, limit?: number): string {
        if (offset === undefined && limit === undefined) {
            const sizeKB = this.sizeInKB(content);
            if (sizeKB > maxSizeKB) {
                return this.buildFileSizeLimitError(sizeKB, maxSizeKB);
            }
            return content;
        }

        const lines = content.split('\n');
        const startOffset = offset ?? 0;
        const sliced = limit !== undefined ? lines.slice(startOffset, startOffset + limit) : lines.slice(startOffset);
        const result = sliced.join('\n');
        const resultSizeKB = this.sizeInKB(result);
        if (resultSizeKB > maxSizeKB) {
            return this.buildSliceSizeLimitError(resultSizeKB, maxSizeKB);
        }
        const startLine = startOffset + 1;
        const endLine = startOffset + sliced.length;
        const header = `[Lines ${startLine}\u2013${endLine} of ${lines.length} total. Use offset and limit to read other ranges.]`;
        return `${header}\n${result}`;
    }

    private async handleFullDiskRead(targetUri: URI, maxSizeKB: number): Promise<string> {
        try {
            const stat = await this.fileService.resolve(targetUri);
            if (stat.size !== undefined) {
                const statSizeKB = Math.round(stat.size / 1024);
                if (statSizeKB > maxSizeKB) {
                    return this.buildFileSizeLimitError(statSizeKB, maxSizeKB);
                }
            } else {
                // Size is unknown from stat; use the streaming path to avoid loading
                // an arbitrarily large file into memory, with a post-read size check.
                return this.readStreamedSlice(targetUri, maxSizeKB);
            }

            const rawContent = (await this.fileService.read(targetUri)).value;
            const sizeKB = this.sizeInKB(rawContent);
            if (sizeKB > maxSizeKB) {
                return this.buildFileSizeLimitError(sizeKB, maxSizeKB);
            }
            return rawContent;
        } catch (error) {
            if (error instanceof FileOperationError) {
                if (error.fileOperationResult === FileOperationResult.FILE_TOO_LARGE ||
                    error.fileOperationResult === FileOperationResult.FILE_EXCEEDS_MEMORY_LIMIT) {
                    return this.buildFileSizeLimitError(undefined, maxSizeKB);
                }
            }
            return JSON.stringify({ error: 'File not found' });
        }
    }

    private async readStreamedSlice(
        targetUri: URI, maxSizeKB: number, startLine?: number, limit?: number
    ): Promise<string> {
        const isPaginated = startLine !== undefined || limit !== undefined;
        const effectiveStartLine = startLine ?? 0;

        let streamValue: Awaited<ReturnType<typeof this.fileService.readStream>>['value'];
        try {
            // Bypass the files.maxFileSizeMB preference: the streaming path never loads the
            // full file into memory, so the OS-level size cap is not appropriate here.
            // Our own per-result maxSizeKB check still applies to the collected slice.
            streamValue = (await this.fileService.readStream(targetUri, { limits: { size: Number.MAX_SAFE_INTEGER } })).value;
        } catch (e) {
            if (e instanceof FileOperationError &&
                (e.fileOperationResult === FileOperationResult.FILE_TOO_LARGE ||
                    e.fileOperationResult === FileOperationResult.FILE_EXCEEDS_MEMORY_LIMIT)) {
                return JSON.stringify({
                    error: 'File exceeds the configured ' + maxSizeKB + 'KB size limit. ' +
                        'Use the \'offset\' (0-based) and \'limit\' parameters to read specific line ranges, ' +
                        'or use searchInWorkspace to find specific content.',
                    maxSizeKB
                });
            }
            return JSON.stringify({ error: 'File not found' });
        }

        return new Promise<string>(resolve => {
            let pending = '';
            let lineIndex = 0;
            const sliceLines: string[] = [];

            streamValue.on('data', (chunk: string) => {
                const parts = (pending + chunk).split('\n');
                pending = parts.pop()!;
                for (const line of parts) {
                    if (lineIndex >= effectiveStartLine && (limit === undefined || lineIndex < effectiveStartLine + limit)) {
                        sliceLines.push(line);
                    }
                    lineIndex++;
                }
            });

            streamValue.on('end', () => {
                if (pending.length > 0) {
                    if (lineIndex >= effectiveStartLine && (limit === undefined || lineIndex < effectiveStartLine + limit)) {
                        sliceLines.push(pending);
                    }
                    lineIndex++;
                }
                const result = sliceLines.join('\n');
                const resultSizeKB = this.sizeInKB(result);
                if (resultSizeKB > maxSizeKB) {
                    const sizeError = isPaginated
                        ? this.buildSliceSizeLimitError(resultSizeKB, maxSizeKB)
                        : this.buildFileSizeLimitError(resultSizeKB, maxSizeKB);
                    resolve(sizeError);
                    return;
                }
                if (isPaginated) {
                    const header =
                        `[Lines ${effectiveStartLine + 1}\u2013${effectiveStartLine + sliceLines.length} of ${lineIndex} total. ` +
                        'Use offset and limit to read other ranges.]';
                    resolve(`${header}\n${result}`);
                } else {
                    resolve(result);
                }
            });

            streamValue.on('error', () => resolve(JSON.stringify({ error: 'File not found' })));
        });
    }

    private sizeInKB(content: string): number {
        return Math.round(Buffer.byteLength(content, 'utf8') / 1024);
    }

    private buildFileSizeLimitError(sizeKB: number | undefined, maxSizeKB: number): string {
        const sizeInfo = sizeKB !== undefined ? ` (${sizeKB}KB)` : '';
        const result: Record<string, unknown> = {
            error: `File exceeds the configured ${maxSizeKB}KB size limit${sizeInfo}. ` +
                'Use the \'offset\' (0-based) and \'limit\' parameters to read specific line ranges, or use searchInWorkspace to find specific content.',
            maxSizeKB
        };
        if (sizeKB !== undefined) {
            result.sizeKB = sizeKB;
        }
        return JSON.stringify(result);
    }

    private buildSliceSizeLimitError(resultSizeKB: number, maxSizeKB: number): string {
        return JSON.stringify({
            error: 'Requested range exceeds the configured ' + maxSizeKB + 'KB size limit (' + resultSizeKB + 'KB). ' +
                'Use a smaller limit to read fewer lines at a time.',
            resultSizeKB,
            maxSizeKB
        });
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
                        description: 'Path to a directory. Relative paths resolve against the workspace root ' +
                            '(e.g., "src", "src/components"); use "" or "." for the workspace root. ' +
                            'Absolute paths and `file://` URIs are accepted only when the target is inside the workspace ' +
                            'or covered by the `ai-features.workspaceFunctions.allowedExternalPaths` preference.'
                    }
                },
                required: ['path']
            },
            description: 'Lists files and directories within a specified directory. ' +
                'By default operates within the workspace; absolute paths or `file://` URIs may be passed ' +
                'when they target a location covered by the `allowedExternalPaths` preference. ' +
                'Returns an array of names where directories are suffixed with "/" (e.g., ["src/", "package.json", "README.md"]). ' +
                'Use this to explore directory structure step by step. ' +
                'For finding specific files by pattern, use findFilesByPattern instead. ' +
                'For searching file contents, use searchInWorkspace instead.',
            handler: (arg_string: string, ctx?: ToolInvocationContext) => {
                const args = JSON.parse(arg_string);
                return this.getProjectFileList(args.path, ctx?.cancellationToken);
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

        let targetUri: URI;
        let workspaceRoot: URI;
        try {
            workspaceRoot = await this.workspaceScope.getWorkspaceRoot();
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }

        try {
            if (!path || path === '.') {
                targetUri = workspaceRoot;
            } else {
                const resolved = await this.workspaceScope.resolveToUri(path);
                if (!resolved) {
                    return JSON.stringify({ error: `Invalid path: '${path}'` });
                }
                targetUri = resolved;
                await this.workspaceScope.ensureAccessible(targetUri);
            }
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }

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
            handler: async (arg: string, ctx?: ToolInvocationContext) => {
                try {
                    const { file } = JSON.parse(arg);
                    const workspaceRoot = await this.workspaceScope.getWorkspaceRoot();
                    const targetUri = workspaceRoot.resolve(file);
                    this.workspaceScope.ensureWithinWorkspace(targetUri, workspaceRoot);

                    return this.getDiagnosticsForFile(targetUri, ctx?.cancellationToken);
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
                // Create a model reference to ensure that the language services are active.
                const modelRef = await this.modelService.createModelReference(uri);
                modelRef.object.suppressOpenEditorWhenDirty = true;
                toDispose.push(modelRef);

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
                editor.object.suppressOpenEditorWhenDirty = true;
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
            description: 'Find files matching a given glob pattern. ' +
                'By default searches the workspace; pass `searchRoot` to search a directory listed in the ' +
                '`ai-features.workspaceFunctions.allowedExternalPaths` preference instead. ' +
                'This function allows efficient discovery of files using patterns like \'**/*.ts\' for all TypeScript files or ' +
                '\'src/**/*.js\' for JavaScript files in the src directory. The function respects gitignore patterns and user exclusions, ' +
                'returns paths relative to the search root, and limits results to 200 files maximum. ' +
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
                    },
                    searchRoot: {
                        type: 'string',
                        description: 'Optional absolute path or `file://` URI to search instead of the workspace. ' +
                            'Must be inside, or equal to, an entry of the `allowedExternalPaths` preference. ' +
                            'When set, results are returned as absolute paths so they can be passed back to getFileContent. ' +
                            'When omitted (default), the workspace root is searched and results are workspace-relative.'
                    }
                },
                required: ['pattern']
            },
            handler: (arg_string: string, ctx?: ToolInvocationContext) => {
                const args = JSON.parse(arg_string);
                return this.findFiles(args.pattern, args.exclude, args.searchRoot, ctx?.cancellationToken);
            },
            providerName: undefined,
            getArgumentsShortLabel: (args: string): { label: string; hasMore: boolean } | undefined => {
                try {
                    const parsed = JSON.parse(args);
                    if (parsed && typeof parsed === 'object' && 'pattern' in parsed) {
                        const keys = Object.keys(parsed);
                        return { label: String(parsed.pattern), hasMore: keys.length > 1 };
                    }
                } catch {
                    const pattern = extractJsonStringField(args, 'pattern');
                    if (pattern) {
                        return { label: pattern, hasMore: false };
                    }
                }
                return undefined;
            },
        };
    }

    private async findFiles(
        pattern: string,
        excludePatterns?: string[],
        searchRoot?: string,
        cancellationToken?: CancellationToken
    ): Promise<string> {
        if (cancellationToken?.isCancellationRequested) {
            return JSON.stringify({ error: 'Operation cancelled by user' });
        }

        let rootUri: URI;
        let isExternalRoot = false;
        try {
            if (searchRoot) {
                const resolved = await this.workspaceScope.resolveToUri(searchRoot);
                if (!resolved) {
                    return JSON.stringify({ error: `Invalid searchRoot: '${searchRoot}'` });
                }
                rootUri = resolved;
                isExternalRoot = !this.workspaceScope.isInWorkspace(rootUri);
                await this.workspaceScope.ensureAccessible(rootUri);
            } else {
                rootUri = await this.workspaceScope.getWorkspaceRoot();
            }
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }

        try {
            // Build ignore patterns from gitignore (workspace only) and user preferences
            const ignorePatterns = isExternalRoot
                ? this.preferences.get<string[]>(USER_EXCLUDE_PATTERN_PREF, [])
                : await this.buildIgnorePatterns(rootUri);

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

            await this.traverseDirectory(rootUri, rootUri, patternMatcher, excludeMatchers, files, maxResults, cancellationToken, isExternalRoot);

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
        searchRoot: URI,
        patternMatcher: Minimatch,
        excludeMatchers: Minimatch[],
        results: string[],
        maxResults: number,
        cancellationToken?: CancellationToken,
        emitAbsolutePaths = false
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

                const relativePath = searchRoot.relative(child.resource)?.toString();
                if (!relativePath) {
                    continue;
                }

                const shouldExclude = excludeMatchers.some(matcher => matcher.match(relativePath)) ||
                    (await this.workspaceScope.shouldExclude(child));

                if (shouldExclude) {
                    continue;
                }

                if (child.isDirectory) {
                    await this.traverseDirectory(child.resource, searchRoot, patternMatcher, excludeMatchers,
                        results, maxResults, cancellationToken, emitAbsolutePaths);
                } else if (patternMatcher.match(relativePath)) {
                    results.push(emitAbsolutePaths ? child.resource.path.toString() : relativePath);
                }
            }
        } catch {
            // If we can't access a directory, skip it
        }
    }
}
