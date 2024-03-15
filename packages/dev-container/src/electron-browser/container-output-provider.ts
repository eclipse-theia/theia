// *****************************************************************************
// Copyright (C) 2024 Typefox and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { OutputChannel, OutputChannelManager } from '@theia/output/lib/browser/output-channel';

@injectable()
export class ContainerOutputProvider implements ContainerOutputProvider {

    @inject(OutputChannelManager)
    protected readonly outputChannelManager: OutputChannelManager;

    protected currentChannel?: OutputChannel;

    openChannel(): void {
        this.currentChannel = this.outputChannelManager.getChannel('Container');
        this.currentChannel.show();
    };

    onRemoteOutput(output: string): void {
        this.currentChannel?.appendLine(output);
    }
}
