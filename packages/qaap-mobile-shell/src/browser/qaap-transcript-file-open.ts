// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { nls } from '@theia/core/lib/common/nls';
import { Disposable } from '@theia/core/lib/common/disposable';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { LabelProvider, URIIconReference } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { MarkdownPreviewHandler } from '@theia/preview/lib/browser/markdown/markdown-preview-handler';
import {
    type TranscriptFileTreeEntry,
    type TranscriptFilesViewServices,
} from './qaap-transcript-files-view';
import { createTranscriptPreviewMonacoEditor } from './qaap-transcript-monaco-editor';

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

export function resolveTranscriptWorkspaceRootUri(cwd: string, workspaceService: WorkspaceService): URI | undefined {
    const trimmed = cwd.trim();
    if (!trimmed) {
        return undefined;
    }
    const cwdUri = trimmed.startsWith('/') ? FileUri.create(trimmed) : new URI(trimmed);
    for (const root of workspaceService.tryGetRoots()) {
        const relative = root.resource.relative(cwdUri);
        if (relative !== undefined && !relative.toString().startsWith('..')) {
            return cwdUri;
        }
    }
    const roots = workspaceService.tryGetRoots();
    if (roots.length > 0) {
        return roots[0].resource;
    }
    return cwdUri;
}

export function resolveTranscriptWorkspaceRootLabel(cwd: string, workspaceService: WorkspaceService): string {
    const root = resolveTranscriptWorkspaceRootUri(cwd, workspaceService);
    if (!root) {
        return cwd.split('/').filter(Boolean).pop() ?? cwd;
    }
    return (root.path.base || root.path.name || cwd.split('/').filter(Boolean).pop()) ?? 'workspace';
}

/**
 * Wires transcript Files tab to the same IDE services as the workbench:
 * - {@link FileService} for list/read/write and file-change events
 * - {@link MonacoEditorProvider} for inline editor (TextMate, same model URI as main editor)
 * - {@link MarkdownPreviewHandler} for markdown preview (same as Preview view)
 * - {@link LabelProvider} for file/folder icons (same as Explorer)
 * - `file.newFile` / `file.newFolder` commands and {@link EditorManager} for open-in-workbench
 */
export function createTranscriptFilesViewServices(
    workspaceService: WorkspaceService,
    fileService: FileService,
    editorManager: EditorManager,
    commands: CommandRegistry,
    editorProvider?: MonacoEditorProvider,
    labelProvider?: LabelProvider,
    markdownPreviewHandler?: MarkdownPreviewHandler,
): TranscriptFilesViewServices {
    return {
        resolveRootUri: cwd => resolveTranscriptWorkspaceRootUri(cwd, workspaceService)?.toString(),
        resolveRootLabel: cwd => resolveTranscriptWorkspaceRootLabel(cwd, workspaceService),
        listDirectory: async resourcePath => {
            const stat = await fileService.resolve(new URI(resourcePath));
            return (stat.children ?? []).map(child => ({
                name: child.name,
                resourcePath: child.resource.toString(),
                relativePath: child.name,
                isDirectory: child.isDirectory,
            } satisfies TranscriptFileTreeEntry));
        },
        relativePathForResource: (resourcePath, rootUri) => {
            const relative = new URI(rootUri).relative(new URI(resourcePath));
            return relative?.toString() ?? new URI(resourcePath).path.base;
        },
        readFile: async resourcePath => {
            const content = await fileService.readFile(new URI(resourcePath));
            return content.value.toString();
        },
        resolveFileIcon: labelProvider
            ? (resourcePath, isDirectory) => {
                if (isDirectory) {
                    return labelProvider.getIcon(URIIconReference.create('folder'));
                }
                return labelProvider.getIcon(new URI(resourcePath));
            }
            : undefined,
        renderMarkdownPreview: markdownPreviewHandler
            ? (resourcePath, markdown) => markdownPreviewHandler.renderContent({
                content: markdown,
                originUri: new URI(resourcePath),
            })
            : undefined,
        createNewFile: parentResourcePath => {
            void executeTranscriptNewFileCommand(commands, workspaceService, parentResourcePath);
        },
        createNewFolder: parentResourcePath => {
            void executeTranscriptNewFolderCommand(commands, workspaceService, parentResourcePath);
        },
        openInEditor: relativePath => {
            void openTranscriptWorkspaceFile(relativePath, workspaceService, editorManager);
        },
        writeFile: async (resourcePath, content) => {
            await fileService.write(new URI(resourcePath), content);
        },
        createMonacoPreviewEditor: editorProvider
            ? (host, resourcePath, options) => createTranscriptPreviewMonacoEditor(
                host,
                resourcePath,
                editorProvider,
                options,
            )
            : undefined,
        watchFileTreeChanges: onChange => {
            const subscription = fileService.onDidFilesChange(() => {
                onChange();
            });
            return Disposable.create(() => subscription.dispose());
        },
        localize: (key, defaultValue, ...args) => nls.localize(key, defaultValue, ...args),
    };
}

function executeTranscriptNewFileCommand(
    commands: CommandRegistry,
    workspaceService: WorkspaceService,
    parentResourcePath?: string,
): void {
    if (parentResourcePath) {
        void commands.executeCommand('file.newFile', new URI(parentResourcePath));
        return;
    }
    const root = resolveTranscriptWorkspaceRootUri('', workspaceService);
    if (root) {
        void commands.executeCommand('file.newFile', root);
        return;
    }
    void commands.executeCommand('file.newFile');
}

function executeTranscriptNewFolderCommand(
    commands: CommandRegistry,
    workspaceService: WorkspaceService,
    parentResourcePath?: string,
): void {
    if (parentResourcePath) {
        void commands.executeCommand('file.newFolder', new URI(parentResourcePath));
        return;
    }
    const root = resolveTranscriptWorkspaceRootUri('', workspaceService);
    if (root) {
        void commands.executeCommand('file.newFolder', root);
        return;
    }
    void commands.executeCommand('file.newFolder');
}
