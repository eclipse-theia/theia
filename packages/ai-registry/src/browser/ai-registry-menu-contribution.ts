// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, nls } from '@theia/core';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AutoUpdateMode } from '../common/ai-registry-preferences';
import { RegistryAutoUpdatePolicy } from './auto-update/registry-auto-update-policy';
import { AIRegistryEntryContextMenu, RegistryEntryContext } from './registry-entry-context';

export namespace AIRegistryCommands {
    export const AUTO_UPDATE_OFF: Command = { id: 'ai-registry.auto-update.off' };
    export const AUTO_UPDATE_ASK: Command = { id: 'ai-registry.auto-update.ask' };
    export const AUTO_UPDATE_ON: Command = { id: 'ai-registry.auto-update.on' };
    export const AUTO_UPDATE_OFF_DEFAULT: Command = { id: 'ai-registry.auto-update.off-default' };
    export const AUTO_UPDATE_ASK_DEFAULT: Command = { id: 'ai-registry.auto-update.ask-default' };
    export const AUTO_UPDATE_ON_DEFAULT: Command = { id: 'ai-registry.auto-update.on-default' };
    export const COPY_ID: Command = { id: 'ai-registry.copy-id' };
}

/** One auto-update mode as offered in the submenu, in its plain and its "is the default" variant. */
interface AutoUpdateModeItem {
    readonly mode: AutoUpdateMode;
    readonly order: string;
    readonly command: Command;
    readonly label: string;
    readonly defaultCommand: Command;
    readonly defaultLabel: string;
}

function modeItem(mode: AutoUpdateMode, order: string, command: Command, defaultCommand: Command, label: string): AutoUpdateModeItem {
    return {
        mode, order, command, label, defaultCommand,
        defaultLabel: nls.localizeByDefault('{0} (Default)', label)
    };
}

const AUTO_UPDATE_MODE_ITEMS: readonly AutoUpdateModeItem[] = [
    modeItem('off', '0', AIRegistryCommands.AUTO_UPDATE_OFF, AIRegistryCommands.AUTO_UPDATE_OFF_DEFAULT,
        nls.localizeByDefault('Off')),
    modeItem('ask', '1', AIRegistryCommands.AUTO_UPDATE_ASK, AIRegistryCommands.AUTO_UPDATE_ASK_DEFAULT,
        nls.localizeByDefault('Ask')),
    modeItem('on', '2', AIRegistryCommands.AUTO_UPDATE_ON, AIRegistryCommands.AUTO_UPDATE_ON_DEFAULT,
        nls.localizeByDefault('On'))
];

/**
 * Commands and menu items behind the gear icon on skill and MCP entry cards.
 *
 * The auto-update items are only offered for artifacts that can actually receive an update
 * - installed and linked to a live registry entry. Drifted, unlinked, stale-linked and
 * not-yet-installed cards expose Copy ID alone, so the gear is never an empty menu.
 */
@injectable()
export class AIRegistryMenuContribution implements CommandContribution, MenuContribution {

    @inject(RegistryAutoUpdatePolicy)
    protected readonly policy: RegistryAutoUpdatePolicy;

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

    registerCommands(commands: CommandRegistry): void {
        for (const item of AUTO_UPDATE_MODE_ITEMS) {
            this.registerAutoUpdateCommand(commands, item.command, item.mode, false);
            this.registerAutoUpdateCommand(commands, item.defaultCommand, item.mode, true);
        }
        commands.registerCommand(AIRegistryCommands.COPY_ID, {
            isVisible: (...args) => this.copyableId(args) !== undefined,
            execute: (...args) => {
                const id = this.copyableId(args);
                if (id !== undefined) {
                    this.clipboardService.writeText(id);
                }
            }
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerSubmenu(
            AIRegistryEntryContextMenu.AUTO_UPDATE_SUBMENU,
            nls.localizeByDefault('Auto Update')
        );
        for (const item of AUTO_UPDATE_MODE_ITEMS) {
            menus.registerMenuAction(AIRegistryEntryContextMenu.AUTO_UPDATE_SUBMENU, {
                commandId: item.command.id,
                label: item.label,
                order: `${item.order}a`
            });
            menus.registerMenuAction(AIRegistryEntryContextMenu.AUTO_UPDATE_SUBMENU, {
                commandId: item.defaultCommand.id,
                label: item.defaultLabel,
                order: `${item.order}b`
            });
        }
        menus.registerMenuAction(AIRegistryEntryContextMenu.COPY, {
            commandId: AIRegistryCommands.COPY_ID.id,
            label: nls.localize('theia/ai-registry/action/copyId', 'Copy ID'),
            order: '0'
        });
    }

    /**
     * Each mode is a command of its own so the menu can render the three of them as a toggle
     * group, with a check mark on the effective mode.
     *
     * Each mode also comes in two variants - plain and suffixed "(Default)" - of which only
     * the one matching the current global default is visible. That makes the source of the
     * effective mode readable at a glance: a check mark on the "(Default)" item means the
     * artifact inherits the mode, a check mark on a plain item means it was set for this
     * artifact. The two can never be confused, because {@link RegistryAutoUpdatePolicy.setMode}
     * drops an override equal to the default instead of writing it.
     */
    protected registerAutoUpdateCommand(commands: CommandRegistry, command: Command, mode: AutoUpdateMode, isDefaultVariant: boolean): void {
        commands.registerCommand(command, {
            isVisible: (...args) => !!this.autoUpdateContext(args) && (this.policy.getDefault() === mode) === isDefaultVariant,
            isToggled: (...args) => {
                const context = this.autoUpdateContext(args);
                return !!context && this.policy.getMode(context.artifactKind, context.autoUpdateId) === mode;
            },
            execute: (...args) => {
                const context = this.autoUpdateContext(args);
                if (context) {
                    return this.policy.setMode(context.artifactKind, context.autoUpdateId, mode);
                }
            }
        });
    }

    /** The entry the menu was opened on, if it is eligible for an auto-update policy. */
    protected autoUpdateContext(args: unknown[]): { artifactKind: RegistryEntryContext['artifactKind']; autoUpdateId: string } | undefined {
        const entry = args.find(RegistryEntryContext.is);
        if (!entry?.autoUpdateId) {
            return undefined;
        }
        return { artifactKind: entry.artifactKind, autoUpdateId: entry.autoUpdateId };
    }

    protected copyableId(args: unknown[]): string | undefined {
        return args.find(RegistryEntryContext.is)?.copyableId;
    }
}
