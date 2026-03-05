import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Disposable, DisposableCollection, URI } from '@theia/core';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { StillumPortalBridge, StillumInitMessage, WorkspaceData } from './stillum-portal-bridge';
import { StillumRegistryFsProvider, STILLUM_SCHEME } from './stillum-registry-fs-provider';
import { StillumWorkspaceManager, ComponentFiles } from '../common/stillum-workspace-manager';

/**
 * Describes a component folder tracked for sync.
 * When any file in the folder changes, ALL files are collected and sent to the registry.
 */
interface TrackedComponentFolder {
    /** Workspace-relative folder path: src/components/<area>/<Title> */
    relativeFolderPath: string;
    artifactId: string;
    versionId: string;
}

@injectable()
export class StillumWorkspaceInitializer implements FrontendApplicationContribution {

    @inject(StillumPortalBridge)
    protected readonly bridge: StillumPortalBridge;

    @inject(StillumRegistryFsProvider)
    protected readonly fsProvider: StillumRegistryFsProvider;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(StillumWorkspaceManager)
    protected readonly workspaceManager: StillumWorkspaceManager;

    @inject(FileService)
    protected readonly fileService: FileService;

    /** Component folders tracked for sync: folder path → artifact info */
    private trackedComponentFolders: TrackedComponentFolder[] = [];
    /** Module artifact info (for src/index.tsx sync) */
    private moduleMapping: { artifactId: string; versionId: string } | undefined;
    private workspacePath: string = '';
    /** Debounce timers per component to avoid rapid-fire syncs */
    private syncTimers = new Map<string, ReturnType<typeof setTimeout>>();
    /** Disposables for editor save listeners (cleaned up when editors close) */
    private editorDisposables = new DisposableCollection();
    /** Widget IDs already tracked — prevents double-registering listeners */
    private trackedWidgetIds = new Set<string>();

    async onStart(): Promise<void> {
        // Only activate when running inside an iframe with a parent window
        if (window === window.parent) {
            console.log('[StillumWorkspaceInitializer] Not in iframe, skipping');
            return;
        }

        console.log('[StillumWorkspaceInitializer] Waiting for init message from portal...');
        const initData = await this.bridge.waitForInit();
        console.log('[StillumWorkspaceInitializer] Received init:', {
            moduleArtifactId: initData.moduleArtifactId,
            moduleVersionId: initData.moduleVersionId,
            openComponentId: initData.openComponentId,
            hasWorkspace: !!initData.workspace,
        });

        // Get workspace data (from init message or fallback to direct API fetch)
        let workspace: WorkspaceData;
        if (initData.workspace) {
            console.log('[StillumWorkspaceInitializer] Using workspace data from init message');
            workspace = initData.workspace;
        } else {
            console.log('[StillumWorkspaceInitializer] No workspace in init, fetching from API...');
            workspace = await this.bridge.fetchWorkspace();
        }

        console.log('[StillumWorkspaceInitializer] Workspace loaded:', {
            moduleTitle: workspace.module?.title,
            hasModuleVersion: !!workspace.moduleVersion,
            hasBuildSnapshot: !!workspace.moduleVersion?.buildSnapshot?.files,
            componentCount: workspace.components?.length ?? 0,
        });

        // Check if build snapshot is available for disk materialization
        const hasBuildSnapshot = !!workspace.moduleVersion?.buildSnapshot?.files;

        if (!hasBuildSnapshot) {
            console.warn('[StillumWorkspaceInitializer] No build snapshot available, falling back to virtual filesystem');
            this.fallbackToVirtualFs(initData, workspace);
            return;
        }

        // Detect whether the workspace was already materialized and opened (after reload).
        const expectedModuleId = initData.moduleArtifactId;
        const hashPath = decodeURI(window.location.hash.slice(1));
        const alreadyOpen = hashPath.includes(`stillum-workspaces/${expectedModuleId}`);

        if (!alreadyOpen) {
            // First load: materialize all project files to disk, then open the workspace
            console.log('[StillumWorkspaceInitializer] First load — materializing workspace to disk...');
            await this.materializeAndOpenWorkspace(initData, workspace);
            // Page will reload; execution stops here
            return;
        }

        // After reload: workspace is already open on disk.
        // Set up source-file sync and open the target file in the editor.
        console.log('[StillumWorkspaceInitializer] Workspace already open (post-reload)');

        // Wait for workspace roots to be fully resolved — tryGetRoots() may
        // return empty if the WorkspaceService hasn't finished initializing yet.
        const roots = await this.workspaceService.roots;
        this.workspacePath = roots.length > 0
            ? roots[0].resource.path.toString()
            : hashPath;
        console.log('[StillumWorkspaceInitializer] Workspace path resolved:', this.workspacePath);

        this.buildSyncMappings(workspace);
        this.setupEditorSaveListener();
        await this.openTargetFile(initData, workspace);
    }

