/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, decorate, injectable } from "inversify";
import { MenuContribution, CommandContribution, KeybindingContribution } from "@theia/core/lib/common";
import { Languages, Workspace } from "@theia/languages/lib/common";
import { TextEditorProvider } from "@theia/editor/lib/browser";
import { MonacoToProtocolConverter, ProtocolToMonacoConverter } from "monaco-languageclient";
import { MonacoEditorProvider } from './monaco-editor-provider';
import { MonacoEditorMenuContribution } from './monaco-menu';
import { MonacoEditorCommandHandlers } from "./monaco-command";
import { MonacoKeybindingContribution } from "./monaco-keybinding";
import { MonacoLanguages } from "./monaco-languages";
import { MonacoWorkspace } from "./monaco-workspace";
import { MonacoEditorService } from "./monaco-editor-service";
import { MonacoModelResolver } from "./monaco-model-resolver";
import { MonacoContextMenuService } from "./monaco-context-menu";
import { MonacoCommandService, MonacoCommandServiceFactory } from './monaco-command-service';
import { MonacoQuickCommandFrontendContribution } from './monaco-quick-command-contribution';
import { MonacoQuickCommandService } from './monaco-quick-command-service';

decorate(injectable(), MonacoToProtocolConverter);
decorate(injectable(), ProtocolToMonacoConverter);

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(MonacoToProtocolConverter).toSelf().inSingletonScope();
    bind(ProtocolToMonacoConverter).toSelf().inSingletonScope();

    bind(MonacoLanguages).toSelf().inSingletonScope();
    bind(Languages).toDynamicValue(ctx => ctx.container.get(MonacoLanguages));

    bind(MonacoWorkspace).toSelf().inSingletonScope();
    bind(Workspace).toDynamicValue(ctx => ctx.container.get(MonacoWorkspace));

    bind(MonacoEditorService).toSelf().inSingletonScope();
    bind(MonacoModelResolver).toSelf().inSingletonScope();
    bind(MonacoContextMenuService).toSelf().inSingletonScope();
    bind(MonacoEditorProvider).toSelf().inSingletonScope();
    bind(MonacoCommandService).toSelf().inTransientScope();
    bind(MonacoCommandServiceFactory).toAutoFactory(MonacoCommandService);
    bind(TextEditorProvider).toProvider(context =>
        uri => context.container.get(MonacoEditorProvider).get(uri)
    );

    bind(CommandContribution).to(MonacoEditorCommandHandlers).inSingletonScope();
    bind(MenuContribution).to(MonacoEditorMenuContribution).inSingletonScope();
    bind(KeybindingContribution).to(MonacoKeybindingContribution).inSingletonScope();

    bind(MonacoQuickCommandService).toSelf().inSingletonScope();
    bind(MonacoQuickCommandFrontendContribution).toSelf().inSingletonScope();
    [CommandContribution, KeybindingContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toDynamicValue(ctx => ctx.container.get(MonacoQuickCommandFrontendContribution)).inSingletonScope()
    );
});
