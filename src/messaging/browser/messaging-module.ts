import { ContainerModule } from "inversify";
import { WebSocketConnection } from './connection';

export const messagingModule = new ContainerModule(bind => {
    bind(WebSocketConnection).toSelf().inSingletonScope();
});