    // ─── Materialization ───────────────────────────────────────────────

    /**
     * Call the backend to write all project files to a real directory on disk,
     * then open that directory as the Theia workspace (causes page reload).
     */
    private async materializeAndOpenWorkspace(
        initData: StillumInitMessage,
        workspace: WorkspaceData,
    ): Promise<void> {
        const { snapshotFiles, moduleSourceCode, components } = this.prepareMaterializeRequest(workspace);

        console.log('[StillumWorkspaceInitializer] Calling backend materialize RPC:', {
            moduleId: initData.moduleArtifactId,
            snapshotFileCount: Object.keys(snapshotFiles).length,
            hasModuleSource: !!moduleSourceCode,
            componentCount: components.length,
        });

        const result = await this.workspaceManager.materialize({
            moduleId: initData.moduleArtifactId,
            moduleTitle: workspace.module.title,
            snapshotFiles,
            moduleSourceCode,
            components,
        });

        console.log('[StillumWorkspaceInitializer] Workspace materialized at:', result.workspacePath);

        // Open the workspace — triggers a page reload (preserveWindow keeps the same iframe)
        const workspaceUri = new URI(`file://${result.workspacePath}`);
        this.workspaceService.open(workspaceUri, { preserveWindow: true });
    }

    /**
     * Build the materialize request from workspace data.
     * Each component gets its own ComponentFiles entry with its folder structure.
     */
    private prepareMaterializeRequest(workspace: WorkspaceData): {
        snapshotFiles: Record<string, string>;
        moduleSourceCode?: string;
        components: ComponentFiles[];
    } {
        const snapshotFiles: Record<string, string> = {};
        const components: ComponentFiles[] = [];

        // Build snapshot files (package.json, tsconfig, webpack, etc.)
        if (workspace.moduleVersion?.buildSnapshot?.files) {
            Object.assign(snapshotFiles, workspace.moduleVersion.buildSnapshot.files);
        }

        // Module source code -> src/index.tsx
        const moduleSourceCode = workspace.moduleVersion?.sourceCode || undefined;

        // Component files — each component has its own folder
        for (const comp of workspace.components) {
            if (!comp.version) continue;

            const area = comp.artifact.area || 'droplets';
            const title = comp.artifact.title;
            const files: Record<string, string> = {};

            if (comp.version.sourceFiles && Object.keys(comp.version.sourceFiles).length > 0) {
                // Multi-file component: use sourceFiles map (filenames relative to component folder)
                Object.assign(files, comp.version.sourceFiles);
            } else if (comp.version.sourceCode) {
                // Single-file backward compat: create <Title>.tsx from sourceCode
                files[`${title}.tsx`] = comp.version.sourceCode;
            }

            if (Object.keys(files).length > 0) {
                components.push({
                    artifactId: comp.artifact.id,
                    title,
                    area,
                    files,
                });
            }
        }

        return { snapshotFiles, moduleSourceCode, components };
    }

    // ─── Sync mappings ─────────────────────────────────────────────────

