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

import { CommandRegistry, Command, MenuModelRegistry, SelectionService, MessageService } from '@theia/core/lib/common';
import { FrontendApplication, AbstractViewContribution } from '@theia/core/lib/browser';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { injectable, inject } from 'inversify';
import { HgDiffWidget, HG_DIFF } from './hg-diff-widget';
import { open, OpenerService } from '@theia/core/lib/browser';
import { NavigatorContextMenu } from '@theia/navigator/lib/browser/navigator-contribution';
import { UriCommandHandler, UriAwareCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import { HgQuickOpenService } from '../hg-quick-open-service';
import { FileSystem } from '@theia/filesystem/lib/common';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import URI from '@theia/core/lib/common/uri';
import { HG_RESOURCE_SCHEME } from '../hg-resource';
import { Hg } from '../../common';
import { HgRepositoryProvider } from '../hg-repository-provider';

export namespace HgDiffCommands {
    export const OPEN_FILE_DIFF: Command = {
        id: 'hg-diff:open-file-diff',
        category: 'Hg Diff',
        label: 'Compare With...'
    };
}

@injectable()
export class HgDiffContribution extends AbstractViewContribution<HgDiffWidget> {

    constructor(
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(HgQuickOpenService) protected readonly quickOpenService: HgQuickOpenService,
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(OpenerService) protected openerService: OpenerService,
        @inject(MessageService) protected readonly notifications: MessageService,
        @inject(HgRepositoryProvider) protected readonly repositoryProvider: HgRepositoryProvider
    ) {
        super({
            widgetId: HG_DIFF,
            widgetName: 'Hg diff',
            defaultWidgetOptions: {
                area: 'left',
                rank: 500
            }
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(NavigatorContextMenu.COMPARE, {
            commandId: HgDiffCommands.OPEN_FILE_DIFF.id
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(HgDiffCommands.OPEN_FILE_DIFF, this.newUriAwareCommandHandler({
            isVisible: uri => !!this.repositoryProvider.findRepository(uri),
            isEnabled: uri => !!this.repositoryProvider.findRepository(uri),
            execute: async fileUri => {
                await this.quickOpenService.chooseTagsAndBranches(
                    async (fromRevision, toRevision) => {
                        const uri = fileUri.toString();
                        const fileStat = await this.fileSystem.getFileStat(uri);
                        const options: Hg.Options.Status = {
                            uri,
                            range: {
                                fromRevision,
                                toRevision
                            }
                        };
                        if (fileStat) {
                            if (fileStat.isDirectory) {
                                this.showWidget(options);
                            } else {
                                const fromURI = fileUri.withScheme(HG_RESOURCE_SCHEME).withQuery(fromRevision);
                                const toURI = fileUri;
                                const diffUri = DiffUris.encode(fromURI, toURI);
                                if (diffUri) {
                                    open(this.openerService, diffUri).catch(e => {
                                        this.notifications.error(e.message);
                                    });
                                }
                            }
                        }
                    }, this.repositoryProvider.findRepository(fileUri));
            }
        }));
    }

    async showWidget(options: Hg.Options.Status): Promise<HgDiffWidget> {
        const widget = await this.widget;
        await widget.setContent(options);
        return this.openView({
            activate: true
        });
    }

    protected newUriAwareCommandHandler(handler: UriCommandHandler<URI>): UriAwareCommandHandler<URI> {
        return new UriAwareCommandHandler(this.selectionService, handler);
    }

}
