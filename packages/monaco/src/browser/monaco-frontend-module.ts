// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/index.css';
import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { MenuContribution, CommandContribution, quickInputServicePath } from '@theia/core/lib/common';
import {
    FrontendApplicationContribution, KeybindingContribution,
    PreferenceService, PreferenceSchemaProvider, createPreferenceProxy,
    PreferenceScope, PreferenceChange, OVERRIDE_PROPERTY_PATTERN, QuickInputService, StylingParticipant, WebSocketConnectionProvider,
    UndoRedoHandler,
    WidgetStatusBarContribution
} from '@theia/core/lib/browser';
import { TextEditorProvider, DiffNavigatorProvider, TextEditor } from '@theia/editor/lib/browser';
import { MonacoEditorProvider, MonacoEditorFactory, SaveParticipant } from './monaco-editor-provider';
import { MonacoEditorMenuContribution } from './monaco-menu';
import { MonacoEditorCommandHandlers } from './monaco-command';
import { MonacoKeybindingContribution } from './monaco-keybinding';
import { MonacoLanguages } from './monaco-languages';
import { MonacoWorkspace } from './monaco-workspace';
import { ActiveMonacoEditorContribution, MonacoEditorService, MonacoEditorServiceFactory, VSCodeContextKeyService, VSCodeThemeService } from './monaco-editor-service';
import { MonacoTextModelService, MonacoEditorModelFactory, MonacoEditorModelFilter } from './monaco-text-model-service';
import { MonacoContextMenuService } from './monaco-context-menu';
import { MonacoOutlineContribution } from './monaco-outline-contribution';
import { MonacoStatusBarContribution } from './monaco-status-bar-contribution';
import { MonacoCommandService } from './monaco-command-service';
import { MonacoCommandRegistry } from './monaco-command-registry';
import { MonacoDiffNavigatorFactory } from './monaco-diff-navigator-factory';
import { MonacoFrontendApplicationContribution } from './monaco-frontend-application-contribution';
import MonacoTextmateModuleBinder from './textmate/monaco-textmate-frontend-bindings';
import { MonacoBulkEditService } from './monaco-bulk-edit-service';
import { MonacoOutlineDecorator } from './monaco-outline-decorator';
import { OutlineTreeDecorator } from '@theia/outline-view/lib/browser/outline-decorator-service';
import { MonacoSnippetSuggestProvider } from './monaco-snippet-suggest-provider';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { MonacoContextKeyService } from './monaco-context-key-service';
import { MonacoMimeService } from './monaco-mime-service';
import { MimeService } from '@theia/core/lib/browser/mime-service';
import { MonacoEditorServices } from './monaco-editor';
import { MonacoColorRegistry } from './monaco-color-registry';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { MonacoIconRegistry } from './monaco-icon-registry';
import { IconRegistry } from '@theia/core/lib/browser/icon-registry';
import { MonacoThemingService } from './monaco-theming-service';
import { bindContributionProvider } from '@theia/core';
import { WorkspaceSymbolCommand } from './workspace-symbol-command';
import { LanguageService } from '@theia/core/lib/browser/language-service';
import { MonacoToProtocolConverter } from './monaco-to-protocol-converter';
import { ProtocolToMonacoConverter } from './protocol-to-monaco-converter';
import { MonacoFormattingConflictsContribution } from './monaco-formatting-conflicts';
import { MonacoQuickInputImplementation, MonacoQuickInputService } from './monaco-quick-input-service';
import { GotoLineQuickAccessContribution } from './monaco-gotoline-quick-access';
import { GotoSymbolQuickAccessContribution } from './monaco-gotosymbol-quick-access';
import { QuickAccessContribution, QuickAccessRegistry } from '@theia/core/lib/browser/quick-input/quick-access';
import { MonacoQuickAccessRegistry } from './monaco-quick-access-registry';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from '@theia/monaco-editor-core/esm/vs/platform/configuration/common/configuration.js';
import { StandaloneConfigurationService, StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { Configuration } from '@theia/monaco-editor-core/esm/vs/platform/configuration/common/configurationModels.js';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MonacoMarkdownRenderer } from './markdown-renderer/monaco-markdown-renderer';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { ThemeServiceWithDB } from './monaco-indexed-db';
import { IContextKeyService } from '@theia/monaco-editor-core/esm/vs/platform/contextkey/common/contextkey.js';
import { IThemeService } from '@theia/monaco-editor-core/esm/vs/platform/theme/common/themeService.js';
import { ActiveMonacoUndoRedoHandler, FocusedMonacoUndoRedoHandler } from './monaco-undo-redo-handler';
import { ILogService } from '@theia/monaco-editor-core/esm/vs/platform/log/common/log';
import { DefaultContentHoverWidgetPatcher } from './default-content-hover-widget-patcher';
import { MonacoWorkspaceContextService } from './monaco-workspace-context-service';
import { MonacoCodeActionSaveParticipant } from './monaco-code-action-save-participant';
import { MonacoCodeActionService, MonacoCodeActionServiceImpl } from './monaco-code-action-service';
import { MonacoDiffComputer } from './monaco-diff-computer';
import { DiffComputer } from '@theia/core/lib/common/diff';
import { MonacoEditorContentMenuContribution } from './monaco-editor-content-menu';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(MonacoThemingService).toSelf().inSingletonScope();

    bind(MonacoContextKeyService).toSelf().inSingletonScope();
    rebind(ContextKeyService).toService(MonacoContextKeyService);

    bind(MonacoSnippetSuggestProvider).toSelf().inSingletonScope();
    bind(MonacoFrontendApplicationContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MonacoFrontendApplicationContribution);
    bind(StylingParticipant).toService(MonacoFrontendApplicationContribution);

    bind(MonacoCodeActionServiceImpl).toSelf().inSingletonScope();
    bind(MonacoCodeActionService).toService(MonacoCodeActionServiceImpl);
    bind(MonacoCodeActionSaveParticipant).toSelf().inSingletonScope();
    bind(SaveParticipant).toService(MonacoCodeActionSaveParticipant);

    bind(MonacoToProtocolConverter).toSelf().inSingletonScope();
    bind(ProtocolToMonacoConverter).toSelf().inSingletonScope();

    bind(MonacoLanguages).toSelf().inSingletonScope();
    rebind(LanguageService).toService(MonacoLanguages);
    bind(WorkspaceSymbolCommand).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, KeybindingContribution, MenuContribution, QuickAccessContribution]) {
        bind(identifier).toService(WorkspaceSymbolCommand);
    }

    bind(MonacoWorkspace).toSelf().inSingletonScope();
    bind(MonacoWorkspaceContextService).toSelf().inSingletonScope();

    bind(MonacoConfigurationService).toDynamicValue(({ container }) => createMonacoConfigurationService(container)).inSingletonScope();

    bind(MonacoBulkEditService).toSelf().inSingletonScope();
    bindContributionProvider(bind, ActiveMonacoEditorContribution);
    bind(MonacoEditorServiceFactory).toFactory((context: interfaces.Context) => (contextKeyService: IContextKeyService, themeService: IThemeService) => {
        const child = context.container.createChild();
        child.bind(VSCodeContextKeyService).toConstantValue(contextKeyService);
        child.bind(VSCodeThemeService).toConstantValue(themeService);
        child.bind(MonacoEditorService).toSelf().inSingletonScope();
        return child.get(MonacoEditorService);
    });
    bind(MonacoTextModelService).toSelf().inSingletonScope();
    bind(MonacoContextMenuService).toSelf().inSingletonScope();
    bind(MonacoEditorServices).toSelf().inSingletonScope();
    bind(MonacoEditorProvider).toSelf().inSingletonScope();
    bindContributionProvider(bind, MonacoEditorFactory);
    bindContributionProvider(bind, MonacoEditorModelFactory);
    bindContributionProvider(bind, MonacoEditorModelFilter);
    bindContributionProvider(bind, SaveParticipant);
    bind(MonacoCommandService).toSelf().inTransientScope();

    bind(TextEditorProvider).toProvider(context =>
        uri => context.container.get(MonacoEditorProvider).get(uri)
    );

    bind(MonacoDiffNavigatorFactory).toSelf().inSingletonScope();
    bind(DiffNavigatorProvider).toFactory(context =>
        (editor: TextEditor) => context.container.get(MonacoEditorProvider).getDiffNavigator(editor)
    );

    bind(MonacoOutlineContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MonacoOutlineContribution);

    rebind(MarkdownRenderer).to(MonacoMarkdownRenderer).inSingletonScope();

    bind(MonacoFormattingConflictsContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MonacoFormattingConflictsContribution);

    bind(MonacoStatusBarContribution).toSelf().inSingletonScope();
    bind(WidgetStatusBarContribution).toService(MonacoStatusBarContribution);

    bind(MonacoCommandRegistry).toSelf().inSingletonScope();
    bind(MonacoEditorCommandHandlers).toSelf().inSingletonScope();
    bind(CommandContribution).toService(MonacoEditorCommandHandlers);
    bind(MonacoEditorMenuContribution).toSelf().inSingletonScope();
    bind(MenuContribution).toService(MonacoEditorMenuContribution);
    bind(MonacoKeybindingContribution).toSelf().inSingletonScope();
    bind(KeybindingContribution).toService(MonacoKeybindingContribution);

    bind(MonacoQuickInputImplementation).toSelf().inSingletonScope();
    bind(MonacoQuickInputService).toSelf().inSingletonScope().onActivation(({ container }, quickInputService: MonacoQuickInputService) => {
        WebSocketConnectionProvider.createHandler(container, quickInputServicePath, quickInputService);
        return quickInputService;
    });
    bind(QuickInputService).toService(MonacoQuickInputService);

    bind(MonacoQuickAccessRegistry).toSelf().inSingletonScope();
    bind(QuickAccessRegistry).toService(MonacoQuickAccessRegistry);

    bind(GotoLineQuickAccessContribution).toSelf().inSingletonScope();
    bind(QuickAccessContribution).toService(GotoLineQuickAccessContribution);

    bind(GotoSymbolQuickAccessContribution).toSelf().inSingletonScope();
    bind(QuickAccessContribution).toService(GotoSymbolQuickAccessContribution);

    MonacoTextmateModuleBinder(bind, unbind, isBound, rebind);

    bind(MonacoOutlineDecorator).toSelf().inSingletonScope();
    bind(OutlineTreeDecorator).toService(MonacoOutlineDecorator);

    bind(MonacoMimeService).toSelf().inSingletonScope();
    rebind(MimeService).toService(MonacoMimeService);

    bind(MonacoColorRegistry).toSelf().inSingletonScope();
    rebind(ColorRegistry).toService(MonacoColorRegistry);

    bind(ThemeServiceWithDB).toSelf().inSingletonScope();
    rebind(ThemeService).toService(ThemeServiceWithDB);

    bind(MonacoIconRegistry).toSelf().inSingletonScope();
    bind(IconRegistry).toService(MonacoIconRegistry);

    bind(FocusedMonacoUndoRedoHandler).toSelf().inSingletonScope();
    bind(ActiveMonacoUndoRedoHandler).toSelf().inSingletonScope();
    bind(UndoRedoHandler).toService(FocusedMonacoUndoRedoHandler);
    bind(UndoRedoHandler).toService(ActiveMonacoUndoRedoHandler);

    bind(DefaultContentHoverWidgetPatcher).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(DefaultContentHoverWidgetPatcher);

    bind(MonacoDiffComputer).toSelf().inSingletonScope();
    bind(DiffComputer).toService(MonacoDiffComputer);

    bind(MonacoEditorContentMenuContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).to(MonacoEditorContentMenuContribution);
});

