import { ContainerModule, injectable, inject } from "inversify";

import { BrowserPopupService } from '../browser/browser-popup-service';
import { SelectionService } from '../common/selection-service';
import { CommonCommandContribution, CommonMenuContribution } from '../common/commands-common';
import { TheiaApplication, TheiaPlugin } from './application';
import { OpenerService } from "./opener-service";
import { CommandRegistry, CommandContribution } from "../common/command";
import { MenuModelRegistry, MenuContribution } from "../common/menu";
import { PopupService } from "../common/popup-service";

export const browserApplicationModule = new ContainerModule(bind => {
    bind(TheiaApplication).toSelf().inSingletonScope();
    bind(OpenerService).toSelf().inSingletonScope();
    bind(CommandRegistry).toSelf().inSingletonScope();
    bind(CommandContribution).to(CommonCommandContribution);
    bind(MenuContribution).to(CommonMenuContribution);
    bind(MenuModelRegistry).toSelf().inSingletonScope();
    bind(SelectionService).toSelf().inSingletonScope();
    bind(TheiaPlugin).to(BrowserPopupContribution).inSingletonScope();
    bind(BrowserPopupService).toSelf().inSingletonScope();
    bind(PopupService).toDynamicValue(context => context.container.get(BrowserPopupService));
});

@injectable()
export class BrowserPopupContribution implements TheiaPlugin {

    constructor(@inject(BrowserPopupService) private popupService: BrowserPopupService) {}

    onStart(app: TheiaApplication): void {
        app.shell.addToMainArea(this.popupService.createPopupContainer());
    }

}