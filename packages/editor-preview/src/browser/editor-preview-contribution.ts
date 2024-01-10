// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { ApplicationShell, CommonCommands, KeybindingContribution, KeybindingRegistry, SHELL_TABBAR_CONTEXT_PIN, Widget } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { EditorPreviewWidget } from './editor-preview-widget';
import { CurrentWidgetCommandAdapter } from '@theia/core/lib/browser/shell/current-widget-command-adapter';

export namespace EditorPreviewCommands {
    export const PIN_PREVIEW_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.keepEditor',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Keep Editor',
    });
}

@injectable()
export class EditorPreviewContribution implements CommandContribution, MenuContribution, KeybindingContribution {
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(EditorPreviewCommands.PIN_PREVIEW_COMMAND, new CurrentWidgetCommandAdapter(this.shell, {
            execute: async title => {
                if (title?.owner instanceof EditorPreviewWidget) {
                    title.owner.convertToNonPreview();
                    await this.shell.activateWidget(title.owner.id);
                }
            },
            isEnabled: title => title?.owner instanceof EditorPreviewWidget && title.owner.isPreview,
            isVisible: title => title?.owner instanceof EditorPreviewWidget,
        }));
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: EditorPreviewCommands.PIN_PREVIEW_COMMAND.id,
            keybinding: 'ctrlcmd+k enter'
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(SHELL_TABBAR_CONTEXT_PIN, {
            commandId: EditorPreviewCommands.PIN_PREVIEW_COMMAND.id,
            label: nls.localizeByDefault('Keep Open'),
            order: '6',
        });
    }

    protected getTargetWidget(event?: Event): Widget | undefined {
        return event ? this.shell.findTargetedWidget(event) : this.shell.activeWidget;
    }
}
