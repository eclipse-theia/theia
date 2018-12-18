/********************************************************************************
 * Copyright (C) 2018 Red Hat and others.
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

import { CommandRegistry, CommandHandler, Command, CommandContribution } from './command';
import { ContributionProvider } from './contribution-provider';
import * as chai from 'chai';

const expect = chai.expect;

describe('Commands', () => {
    it('should properly pass arguments when any', async () => {
        const commandRegistry = new CommandRegistry(
            new EmptyContributionProvider()
        );

        // Registering a concat command to test
        commandRegistry.registerCommand(
            <Command>{ id: 'concat' },
            new ConcatCommandHandler()
        );

        expect(
            'commandarg1_commandarg2_commandarg3'
        ).equals(
            await commandRegistry.executeCommand(
                'concat',
                'commandarg1',
                '_commandarg2',
                '_commandarg3')
        );
    });
});

class EmptyContributionProvider implements ContributionProvider<CommandContribution> {
    getContributions(recursive?: boolean | undefined): CommandContribution[] {
        return [];
    }
}

class ConcatCommandHandler implements CommandHandler {
    execute(...args: string[]) {
        let concat = '';
        args.forEach(element => {
            concat += element;
        });
        return concat;
    }
}
