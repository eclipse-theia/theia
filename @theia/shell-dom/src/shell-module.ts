import {TheiaApplication} from './application';
import {ContainerModule} from "inversify"

export const shellModule = new ContainerModule(bind => {
    bind(TheiaApplication).toSelf().inSingletonScope();
});