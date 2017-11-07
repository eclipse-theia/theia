/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import {
    CommandContribution, MenuContribution,
    KeybindingContribution, KeybindingContext
} from "@theia/core/lib/common";
import { OpenHandler, WidgetFactory } from '@theia/core/lib/browser';
import { EditorManagerImpl, EditorManager } from './editor-manager';
import { EditorCommandContribution } from "./editor-command";
import { EditorMenuContribution } from "./editor-menu";
import { EditorKeybindingContribution, EditorKeybindingContext } from "./editor-keybinding";
import { bindEditorPreferences } from './editor-preferences';

export default new ContainerModule(bind => {
    bindEditorPreferences(bind);

    bind(EditorManagerImpl).toSelf().inSingletonScope();
    bind(EditorManager).toDynamicValue(c => c.container.get(EditorManagerImpl)).inSingletonScope();
    bind(WidgetFactory).toDynamicValue(c => c.container.get(EditorManagerImpl)).inSingletonScope();
    bind(OpenHandler).toDynamicValue(context => context.container.get(EditorManager)).inSingletonScope();

    bind(CommandContribution).to(EditorCommandContribution).inSingletonScope();
    bind(MenuContribution).to(EditorMenuContribution).inSingletonScope();
    bind(EditorKeybindingContext).toSelf().inSingletonScope();
    bind(KeybindingContext).toDynamicValue(context => context.container.get(EditorKeybindingContext)).inSingletonScope();
    bind(KeybindingContribution).to(EditorKeybindingContribution).inSingletonScope();
});
