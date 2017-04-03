import {ContainerModule} from "inversify";
import {TheiaPlugin} from "../application";
import { BrowserMenuBarContribution, MainMenuFactory } from "./menu-plugin";

export const browserMenuModule = new ContainerModule(bind => {
    bind(TheiaPlugin).to(BrowserMenuBarContribution);
    bind(MainMenuFactory).toSelf().inSingletonScope();
});
