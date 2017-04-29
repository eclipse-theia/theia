/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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