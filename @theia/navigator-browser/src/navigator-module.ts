import {TheiaPlugin} from "@theia/application-browser";
import {FileNavigatorContribution, FileNavigatorWidget} from "./navigator-widget";
import {FileNavigatorModel, FileNavigatorTree} from "./navigator-model";
import {ContainerModule} from "inversify";
import {ITree, ITreeSelectionService, TreeSelectionService, ITreeExpansionService, TreeExpansionService} from "./tree";

export const navigatorModule = new ContainerModule(bind => {
    bind(TheiaPlugin).to(FileNavigatorContribution);
    bind(FileNavigatorWidget).toSelf().inSingletonScope();
    bind(FileNavigatorModel).toSelf().inSingletonScope();
    bind(ITree).to(FileNavigatorTree).inSingletonScope();
    bind(ITreeSelectionService).to(TreeSelectionService).inSingletonScope();
    bind(ITreeExpansionService).to(TreeExpansionService).inSingletonScope();
});