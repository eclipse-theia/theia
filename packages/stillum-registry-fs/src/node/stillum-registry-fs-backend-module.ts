import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common/messaging';
import {
    StillumWorkspaceManager,
    STILLUM_WORKSPACE_MANAGER_PATH,
} from '../common/stillum-workspace-manager';
import { StillumWorkspaceManagerImpl } from './stillum-workspace-manager-impl';

export default new ContainerModule(bind => {
    bind(StillumWorkspaceManagerImpl).toSelf().inSingletonScope();
    bind(StillumWorkspaceManager).toService(StillumWorkspaceManagerImpl);

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler(STILLUM_WORKSPACE_MANAGER_PATH, () =>
            ctx.container.get<StillumWorkspaceManager>(StillumWorkspaceManager)
        )
    ).inSingletonScope();
});
