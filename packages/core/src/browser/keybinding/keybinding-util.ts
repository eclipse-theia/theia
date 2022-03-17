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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from 'inversify';
import { KeybindingRegistry, ResolvedKeybinding } from '../keybinding';
import { Command } from '../../common';

export interface RenderableKeybindingStringSegment {
    value: string;
    key: boolean;
}

@injectable()
export class KeybindingUtil {

    @inject(KeybindingRegistry) protected readonly keybindingRegistry: KeybindingRegistry;

    public getRenderableKeybindingSegments(item: ResolvedKeybinding): RenderableKeybindingStringSegment[] {
        const segments = this.keybindingRegistry.resolveKeybinding(item).reduce<RenderableKeybindingStringSegment[]>((collection, code, codeIndex) => {
            if (codeIndex !== 0) {
                // Two non-breaking spaces.
                collection.push({ value: '\u00a0\u00a0', key: false });
            }
            const displayChunks = this.keybindingRegistry.componentsForKeyCode(code);

            displayChunks.forEach((chunk, chunkIndex) => {
                if (chunkIndex !== 0) {
                    collection.push({ value: '+', key: false });
                }
                collection.push({ value: chunk, key: true });
            });
            return collection;
        }, []);
        return segments;
    }

    /**
     * Get the human-readable label for a given command.
     * @param command the command.
     *
     * @returns a human-readable label for the given command.
     */
    public getCommandLabel(command: Command): string {
        if (command.label) {
            // Prefix the command label with the category if it exists, else return the simple label.
            return command.category ? `${command.category}: ${command.label}` : command.label;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((command as any).dialogLabel) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const label = (command as any).dialogLabel;
            return command.category ? `${command.category}: ${label}` : label;
        };

        return command.id;
    }

}
