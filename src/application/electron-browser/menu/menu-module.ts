import { TheiaPlugin } from '../../browser/application';
import { MainMenuFactory, MenuContribution } from './menu-plugin';
import { ContainerModule } from 'inversify';
import { ElectronContextMenuRenderer } from "./context-menu-renderer";
import { ContextMenuRenderer } from "../../browser/menu/context-menu-renderer";

export const electronMenuModule = new ContainerModule(bind => {
    bind(TheiaPlugin).to(MenuContribution);
    bind(ContextMenuRenderer).to(ElectronContextMenuRenderer);
    bind(MainMenuFactory).toSelf().inSingletonScope();
});
