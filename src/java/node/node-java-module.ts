import { ContainerModule } from "inversify";
import { LanguageContribution } from "../../languages/node";
import { JavaContribution } from './java-contribution';

export const nodeJavaModule = new ContainerModule(bind => {
    bind<LanguageContribution>(LanguageContribution).to(JavaContribution);
});
