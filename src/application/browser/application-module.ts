import { ContainerModule } from "inversify";

import { SelectionService } from '../common/selection-service';
import { CommonCommandContribution, CommonMenuContribution } from '../common/commands-common';
import { TheiaApplication, TheiaPlugin } from './application';
import { OpenerService } from "./opener-service";
import { CommandRegistry, CommandContribution } from "../common/command";
import { MenuModelRegistry, MenuContribution } from "../common/menu";
import { ClipboardSerivce } from "../common/clipboard-service";
import { BrowserPopupContribution, BrowserPopupService } from "./browser-popup-service";
import { PopupService } from "../common/index";

export const browserApplicationModule = new ContainerModule(bind => {
    bind(TheiaApplication).toSelf().inSingletonScope();
    bind(TheiaPlugin).to(BrowserPopupContribution).inSingletonScope();
    bind(OpenerService).toSelf().inSingletonScope();
    bind(CommandRegistry).toSelf().inSingletonScope();
    bind(CommandContribution).to(CommonCommandContribution);
    bind(MenuContribution).to(CommonMenuContribution);
    bind(MenuModelRegistry).toSelf().inSingletonScope();
    bind(SelectionService).toSelf().inSingletonScope();
    bind(ClipboardSerivce).toSelf().inSingletonScope();
    bind(BrowserPopupService).toSelf().inSingletonScope();
    bind(PopupService).toDynamicValue(context => context.container.get(BrowserPopupService));
});
