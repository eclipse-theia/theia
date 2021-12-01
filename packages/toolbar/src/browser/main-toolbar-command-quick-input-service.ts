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

import { Command, CommandRegistry, CommandService } from '@theia/core';
import { QuickCommandService, QuickInputService, QuickPickItem } from '@theia/core/lib/browser';
import { injectable, inject } from '@theia/core/shared/inversify';
import { MainToolbarIconDialogFactory } from './main-toolbar-icon-selector-dialog';
import { ToolbarAlignment, ToolbarAlignmentString } from './main-toolbar-interfaces';
import { MainToolbarController } from './main-toolbar-controller';

@injectable()
export class MainToolbarCommandQuickInputService {
    @inject(CommandService) protected readonly commandService: CommandService;
    @inject(QuickInputService) protected readonly quickInputService: QuickInputService;
    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry;
    @inject(QuickCommandService) protected readonly quickCommandService: QuickCommandService;
    @inject(MainToolbarController) protected readonly model: MainToolbarController;
    @inject(MainToolbarIconDialogFactory) protected readonly iconDialogFactory: MainToolbarIconDialogFactory;

    protected quickPickItems: QuickPickItem[] = [];

    protected iconClass: string | undefined;
    protected commandToAdd: Command | undefined;

    protected columnQuickPickItems: QuickPickItem[] = [ToolbarAlignment.LEFT, ToolbarAlignment.CENTER, ToolbarAlignment.RIGHT]
        .map(column => ({
            label: `${column.toUpperCase()} Column`,
            id: column,
        }));

    openIconDialog(): void {
        this.quickPickItems = this.generateCommandsList();
        this.quickInputService.showQuickPick(this.quickPickItems, {
            placeholder: 'Find a command to add to the toolbar',
        });
    }

    protected openColumnQP(): Promise<QuickPickItem> {
        return this.quickInputService.showQuickPick(this.columnQuickPickItems, {
            placeholder: 'Where would you like the command added?',
        });
    }

    protected generateCommandsList(): QuickPickItem[] {
        const { recent, other } = this.quickCommandService['getCommands']();
        return [...recent, ...other].map(command => {
            const formattedItem = this.quickCommandService.toItem(command) as QuickPickItem;
            return {
                ...formattedItem,
                alwaysShow: true,
                execute: async (): Promise<void> => {
                    const iconDialog = this.iconDialogFactory(command);
                    const iconClass = await iconDialog.open();
                    if (iconClass) {
                        const { id } = await this.openColumnQP();
                        if (ToolbarAlignmentString.is(id)) {
                            this.model.addItem({ ...command, iconClass }, id);
                        }
                    }
                },
            };
        });
    }
}
