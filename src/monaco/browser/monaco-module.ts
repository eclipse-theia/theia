/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { ContainerModule } from "inversify";
import { MenuContribution, CommandContribution, KeybindingContribution } from "../../application/common";
import { TextEditorProvider } from "../../editor/browser";
import {
    Languages, Workspace,
    MonacoLanguages, MonacoWorkspace,
    MonacoToProtocolConverter, ProtocolToMonacoConverter
} from './languages';
import {
    MonacoModelResolver, MonacoContextMenuService, MonacoEditorService
} from './services';
import { MonacoEditorProvider } from './monaco-editor-provider';
import { MonacoEditorMenuContribution } from './monaco-menu';
import { MonacoEditorCommandHandlers } from "./monaco-command";
import { MonacoKeybindingContribution} from "./monaco-keybinding";

export const monacoModule = new ContainerModule(bind => {
    bind(MonacoToProtocolConverter).toSelf().inSingletonScope();
    bind(ProtocolToMonacoConverter).toSelf().inSingletonScope();
    bind(Languages).to(MonacoLanguages).inSingletonScope();
    bind(Workspace).to(MonacoWorkspace).inSingletonScope();

    bind(MonacoEditorService).toSelf().inSingletonScope();
    bind(MonacoModelResolver).toSelf().inSingletonScope();
    bind(MonacoContextMenuService).toSelf().inSingletonScope();
    bind(TextEditorProvider).to(MonacoEditorProvider).inSingletonScope();

    bind(CommandContribution).to(MonacoEditorCommandHandlers);
    bind(MenuContribution).to(MonacoEditorMenuContribution);
    bind(KeybindingContribution).to(MonacoKeybindingContribution);
});