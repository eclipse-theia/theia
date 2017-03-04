import {TheiaPlugin} from '@theia/shell-dom';
import {FileNavigatorContribution, FileNavigator} from './navigator-widget';
import {FileNavigatorModel} from './navigator-model';
import {ContainerModule} from "inversify"

export const navigatorModule = new ContainerModule(bind => {
    bind(TheiaPlugin).to(FileNavigatorContribution);
    bind(FileNavigator).toSelf().inSingletonScope();
    bind(FileNavigatorModel).toSelf().inSingletonScope();
});