import { SelectionService } from '../common/selection-service';
import { ContainerModule } from "inversify";
import { TheiaApplication } from './application';
import { OpenerService } from "./opener-service";
import { CommandRegistry } from "../common/command";
import { MenuModelRegistry } from "../common/menu";

export const browserApplicationModule = new ContainerModule(bind => {
    bind(TheiaApplication).toSelf().inSingletonScope();
    bind(OpenerService).toSelf().inSingletonScope();
    bind(CommandRegistry).toSelf().inSingletonScope();
    bind(MenuModelRegistry).toSelf().inSingletonScope();
    bind(SelectionService).toSelf().inSingletonScope();
});
