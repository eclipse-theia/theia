import { ContainerModule, injectable, inject } from "inversify";

import { DialogServiceImpl } from '../browser/dialog-service';
import { SelectionService } from '../common/selection-service';
import { CommonCommandContribution, CommonMenuContribution } from '../common/commands-common';
import { TheiaApplication, TheiaPlugin } from './application';
import { OpenerService } from "./opener-service";
import { CommandRegistry, CommandContribution } from "../common/command";
import { MenuModelRegistry, MenuContribution } from "../common/menu";
import { DialogService } from "../common/dialog-service";

export const browserApplicationModule = new ContainerModule(bind => {
    bind(TheiaApplication).toSelf().inSingletonScope();
    bind(OpenerService).toSelf().inSingletonScope();
    bind(CommandRegistry).toSelf().inSingletonScope();
    bind(CommandContribution).to(CommonCommandContribution);
    bind(MenuContribution).to(CommonMenuContribution);
    bind(MenuModelRegistry).toSelf().inSingletonScope();
    bind(SelectionService).toSelf().inSingletonScope();
    bind(TheiaPlugin).to(BrowserDialogContribution).inSingletonScope();
    bind(DialogServiceImpl).toSelf().inSingletonScope();
    bind(DialogService).toDynamicValue(context => context.container.get(DialogServiceImpl));
});

@injectable()
export class BrowserDialogContribution implements TheiaPlugin {

    constructor(@inject(DialogServiceImpl) private dialogService: DialogServiceImpl) {}

    onStart(app: TheiaApplication): void {
        app.shell.addToMainArea(this.dialogService.createDialogContainer());
    }

}