import { ContainerModule } from "inversify";
import { Languages, Workspace } from "../../languages/common";
import { MonacoWorkspace } from './monaco-workspace';
import { MonacoLanguages } from './monaco-languages';

export const monacoModule = new ContainerModule(bind => {
    bind(Languages).to(MonacoLanguages).inSingletonScope();
    bind(Workspace).to(MonacoWorkspace).inSingletonScope();
});