    /**
     * Build the in-memory mappings for syncing file changes back to the registry.
     * - Module src/index.tsx → moduleMapping
     * - Each component folder → trackedComponentFolders
     */
    private buildSyncMappings(workspace: WorkspaceData): void {
        this.trackedComponentFolders = [];
        this.moduleMapping = undefined;

        // Module mapping
        if (workspace.moduleVersion) {
            this.moduleMapping = {
                artifactId: workspace.module.id,
                versionId: workspace.moduleVersion.id,
            };
        }

        // Component folder mappings
        for (const comp of workspace.components) {
            if (!comp.version) continue;
            const area = comp.artifact.area || 'droplets';
            const title = comp.artifact.title;
            const relativeFolderPath = `src/components/${area}/${title}`;

            this.trackedComponentFolders.push({
                relativeFolderPath,
                artifactId: comp.artifact.id,
                versionId: comp.version.id,
            });
        }

        console.log('[StillumWorkspaceInitializer] Sync mappings built:', {
            hasModuleMapping: !!this.moduleMapping,
            componentFolders: this.trackedComponentFolders.map(f => f.relativeFolderPath),
        });
    }

    // ─── Editor save listener ─────────────────────────────────────────

    /**
     * Intercept save events directly from the Theia editor.
     *
     * Uses THREE layers to ensure every editor is tracked regardless of timing:
     *
     *   1. editorManager.all — catches editors already open when this runs
     *   2. editorManager.onCreated — catches editors created AFTER this runs
     *   3. editorManager.onActiveEditorChanged — lazy fallback: whenever the
     *      user switches editor tab, we check if it's tracked and attach
     *      a listener if needed.  This covers edge-cases where the first
     *      two layers missed a widget (e.g., restored from layout state
     *      between layers 1 and 2).
     *
     * Each layer calls trackEditorWidget(), which is **idempotent** (guarded
     * by trackedWidgetIds).
     */
    private setupEditorSaveListener(): void {
        // Layer 1 — editors already open
        const existing = this.editorManager.all;
        console.log('[StillumWorkspaceInitializer] Layer 1 — existing editors:', existing.length);
        for (const widget of existing) {
            this.trackEditorWidget(widget);
        }

        // Layer 2 — editors created later
        this.editorDisposables.push(
            this.editorManager.onCreated(widget => {
                console.log('[StillumWorkspaceInitializer] Layer 2 — onCreated:', widget.id);
                this.trackEditorWidget(widget);
            })
        );

        // Layer 3 — active editor changes (lazy catch-all)
        this.editorDisposables.push(
            this.editorManager.onActiveEditorChanged(widget => {
                if (widget) {
                    this.trackEditorWidget(widget);
                }
            })
        );

        console.log('[StillumWorkspaceInitializer] Editor save listener active (3-layer)');
    }

    /**
     * Attach a save listener to an editor widget.
     *
     * Idempotent: if the widget is already tracked (by ID), this is a no-op.
     *
     * When the editor transitions from dirty → clean (= save completed),
     * we check if the file belongs to a tracked component folder or is the
     * module index, and sync it to the registry.
     */
    private trackEditorWidget(widget: EditorWidget): void {
        // Idempotent guard
        if (this.trackedWidgetIds.has(widget.id)) {
            return;
        }

        const resourceUri = widget.getResourceUri();
        if (!resourceUri) {
            return;
        }

        const filePath = resourceUri.path.toString();
        const relativePath = this.toRelativePath(filePath);
        if (!relativePath) {
            return;
        }

        // Only track files in our tracked paths
        const isModuleIndex = relativePath === 'src/index.tsx' && !!this.moduleMapping;
        const tracked = this.trackedComponentFolders.find(
            f => relativePath.startsWith(f.relativeFolderPath + '/'),
        );

        if (!isModuleIndex && !tracked) {
            return;
        }

        // Mark as tracked BEFORE registering listeners
        this.trackedWidgetIds.add(widget.id);
        console.log('[StillumWorkspaceInitializer] ✔ Tracking editor:', relativePath,
            '| widgetId:', widget.id,
            '| isModuleIndex:', isModuleIndex,
            '| componentFolder:', tracked?.relativeFolderPath ?? 'N/A');

        // Track dirty state: we need to detect the dirty → clean transition
        let wasDirty = widget.saveable.dirty;

        const disposable = new DisposableCollection();

        disposable.push(
            widget.saveable.onDirtyChanged(() => {
                const isDirty = widget.saveable.dirty;
                console.log('[StillumWorkspaceInitializer] onDirtyChanged:', relativePath,
                    '| wasDirty:', wasDirty, '→ isDirty:', isDirty);

                if (wasDirty && !isDirty) {
                    // dirty → clean = save completed
                    console.log('[StillumWorkspaceInitializer] 💾 Save detected:', relativePath);
                    if (isModuleIndex) {
                        this.syncModuleSourceCode(resourceUri);
                    } else if (tracked) {
                        this.debouncedSyncComponentFolder(tracked);
                    }
                }
                wasDirty = isDirty;
            })
        );

        // Clean up when the editor is closed
        disposable.push(
            Disposable.create(() => {
                this.trackedWidgetIds.delete(widget.id);
                console.log('[StillumWorkspaceInitializer] Editor closed, removed tracking:', relativePath);
            })
        );
        widget.disposed.connect(() => disposable.dispose());

        this.editorDisposables.push(disposable);
    }

