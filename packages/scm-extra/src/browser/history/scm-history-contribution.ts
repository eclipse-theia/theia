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

import { MenuModelRegistry, CommandRegistry, Command, SelectionService } from '@theia/core';
import { AbstractViewContribution, OpenViewArguments } from '@theia/core/lib/browser';
import { injectable, inject } from '@theia/core/shared/inversify';
import { NavigatorContextMenu } from '@theia/navigator/lib/browser/navigator-contribution';
import { UriCommandHandler, UriAwareCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import URI from '@theia/core/lib/common/uri';
import { ScmHistoryWidget } from './scm-history-widget';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { EDITOR_CONTEXT_MENU_SCM } from '../scm-extra-contribution';

export const SCM_HISTORY_ID = 'scm-history';
export const SCM_HISTORY_LABEL = 'History';
export const SCM_HISTORY_TOGGLE_KEYBINDING = 'alt+h';
export const SCM_HISTORY_MAX_COUNT = 100;

export namespace ScmHistoryCommands {
    export const OPEN_FILE_HISTORY: Command = {
        id: 'scm-history:open-file-history',
    };
    export const OPEN_BRANCH_HISTORY: Command = {
        id: 'scm-history:open-branch-history',
        label: SCM_HISTORY_LABEL
    };
}

export interface ScmHistoryOpenViewArguments extends OpenViewArguments {
    uri: string | undefined;
}

@injectable()
export class ScmHistoryContribution extends AbstractViewContribution<ScmHistoryWidget> {

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;
    @inject(ScmService)
    protected readonly scmService: ScmService;

    constructor() {
        super({
            widgetId: SCM_HISTORY_ID,
            widgetName: SCM_HISTORY_LABEL,
            defaultWidgetOptions: {
                area: 'left',
                rank: 500
            },
            toggleCommandId: ScmHistoryCommands.OPEN_BRANCH_HISTORY.id,
            toggleKeybinding: SCM_HISTORY_TOGGLE_KEYBINDING
        });
    }

    async openView(args?: Partial<ScmHistoryOpenViewArguments>): Promise<ScmHistoryWidget> {
        const widget = await super.openView(args);
        this.refreshWidget(args!.uri);
        return widget;
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(NavigatorContextMenu.SEARCH, {
            commandId: ScmHistoryCommands.OPEN_FILE_HISTORY.id,
            label: SCM_HISTORY_LABEL
        });
        menus.registerMenuAction(EDITOR_CONTEXT_MENU_SCM, {
            commandId: ScmHistoryCommands.OPEN_FILE_HISTORY.id,
            label: SCM_HISTORY_LABEL
        });
        super.registerMenus(menus);
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(ScmHistoryCommands.OPEN_FILE_HISTORY, this.newUriAwareCommandHandler({
            isEnabled: (uri: URI) => !!this.scmService.findRepository(uri),
            isVisible: (uri: URI) => !!this.scmService.findRepository(uri),
            execute: async uri => this.openView({ activate: true, uri: uri.toString() }),
        }));
        super.registerCommands(commands);
    }

    protected async refreshWidget(uri: string | undefined): Promise<void> {
        const widget = this.tryGetWidget();
        if (!widget) {
            // the widget doesn't exist, so don't wake it up
            return;
        }
        await widget.setContent({ uri });
    }

    protected newUriAwareCommandHandler(handler: UriCommandHandler<URI>): UriAwareCommandHandler<URI> {
        return UriAwareCommandHandler.MonoSelect(this.selectionService, handler);
    }

}
