import {BackendApplication} from "./application";
import {ContainerModule} from "inversify";

export const applicationModule = new ContainerModule((bind) => {
    bind(BackendApplication).to(BackendApplication);
});
