import { SelectionService } from '../common/selection-service';
import { CommonCommandContribution, CommonMenuContribution } from '../common/commands-common';
import { ContainerModule } from "inversify";
import { TheiaApplication } from './application';
import { OpenerService } from "./opener-service";
import { CommandRegistry, CommandContribution } from "../common/command";
import { MenuModelRegistry, MenuContribution } from "../common/menu";

export const browserApplicationModule = new ContainerModule(bind => {
    bind(TheiaApplication).toSelf().inSingletonScope();
    bind(OpenerService).toSelf().inSingletonScope();
    bind(CommandRegistry).toSelf().inSingletonScope();
    bind(CommandContribution).to(CommonCommandContribution);
    bind(MenuContribution).to(CommonMenuContribution);
    bind(MenuModelRegistry).toSelf().inSingletonScope();
    bind(SelectionService).toSelf().inSingletonScope();
});
