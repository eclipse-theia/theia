// *****************************************************************************
// Copyright (C) 2018 Red Hat and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { CommandRegistry, CommandHandler, Command, CommandContribution } from './command';
import { ContributionProvider } from './contribution-provider';
import { expect } from 'chai';

/* eslint-disable no-unused-expressions */

describe('Commands', () => {

    let commandRegistry: CommandRegistry;

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

    it('should add command to recently used', async () => {
        const commandId = 'stub';
        const command: Command = { id: commandId };
        commandRegistry.registerCommand(command, new StubCommandHandler());
        commandRegistry.addRecentCommand(command);
        expect(commandRegistry.recent.length).equal(1);
    });

    it('should add multiple commands to recently used in the order they were used', async () => {
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
        commandRegistry.addRecentCommand(commands[2]);
        commandRegistry.addRecentCommand(commands[1]);
        commandRegistry.addRecentCommand(commands[0]);

        // Expect recently used to be a, b, c.
        const result: Command[] = commandRegistry.recent;

        expect(result.length).equal(3);
        expect(result[0].id).equal(commandIds[0]);
        expect(result[1].id).equal(commandIds[1]);
        expect(result[2].id).equal(commandIds[2]);
    });

    it('should add a previously used command to the top of the most recently used', async () => {
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
        commandRegistry.addRecentCommand(commands[0]);
        commandRegistry.addRecentCommand(commands[1]);
        commandRegistry.addRecentCommand(commands[2]);
        commandRegistry.addRecentCommand(commands[0]);

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
        commandRegistry.addRecentCommand(commands[0]);
        commandRegistry.addRecentCommand(commands[1]);
        commandRegistry.addRecentCommand(commands[2]);

        // Clear the list of recently used commands.
        commandRegistry.clearCommandHistory();
        expect(commandRegistry.recent.length).equal(0);
    });

    it('should return with an empty array of handlers if the command is not registered', () => {
        expect(commandRegistry.getCommand('missing')).to.be.undefined;
        expect(commandRegistry.getAllHandlers('missing')).to.be.empty;
    });

    it('should return with an empty array of handlers if the command has no registered handlers', () => {
        commandRegistry.registerCommand({ id: 'id' });
        expect(commandRegistry.getCommand('id')).to.be.not.undefined;
        expect(commandRegistry.getAllHandlers('id')).to.be.empty;
    });

    it('should return all handlers including the non active ones', () => {
        commandRegistry.registerCommand({ id: 'id' });
        commandRegistry.registerHandler('id', new StubCommandHandler());
        commandRegistry.registerHandler('id', new NeverActiveStubCommandHandler());
        expect(commandRegistry.getAllHandlers('id').length).to.be.equal(2);
    });

    describe('compareCommands', () => {

        it('should sort command \'a\' before command \'b\' with categories', () => {
            const a: Command = { id: 'a', category: 'a', label: 'a' };
            const b: Command = { id: 'b', category: 'b', label: 'b' };
            expect(Command.compareCommands(a, b)).to.equal(-1);
            expect(Command.compareCommands(b, a)).to.equal(1);
        });

        it('should sort command \'a\' before command \'b\' without categories', () => {
            const a: Command = { id: 'a', label: 'a' };
            const b: Command = { id: 'b', label: 'b' };
            expect(Command.compareCommands(a, b)).to.equal(-1);
            expect(Command.compareCommands(b, a)).to.equal(1);
        });

        it('should sort command \'a\' before command \'b\' with mix-match categories', () => {
            const a: Command = { id: 'a', category: 'a', label: 'a' };
            const b: Command = { id: 'b', label: 'a' };
            expect(Command.compareCommands(a, b)).to.equal(1);
            expect(Command.compareCommands(b, a)).to.equal(-1);
        });

        it('should sort irregardless of casing', () => {
            const lowercase: Command = { id: 'a', label: 'a' };
            const uppercase: Command = { id: 'a', label: 'A' };
            expect(Command.compareCommands(lowercase, uppercase)).to.equal(0);
        });

        it('should not sort if commands are equal', () => {
            const a: Command = { id: 'a', label: 'a' };
            expect(Command.compareCommands(a, a)).to.equal(0);
        });

        it('should not sort commands without labels', () => {
            const a: Command = { id: 'a' };
            const b: Command = { id: 'b' };
            expect(Command.compareCommands(a, b)).to.equal(0);
        });

    });

    // We don't need to run typing tests, we only want it to compile.
    if (0) {
        it('Can pass anything without typings', () => {
            const command: Command = { id: 'untypedCommand' };
            commandRegistry.registerCommand(command, {
                execute: (...args: unknown[]) => args
            });
            commandRegistry.executeCommand(command.id, 1, '2', undefined, { c: 4 });
        });

        it('Can properly type commands', () => {
            const command = Command.as<(a: number, b: string) => symbol>({ id: 'typedCommand1' });
            commandRegistry.registerCommand(command, {
                // @ts-expect-error
                execute: () => 'wrong return type'
            });
            // @ts-expect-error
            commandRegistry.executeCommand(command.id, 'wrong argument type');
        });

        it('Can extend command typings', () => {
            const command = Command.as<() => void>({ id: 'typedCommand2' });
            commandRegistry.registerCommand(command, {
                execute: () => { }
            });
            const extended = Command.extend(command).as<(a: number) => number>();
            commandRegistry.registerHandler(extended.id, {
                // previous signature should work
                execute: () => { }
            });
            commandRegistry.registerHandler(extended.id, {
                // new signature should work
                execute: (a?: number) => 0
            });
            commandRegistry.registerHandler(extended.id, {
                // @ts-expect-error
                execute: (a?: number) => 'wrong return type'
            });
            commandRegistry.registerHandler(extended.id, {
                // @ts-expect-error
                execute: (a?: 'wrong argument type') => 0
            });
        });
    }
});

class EmptyContributionProvider implements ContributionProvider<CommandContribution> {
    getContributions(recursive?: boolean | undefined): CommandContribution[] {
        return [];
    }
}

class ConcatCommandHandler implements CommandHandler {
    execute(...args: string[]): string {
        let concat = '';
        args.forEach(element => {
            concat += element;
        });
        return concat;
    }
}

class StubCommandHandler implements CommandHandler {
    execute(...args: string[]): undefined { return; }
}

class NeverActiveStubCommandHandler extends StubCommandHandler {
    isEnabled(): unknown { return '' /* falsy-value */; }
}
