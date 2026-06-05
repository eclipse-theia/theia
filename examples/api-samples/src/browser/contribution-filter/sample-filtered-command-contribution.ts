// *****************************************************************************
// Copyright (C) 2021 STMicroelectronics and others.
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

import { Command, CommandContribution, CommandRegistry, ContributionFilterRegistry, FilterContribution, bindContribution } from '@theia/core/lib/common';
import { injectable, interfaces } from '@theia/core/shared/inversify';

export namespace SampleFilteredCommand {

    const API_SAMPLES_CATEGORY = 'API Samples';

    export const FILTERED: Command = {
        id: 'example_command.filtered',
        category: API_SAMPLES_CATEGORY,
        label: 'This command should be filtered out'
    };

    export const FILTERED2: Command = {
        id: 'example_command.filtered2',
        category: API_SAMPLES_CATEGORY,
        label: 'This command should be filtered out (2)'
    };
}

/**
 * This sample command is used to test the runtime filtering of already bound contributions.
 */
@injectable()
export class SampleFilteredCommandContribution implements CommandContribution {

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SampleFilteredCommand.FILTERED, { execute: () => { } });
    }
}

@injectable()
export class SampleFilterAndCommandContribution implements FilterContribution, CommandContribution {

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SampleFilteredCommand.FILTERED2, { execute: () => { } });
    }

    registerContributionFilters(registry: ContributionFilterRegistry): void {
        registry.addFilters([CommandContribution], [
            // filter ourselves out
            contrib => contrib.constructor !== this.constructor
        ]);
        registry.addFilters('*', [
            // filter a contribution based on its class type
            contrib => !(contrib instanceof SampleFilteredCommandContribution)
        ]);
    }
}

export function bindSampleFilteredCommandContribution(bind: interfaces.Bind): void {
    bind(CommandContribution).to(SampleFilteredCommandContribution).inSingletonScope();
    bind(SampleFilterAndCommandContribution).toSelf().inSingletonScope();
    bindContribution(bind, SampleFilterAndCommandContribution, [CommandContribution, FilterContribution]);
}
