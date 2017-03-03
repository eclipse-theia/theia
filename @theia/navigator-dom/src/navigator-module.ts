

import {TheiaPlugin} from '@theia/shell-dom';
import {FileNavigatorContribution, FileNavigator} from './widget';
import {FileNavigatorModel} from './model';
import {ContainerModule} from "inversify"

export const navigatorModule = new ContainerModule(bind => {
    bind(TheiaPlugin).to(FileNavigatorContribution);
    bind(FileNavigator).toSelf().inSingletonScope();
    bind(FileNavigatorModel).toSelf().inSingletonScope();
});