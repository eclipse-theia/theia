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
let commandRegistry: CommandRegistry;

describe('Commands', () => {

    beforeEach(() => {
        commandRegistry = new CommandRegistry(new EmptyContributionProvider());
    });

    it('should register and execute a given command', async () => {
        const concatId = 'concat';
        const command: Command = { id: concatId };
        commandRegistry.registerCommand(command, new ConcatCommandHandler());
        const result = await commandRegistry.executeCommand(concatId, 'a', 'b', 'c');
        expect('abc').equals(result);
    });

    it('should execute a given command, and add it to recently used', async () => {
        const commandId = 'stub';
        const command: Command = { id: commandId };
        commandRegistry.registerCommand(command, new StubCommandHandler());
        await commandRegistry.executeCommand(commandId);
        expect(commandRegistry.recent.length).equal(1);
    });

    it('should execute multiple commands, and add them to recently used in the order they were used', async () => {
        const commandIds = ['a', 'b', 'c'];
        const commands: Command[] = [
            { id: commandIds[0] },
            { id: commandIds[1] },
            { id: commandIds[2] },
        ];

        // Register each command.
        commands.forEach((c: Command) => {
            commandRegistry.registerCommand(c, new StubCommandHandler());
        });

        // Execute order c, b, a.
        await commandRegistry.executeCommand(commandIds[2]);
        await commandRegistry.executeCommand(commandIds[1]);
        await commandRegistry.executeCommand(commandIds[0]);

        // Expect recently used to be a, b, c.
        const result: Command[] = commandRegistry.recent;

        expect(result.length).equal(3);
        expect(result[0].id).equal(commandIds[0]);
        expect(result[1].id).equal(commandIds[1]);
        expect(result[2].id).equal(commandIds[2]);
    });

    it('should execute a command that\'s already been executed, and add it to the top of the most recently used', async () => {
        const commandIds = ['a', 'b', 'c'];
        const commands: Command[] = [
            { id: commandIds[0] },
            { id: commandIds[1] },
            { id: commandIds[2] },
        ];

        // Register each command.
        commands.forEach((c: Command) => {
            commandRegistry.registerCommand(c, new StubCommandHandler());
        });

        // Execute order a, b, c, a.
        await commandRegistry.executeCommand(commandIds[0]);
        await commandRegistry.executeCommand(commandIds[1]);
        await commandRegistry.executeCommand(commandIds[2]);
        await commandRegistry.executeCommand(commandIds[0]);

        // Expect recently used to be a, b, c.
        const result: Command[] = commandRegistry.recent;

        expect(result.length).equal(3);
        expect(result[0].id).equal(commandIds[0]);
        expect(result[1].id).equal(commandIds[2]);
        expect(result[2].id).equal(commandIds[1]);
    });

    it('should clear the recently used command history', async () => {
        const commandIds = ['a', 'b', 'c'];
        const commands: Command[] = [
            { id: commandIds[0] },
            { id: commandIds[1] },
            { id: commandIds[2] },
        ];

        // Register each command.
        commands.forEach((c: Command) => {
            commandRegistry.registerCommand(c, new StubCommandHandler());
        });

        // Execute each command.
        await commandRegistry.executeCommand(commandIds[0]);
        await commandRegistry.executeCommand(commandIds[1]);
        await commandRegistry.executeCommand(commandIds[2]);

        // Clear the list of recently used commands.
        commandRegistry.clearCommandHistory();
        expect(commandRegistry.recent.length).equal(0);
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

class StubCommandHandler implements CommandHandler {
    execute(...args: string[]) { return undefined; }
}
