/********************************************************************************
 * Copyright (C) 2022 Ericsson and others.
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

import {
    bindContributionProvider,
    CommandContribution,
    CommandRegistry,
    CommandService,
    InMemoryResources,
    MenuContribution,
    MenuModelRegistry,
} from '@theia/core';
import {
    CommonMenus,
    createPreferenceProxy,
    KeybindingContribution,
    KeybindingRegistry,
    PreferenceContribution,
    PreferenceScope,
    PreferenceService,
    QuickInputService,
    Widget,
} from '@theia/core/lib/browser';
import { injectable, inject, interfaces, Container } from '@theia/core/shared/inversify';
import { EditorManager } from '@theia/editor/lib/browser';
import { bindEasySearchToolbarWidget } from './easy-search-toolbar-item';
import { MainToolbarImpl } from './main-toolbar';
import { bindToolbarIconDialog } from './main-toolbar-icon-selector-dialog';
import {
    ReactTabBarToolbarContribution,
    ToolbarItemPosition,
    MainToolbarFactory,
    MainToolbar,
    LateInjector,
    lateInjector,
} from './main-toolbar-interfaces';
import { MainToolbarCommandQuickInputService } from './main-toolbar-command-quick-input-service';
import { MainToolbarStorageProvider } from './main-toolbar-storage-provider';
import { MainToolbarController } from './main-toolbar-controller';
import { SearchInWorkspaceQuickInputService } from './search-in-workspace-root-quick-input-service';
import { MainToolbarPreferencesSchema, MainToolbarPreferences, TOOLBAR_ENABLE_PREFERENCE_ID } from './main-toolbar-preference-contribution';
import { MainToolbarDefaults, MainToolbarDefaultsFactory } from './main-toolbar-defaults';
import { MainToolbarCommands, MainToolbarMenus, UserToolbarURI, USER_TOOLBAR_URI } from './main-toolbar-constants';
import { JsonSchemaContribution, JsonSchemaRegisterContext } from '@theia/core/lib/browser/json-schema-store';
import { toolbarConfigurationSchema, toolbarSchemaId } from './main-toolbar-preference-schema';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class MainToolbarContribution implements CommandContribution, KeybindingContribution, MenuContribution, JsonSchemaContribution {
    @inject(MainToolbarController) protected readonly model: MainToolbarController;
    @inject(QuickInputService) protected readonly quickInputService: QuickInputService;
    @inject(MainToolbarCommandQuickInputService) protected toolbarCommandPickService: MainToolbarCommandQuickInputService;
    @inject(CommandService) protected readonly commandService: CommandService;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;
    @inject(MainToolbarController) protected readonly toolbarModel: MainToolbarController;
    @inject(InMemoryResources) protected readonly inMemoryResources: InMemoryResources;
    protected readonly schemaURI = new URI(toolbarSchemaId);

    registerSchemas(context: JsonSchemaRegisterContext): void {
        this.inMemoryResources.add(this.schemaURI, JSON.stringify(toolbarConfigurationSchema));
        context.registerSchema({
            fileMatch: ['toolbar.json'],
            url: this.schemaURI.toString(),
        });
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(MainToolbarCommands.CUSTOMIZE_TOOLBAR, {
            execute: () => this.model.openOrCreateJSONFile(true),
        });
        registry.registerCommand(MainToolbarCommands.RESET_TOOLBAR, {
            execute: () => this.model.clearAll(),
        });
        registry.registerCommand(MainToolbarCommands.TOGGLE_MAIN_TOOLBAR, {
            execute: () => {
                const isVisible = this.preferenceService.get<boolean>(TOOLBAR_ENABLE_PREFERENCE_ID);
                this.preferenceService.set(TOOLBAR_ENABLE_PREFERENCE_ID, !isVisible, PreferenceScope.User);
            },
        });

        registry.registerCommand(MainToolbarCommands.REMOVE_COMMAND_FROM_TOOLBAR, {
            execute: async (_widget, position: ToolbarItemPosition | undefined, id?: string) => position && this.model.removeItem(position, id),
            isVisible: (...args) => this.isToolbarWidget(args[0]),
        });
        registry.registerCommand(MainToolbarCommands.INSERT_GROUP_LEFT, {
            execute: async (_widget: Widget, position: ToolbarItemPosition | undefined) => position && this.model.insertGroup(position, 'left'),
            isVisible: (widget: Widget, position: ToolbarItemPosition | undefined) => {
                if (position) {
                    const { alignment, groupIndex, itemIndex } = position;
                    const owningGroupLength = this.toolbarModel.toolbarItems.items[alignment][groupIndex].length;
                    return this.isToolbarWidget(widget) && (owningGroupLength > 1) && (itemIndex > 0);
                }
                return false;
            },
        });
        registry.registerCommand(MainToolbarCommands.INSERT_GROUP_RIGHT, {
            execute: async (_widget: Widget, position: ToolbarItemPosition | undefined) => position && this.model.insertGroup(position, 'right'),
            isVisible: (widget: Widget, position: ToolbarItemPosition | undefined) => {
                if (position) {
                    const { alignment, groupIndex, itemIndex } = position;
                    const owningGroupLength = this.toolbarModel.toolbarItems.items[alignment][groupIndex].length;
                    const isNotLastItem = itemIndex < (owningGroupLength - 1);
                    return this.isToolbarWidget(widget) && owningGroupLength > 1 && isNotLastItem;
                }
                return false;
            },
        });
        registry.registerCommand(MainToolbarCommands.ADD_COMMAND_TO_TOOLBAR, {
            execute: () => this.toolbarCommandPickService.openIconDialog(),
        });
    }

    protected isToolbarWidget(arg: unknown): boolean {
        return arg instanceof MainToolbarImpl;
    }

    registerKeybindings(keys: KeybindingRegistry): void {
        keys.registerKeybinding({
            command: MainToolbarCommands.TOGGLE_MAIN_TOOLBAR.id,
            keybinding: 'alt+t',
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(CommonMenus.VIEW_LAYOUT, {
            commandId: MainToolbarCommands.TOGGLE_MAIN_TOOLBAR.id,
            order: 'z',
        });

        registry.registerMenuAction(MainToolbarMenus.TOOLBAR_ITEM_CONTEXT_MENU, {
            commandId: MainToolbarCommands.ADD_COMMAND_TO_TOOLBAR.id,
            order: 'a',
        });
        registry.registerMenuAction(MainToolbarMenus.TOOLBAR_ITEM_CONTEXT_MENU, {
            commandId: MainToolbarCommands.INSERT_GROUP_LEFT.id,
            order: 'b',
        });
        registry.registerMenuAction(MainToolbarMenus.TOOLBAR_ITEM_CONTEXT_MENU, {
            commandId: MainToolbarCommands.INSERT_GROUP_RIGHT.id,
            order: 'c',
        });
        registry.registerMenuAction(MainToolbarMenus.TOOLBAR_ITEM_CONTEXT_MENU, {
            commandId: MainToolbarCommands.REMOVE_COMMAND_FROM_TOOLBAR.id,
            order: 'd',
        });

        registry.registerMenuAction(MainToolbarMenus.MAIN_TOOLBAR_BACKGROUND_CONTEXT_MENU, {
            commandId: MainToolbarCommands.ADD_COMMAND_TO_TOOLBAR.id,
            order: 'a',
        });
        registry.registerMenuAction(MainToolbarMenus.MAIN_TOOLBAR_BACKGROUND_CONTEXT_MENU, {
            commandId: MainToolbarCommands.CUSTOMIZE_TOOLBAR.id,
            order: 'b',
        });
        registry.registerMenuAction(MainToolbarMenus.MAIN_TOOLBAR_BACKGROUND_CONTEXT_MENU, {
            commandId: MainToolbarCommands.TOGGLE_MAIN_TOOLBAR.id,
            order: 'c',
        });
        registry.registerMenuAction(MainToolbarMenus.MAIN_TOOLBAR_BACKGROUND_CONTEXT_MENU, {
            commandId: MainToolbarCommands.RESET_TOOLBAR.id,
            order: 'd',
        });
    }
}

export function bindMainToolbar(bind: interfaces.Bind): void {
    bind(MainToolbarFactory).toFactory(({ container }) => (): MainToolbar => {
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = container;
        child.bind(MainToolbar).to(MainToolbarImpl);
        return child.get(MainToolbar);
    });
    bind(MainToolbarContribution).toSelf().inSingletonScope();
    bind(CommandContribution).to(MainToolbarContribution);
    bind(MenuContribution).toService(MainToolbarContribution);
    bind(KeybindingContribution).toService(MainToolbarContribution);
    bind(JsonSchemaContribution).toService(MainToolbarContribution);

    bind(MainToolbarCommandQuickInputService).toSelf().inSingletonScope();
    bind(SearchInWorkspaceQuickInputService).toSelf().inSingletonScope();

    bindToolbarIconDialog(bind);
    bind(MainToolbarDefaultsFactory).toConstantValue(MainToolbarDefaults);
    bind(MainToolbarPreferences).toDynamicValue(({ container }) => {
        const preferences = container.get<PreferenceService>(PreferenceService);
        return createPreferenceProxy(preferences, MainToolbarPreferencesSchema);
    }).inSingletonScope();
    bind(PreferenceContribution).toConstantValue({
        schema: MainToolbarPreferencesSchema,
    });

    bind(UserToolbarURI).toConstantValue(USER_TOOLBAR_URI);

    bind(MainToolbarController).toSelf().inSingletonScope();
    bind(MainToolbarStorageProvider).toSelf().inSingletonScope();
    bindContributionProvider(bind, ReactTabBarToolbarContribution);
    bindEasySearchToolbarWidget(bind);
    bind(LateInjector).toFactory(
        <T>(context: interfaces.Context) => (id: interfaces.ServiceIdentifier<T>): T => lateInjector(context.container, id),
    );
}
