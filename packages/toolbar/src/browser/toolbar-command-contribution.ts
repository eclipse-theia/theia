// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import {
    bindContributionProvider,
    CommandContribution,
    CommandRegistry,
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
    Widget,
} from '@theia/core/lib/browser';
import { injectable, inject, interfaces, Container } from '@theia/core/shared/inversify';
import { ToolbarImpl } from './toolbar';
import { bindToolbarIconDialog } from './toolbar-icon-selector-dialog';
import {
    ToolbarContribution,
    ToolbarItemPosition,
    ToolbarFactory,
    Toolbar,
    LateInjector,
    lateInjector,
} from './toolbar-interfaces';
import { ToolbarCommandQuickInputService } from './toolbar-command-quick-input-service';
import { ToolbarStorageProvider } from './toolbar-storage-provider';
import { ToolbarController } from './toolbar-controller';
import { ToolbarPreferencesSchema, ToolbarPreferences, TOOLBAR_ENABLE_PREFERENCE_ID } from './toolbar-preference-contribution';
import { ToolbarDefaults, ToolbarDefaultsFactory } from './toolbar-defaults';
import { ToolbarCommands, ToolbarMenus, UserToolbarURI, USER_TOOLBAR_URI } from './toolbar-constants';
import { JsonSchemaContribution, JsonSchemaDataStore, JsonSchemaRegisterContext } from '@theia/core/lib/browser/json-schema-store';
import { toolbarConfigurationSchema, toolbarSchemaId } from './toolbar-preference-schema';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class ToolbarCommandContribution implements CommandContribution, KeybindingContribution, MenuContribution, JsonSchemaContribution {
    @inject(ToolbarController) protected readonly controller: ToolbarController;
    @inject(ToolbarCommandQuickInputService) protected toolbarCommandPickService: ToolbarCommandQuickInputService;
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;
    @inject(JsonSchemaDataStore) protected readonly schemaStore: JsonSchemaDataStore;

    protected readonly schemaURI = new URI(toolbarSchemaId);

    registerSchemas(context: JsonSchemaRegisterContext): void {
        this.schemaStore.setSchema(this.schemaURI, toolbarConfigurationSchema);
        context.registerSchema({
            fileMatch: ['toolbar.json'],
            url: this.schemaURI.toString(),
        });
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(ToolbarCommands.CUSTOMIZE_TOOLBAR, {
            execute: () => this.controller.openOrCreateJSONFile(true),
        });
        registry.registerCommand(ToolbarCommands.RESET_TOOLBAR, {
            execute: () => this.controller.restoreToolbarDefaults(),
        });
        registry.registerCommand(ToolbarCommands.TOGGLE_TOOLBAR, {
            execute: () => {
                const isVisible = this.preferenceService.get<boolean>(TOOLBAR_ENABLE_PREFERENCE_ID);
                this.preferenceService.set(TOOLBAR_ENABLE_PREFERENCE_ID, !isVisible, PreferenceScope.User);
            },
        });

        registry.registerCommand(ToolbarCommands.REMOVE_COMMAND_FROM_TOOLBAR, {
            execute: async (_widget, position: ToolbarItemPosition | undefined, id?: string) => position && this.controller.removeItem(position, id),
            isVisible: (...args) => this.isToolbarWidget(args[0]),
        });
        registry.registerCommand(ToolbarCommands.INSERT_GROUP_LEFT, {
            execute: async (_widget: Widget, position: ToolbarItemPosition | undefined) => position && this.controller.insertGroup(position, 'left'),
            isVisible: (widget: Widget, position: ToolbarItemPosition | undefined) => {
                if (position) {
                    const { alignment, groupIndex, itemIndex } = position;
                    const owningGroupLength = this.controller.toolbarItems.items[alignment][groupIndex].length;
                    return this.isToolbarWidget(widget) && (owningGroupLength > 1) && (itemIndex > 0);
                }
                return false;
            },
        });
        registry.registerCommand(ToolbarCommands.INSERT_GROUP_RIGHT, {
            execute: async (_widget: Widget, position: ToolbarItemPosition | undefined) => position && this.controller.insertGroup(position, 'right'),
            isVisible: (widget: Widget, position: ToolbarItemPosition | undefined) => {
                if (position) {
                    const { alignment, groupIndex, itemIndex } = position;
                    const owningGroupLength = this.controller.toolbarItems.items[alignment][groupIndex].length;
                    const isNotLastItem = itemIndex < (owningGroupLength - 1);
                    return this.isToolbarWidget(widget) && owningGroupLength > 1 && isNotLastItem;
                }
                return false;
            },
        });
        registry.registerCommand(ToolbarCommands.ADD_COMMAND_TO_TOOLBAR, {
            execute: () => this.toolbarCommandPickService.openIconDialog(),
        });
    }

    protected isToolbarWidget(arg: unknown): boolean {
        return arg instanceof ToolbarImpl;
    }

    registerKeybindings(keys: KeybindingRegistry): void {
        keys.registerKeybinding({
            command: ToolbarCommands.TOGGLE_TOOLBAR.id,
            keybinding: 'alt+t',
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(CommonMenus.VIEW_LAYOUT, {
            commandId: ToolbarCommands.TOGGLE_TOOLBAR.id,
            order: 'z',
        });

        registry.registerMenuAction(ToolbarMenus.TOOLBAR_ITEM_CONTEXT_MENU, {
            commandId: ToolbarCommands.ADD_COMMAND_TO_TOOLBAR.id,
            order: 'a',
        });
        registry.registerMenuAction(ToolbarMenus.TOOLBAR_ITEM_CONTEXT_MENU, {
            commandId: ToolbarCommands.INSERT_GROUP_LEFT.id,
            order: 'b',
        });
        registry.registerMenuAction(ToolbarMenus.TOOLBAR_ITEM_CONTEXT_MENU, {
            commandId: ToolbarCommands.INSERT_GROUP_RIGHT.id,
            order: 'c',
        });
        registry.registerMenuAction(ToolbarMenus.TOOLBAR_ITEM_CONTEXT_MENU, {
            commandId: ToolbarCommands.REMOVE_COMMAND_FROM_TOOLBAR.id,
            order: 'd',
        });

        registry.registerMenuAction(ToolbarMenus.TOOLBAR_BACKGROUND_CONTEXT_MENU, {
            commandId: ToolbarCommands.ADD_COMMAND_TO_TOOLBAR.id,
            order: 'a',
        });
        registry.registerMenuAction(ToolbarMenus.TOOLBAR_BACKGROUND_CONTEXT_MENU, {
            commandId: ToolbarCommands.CUSTOMIZE_TOOLBAR.id,
            order: 'b',
        });
        registry.registerMenuAction(ToolbarMenus.TOOLBAR_BACKGROUND_CONTEXT_MENU, {
            commandId: ToolbarCommands.TOGGLE_TOOLBAR.id,
            order: 'c',
        });
        registry.registerMenuAction(ToolbarMenus.TOOLBAR_BACKGROUND_CONTEXT_MENU, {
            commandId: ToolbarCommands.RESET_TOOLBAR.id,
            order: 'd',
        });
    }
}

export function bindToolbar(bind: interfaces.Bind): void {
    bind(ToolbarFactory).toFactory(({ container }) => (): Toolbar => {
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = container;
        child.bind(Toolbar).to(ToolbarImpl);
        return child.get(Toolbar);
    });
    bind(ToolbarCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).to(ToolbarCommandContribution);
    bind(MenuContribution).toService(ToolbarCommandContribution);
    bind(KeybindingContribution).toService(ToolbarCommandContribution);
    bind(JsonSchemaContribution).toService(ToolbarCommandContribution);

    bind(ToolbarCommandQuickInputService).toSelf().inSingletonScope();

    bindToolbarIconDialog(bind);
    bind(ToolbarDefaultsFactory).toConstantValue(ToolbarDefaults);
    bind(ToolbarPreferences).toDynamicValue(({ container }) => {
        const preferences = container.get<PreferenceService>(PreferenceService);
        return createPreferenceProxy(preferences, ToolbarPreferencesSchema);
    }).inSingletonScope();
    bind(PreferenceContribution).toConstantValue({
        schema: ToolbarPreferencesSchema,
    });

    bind(UserToolbarURI).toConstantValue(USER_TOOLBAR_URI);

    bind(ToolbarController).toSelf().inSingletonScope();
    bind(ToolbarStorageProvider).toSelf().inSingletonScope();
    bindContributionProvider(bind, ToolbarContribution);
    bind(LateInjector).toFactory(
        <T>(context: interfaces.Context) => (id: interfaces.ServiceIdentifier<T>): T => lateInjector(context.container, id),
    );
}
