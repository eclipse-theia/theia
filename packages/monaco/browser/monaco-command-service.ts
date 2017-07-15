/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { CommandRegistry, Emitter, DisposableCollection } from '../../application/common';
import ICommandEvent = monaco.commands.ICommandEvent;
import ICommandService = monaco.commands.ICommandService;

export const MonacoCommandServiceFactory = Symbol('MonacoCommandServiceFactory');
export interface MonacoCommandServiceFactory {
    (): MonacoCommandService;
}

@injectable()
export class MonacoCommandService implements ICommandService {

    protected readonly onWillExecuteCommandEmitter = new Emitter<ICommandEvent>();

    protected delegate: ICommandService | undefined;
    protected readonly delegateListeners = new DisposableCollection();

    constructor(
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry
    ) { }

    get onWillExecuteCommand(): monaco.IEvent<ICommandEvent> {
        return this.onWillExecuteCommandEmitter.event;
    }

    setDelegate(delegate: ICommandService | undefined) {
        this.delegateListeners.dispose();
        this.delegate = delegate;
        if (this.delegate) {
            this.delegateListeners.push(this.delegate.onWillExecuteCommand(event =>
                this.onWillExecuteCommandEmitter.fire(event)
            ));
        }
    }

    executeCommand(commandId: any, ...args: any[]): monaco.Promise<any> {
        const handler = this.commandRegistry.getActiveHandler(commandId, ...args);
        if (handler) {
            try {
                this.onWillExecuteCommandEmitter.fire({ commandId });
                return monaco.Promise.wrap(handler.execute(...args));
            } catch (err) {
                return monaco.Promise.wrapError(err);
            }
        }
        if (this.delegate) {
            return this.delegate.executeCommand(commandId, ...args);
        }
        return monaco.Promise.wrapError(new Error(`command '${commandId}' not found`));
    }

}