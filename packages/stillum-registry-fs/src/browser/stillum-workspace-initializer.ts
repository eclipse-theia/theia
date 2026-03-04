import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { URI } from '@theia/core';
import { EditorManager } from '@theia/editor/lib/browser';
import { StillumPortalBridge, WorkspaceData } from './stillum-portal-bridge';
import { StillumRegistryFsProvider, STILLUM_SCHEME } from './stillum-registry-fs-provider';

@injectable()
export class StillumWorkspaceInitializer implements FrontendApplicationContribution {

    @inject(StillumPortalBridge)
    protected readonly bridge: StillumPortalBridge;

    @inject(StillumRegistryFsProvider)
    protected readonly fsProvider: StillumRegistryFsProvider;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    async onStart(): Promise<void> {
        // Only activate when running inside an iframe with a parent window
        if (window === window.parent) {
            console.log('[StillumWorkspaceInitializer] Not in iframe, skipping');
            return;
        }

        console.log('[StillumWorkspaceInitializer] Waiting for init message from portal...');
        const initData = await this.bridge.waitForInit();
        console.log('[StillumWorkspaceInitializer] Received init message:', {
            moduleArtifactId: initData.moduleArtifactId,
            moduleVersionId: initData.moduleVersionId,
            openComponentId: initData.openComponentId,
            hasWorkspace: !!initData.workspace,
        });

        // Use workspace data from the init message (sent by portal to avoid CORS),
        // fall back to direct API fetch only if not provided
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
            componentCount: workspace.components?.length ?? 0,
        });

        // Populate the in-memory file tree
        this.fsProvider.loadWorkspace(workspace);

        // Open the target file in the editor.
        // NOTE: We skip workspaceService.open() because Theia's WorkspaceService
        // only supports the file:// scheme. The stillum:// virtual FS is not
        // compatible as a workspace root, but editorManager.open() works fine.
        if (initData.openComponentId) {
            const match = this.fsProvider.findByArtifactId(initData.openComponentId);
            if (match) {
                const fileUri = new URI(`${STILLUM_SCHEME}:///${match.fileName}`);
                console.log('[StillumWorkspaceInitializer] Opening component file:', fileUri.toString());
                setTimeout(() => {
                    this.editorManager.open(fileUri);
                }, 500);
            } else {
                console.warn('[StillumWorkspaceInitializer] Component not found:', initData.openComponentId);
            }
        } else {
            // By default, open the module's index.tsx
            const indexUri = new URI(`${STILLUM_SCHEME}:///index.tsx`);
            console.log('[StillumWorkspaceInitializer] Opening default file:', indexUri.toString());
            setTimeout(() => {
                this.editorManager.open(indexUri);
            }, 500);
        }
    }
}
