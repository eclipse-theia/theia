/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { CommandService } from '@theia/core/lib/common/command';
import { OutputCommands } from '@theia/output/lib/browser/output-commands';
import { OutputChannelRegistryMain, PluginInfo } from '../../common/plugin-api-rpc';

@injectable()
export class OutputChannelRegistryMainImpl implements OutputChannelRegistryMain {

    @inject(CommandService)
    protected readonly commandService: CommandService;

    $append(name: string, text: string, pluginInfo: PluginInfo): PromiseLike<void> {
        this.commandService.executeCommand(OutputCommands.APPEND.id, { name, text });
        return Promise.resolve();
    }

    $clear(name: string): PromiseLike<void> {
        this.commandService.executeCommand(OutputCommands.CLEAR.id, { name });
        return Promise.resolve();
    }

    $dispose(name: string): PromiseLike<void> {
        this.commandService.executeCommand(OutputCommands.DISPOSE.id, { name });
        return Promise.resolve();
    }

    async $reveal(name: string, preserveFocus: boolean): Promise<void> {
        const options = { preserveFocus };
        this.commandService.executeCommand(OutputCommands.SHOW.id, { name, options });
    }

    $close(name: string): PromiseLike<void> {
        this.commandService.executeCommand(OutputCommands.HIDE.id, { name });
        return Promise.resolve();
    }

}
