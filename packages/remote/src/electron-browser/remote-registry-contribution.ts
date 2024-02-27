// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import { Command, CommandHandler, Emitter, Event } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { WindowService, WindowReloadOptions } from '@theia/core/lib/browser/window/window-service';

export const RemoteRegistryContribution = Symbol('RemoteRegistryContribution');

export interface RemoteRegistryContribution {
    registerRemoteCommands(registry: RemoteRegistry): void;
}

@injectable()
export abstract class AbstractRemoteRegistryContribution implements RemoteRegistryContribution {

    @inject(WindowService)
    protected readonly windowService: WindowService;

    abstract registerRemoteCommands(registry: RemoteRegistry): void;

    protected openRemote(port: string, newWindow: boolean, workspace?: string): void {
        const searchParams = new URLSearchParams(location.search);
        const localPort = searchParams.get('localPort') || searchParams.get('port');
        const options: WindowReloadOptions = {
            search: { port }
        };
        if (localPort) {
            options.search!.localPort = localPort;
        }
        if (workspace) {
            options.hash = workspace;
        }

        if (newWindow) {
            this.windowService.openNewDefaultWindow(options);
        } else {
            this.windowService.reload(options);
        }
    }
}

export class RemoteRegistry {

    protected _commands: Command[] = [];
    protected onDidRegisterCommandEmitter = new Emitter<[Command, CommandHandler | undefined]>();

    get commands(): readonly Command[] {
        return this._commands;
    }

    get onDidRegisterCommand(): Event<[Command, CommandHandler | undefined]> {
        return this.onDidRegisterCommandEmitter.event;
    }

    registerCommand(command: Command, handler?: CommandHandler): void {
        this.onDidRegisterCommandEmitter.fire([command, handler]);
        this._commands.push(command);
    }
}
