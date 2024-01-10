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

// @ts-check
describe('Contribution filter', function () {
    this.timeout(5000);
    const { assert } = chai;

    const { CommandRegistry, CommandContribution } = require('@theia/core/lib/common/command');
    const { SampleFilteredCommandContribution, SampleFilteredCommand } = require('@theia/api-samples/lib/browser/contribution-filter/sample-filtered-command-contribution');

    const container = window.theia.container;
    const commands = container.get(CommandRegistry);

    it('filtered command in container but not in registry', async function () {
        const allCommands = container.getAll(CommandContribution);
        assert.isDefined(allCommands.find(contribution => contribution instanceof SampleFilteredCommandContribution),
            'SampleFilteredCommandContribution is not bound in container');
        const filteredCommand = commands.getCommand(SampleFilteredCommand.FILTERED.id);
        assert.isUndefined(filteredCommand, 'SampleFilteredCommandContribution should be filtered out but is present in "CommandRegistry"');
    });

});
