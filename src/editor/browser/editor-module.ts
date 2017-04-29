/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { ContainerModule } from 'inversify';
import {
    CommandContribution,
    KeybindingContribution, KeybindingContext,
    KeybindingContextProvider, KeybindingContributionProvider
} from "../../application/common";
import { OpenerService, TheiaPlugin } from '../../application/browser';
import { EditorManagerImpl, EditorManager } from './editor-manager';
import { EditorRegistry } from './editor-registry';
import { EditorCommandHandlers } from "./editor-command";
import { EditorKeybindingContribution, EditorKeybindingContext } from "./editor-keybinding";

export const editorModule = new ContainerModule(bind => {
    bind(EditorRegistry).toSelf().inSingletonScope();
    bind(EditorManager).to(EditorManagerImpl).inSingletonScope();
    bind(TheiaPlugin).toDynamicValue(context => context.container.get(EditorManager));
    bind(OpenerService).toDynamicValue(context => context.container.get(EditorManager));

    bind(CommandContribution).to(EditorCommandHandlers);
    bind(KeybindingContribution).to(EditorKeybindingContribution);
    bind(EditorKeybindingContext).toSelf();
    bind(KeybindingContext).to(EditorKeybindingContext);
    bind(KeybindingContextProvider).toFactory<KeybindingContext[]>(ctx => {
        return () => ctx.container.getAll<KeybindingContext>(KeybindingContext);
    });
    bind(KeybindingContribution).to(EditorKeybindingContribution);
    bind(KeybindingContributionProvider).toFactory<KeybindingContribution[]>(ctx => {
        return () => ctx.container.getAll<KeybindingContribution>(KeybindingContribution);
    });
});
