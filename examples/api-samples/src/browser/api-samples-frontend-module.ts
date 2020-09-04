/********************************************************************************
 * Copyright (C) 2019 Arm and others.
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

import { ContainerModule } from 'inversify';
import { bindDynamicLabelProvider } from './label/sample-dynamic-label-provider-command-contribution';
import { bindSampleUnclosableView } from './view/sample-unclosable-view-contribution';
import { bindSampleOutputChannelWithSeverity } from './output/sample-output-channel-with-severity';
import { bindSampleMenu } from './menu/sample-menu-contribution';
import { CommandRegistry, CommandContribution } from '@theia/core/lib/common/command';

export default new ContainerModule(bind => {
    bindDynamicLabelProvider(bind);
    bindSampleUnclosableView(bind);
    bindSampleOutputChannelWithSeverity(bind);
    bindSampleMenu(bind);
    let timer: NodeJS.Timer | undefined = undefined;
    let counter = 0;
    bind(CommandContribution).toConstantValue({
        registerCommands(commands: CommandRegistry): void {
            commands.registerCommand({ id: 'start--auto-restart-go', label: 'Start: Auto Restart Go LS' }, {
                execute: () => {
                    timer = setInterval(() => {
                        commands.executeCommand('go.languageserver.restart');
                        if (++counter % 10 === 0) {
                            console.log(`Restarted the Go LS ${counter} times.`);
                        }
                    }, 1000);
                },
                isEnabled: () => !timer
            });
            commands.registerCommand({ id: 'stop--auto-restart-go', label: 'Stop: Auto Restart Go LS' }, {
                execute: () => {
                    if (timer) {
                        clearInterval(timer);
                        timer = undefined;
                        counter = 0;
                    }
                },
                isEnabled: () => !!timer
            });
        }
    });
});
