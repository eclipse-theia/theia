// *****************************************************************************
// Copyright (C) 2022 Alexander Flammer.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from 'react';
import { ReactWidget } from '../widgets/react-widget';
import { injectable, inject } from 'inversify';
import { Message } from '../widgets';
import { KeybindingUtil, RenderableKeybindingStringSegment } from '../keybinding/keybinding-util';
import { Command, CommandRegistry } from '../../common';
import { WatermarkCommandOptions, WatermarkCommandRegistry } from './watermark-command-registry';
import { KeybindingSegmentsWidget } from '../keybinding/keybinding-segments-widget';
import { KeybindingRegistry, ScopedKeybinding } from '../keybinding';

export interface KeybindingRenderingItem {
    command: Command
    keybinding: ScopedKeybinding
    keySegments: RenderableKeybindingStringSegment[]

    commandLabel: string;

}

@injectable()
export class WatermarkWidget extends ReactWidget {

    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry;
    @inject(KeybindingUtil) protected readonly keybindingUtil: KeybindingUtil;
    @inject(WatermarkCommandRegistry) protected readonly watermarkCommandRegistry: WatermarkCommandRegistry;
    @inject(KeybindingRegistry) protected readonly keybindingRegistry: KeybindingRegistry;

    constructor() {
        super();
        this.id = 'theia-main-content-watermark';
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
        const disposable = this.keybindingRegistry.onKeybindingsChanged(() => {
            this.update();
        });
        this.toDispose.push(disposable);
    }

    protected override render(): React.ReactNode {
        const watermarkCommandIds = this.watermarkCommandRegistry.getAllEnabledWatermarkCommands();
        const enabledWatermarkCommandIds = this.filterCommands(watermarkCommandIds);

        const items: KeybindingRenderingItem[] = [];

        for (let i = 0; i < enabledWatermarkCommandIds.length; i++) {
            const command = enabledWatermarkCommandIds[i];

            const keybinding = this.keybindingRegistry.getKeybindingsForCommand(command.id)[0];
            if (!keybinding) {
                continue;
            }

            const keySegments = this.keybindingUtil.getRenderableKeybindingSegments(keybinding);
            const commandLabel = this.keybindingUtil.getCommandLabel(command);

            const item = {
                command,
                keybinding,
                keySegments,
                commandLabel
            };

            items.push(item);
        }

        const content = items.map((item, _) =>
            this.renderKeybindings(item)
        );

        return <table>
            <tbody>
                {content}
            </tbody>
        </table>;
    }

    protected filterCommands(watermarkCommandIds: ReadonlyMap<string, WatermarkCommandOptions>): Command[] {
        const commandsIds = Array.from(watermarkCommandIds.keys());

        return commandsIds
            .map(a => this.commandRegistry.commands.find(c => c.id === a))
            .filter((a): a is Command => !!a)
            .sort((a: Command, b: Command) => {
                const firstRank = watermarkCommandIds.get(a.id)?.rank ?? 0;
                const secondRank = watermarkCommandIds.get(b.id)?.rank ?? 0;
                if (firstRank !== secondRank) {
                    return firstRank - secondRank;
                }
                return Command.compareCommands(a, b);
            });
    }

    protected renderKeybindings(item: KeybindingRenderingItem): React.ReactNode {
        return <tr key={item.command.id}>
            <td className='watermark-keybinding-label' title={item.commandLabel}>
                {item.commandLabel}
            </td>
            <td title={item.keybinding.keybinding} className='watermark-keybinding monaco-keybinding'>
                {<KeybindingSegmentsWidget keybinding={item} />}
            </td>
        </tr>;
    }

}
