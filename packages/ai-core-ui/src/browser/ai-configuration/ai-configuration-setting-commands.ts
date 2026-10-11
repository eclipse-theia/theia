// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { AiConfigurationService } from '@theia/ai-core';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, nls, PreferenceScope } from '@theia/core';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';

/** Context-menu path for the AI Configuration setting-row gear. */
export const AI_CONFIGURATION_SETTING_CONTEXT_MENU = ['ai-configuration-setting-context-menu'];

/**
 * Arguments carried by the gear menu's commands. A preference-backed row supplies `id`/`value`/`scope`
 * (Reset writes `undefined` to that scope; Copy uses `id`/`value`). A row backed by non-preference data
 * (e.g. per-agent settings) instead supplies a `reset` callback, so it gets the same gear/Reset affordance
 * without a preference id.
 */
export interface AiConfigurationSettingCommandArgs {
    readonly id?: string;
    readonly value?: unknown;
    readonly scope?: PreferenceScope;
    readonly resourceUri?: string;
    readonly reset?: () => void;
}
export namespace AiConfigurationSettingCommandArgs {
    /** Preference-backed args: `id` + `scope` present (enables Copy and preference reset). */
    export function isPreference(arg: unknown): arg is AiConfigurationSettingCommandArgs & { id: string; scope: PreferenceScope } {
        return typeof arg === 'object' && arg !== undefined
            && typeof (arg as AiConfigurationSettingCommandArgs).id === 'string'
            && typeof (arg as AiConfigurationSettingCommandArgs).scope === 'number';
    }
    /** Resettable args: either preference-backed or carrying a `reset` callback. */
    export function isResettable(arg: unknown): arg is AiConfigurationSettingCommandArgs {
        return isPreference(arg) || (typeof arg === 'object' && arg !== undefined && typeof (arg as AiConfigurationSettingCommandArgs).reset === 'function');
    }
}

export namespace AiConfigurationSettingCommands {
    export const RESET: Command = { id: 'ai-configuration.setting.reset', label: nls.localizeByDefault('Reset Setting') };
    export const COPY_ID: Command = { id: 'ai-configuration.setting.copyId', label: nls.localizeByDefault('Copy Setting ID') };
    export const COPY_JSON: Command = { id: 'ai-configuration.setting.copyJson', label: nls.localizeByDefault('Copy Setting as JSON') };
}

/**
 * Commands + menu for the AI Configuration setting-row gear, mirroring the Settings UI's preference
 * context menu (Reset / Copy Setting ID / Copy as JSON) but backed by {@link AiConfigurationService} and
 * acting in the row's own scope. Kept self-contained here rather than reusing the Settings UI's
 * `RESET_PREFERENCE` command, which is bound to the Preferences editor widget (its scope tracker) and
 * misbehaves when invoked from this view.
 */
@injectable()
export class AiConfigurationSettingCommandContribution implements CommandContribution, MenuContribution {

    @inject(AiConfigurationService)
    protected readonly aiConfigurationService: AiConfigurationService;

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(AiConfigurationSettingCommands.RESET, {
            isEnabled: AiConfigurationSettingCommandArgs.isResettable,
            isVisible: AiConfigurationSettingCommandArgs.isResettable,
            execute: (args: AiConfigurationSettingCommandArgs) => args.reset
                ? args.reset()
                : this.aiConfigurationService.set(args.id!, undefined, args.scope!, args.resourceUri)
        });
        commands.registerCommand(AiConfigurationSettingCommands.COPY_ID, {
            isEnabled: AiConfigurationSettingCommandArgs.isPreference,
            isVisible: AiConfigurationSettingCommandArgs.isPreference,
            execute: (args: AiConfigurationSettingCommandArgs) => this.clipboardService.writeText(args.id!)
        });
        commands.registerCommand(AiConfigurationSettingCommands.COPY_JSON, {
            isEnabled: AiConfigurationSettingCommandArgs.isPreference,
            isVisible: AiConfigurationSettingCommandArgs.isPreference,
            execute: (args: AiConfigurationSettingCommandArgs) => this.clipboardService.writeText(`"${args.id}": ${JSON.stringify(args.value)}`)
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(AI_CONFIGURATION_SETTING_CONTEXT_MENU, { commandId: AiConfigurationSettingCommands.RESET.id, order: 'a' });
        menus.registerMenuAction(AI_CONFIGURATION_SETTING_CONTEXT_MENU, { commandId: AiConfigurationSettingCommands.COPY_ID.id, order: 'b' });
        menus.registerMenuAction(AI_CONFIGURATION_SETTING_CONTEXT_MENU, { commandId: AiConfigurationSettingCommands.COPY_JSON.id, order: 'c' });
    }
}

export function bindAiConfigurationSettingCommands(bind: interfaces.Bind): void {
    bind(AiConfigurationSettingCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(AiConfigurationSettingCommandContribution);
    bind(MenuContribution).toService(AiConfigurationSettingCommandContribution);
}
