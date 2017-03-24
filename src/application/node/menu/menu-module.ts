import { ContainerModule } from "inversify";
import { MainMenuFactory, MenuContribution } from "./menu-plugin";
import { TheiaPlugin } from "../../browser/application";

export const electronMenuModule = new ContainerModule(bind => {
    bind(TheiaPlugin).to(MenuContribution);
    bind(MainMenuFactory).toSelf().inSingletonScope();
});
