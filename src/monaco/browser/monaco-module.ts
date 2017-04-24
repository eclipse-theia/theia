import { ContainerModule, injectable, decorate} from "inversify";
import { Languages, Workspace } from "../../languages/common";
import { MonacoWorkspace } from "./monaco-workspace";
import { MonacoLanguages } from "./monaco-languages";
import { MonacoToProtocolConverter, ProtocolToMonacoConverter } from "monaco-languageclient";
import { MonacoKeybindingContribution} from "./monaco-keybinding";
import { KeybindingContribution } from "../../application/common/keybinding";

decorate(injectable(), MonacoToProtocolConverter);
decorate(injectable(), ProtocolToMonacoConverter);

export {
    MonacoToProtocolConverter,
    ProtocolToMonacoConverter,
    MonacoLanguages,
    MonacoWorkspace
}

export const monacoModule = new ContainerModule(bind => {
    bind<KeybindingContribution>(KeybindingContribution).to(MonacoKeybindingContribution);
    bind(MonacoToProtocolConverter).toSelf().inSingletonScope();
    bind(ProtocolToMonacoConverter).toSelf().inSingletonScope();
    bind(Languages).to(MonacoLanguages).inSingletonScope();
    bind(Workspace).to(MonacoWorkspace).inSingletonScope();
});