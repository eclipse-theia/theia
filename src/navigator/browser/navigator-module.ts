import { ContainerModule } from 'inversify';

import { TheiaPlugin } from "../../application/browser";
import { FileNavigatorContribution, FileNavigatorWidget } from "./navigator-widget";

import { CommandContribution } from '../../application/common/command';
import { MenuContribution } from '../../application/common/menu';
import { FileNavigatorModel, FileNavigatorTree } from "./navigator-model";
import { NavigatorCommandHandlers, NavigatorMenuContribution } from './navigator-command';
import { ITree, ITreeSelectionService, TreeSelectionService, ITreeExpansionService, TreeExpansionService } from "./tree";

export const navigatorModule = new ContainerModule(bind => {
    bind(TheiaPlugin).to(FileNavigatorContribution);
    bind(FileNavigatorWidget).toSelf().inSingletonScope();
    bind(FileNavigatorModel).toSelf().inSingletonScope();
    bind(ITree).to(FileNavigatorTree).inSingletonScope();
    bind<CommandContribution>(CommandContribution).to(NavigatorCommandHandlers);
    bind<MenuContribution>(MenuContribution).to(NavigatorMenuContribution);
    bind(ITreeSelectionService).to(TreeSelectionService).inSingletonScope();
    bind(ITreeExpansionService).to(TreeExpansionService).inSingletonScope();
});
