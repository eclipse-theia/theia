// *****************************************************************************
// Copyright (C) 2020 SAP SE or an SAP affiliate company and others.
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
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { OutputChannelManager, OutputChannelSeverity } from '@theia/output/lib/browser/output-channel';

@injectable()
export class SampleOutputChannelWithSeverity
    implements FrontendApplicationContribution {
    @inject(OutputChannelManager)
    protected readonly outputChannelManager: OutputChannelManager;
    public onStart(): void {
        const channel = this.outputChannelManager.getChannel('API Sample: my test channel');
        channel.appendLine('hello info1'); // showed without color
        channel.appendLine('hello info2', OutputChannelSeverity.Info);
        channel.appendLine('hello error', OutputChannelSeverity.Error);
        channel.appendLine('hello warning', OutputChannelSeverity.Warning);
        channel.append('inlineInfo1 ');
        channel.append('inlineWarning ', OutputChannelSeverity.Warning);
        channel.append('inlineError ', OutputChannelSeverity.Error);
        channel.append('inlineInfo2', OutputChannelSeverity.Info);

        // ANSI color code samples
        channel.appendLine('\x1b[31mANSI red text\x1b[0m');
        channel.appendLine('\x1b[32mANSI green text\x1b[0m');
        channel.appendLine('\x1b[33mANSI yellow\x1b[0m and \x1b[34mANSI blue\x1b[0m on the same line');
        channel.appendLine('\x1b[1m\x1b[35mANSI bold magenta\x1b[0m');
        channel.appendLine('\x1b[4m\x1b[36mANSI underlined cyan\x1b[0m');
        channel.appendLine('Mixed: \x1b[31mANSI error\x1b[0m and \x1b[32mANSI success\x1b[0m in one line');
        channel.appendLine('\x1b[41m\x1b[37mANSI white on red background\x1b[0m');
    }
}
export const bindSampleOutputChannelWithSeverity = (bind: interfaces.Bind) => {
    bind(FrontendApplicationContribution)
        .to(SampleOutputChannelWithSeverity)
        .inSingletonScope();
};
