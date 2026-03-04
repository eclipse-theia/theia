import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { URI } from '@theia/core';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { StillumPortalBridge } from './stillum-portal-bridge';
import { StillumRegistryFsProvider, STILLUM_SCHEME } from './stillum-registry-fs-provider';

@injectable()
export class StillumWorkspaceInitializer implements FrontendApplicationContribution {

    @inject(StillumPortalBridge)
    protected readonly bridge: StillumPortalBridge;

    @inject(StillumRegistryFsProvider)
    protected readonly fsProvider: StillumRegistryFsProvider;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    async onStart(): Promise<void> {
        // Only activate when running inside an iframe with a parent window
        if (window === window.parent) {
            return;
        }

        const initData = await this.bridge.waitForInit();

        // Fetch workspace data from registry API
        const workspace = await this.bridge.fetchWorkspace();

        // Populate the in-memory file tree
        this.fsProvider.loadWorkspace(workspace);

        // Open the workspace root
        const rootUri = new URI(`${STILLUM_SCHEME}:///`);
        await this.workspaceService.open(rootUri);

        // If a specific component should be opened, find and open its file
        if (initData.openComponentId) {
            const match = this.fsProvider.findByArtifactId(initData.openComponentId);
            if (match) {
                const fileUri = new URI(`${STILLUM_SCHEME}:///${match.fileName}`);
                // Give the workspace a moment to initialize the file tree
                setTimeout(() => {
                    this.editorManager.open(fileUri);
                }, 500);
            }
        } else {
            // By default, open the module's index.tsx
            const indexUri = new URI(`${STILLUM_SCHEME}:///index.tsx`);
            setTimeout(() => {
                this.editorManager.open(indexUri);
            }, 500);
        }
    }
}
