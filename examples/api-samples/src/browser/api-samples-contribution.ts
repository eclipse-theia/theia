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

import { injectable, inject, postConstruct } from 'inversify';
import { Command, CommandContribution, CommandRegistry, CommandHandler } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { MessageService } from '@theia/core/lib/common';
import { OutputChannelManager } from '@theia/output/lib/common/output-channel';
import { OutputContribution } from '@theia/output/lib/browser/output-contribution';
import { SampleDynamicLabelProviderContribution } from './sample-dynamic-label-provider-contribution';

export namespace ExampleLabelProviderCommands {
    const EXAMPLE_CATEGORY = 'Examples';
    export const TOGGLE_SAMPLE: Command = {
        id: 'example_label_provider.toggle',
        category: EXAMPLE_CATEGORY,
        label: 'Toggle Dynamically-Changing Labels'
    };
}

@injectable()
export class ApiSamplesContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(SampleDynamicLabelProviderContribution)
    protected readonly labelProviderContribution: SampleDynamicLabelProviderContribution;

    @inject(MessageService)
    protected messageService: MessageService;

    @inject(OutputChannelManager)
    protected readonly outputManager: OutputChannelManager;

    @inject(OutputContribution)
    protected readonly outputViewContribution: OutputContribution;

    protected timer: number | undefined;

    @postConstruct()
    init(): void {
        this.messageService.info("API Sample Contribution is starting and will log a message to the 'Output' view 10 times per second. Stand by...");
        this.outputViewContribution.openView({ activate: true }).then(() => {
            const channel = this.outputManager.getChannel('API Sample Contribution');
            this.outputManager.selectedChannel = channel;
            this.timer = window.setInterval(() => {
                this.outputViewContribution.openView({ activate: true }).then(() => {
                    this.outputManager.getChannel('API Sample Contribution').appendLine('hey there!');
                });
            }, 100);
        });
    }

    onStop(): void {
        if (typeof this.timer === 'number') {
            window.clearInterval(this.timer);
        }
    }

    initialize(): void { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(ExampleLabelProviderCommands.TOGGLE_SAMPLE, new ExampleLabelProviderCommandHandler(this.labelProviderContribution));
    }

}

export class ExampleLabelProviderCommandHandler implements CommandHandler {

    constructor(private readonly labelProviderContribution: SampleDynamicLabelProviderContribution) {
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute(...args: any[]): any {
        this.labelProviderContribution.toggle();
    }

}