export const MonacoConfigurationService = Symbol('MonacoConfigurationService');
export function createMonacoConfigurationService(container: interfaces.Container): IConfigurationService {
    const preferences = container.get<PreferenceService>(PreferenceService);
    const preferenceSchemaProvider = container.get<PreferenceSchemaProvider>(PreferenceSchemaProvider);
    const service = new StandaloneConfigurationService(StandaloneServices.get(ILogService));
    const _configuration: Configuration = service['_configuration'];

    _configuration.getValue = (section, overrides) => {
        const overrideIdentifier: string | undefined = (overrides && 'overrideIdentifier' in overrides && typeof overrides.overrideIdentifier === 'string')
            ? overrides['overrideIdentifier']
            : undefined;
        const resourceUri: string | undefined = (overrides && 'resource' in overrides && !!overrides['resource']) ? overrides['resource'].toString() : undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const proxy = createPreferenceProxy<{ [key: string]: any }>(preferences, preferenceSchemaProvider.getCombinedSchema(), {
            resourceUri, overrideIdentifier, style: 'both'
        });
        if (section) {
            return proxy[section];
        }
        return proxy;
    };

    /*
     * Since we never read values from the underlying service, writing to it doesn't make sense. The standalone editor writes to the configuration when being created,
     * which makes sense in the standalone case where there is no preference infrastructure in place. Those writes degrade the performance, however, so we patch the
     * service to an empty implementation.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service.updateValues = (values: [string, any][]) => Promise.resolve();

    /*
     * There are a few places in Monaco where this method is called from, including actions for editor minimap in `ContextMenuController`.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service.updateValue = (key: string, value: any) => preferences.updateValue(key, value);

    const toTarget = (scope: PreferenceScope): ConfigurationTarget => {
        switch (scope) {
            case PreferenceScope.Default: return ConfigurationTarget.DEFAULT;
            case PreferenceScope.User: return ConfigurationTarget.USER;
            case PreferenceScope.Workspace: return ConfigurationTarget.WORKSPACE;
            case PreferenceScope.Folder: return ConfigurationTarget.WORKSPACE_FOLDER;
        }
    };

    interface FireDidChangeConfigurationContext {
        changes: PreferenceChange[];
        affectedKeys: Set<string>;
        keys: Set<string>;
        overrides: Map<string, Set<string>>
    }
    const newFireDidChangeConfigurationContext = (): FireDidChangeConfigurationContext => ({
        changes: [],
        affectedKeys: new Set<string>(),
        keys: new Set<string>(),
        overrides: new Map<string, Set<string>>()
    });
    const fireDidChangeConfiguration = (source: ConfigurationTarget, context: FireDidChangeConfigurationContext): void => {
        if (!context.affectedKeys.size) {
            return;
        }
        const overrides: [string, string[]][] = [];
        for (const [override, values] of context.overrides) {
            overrides.push([override, [...values]]);
        }
        service['_onDidChangeConfiguration'].fire(<IConfigurationChangeEvent>{
            sourceConfig: {},
            change: {
                keys: [...context.keys],
                overrides
            },
            affectedKeys: context.affectedKeys,
            source,
            affectsConfiguration: (prefix, options) => {
                if (!context.affectedKeys.has(prefix)) {
                    return false;
                }
                for (const change of context.changes) {
                    const overridden = preferences.overriddenPreferenceName(change.preferenceName);
                    const preferenceName = overridden ? overridden.preferenceName : change.preferenceName;
                    if (preferenceName.startsWith(prefix)) {
                        if (options?.overrideIdentifier !== undefined) {
                            if (overridden && overridden.overrideIdentifier !== options?.overrideIdentifier) {
                                continue;
                            }
                        }
                        if (change.affects(options?.resource?.toString())) {
                            return true;
                        }
                    }
                }
                return false;
            }
        });
    };

    preferences.onPreferencesChanged(event => {
        let source: ConfigurationTarget | undefined;
        let context = newFireDidChangeConfigurationContext();
        for (let key of Object.keys(event)) {
            const change = event[key];
            const target = toTarget(change.scope);
            if (source !== undefined && target !== source) {
                fireDidChangeConfiguration(source, context);
                context = newFireDidChangeConfigurationContext();
            }
            context.changes.push(change);
            source = target;

            let overrideKeys: Set<string> | undefined;
            if (key.startsWith('[')) {
                const index = key.indexOf('.');
                const override = key.substring(0, index);
                const overrideIdentifier = override.match(OVERRIDE_PROPERTY_PATTERN)?.[1];
                if (overrideIdentifier) {
                    context.keys.add(override);
                    context.affectedKeys.add(override);
                    overrideKeys = context.overrides.get(overrideIdentifier) || new Set<string>();
                    context.overrides.set(overrideIdentifier, overrideKeys);
                    key = key.substring(index + 1);
                }
            }
            while (key) {
                if (overrideKeys) {
                    overrideKeys.add(key);
                }
                context.keys.add(key);
                context.affectedKeys.add(key);
                const index = key.lastIndexOf('.');
                key = key.substring(0, index);
            }
        }
        if (source) {
            fireDidChangeConfiguration(source, context);
        }
    });

    return service;
}
