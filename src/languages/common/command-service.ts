/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { CommandRegistry, DisposableCollection, Disposable, CommandHandler } from '../../application/common';
import * as services from 'vscode-base-languageclient/lib/services';

/**
 * FIXME:
 * consider move it to the application module, but without dependencies to `services.Commands`
 */
@injectable()
export class CommandService implements services.Commands {

    constructor(
        @inject(CommandRegistry) protected readonly registry: CommandRegistry
    ) { }

    executeCommand<T>(command: string, ...args: any[]): Promise<T | undefined> {
        const handler = this.registry.getActiveHandler(command);
        if (handler) {
            return Promise.resolve(handler.execute(args))
        }
        return Promise.resolve(undefined);
    }

    registerCommand(command: string, handler: CommandHandler): Disposable;
    registerCommand(command: string, handler: (...args: any[]) => any, thisArg?: any): Disposable;
    registerCommand(command: string, rawHandler: ((...args: any[]) => any) | CommandHandler, thisArg?: any): Disposable {
        const toDispose = new DisposableCollection();
        toDispose.push(this.registry.registerCommand({
            id: command,
            label: command // FIXME label should be optional
        }));
        const handler: CommandHandler = typeof rawHandler === 'function' ? {
            isEnabled: () => true,
            execute: rawHandler.bind(thisArg)
        } : rawHandler;
        toDispose.push(this.registry.registerHandler(command, handler));
        return toDispose;
    }

}
