import { CommonCommandContribution, CommonMenuContribution } from '../../common/commands-common';
import { CommandContribution } from '../../common/command';
import { MenuContribution } from '../../common/menu';
import {ContainerModule} from "inversify";
import {TheiaPlugin} from "../application";
import { BrowserMenuBarContribution, MainMenuFactory } from "./menu-plugin";

export const browserMenuModule = new ContainerModule(bind => {
    bind(TheiaPlugin).to(BrowserMenuBarContribution);
    bind(MainMenuFactory).toSelf().inSingletonScope();
    bind(CommandContribution).to(CommonCommandContribution);
    bind(MenuContribution).to(CommonMenuContribution);
});
