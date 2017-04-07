import { JavaContributor } from './java-contributor';
import { ContainerModule } from "inversify";
import { LanguageContributor } from "../../languages/node";

export const nodeJavaModule = new ContainerModule(bind => {
    bind<LanguageContributor>(LanguageContributor).to(JavaContributor);
});