    /**
     * Sync module's src/index.tsx to the registry as sourceCode.
     */
    private async syncModuleSourceCode(fileUri: URI): Promise<void> {
        if (!this.moduleMapping) return;
        try {
            const content = await this.fileService.read(fileUri);
            console.log('[StillumWorkspaceInitializer] Syncing module src/index.tsx',
                '| artifactId:', this.moduleMapping.artifactId,
                '| versionId:', this.moduleMapping.versionId,
                '| contentLength:', content.value.length);
            await this.bridge.saveSourceCode(
                this.moduleMapping.artifactId,
                this.moduleMapping.versionId,
                content.value,
            );
            console.log('[StillumWorkspaceInitializer] ✅ Module source sync successful');
            this.bridge.notifyDirtyState(false);
        } catch (error) {
            console.error('[StillumWorkspaceInitializer] ❌ Failed to sync module source:', error);
        }
    }

    /**
     * Debounce component folder sync: wait 1s after the last change before syncing.
     * This avoids rapid-fire syncs when multiple files change in quick succession
     * (e.g., during a save-all or format-on-save).
     */
    private debouncedSyncComponentFolder(tracked: TrackedComponentFolder): void {
        const key = tracked.artifactId;
        const existing = this.syncTimers.get(key);
        if (existing) {
            clearTimeout(existing);
        }
        this.syncTimers.set(key, setTimeout(() => {
            this.syncTimers.delete(key);
            this.syncComponentFolder(tracked);
        }, 1000));
    }

    /**
     * Scan a component folder, collect all files, and sync them to the registry
     * as sourceFiles: { "Button.tsx": "...", "Button.test.tsx": "...", ... }
     */
    private async syncComponentFolder(tracked: TrackedComponentFolder): Promise<void> {
        try {
            const folderUri = new URI(`file://${this.workspacePath}/${tracked.relativeFolderPath}`);
            console.log('[StillumWorkspaceInitializer] Collecting files from:', folderUri.toString());
            const sourceFiles = await this.collectFolderFiles(folderUri, '');

            if (Object.keys(sourceFiles).length === 0) {
                console.warn('[StillumWorkspaceInitializer] Component folder empty, skipping sync:', tracked.relativeFolderPath);
                return;
            }

            console.log('[StillumWorkspaceInitializer] Syncing component:', tracked.relativeFolderPath,
                '| files:', Object.keys(sourceFiles),
                '| artifactId:', tracked.artifactId,
                '| versionId:', tracked.versionId);
            await this.bridge.saveComponentFiles(
                tracked.artifactId,
                tracked.versionId,
                sourceFiles,
            );
            console.log('[StillumWorkspaceInitializer] ✅ Component sync successful:', tracked.relativeFolderPath);
            this.bridge.notifyDirtyState(false);
        } catch (error) {
            console.error('[StillumWorkspaceInitializer] ❌ Failed to sync component folder:', error);
        }
    }

