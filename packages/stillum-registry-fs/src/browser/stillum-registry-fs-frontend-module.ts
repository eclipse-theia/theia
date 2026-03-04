import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { FileServiceContribution, FileService } from '@theia/filesystem/lib/browser/file-service';
import { StillumPortalBridge } from './stillum-portal-bridge';
import { StillumRegistryFsProvider, STILLUM_SCHEME } from './stillum-registry-fs-provider';
import { StillumWorkspaceInitializer } from './stillum-workspace-initializer';
import {
    StillumWorkspaceManager,
    STILLUM_WORKSPACE_MANAGER_PATH,
} from '../common/stillum-workspace-manager';

export default new ContainerModule(bind => {
    // Portal bridge — handles postMessage communication with parent frame
    bind(StillumPortalBridge).toSelf().inSingletonScope();

    // Virtual filesystem provider backed by registry API (kept as fallback)
    bind(StillumRegistryFsProvider).toSelf().inSingletonScope();

    // Register the stillum:// scheme with Theia's file service
    bind(FileServiceContribution).toDynamicValue(ctx => ({
        registerFileSystemProviders(service: FileService): void {
            const provider = ctx.container.get(StillumRegistryFsProvider);
            service.registerProvider(STILLUM_SCHEME, provider);
        },
    })).inSingletonScope();

    // RPC proxy to the backend workspace materializer (Node.js)
    bind(StillumWorkspaceManager).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<StillumWorkspaceManager>(STILLUM_WORKSPACE_MANAGER_PATH);
    }).inSingletonScope();

    // Workspace initializer — waits for init message, materializes workspace, opens files
    bind(StillumWorkspaceInitializer).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(StillumWorkspaceInitializer);
});
