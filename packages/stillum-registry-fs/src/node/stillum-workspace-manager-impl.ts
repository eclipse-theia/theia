import { injectable } from '@theia/core/shared/inversify';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    StillumWorkspaceManager,
    WorkspaceMaterializeRequest,
    WorkspaceMaterializeResult,
} from '../common/stillum-workspace-manager';

const WORKSPACES_ROOT = path.join(os.tmpdir(), 'stillum-workspaces');

@injectable()
export class StillumWorkspaceManagerImpl implements StillumWorkspaceManager {

    async materialize(request: WorkspaceMaterializeRequest): Promise<WorkspaceMaterializeResult> {
        const workspacePath = path.join(WORKSPACES_ROOT, request.moduleId);

        console.log(`[StillumWorkspaceManager] Materializing workspace at: ${workspacePath}`);

        // Ensure the root directory exists
        fs.mkdirSync(workspacePath, { recursive: true });

        // 1. Write all build snapshot files (package.json, tsconfig, webpack, etc.)
        if (request.snapshotFiles) {
            for (const [relativePath, content] of Object.entries(request.snapshotFiles)) {
                this.writeFile(workspacePath, relativePath, content);
            }
            console.log(`[StillumWorkspaceManager] Wrote ${Object.keys(request.snapshotFiles).length} snapshot files`);
        }

        // 2. Write module source code -> src/index.tsx
        if (request.moduleSourceCode) {
            this.writeFile(workspacePath, 'src/index.tsx', request.moduleSourceCode);
            console.log(`[StillumWorkspaceManager] Wrote module src/index.tsx`);
        }

        // 3. Write component files — each into its own subfolder
        //    e.g., src/components/droplets/Button/Button.tsx
        if (request.components) {
            for (const comp of request.components) {
                const componentDir = `src/components/${comp.area}/${comp.title}`;
                if (comp.files) {
                    for (const [fileName, content] of Object.entries(comp.files)) {
                        this.writeFile(workspacePath, `${componentDir}/${fileName}`, content);
                    }
                }
                console.log(`[StillumWorkspaceManager] Wrote component ${comp.title} (${comp.area}): ${Object.keys(comp.files || {}).length} files`);
            }
        }

        console.log(`[StillumWorkspaceManager] Workspace materialized successfully`);

        return { workspacePath };
    }

    async cleanup(moduleId: string): Promise<void> {
        const workspacePath = path.join(WORKSPACES_ROOT, moduleId);
        if (fs.existsSync(workspacePath)) {
            console.log(`[StillumWorkspaceManager] Cleaning up workspace: ${workspacePath}`);
            fs.rmSync(workspacePath, { recursive: true, force: true });
        }
    }

    private writeFile(basePath: string, relativePath: string, content: string): void {
        const fullPath = path.join(basePath, relativePath);
        const dir = path.dirname(fullPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
    }
}
