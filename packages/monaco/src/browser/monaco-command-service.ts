// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { Emitter } from '@theia/core/lib/common/event';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { ICommandEvent, ICommandService } from '@theia/monaco-editor-core/esm/vs/platform/commands/common/commands';
import { StandaloneCommandService, StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import * as monaco from '@theia/monaco-editor-core';
import { IInstantiationService } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation';

@injectable()
export class MonacoCommandService implements ICommandService, Disposable {
    declare readonly _serviceBrand: undefined; // Required for type compliance.
    protected readonly onWillExecuteCommandEmitter = new Emitter<ICommandEvent>();
    protected readonly onDidExecuteCommandEmitter = new Emitter<ICommandEvent>();
    protected readonly toDispose = new DisposableCollection(
        this.onWillExecuteCommandEmitter,
        this.onDidExecuteCommandEmitter
    );

    protected delegate: StandaloneCommandService | undefined;

    constructor(
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry
    ) {
        this.toDispose.push(this.commandRegistry.onWillExecuteCommand(e => this.onWillExecuteCommandEmitter.fire(e)));
        this.toDispose.push(this.commandRegistry.onDidExecuteCommand(e => this.onDidExecuteCommandEmitter.fire(e)));
    }

    @postConstruct()
    init(): void {
        this.delegate = new StandaloneCommandService(StandaloneServices.get(IInstantiationService));
        if (this.delegate) {
            this.toDispose.push(this.delegate.onWillExecuteCommand(event =>
                this.onWillExecuteCommandEmitter.fire(event)
            ));
            this.toDispose.push(this.delegate.onDidExecuteCommand(event =>
                this.onDidExecuteCommandEmitter.fire(event)
            ));
        }
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    get onWillExecuteCommand(): monaco.IEvent<ICommandEvent> {
        return this.onWillExecuteCommandEmitter.event;
    }

    get onDidExecuteCommand(): monaco.IEvent<ICommandEvent> {
        return this.onDidExecuteCommandEmitter.event;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async executeCommand(commandId: any, ...args: any[]): Promise<any> {
        try {
            await this.commandRegistry.executeCommand(commandId, ...args);
        } catch (e) {
            if (e.code === 'NO_ACTIVE_HANDLER') {
                return this.executeMonacoCommand(commandId, ...args);
            }
            throw e;
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async executeMonacoCommand(commandId: any, ...args: any[]): Promise<any> {
        if (this.delegate) {
            return this.delegate.executeCommand(commandId, ...args);
        }
        throw new Error(`command '${commandId}' not found`);
    }

}
