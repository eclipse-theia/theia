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
import { CancellationToken, Disposable, PreferenceService, URI, Path } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
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
import { CONSIDER_GITIGNORE_PREF, FILE_CONTENT_MAX_SIZE_KB_PREF, USER_EXCLUDE_PATTERN_PREF } from '../common/workspace-preferences';
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

    private gitignoreMatchers = new Map<string, ReturnType<typeof ignore>>();
    private gitignoreWatchersInitialized = new Set<string>();

    private _rootMapping: Map<string, URI> | undefined;
    private _allRootUris: URI[] | undefined;

    @postConstruct()
    protected init(): void {
        this.workspaceService.onWorkspaceChanged(() => {
            this._rootMapping = undefined;
            this._allRootUris = undefined;
        });
    }

    /**
     * Returns all workspace root URIs (synchronous, cached).
     */
    private getAllRootUris(): URI[] {
        if (!this._allRootUris) {
            this._allRootUris = this.workspaceService.tryGetRoots().map(root => root.resource);
        }
        return this._allRootUris;
    }

    /**
     * Returns a mapping of root names to root URIs.
     *
     * Root names are always the directory basename. When multiple roots share the
     * same basename, only the first (by URI sort order) is addressable by name —
     * the others are still reachable via the `resolveRelativePath` supra-relative
     * check (which examines path segments against all roots).
     *
     * **Known limitation:** duplicate basenames are not disambiguated with synthetic
     * suffixes because agents observe real filesystem paths in terminal output,
     * compiler errors, stack traces, etc. Synthetic names like `app-1` would
     * conflict with those observations and cause more confusion than they solve.
     * A future improvement could let users assign display names to roots.
     */
    getRootMapping(): Map<string, URI> {
        if (this._rootMapping) {
            return this._rootMapping;
        }

        const wsRoots = this.workspaceService.tryGetRoots();
        const sortedRoots = [...wsRoots].sort((a, b) => a.resource.toString().localeCompare(b.resource.toString()));
        const mapping = new Map<string, URI>();

        for (const root of sortedRoots) {
            const basename = root.resource.path.base;
            if (mapping.has(basename)) {
                console.debug(
                    `Multiple workspace roots share the basename '${basename}'. ` +
                    `Only '${mapping.get(basename)!.toString()}' is addressable as '${basename}'. ` +
                    `'${root.resource.toString()}' can still be accessed but may require full paths.`
                );
                continue;
            }
            mapping.set(basename, root.resource);
        }

        this._rootMapping = mapping;
        return mapping;
    }

    /**
     * Returns the root name for a given root URI based on the cached mapping.
     */
    getRootName(rootUri: URI): string | undefined {
        const mapping = this.getRootMapping();
        for (const [name, uri] of mapping) {
            if (uri.toString() === rootUri.toString()) {
                return name;
            }
        }
        return undefined;
    }

    /**
     * Returns the workspace root that contains the given URI.
     * If nested roots exist, returns the most specific (deepest) one.
     */
    getContainingRoot(uri: URI): URI | undefined {
        const roots = this.getAllRootUris();
        const matchingRoots: URI[] = [];

        for (const rootUri of roots) {
            if (rootUri.scheme === uri.scheme && rootUri.isEqualOrParent(uri)) {
                matchingRoots.push(rootUri);
            }
        }

        matchingRoots.sort((a, b) => b.toString().length - a.toString().length);
        return matchingRoots[0];
    }

    /**
     * Converts a URI to a workspace-relative path with root name prefix.
     * Format: <rootName>/<relativePath>
     */
    toWorkspaceRelativePath(uri: URI): string | undefined {
        const containingRoot = this.getContainingRoot(uri);
        if (!containingRoot) {
            return undefined;
        }

        const rootName = this.getRootName(containingRoot);
        if (!rootName) {
            return undefined;
        }

        const relativePath = containingRoot.relative(uri);
        if (!relativePath || relativePath.toString() === '') {
            return rootName; // URI is the root itself
        }

        return `${rootName}/${relativePath.toString()}`;
    }

    ensureWithinWorkspace(targetUri: URI, workspaceRootUri: URI): void {
        if (!targetUri.toString().startsWith(workspaceRootUri.toString())) {
            throw new Error('Access outside of the workspace is not allowed');
        }
    }

    /**
     * Resolves a relative path to a URI using a deterministic, synchronous algorithm.
     * No filesystem I/O is performed — the agent is expected to use `<rootName>/<relativePath>`
     * format. If the path cannot be resolved deterministically, an error is thrown.
     *
     * Resolution order:
     * 1. Root+relative: first segment matches a root name → resolve rest relative to that root.
     * 2. Supra-relative: a root's basename appears as a segment, and any preceding material
     *    matches the preceding path components of the root → resolve the trailing portion.
     * 3. Single-root fallback: if exactly one workspace root, resolve relative to it.
     * 4. Error: tell the agent how to format the path.
     */
    resolveRelativePath(relativePath: string): URI {
        const normalizedPath = new Path(Path.normalizePathSeparator(relativePath)).normalize().toString();
        const mapping = this.getRootMapping();
        const roots = this.getAllRootUris();
        const segments = normalizedPath.split('/');

        // Phase 1 — Root+relative check:
        if (segments.length > 0) {
            const potentialRootName = segments[0];
            const rootUri = mapping.get(potentialRootName);
            if (rootUri) {
                const restOfPath = segments.slice(1).join('/');
                return restOfPath ? rootUri.resolve(restOfPath) : rootUri;
            }
        }

        // Phase 2 — Supra-relative check:
        for (const rootUri of roots) {
            const rootBasename = rootUri.path.base;
            for (let i = 0; i < segments.length; i++) {
                if (segments[i] !== rootBasename) {
                    continue;
                }
                const rootPathSegments = rootUri.path.toString().split('/').filter(s => s.length > 0);
                const rootPrecedingSegments = rootPathSegments.slice(0, rootPathSegments.length - 1);
                const pathPrecedingSegments = segments.slice(0, i);

                let matches = true;
                if (pathPrecedingSegments.length > rootPrecedingSegments.length) {
                    matches = false;
                } else {
                    const rootTail = rootPrecedingSegments.slice(rootPrecedingSegments.length - pathPrecedingSegments.length);
                    for (let j = 0; j < pathPrecedingSegments.length; j++) {
                        if (pathPrecedingSegments[j] !== rootTail[j]) {
                            matches = false;
                            break;
                        }
                    }
                }

                if (matches) {
                    const restOfPath = segments.slice(i + 1).join('/');
                    return restOfPath ? rootUri.resolve(restOfPath) : rootUri;
                }
            }
        }

        // Phase 3 — Single-root fallback:
        if (roots.length === 1) {
            return roots[0].resolve(normalizedPath);
        }

        // Phase 4 — Error:
        const rootNames = Array.from(mapping.keys());
        throw new Error(
            `Could not resolve path '${relativePath}'. In a multi-root workspace, prefix paths with the workspace root name ` +
            `(e.g., 'rootName/path/to/file'). Available roots: ${rootNames.join(', ')}`
        );
    }

    isInWorkspace(uri: URI): boolean {
        try {
            const roots = this.getAllRootUris();

            if (roots.length === 0) {
                return false;
            }

            for (const rootUri of roots) {
                if (rootUri.scheme === uri.scheme && rootUri.isEqualOrParent(uri)) {
                    return true;
                }
            }

            return false;
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
        const rootKey = workspaceRoot.toString();
        if (this.gitignoreWatchersInitialized.has(rootKey)) {
            return;
        }

        const gitignoreUri = workspaceRoot.resolve(this.GITIGNORE_FILE_NAME);
        this.fileService.watch(gitignoreUri);

        this.fileService.onDidFilesChange(async event => {
            if (event.contains(gitignoreUri)) {
                this.gitignoreMatchers.delete(rootKey);
            }
        });

        this.gitignoreWatchersInitialized.add(rootKey);
    }

    async shouldExclude(stat: FileStat): Promise<boolean> {
        const shouldConsiderGitIgnore = this.preferences.get(CONSIDER_GITIGNORE_PREF, false);
        const userExcludePatterns = this.preferences.get<string[]>(USER_EXCLUDE_PATTERN_PREF, []);

        if (this.isUserExcluded(stat.resource.path.base, userExcludePatterns)) {
            return true;
        }

        const containingRoot = this.getContainingRoot(stat.resource);
        // If the file is outside all workspace roots, we skip gitignore checks
        // since gitignore rules are relative to their root directory.
        if (shouldConsiderGitIgnore && containingRoot && (await this.isGitIgnored(stat, containingRoot))) {
            return true;
        }

        return false;
    }

    protected isUserExcluded(fileName: string, userExcludePatterns: string[]): boolean {
        return userExcludePatterns.some(pattern => new Minimatch(pattern, { dot: true }).match(fileName));
    }

    protected async isGitIgnored(stat: FileStat, workspaceRoot: URI): Promise<boolean> {
        await this.initializeGitignoreWatcher(workspaceRoot);

        const rootKey = workspaceRoot.toString();
        const gitignoreUri = workspaceRoot.resolve(this.GITIGNORE_FILE_NAME);

        try {
            const fileStat = await this.fileService.resolve(gitignoreUri);
            if (fileStat) {
                let matcher = this.gitignoreMatchers.get(rootKey);
                if (!matcher) {
                    const gitignoreContent = await this.fileService.read(gitignoreUri);
                    matcher = ignore().add(gitignoreContent.value);
                    this.gitignoreMatchers.set(rootKey, matcher);
                }
                const relativePath = workspaceRoot.relative(stat.resource);
                if (relativePath) {
                    const relativePathStr = relativePath.toString() + (stat.isDirectory ? '/' : '');
                    if (matcher.ignores(relativePathStr)) {
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
            description: 'Retrieves the complete directory tree structure of the workspace as a nested JSON object ' +
                'with root names as keys. ' +
                'Lists only directories (no files), excluding common non-essential directories (node_modules, hidden files, etc.). ' +
                'Useful for getting a high-level overview of project organization. ' +
                'For listing files within a specific directory, use getWorkspaceFileList instead. ' +
                'For finding specific files, use findFilesByPattern.',
            parameters: {
                type: 'object',
                properties: {},
            },
            handler: (_: string, ctx?: ToolInvocationContext) => this.getDirectoryStructure(ctx?.cancellationToken),
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

        try {
            const rootMapping = this.workspaceScope.getRootMapping();
            if (rootMapping.size === 0) {
                return { error: 'No workspace has been opened yet' };
            }

            const result: Record<string, unknown> = {};
            for (const [rootName, rootUri] of rootMapping) {
                if (cancellationToken?.isCancellationRequested) {
                    return { error: 'Operation cancelled by user' };
                }
                result[rootName] = await this.buildDirectoryStructure(rootUri, cancellationToken);
            }

            return result;
        } catch (error) {
            return { error: error.message };
        }
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
                'File paths use the same format returned by other workspace tools ' +
                '(e.g., "my-project/src/index.ts"). ' +
                'Only files within workspace boundaries are accessible; attempting to access files outside the workspace will return an error. ' +
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
                        description: 'The path to the target file within the workspace, as returned by other workspace tools ' +
                            '(e.g., "my-project/src/index.ts", "backend/package.json"). ' +
                            'Absolute paths and paths outside the workspace will result in an error.',
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
            targetUri = await this.workspaceScope.resolveRelativePath(file);
            const containingRoot = this.workspaceScope.getContainingRoot(targetUri);
            if (!containingRoot) {
                return JSON.stringify({ error: 'Access outside of the workspace is not allowed' });
            }
            this.workspaceScope.ensureWithinWorkspace(targetUri, containingRoot);
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
                        description: 'Path to a directory within the workspace ' +
                            '(e.g., "my-project/src", "backend/src/components"). ' +
                            'Use "" or "." to list the top-level workspace roots. ' +
                            'Paths outside the workspace will result in an error.'
                    }
                },
                required: ['path']
            },
            description: 'Lists files and directories within a specified workspace directory. ' +
                'Returns an array of names where directories are suffixed with "/" (e.g., ["src/", "package.json", "README.md"]). ' +
                'When called with empty path or ".", returns the list of workspace root names (e.g., ["frontend/", "backend/"]). ' +
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

        try {
            const rootMapping = this.workspaceScope.getRootMapping();
            if (rootMapping.size === 0) {
                return JSON.stringify({ error: 'No workspace has been opened yet' });
            }

            if (!path || path === '.' || path === '') {
                const rootNames = Array.from(rootMapping.keys()).map(name => `${name}/`);
                return rootNames;
            }

            const targetUri = await this.workspaceScope.resolveRelativePath(path);
            const containingRoot = this.workspaceScope.getContainingRoot(targetUri);
            if (!containingRoot) {
                return JSON.stringify({ error: 'Access outside of the workspace is not allowed' });
            }
            this.workspaceScope.ensureWithinWorkspace(targetUri, containingRoot);

            if (cancellationToken?.isCancellationRequested) {
                return JSON.stringify({ error: 'Operation cancelled by user' });
            }

            const stat = await this.fileService.resolve(targetUri);
            if (!stat || !stat.isDirectory) {
                return JSON.stringify({ error: 'Directory not found' });
            }
            return await this.listFilesDirectly(targetUri, cancellationToken);
        } catch (error) {
            return JSON.stringify({ error: 'Directory not found' });
        }
    }

    private async listFilesDirectly(uri: URI, cancellationToken?: CancellationToken): Promise<string | string[]> {
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
                        description: 'The path to the target file within the workspace ' +
                            '(e.g., "my-project/src/index.ts", "backend/src/main.ts").'
                    }
                },
                required: ['file']
            },
            handler: async (arg: string, ctx?: ToolInvocationContext) => {
                try {
                    const { file } = JSON.parse(arg);
                    const targetUri = await this.workspaceScope.resolveRelativePath(file);
                    const containingRoot = this.workspaceScope.getContainingRoot(targetUri);
                    if (!containingRoot) {
                        return JSON.stringify({ error: 'Access outside of the workspace is not allowed' });
                    }
                    this.workspaceScope.ensureWithinWorkspace(targetUri, containingRoot);

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
            description: 'Find files in the workspace that match a given glob pattern. ' +
                'Searches across all workspace roots. ' +
                'Allows efficient discovery of files using patterns like \'**/*.ts\' for all TypeScript files or ' +
                '\'src/**/*.js\' for JavaScript files in the src directory. The function respects gitignore patterns and user exclusions, ' +
                'returns workspace-relative paths (e.g., "my-project/src/index.ts"), and limits results to 200 files maximum. ' +
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
            handler: (arg_string: string, ctx?: ToolInvocationContext) => {
                const args = JSON.parse(arg_string);
                return this.findFiles(args.pattern, args.exclude, ctx?.cancellationToken);
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

    private async findFiles(pattern: string, excludePatterns?: string[], cancellationToken?: CancellationToken): Promise<string> {
        if (cancellationToken?.isCancellationRequested) {
            return JSON.stringify({ error: 'Operation cancelled by user' });
        }

        try {
            const rootMapping = this.workspaceScope.getRootMapping();
            if (rootMapping.size === 0) {
                return JSON.stringify({ error: 'No workspace has been opened yet' });
            }

            const patternMatcher = new Minimatch(pattern, { dot: false });
            const files: string[] = [];
            const maxResults = 200;

            for (const [rootName, rootUri] of rootMapping) {
                if (cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }

                if (files.length >= maxResults) {
                    break;
                }

                const ignorePatterns = await this.buildIgnorePatterns(rootUri);
                const allExcludes = [...ignorePatterns];
                if (excludePatterns && excludePatterns.length > 0) {
                    allExcludes.push(...excludePatterns);
                }
                const excludeMatchers = allExcludes.map(excludePattern => new Minimatch(excludePattern, { dot: true }));

                await this.traverseDirectory(
                    rootUri,
                    rootUri,
                    rootName,
                    patternMatcher,
                    excludeMatchers,
                    files,
                    maxResults,
                    cancellationToken
                );
            }

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
        rootName: string,
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
                    await this.traverseDirectory(
                        child.resource,
                        workspaceRoot,
                        rootName,
                        patternMatcher,
                        excludeMatchers,
                        results,
                        maxResults,
                        cancellationToken
                    );
                } else if (patternMatcher.match(relativePath)) {
                    results.push(`${rootName}/${relativePath}`);
                }
            }
        } catch {
            // If we can't access a directory, skip it
        }
    }
}
