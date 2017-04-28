import { ContainerModule } from "inversify";
import { LanguageContribution } from "../../node";
import { PythonContribution } from './python-contribution';

export const nodePythonModule = new ContainerModule(bind => {
    bind<LanguageContribution>(LanguageContribution).to(PythonContribution);
});