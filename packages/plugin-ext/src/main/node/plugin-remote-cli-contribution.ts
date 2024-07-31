// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { MaybePromise } from '@theia/core';
import { RemoteCliContext, RemoteCliContribution } from '@theia/core/lib/node/remote/remote-cli-contribution';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PluginCliContribution } from './plugin-cli-contribution';

@injectable()
export class PluginRemoteCliContribution implements RemoteCliContribution {

    @inject(PluginCliContribution)
    protected readonly pluginCliContribution: PluginCliContribution;

    enhanceArgs(context: RemoteCliContext): MaybePromise<string[]> {
        const pluginsFolder = this.pluginCliContribution.localDir();
        if (!pluginsFolder) {
            return [];
        } else {
            return ['--plugins=local-dir:./plugins'];
        }
    }
}
