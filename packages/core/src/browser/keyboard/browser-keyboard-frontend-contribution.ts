/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { inject, injectable } from 'inversify';
import { isOSX } from '../../common/os';
import { CommandContribution, CommandRegistry, Command } from '../../common/command';
import { QuickPickService, QuickPickItem } from '../../common/quick-pick-service';
import { BrowserKeyboardLayoutProvider, KeyboardLayoutData } from './browser-keyboard-layout-provider';

export namespace KeyboardCommands {

    const KEYBOARD_CATEGORY = 'Keyboard';

    export const CHOOSE_KEYBOARD_LAYOUT: Command = {
        id: 'core.keyboard.choose',
        category: KEYBOARD_CATEGORY,
        label: 'Choose Keyboard Layout',
    };

}

@injectable()
export class BrowserKeyboardFrontendContribution implements CommandContribution {

    @inject(BrowserKeyboardLayoutProvider)
    protected readonly layoutProvider: BrowserKeyboardLayoutProvider;

    @inject(QuickPickService)
    protected readonly quickPickService: QuickPickService;

    registerCommands(commandRegistry: CommandRegistry): void {
        commandRegistry.registerCommand(KeyboardCommands.CHOOSE_KEYBOARD_LAYOUT, {
            execute: () => this.chooseLayout()
        });
    }

    protected async chooseLayout() {
        const current = this.layoutProvider.currentLayoutData;
        const autodetect: QuickPickItem<'autodetect'> = {
            label: 'Auto-detect',
            description: this.layoutProvider.currentLayoutSource !== 'user-choice' ? `(current: ${current.name})` : undefined,
            detail: 'Try to detect the keyboard layout from browser information and pressed keys.',
            value: 'autodetect'
        };
        const pcLayouts = this.layoutProvider.allLayoutData
            .filter(layout => layout.hardware === 'pc')
            .sort((a, b) => compare(a.name, b.name))
            .map(layout => this.toQuickPickValue(layout, current === layout));
        const macLayouts = this.layoutProvider.allLayoutData
            .filter(layout => layout.hardware === 'mac')
            .sort((a, b) => compare(a.name, b.name))
            .map(layout => this.toQuickPickValue(layout, current === layout));
        let layouts: QuickPickItem<KeyboardLayoutData | 'autodetect'>[];
        if (isOSX) {
            layouts = [
                autodetect,
                { type: 'separator', label: 'Mac Keyboards' }, ...macLayouts,
                { type: 'separator', label: 'PC Keyboards' }, ...pcLayouts
            ];
        } else {
            layouts = [
                autodetect,
                { type: 'separator', label: 'PC Keyboards' }, ...pcLayouts,
                { type: 'separator', label: 'Mac Keyboards' }, ...macLayouts
            ];
        }
        const chosen = await this.quickPickService.show(layouts, { placeholder: 'Choose a keyboard layout' });
        if (chosen) {
            return this.layoutProvider.setLayoutData(chosen);
        }
    }

    protected toQuickPickValue(layout: KeyboardLayoutData, isCurrent: boolean): QuickPickItem<KeyboardLayoutData> {
        return {
            label: layout.name,
            description: `${layout.hardware === 'mac' ? 'Mac' : 'PC'} (${layout.language})${isCurrent ? ' - current layout' : ''}`,
            value: layout
        };
    }

}

function compare(a: string, b: string): number {
    if (a < b) {
        return -1;
    }
    if (a > b) {
        return 1;
    }
    return 0;
}
