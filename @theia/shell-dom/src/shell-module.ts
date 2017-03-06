import {ContainerModule} from "inversify"
import {TheiaApplication} from './application';
import {OpenerService} from "./opener-service";

export const shellModule = new ContainerModule(bind => {
    bind(TheiaApplication).toSelf().inSingletonScope();
    bind(OpenerService).toSelf().inSingletonScope();
});