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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

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

    describe('registerAlias', () => {

        it('onDidExecuteCommand fires for alias when target is executed', async () => {
            commandRegistry.registerCommand({ id: 'target' }, new StubCommandHandler());
            commandRegistry.registerAlias('alias', 'target');
            const events: string[] = [];
            commandRegistry.onDidExecuteCommand(e => events.push(e.commandId));
            await commandRegistry.executeCommand('target');
            expect(events).to.deep.equal(['target', 'alias']);
        });

        it('onDidExecuteCommand fires only for alias when alias is executed (no reverse)', async () => {
            commandRegistry.registerCommand({ id: 'alias' }, new StubCommandHandler());
            commandRegistry.registerAlias('alias', 'target');
            const events: string[] = [];
            commandRegistry.onDidExecuteCommand(e => events.push(e.commandId));
            await commandRegistry.executeCommand('alias');
            // Unidirectional: only target→alias fires, not alias→target
            expect(events).to.deep.equal(['alias']);
        });

        it('onWillExecuteCommand fires for alias when target is executed', async () => {
            commandRegistry.registerCommand({ id: 'target' }, new StubCommandHandler());
            commandRegistry.registerAlias('alias', 'target');
            const events: string[] = [];
            commandRegistry.onWillExecuteCommand(e => events.push(e.commandId));
            await commandRegistry.executeCommand('target');
            expect(events).to.deep.equal(['target', 'alias']);
        });

        it('disposing the alias removes the event link', async () => {
            commandRegistry.registerCommand({ id: 'target' }, new StubCommandHandler());
            const disposable = commandRegistry.registerAlias('alias', 'target');
            disposable.dispose();
            const events: string[] = [];
            commandRegistry.onDidExecuteCommand(e => events.push(e.commandId));
            await commandRegistry.executeCommand('target');
            expect(events).to.deep.equal(['target']);
        });

        it('getAlias returns registered alias for target', () => {
            commandRegistry.registerAlias('a', 'b');
            expect(commandRegistry.getAlias('b')).to.equal('a');
        });

        it('getAlias returns undefined for alias direction (unidirectional)', () => {
            commandRegistry.registerAlias('a', 'b');
            expect(commandRegistry.getAlias('a')).to.be.undefined;
        });

        it('getAlias returns undefined for unaliased commands', () => {
            expect(commandRegistry.getAlias('nonexistent')).to.be.undefined;
        });

        it('later registerAlias overwrites previous alias for the same target', async () => {
            commandRegistry.registerCommand({ id: 'target' }, new StubCommandHandler());
            commandRegistry.registerAlias('alias1', 'target');
            commandRegistry.registerAlias('alias2', 'target');
            const events: string[] = [];
            commandRegistry.onDidExecuteCommand(e => events.push(e.commandId));
            await commandRegistry.executeCommand('target');
            // Only the last alias registered fires
            expect(events).to.deep.equal(['target', 'alias2']);
        });

        it('alias events include correct args', async () => {
            commandRegistry.registerCommand({ id: 'target' }, new ConcatCommandHandler());
            commandRegistry.registerAlias('alias', 'target');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const capturedArgs: any[][] = [];
            commandRegistry.onDidExecuteCommand(e => capturedArgs.push(e.args));
            await commandRegistry.executeCommand('target', 'x', 'y');
            expect(capturedArgs.length).to.equal(2);
            expect(capturedArgs[0]).to.deep.equal(['x', 'y']);
            expect(capturedArgs[1]).to.deep.equal(['x', 'y']);
        });

        it('nested execution: alias handler delegating to target fires target and alias events', async () => {
            commandRegistry.registerCommand({ id: 'target' }, new StubCommandHandler());
            commandRegistry.registerCommand({ id: 'alias' }, {
                execute: () => commandRegistry.executeCommand('target')
            });
            commandRegistry.registerAlias('alias', 'target');
            const events: string[] = [];
            commandRegistry.onDidExecuteCommand(e => events.push(e.commandId));
            await commandRegistry.executeCommand('alias');
            // Inner executeCommand('target') fires: 'target', then alias 'alias'
            // Outer executeCommand('alias') fires: 'alias' only (no reverse alias)
            expect(events).to.deep.equal(['target', 'alias', 'alias']);
        });

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
    execute(...args: string[]): undefined { return undefined; }
}

class NeverActiveStubCommandHandler extends StubCommandHandler {
    isEnabled(): boolean { return false; }
}
