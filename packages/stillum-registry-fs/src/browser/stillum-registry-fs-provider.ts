import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import {
    FileChange, FileChangeType, FileDeleteOptions,
    FileOverwriteOptions, FileSystemProviderCapabilities,
    FileSystemProviderWithFileReadWriteCapability,
    FileType, FileWriteOptions, Stat, WatchOptions,
    createFileSystemProviderError, FileSystemProviderErrorCode,
} from '@theia/filesystem/lib/common/files';
import { Emitter, Event, URI, Disposable, DisposableCollection } from '@theia/core';
import { StillumPortalBridge, WorkspaceData } from './stillum-portal-bridge';

export const STILLUM_SCHEME = 'stillum';

interface FileEntry {
    name: string;
    artifactId: string;
    versionId: string;
    sourceCode: string;
}

@injectable()
export class StillumRegistryFsProvider implements Disposable,
    FileSystemProviderWithFileReadWriteCapability {

    readonly capabilities: FileSystemProviderCapabilities =
        FileSystemProviderCapabilities.FileReadWrite;

    readonly onDidChangeCapabilities: Event<void> = Event.None;

    private readonly onDidChangeFileEmitter = new Emitter<readonly FileChange[]>();
    readonly onDidChangeFile: Event<readonly FileChange[]> = this.onDidChangeFileEmitter.event;
    readonly onFileWatchError: Event<void> = Event.None;

    @inject(StillumPortalBridge)
    protected readonly bridge: StillumPortalBridge;

    protected readonly toDispose = new DisposableCollection(
        this.onDidChangeFileEmitter
    );

    /** In-memory file tree: filename -> file entry */
    private files = new Map<string, FileEntry>();

    @postConstruct()
    protected init(): void {
        // No-op — workspace data is loaded externally via loadWorkspace()
    }

    loadWorkspace(data: WorkspaceData): void {
        this.files.clear();

        // Module's own sourceCode -> index.tsx
        if (data.moduleVersion) {
            this.files.set('index.tsx', {
                name: 'index.tsx',
                artifactId: data.module.id,
                versionId: data.moduleVersion.id,
                sourceCode: data.moduleVersion.sourceCode ?? '',
            });
        }

        // Each component -> {title}.tsx
        const usedNames = new Set<string>(['index.tsx']);
        for (const comp of data.components) {
            let fileName = this.toFileName(comp.artifact.title);
            if (usedNames.has(fileName)) {
                // Avoid name collisions by appending short artifact ID
                const shortId = comp.artifact.id.substring(0, 8);
                fileName = this.toFileName(`${comp.artifact.title}-${shortId}`);
            }
            usedNames.add(fileName);

            this.files.set(fileName, {
                name: fileName,
                artifactId: comp.artifact.id,
                versionId: comp.version?.id ?? '',
                sourceCode: comp.version?.sourceCode ?? '',
            });
        }
    }

    /** Finds a file entry by its artifactId */
    findByArtifactId(artifactId: string): { fileName: string; entry: FileEntry } | undefined {
        for (const [fileName, entry] of this.files) {
            if (entry.artifactId === artifactId) {
                return { fileName, entry };
            }
        }
        return undefined;
    }

    watch(_resource: URI, _opts: WatchOptions): Disposable {
        // No external watchers — changes come from the editor
        return Disposable.NULL;
    }

    async stat(resource: URI): Promise<Stat> {
        const path = resource.path.toString();

        // Root directory
        if (path === '/' || path === '') {
            return {
                type: FileType.Directory,
                ctime: Date.now(),
                mtime: Date.now(),
                size: 0,
            };
        }

        const fileName = this.extractFileName(path);
        const entry = this.files.get(fileName);
        if (!entry) {
            throw createFileSystemProviderError(
                `File not found: ${fileName}`,
                FileSystemProviderErrorCode.FileNotFound
            );
        }

        const content = new TextEncoder().encode(entry.sourceCode);
        return {
            type: FileType.File,
            ctime: Date.now(),
            mtime: Date.now(),
            size: content.byteLength,
        };
    }

    async readdir(resource: URI): Promise<[string, FileType][]> {
        const path = resource.path.toString();
        if (path !== '/' && path !== '') {
            throw createFileSystemProviderError(
                'Only root directory is supported',
                FileSystemProviderErrorCode.FileNotADirectory
            );
        }

        return Array.from(this.files.keys()).map(name => [name, FileType.File]);
    }

    async readFile(resource: URI): Promise<Uint8Array> {
        const fileName = this.extractFileName(resource.path.toString());
        const entry = this.files.get(fileName);
        if (!entry) {
            throw createFileSystemProviderError(
                `File not found: ${fileName}`,
                FileSystemProviderErrorCode.FileNotFound
            );
        }

        return new TextEncoder().encode(entry.sourceCode);
    }

    async writeFile(resource: URI, content: Uint8Array, _opts: FileWriteOptions): Promise<void> {
        const fileName = this.extractFileName(resource.path.toString());
        const entry = this.files.get(fileName);
        if (!entry) {
            throw createFileSystemProviderError(
                `File not found: ${fileName}`,
                FileSystemProviderErrorCode.FileNotFound
            );
        }

        const newSourceCode = new TextDecoder().decode(content);
        entry.sourceCode = newSourceCode;

        // Persist to registry API
        await this.bridge.saveSourceCode(entry.artifactId, entry.versionId, newSourceCode);

        this.onDidChangeFileEmitter.fire([{
            resource,
            type: FileChangeType.UPDATED,
        }]);
    }

    async mkdir(_resource: URI): Promise<void> {
        throw createFileSystemProviderError(
            'Creating directories is not supported',
            FileSystemProviderErrorCode.NoPermissions
        );
    }

    async delete(_resource: URI, _opts: FileDeleteOptions): Promise<void> {
        throw createFileSystemProviderError(
            'Deleting files is not supported',
            FileSystemProviderErrorCode.NoPermissions
        );
    }

    async rename(_from: URI, _to: URI, _opts: FileOverwriteOptions): Promise<void> {
        throw createFileSystemProviderError(
            'Renaming files is not supported',
            FileSystemProviderErrorCode.NoPermissions
        );
    }

    private toFileName(title: string): string {
        // Convert title to filename with .tsx extension
        const cleaned = title
            .replace(/[^a-zA-Z0-9\s\-_]/g, '')
            .trim();
        if (!cleaned) {
            return 'Untitled.tsx';
        }
        return cleaned + '.tsx';
    }

    private extractFileName(path: string): string {
        // Remove leading slash and any directory segments
        const segments = path.split('/').filter(s => s.length > 0);
        return segments[segments.length - 1] ?? '';
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
