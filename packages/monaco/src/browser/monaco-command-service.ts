/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import { CommandRegistry, Emitter, DisposableCollection } from '@theia/core/lib/common';
import ICommandEvent = monaco.commands.ICommandEvent;
import ICommandService = monaco.commands.ICommandService;

export const MonacoCommandServiceFactory = Symbol('MonacoCommandServiceFactory');
export interface MonacoCommandServiceFactory {
    (): MonacoCommandService;
}

@injectable()
export class MonacoCommandService implements ICommandService {

    readonly _onWillExecuteCommand = new Emitter<ICommandEvent>();

    protected delegate: ICommandService | undefined;
    protected readonly delegateListeners = new DisposableCollection();

    constructor(
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry
    ) { }

    get onWillExecuteCommand(): monaco.IEvent<ICommandEvent> {
        return this._onWillExecuteCommand.event;
    }

    setDelegate(delegate: ICommandService | undefined): void {
        this.delegateListeners.dispose();
        this.delegate = delegate;
        if (this.delegate) {
            this.delegateListeners.push(this.delegate._onWillExecuteCommand.event(event =>
                this._onWillExecuteCommand.fire(event)
            ));
        }
    }

    // tslint:disable-next-line:no-any
    async executeCommand(commandId: any, ...args: any[]): Promise<any> {
        const handler = this.commandRegistry.getActiveHandler(commandId, ...args);
        if (handler) {
            this._onWillExecuteCommand.fire({ commandId });
            return handler.execute(...args);
        }
        if (this.delegate) {
            return this.delegate.executeCommand(commandId, ...args);
        }
        throw new Error(`command '${commandId}' not found`);
    }

}
