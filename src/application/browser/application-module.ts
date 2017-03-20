import { ContainerModule } from "inversify";
import { TheiaApplication } from './application';
import { OpenerService } from "./opener-service";
import { CommandRegistry } from "../common/command";
import { MenuBarModelProvider } from "../common/menu";

export const browserApplicationModule = new ContainerModule(bind => {
    bind(TheiaApplication).toSelf().inSingletonScope();
    bind(OpenerService).toSelf().inSingletonScope();
    bind(CommandRegistry).toSelf().inSingletonScope();
    bind(MenuBarModelProvider).toSelf().inSingletonScope();
});