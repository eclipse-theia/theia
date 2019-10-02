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
import * as theia from '@theia/plugin';
import { OutputChannelRegistryMain, PluginInfo } from '../../common/plugin-api-rpc';

export class OutputChannelImpl implements theia.OutputChannel {

    private disposed: boolean;

    constructor(readonly name: string, private proxy: OutputChannelRegistryMain, private readonly pluginInfo: PluginInfo) {
    }

    dispose(): void {
        if (!this.disposed) {
            this.proxy.$dispose(this.name).then(() => {
                this.disposed = true;
            });
        }
    }

    append(value: string): void {
        this.validate();
        this.proxy.$append(this.name, value, this.pluginInfo);
    }

    appendLine(value: string): void {
        this.validate();
        this.append(value + '\n');
    }

    clear(): void {
        this.validate();
        this.proxy.$clear(this.name);
    }

    show(preserveFocus: boolean | undefined): void {
        this.validate();
        this.proxy.$reveal(this.name, !!preserveFocus);
    }

    hide(): void {
        this.validate();
        this.proxy.$close(this.name);
    }

    private validate(): void {
        if (this.disposed) {
            throw new Error('Channel has been closed');
        }
    }
}