    /**
     * Recursively collect all files in a directory as { relativePath: content }.
     * Paths are relative to the component folder root.
     */
    private async collectFolderFiles(
        dirUri: URI,
        prefix: string,
    ): Promise<Record<string, string>> {
        const result: Record<string, string> = {};
        try {
            const entries = await this.fileService.resolve(dirUri);
            if (!entries.children) return result;

            for (const child of entries.children) {
                const name = child.name;
                const relativeName = prefix ? `${prefix}/${name}` : name;

                if (child.isDirectory) {
                    // Recursively collect files in subdirectories
                    const subFiles = await this.collectFolderFiles(child.resource, relativeName);
                    Object.assign(result, subFiles);
                } else if (child.isFile) {
                    try {
                        const content = await this.fileService.read(child.resource);
                        result[relativeName] = content.value;
                    } catch (readError) {
                        console.warn(`[StillumWorkspaceInitializer] Failed to read ${relativeName}:`, readError);
                    }
                }
            }
        } catch (error) {
            console.warn('[StillumWorkspaceInitializer] Failed to resolve directory:', dirUri.toString(), error);
        }
        return result;
    }

    // ─── Open target file ──────────────────────────────────────────────

    /**
     * Open the target file in the editor.
     * If openComponentId is specified, open that component's main file;
     * otherwise open src/index.tsx.
     */
    private async openTargetFile(
        initData: StillumInitMessage,
        workspace: WorkspaceData,
    ): Promise<void> {
        let targetPath: string;

        if (initData.openComponentId) {
            const comp = workspace.components.find(
                c => c.artifact.id === initData.openComponentId,
            );
            if (comp) {
                const area = comp.artifact.area || 'droplets';
                const title = comp.artifact.title;
                // Open the main component file (same name as folder)
                targetPath = `src/components/${area}/${title}/${title}.tsx`;
            } else {
                console.warn('[StillumWorkspaceInitializer] Component not found:', initData.openComponentId);
                targetPath = 'src/index.tsx';
            }
        } else {
            targetPath = 'src/index.tsx';
        }

        const fileUri = new URI(`file://${this.workspacePath}/${targetPath}`);
        console.log('[StillumWorkspaceInitializer] Opening file:', fileUri.toString());

        try {
            // Verify the file exists before attempting to open it
            const exists = await this.fileService.exists(fileUri);
            if (!exists) {
                console.warn('[StillumWorkspaceInitializer] Target file not found on disk:', fileUri.toString());
                return;
            }
            await this.editorManager.open(fileUri);
        } catch (error) {
            console.error('[StillumWorkspaceInitializer] Failed to open target file:', error);
        }
    }

    // ─── Virtual filesystem fallback ───────────────────────────────────

    /**
     * Fallback to the in-memory virtual filesystem when no build snapshot
     * is available (preserves pre-materialization behavior).
     */
    private fallbackToVirtualFs(
        initData: StillumInitMessage,
        workspace: WorkspaceData,
    ): void {
        this.fsProvider.loadWorkspace(workspace);

        if (initData.openComponentId) {
            const match = this.fsProvider.findByArtifactId(initData.openComponentId);
            if (match) {
                const fileUri = new URI(`${STILLUM_SCHEME}:///${match.fileName}`);
                console.log('[StillumWorkspaceInitializer] Opening component (virtual FS):', fileUri.toString());
                setTimeout(() => this.editorManager.open(fileUri), 500);
            } else {
                console.warn('[StillumWorkspaceInitializer] Component not found:', initData.openComponentId);
            }
        } else {
            const indexUri = new URI(`${STILLUM_SCHEME}:///index.tsx`);
            console.log('[StillumWorkspaceInitializer] Opening default file (virtual FS):', indexUri.toString());
            setTimeout(() => this.editorManager.open(indexUri), 500);
        }
    }

    // ─── Utilities ─────────────────────────────────────────────────────

    /**
     * Extract a workspace-relative path from an absolute path.
     * Returns undefined if the path is not inside the workspace.
     */
    private toRelativePath(absolutePath: string): string | undefined {
        if (!this.workspacePath || !absolutePath.startsWith(this.workspacePath)) {
            return undefined;
        }
        return absolutePath.slice(this.workspacePath.length + 1); // +1 for trailing '/'
    }
}
