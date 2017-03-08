import {ContainerModule} from "inversify";
import {TheiaPlugin} from "../application";
import { MenuContribution, MainMenuFactory } from "./menu-plugin";

export const browserMenuModule = new ContainerModule(bind => {
    bind(TheiaPlugin).to(MenuContribution);
    bind(MainMenuFactory).toSelf().inSingletonScope();
});
