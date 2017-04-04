import {ContainerModule} from "inversify";
import {TheiaPlugin} from "../application";
import { BrowserMenuBarContribution, MainMenuFactory } from "./menu-plugin";
import { ContextMenuRenderer, BrowserContextMenuRenderer } from "./context-menu-renderer";

export const browserMenuModule = new ContainerModule(bind => {
    bind(TheiaPlugin).to(BrowserMenuBarContribution);
    bind(ContextMenuRenderer).to(BrowserContextMenuRenderer);
    bind(MainMenuFactory).toSelf().inSingletonScope();
});
