/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { ContainerModule, decorate, injectable } from 'inversify';
import { MenuContribution, CommandContribution } from '@theia/core/lib/common';
import { QuickOpenService, FrontendApplicationContribution, KeybindingContribution } from '@theia/core/lib/browser';
import { Languages, Workspace } from '@theia/languages/lib/common';
import { TextEditorProvider, DiffNavigatorProvider } from '@theia/editor/lib/browser';
import { StrictEditorTextFocusContext } from '@theia/editor/lib/browser/editor-keybinding-contexts';
import { MonacoToProtocolConverter, ProtocolToMonacoConverter } from 'monaco-languageclient';
import { MonacoEditorProvider } from './monaco-editor-provider';
import { MonacoEditorMenuContribution } from './monaco-menu';
import { MonacoEditorCommandHandlers } from './monaco-command';
import { MonacoKeybindingContribution } from './monaco-keybinding';
import { MonacoLanguages } from './monaco-languages';
import { MonacoWorkspace } from './monaco-workspace';
import { MonacoEditorService } from './monaco-editor-service';
import { MonacoTextModelService } from './monaco-text-model-service';
import { MonacoContextMenuService } from './monaco-context-menu';
import { MonacoOutlineContribution } from './monaco-outline-contribution';
import { MonacoStatusBarContribution } from './monaco-status-bar-contribution';
import { MonacoCommandService, MonacoCommandServiceFactory } from './monaco-command-service';
import { MonacoCommandRegistry } from './monaco-command-registry';
import { MonacoQuickOpenService } from './monaco-quick-open-service';
import { MonacoDiffNavigatorFactory } from './monaco-diff-navigator-factory';
import { MonacoStrictEditorTextFocusContext } from './monaco-keybinding-contexts';
import { MonacoFrontendApplicationContribution } from './monaco-frontend-application-contribution';
import MonacoTextmateModuleBinder from './textmate/monaco-textmate-frontend-bindings';
import { QuickInputService } from './monaco-quick-input-service';

decorate(injectable(), MonacoToProtocolConverter);
decorate(injectable(), ProtocolToMonacoConverter);

import '../../src/browser/style/index.css';
import '../../src/browser/style/symbol-sprite.svg';
import '../../src/browser/style/symbol-icons.css';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(FrontendApplicationContribution).to(MonacoFrontendApplicationContribution).inSingletonScope();

    bind(MonacoToProtocolConverter).toSelf().inSingletonScope();
    bind(ProtocolToMonacoConverter).toSelf().inSingletonScope();

    bind(MonacoLanguages).toSelf().inSingletonScope();
    bind(Languages).toDynamicValue(ctx => ctx.container.get(MonacoLanguages));

    bind(MonacoWorkspace).toSelf().inSingletonScope();
    bind(Workspace).toDynamicValue(ctx => ctx.container.get(MonacoWorkspace));

    bind(MonacoEditorService).toSelf().inSingletonScope();
    bind(MonacoTextModelService).toSelf().inSingletonScope();
    bind(MonacoContextMenuService).toSelf().inSingletonScope();
    bind(MonacoEditorProvider).toSelf().inSingletonScope();
    bind(MonacoCommandService).toSelf().inTransientScope();
    bind(MonacoCommandServiceFactory).toAutoFactory(MonacoCommandService);
    bind(TextEditorProvider).toProvider(context =>
        uri => context.container.get(MonacoEditorProvider).get(uri)
    );
    bind(MonacoDiffNavigatorFactory).toSelf().inSingletonScope();
    bind(DiffNavigatorProvider).toFactory(context =>
        editor => context.container.get(MonacoEditorProvider).getDiffNavigator(editor)
    );

    bind(MonacoOutlineContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toDynamicValue(ctx => ctx.container.get(MonacoOutlineContribution));

    bind(MonacoStatusBarContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MonacoStatusBarContribution);

    bind(MonacoCommandRegistry).toSelf().inSingletonScope();
    bind(CommandContribution).to(MonacoEditorCommandHandlers).inSingletonScope();
    bind(MenuContribution).to(MonacoEditorMenuContribution).inSingletonScope();
    bind(KeybindingContribution).to(MonacoKeybindingContribution).inSingletonScope();
    rebind(StrictEditorTextFocusContext).to(MonacoStrictEditorTextFocusContext).inSingletonScope();

    bind(MonacoQuickOpenService).toSelf().inSingletonScope();
    rebind(QuickOpenService).toDynamicValue(ctx =>
        ctx.container.get(MonacoQuickOpenService)
    ).inSingletonScope();

    MonacoTextmateModuleBinder(bind, unbind, isBound, rebind);

    bind(QuickInputService).toSelf().inSingletonScope();
});
