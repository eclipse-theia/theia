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

import { injectable } from 'inversify';
import { Disposable, DisposableCollection } from '../../common';

export interface WatermarkCommandOptions {
    /**
     * Priority of the watermark command
     */
    rank?: number;
    /**
     * Test whether the watermark command should be shown
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isVisible?(): boolean;
}

/**
 * The watermark command registry manages commands to be shown in the watermark widget.
 */
@injectable()
export class WatermarkCommandRegistry {

    /**
     * Registered commands to be shown in the watermark widget
     */
    protected readonly _commands: { [id: string]: WatermarkCommandOptions } = {};
    protected readonly toUnregisterCommands = new Map<string, Disposable>();

    registerWatermarkCommand(commandId: string, options?: WatermarkCommandOptions): Disposable {
        if (this._commands[commandId]) {
            console.warn(`Command ${commandId} is already registered as a watermark command.`);
            return Disposable.NULL;
        }
        const toDispose = new DisposableCollection(this.doRegisterCommand(commandId, options ?? {}));
        this.toUnregisterCommands.set(commandId, toDispose);
        toDispose.push(Disposable.create(() => this.toUnregisterCommands.delete(commandId)));
        return toDispose;
    }

    protected doRegisterCommand(commandId: string, options: WatermarkCommandOptions): Disposable {
        this._commands[commandId] = options;
        return {
            dispose: () => {
                delete this._commands[commandId];
            }
        };
    }

    getAllEnabledWatermarkCommands(): ReadonlyMap<string, WatermarkCommandOptions> {
        const result = new Map<string, WatermarkCommandOptions>();

        for (const [key, value] of Object.entries(this._commands)) {
            if (!value.isVisible || value.isVisible()) {
                result.set(key, value);
            }
        }

        return result;
    }

}
