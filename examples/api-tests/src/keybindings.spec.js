/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

// @ts-check
describe('Keybindings', function () {

    const { assert } = chai;

    const { Disposable, DisposableCollection } = require('@theia/core/lib/common/disposable');
    const { isOSX } = require('@theia/core/lib/common/os');
    const { CommonCommands } = require('@theia/core/lib/browser/common-frontend-contribution');
    const { TerminalService } = require('@theia/terminal/lib/browser/base/terminal-service');
    const { TerminalCommands } = require('@theia/terminal/lib/browser/terminal-frontend-contribution');
    const { ApplicationShell } = require('@theia/core/lib/browser/shell/application-shell');
    const { KeybindingRegistry } = require('@theia/core/lib/browser/keybinding');
    const { CommandRegistry } = require('@theia/core/lib/common/command');
    const { Deferred } = require('@theia/core/lib/common/promise-util');
    const { Key } = require('@theia/core/lib/browser/keys');
    const { EditorManager } = require('@theia/editor/lib/browser/editor-manager');
    const { WorkspaceService } = require('@theia/workspace/lib/browser/workspace-service');

    /** @type {import('inversify').Container} */
    const container = window['theia'].container;
    /** @type {import('@theia/terminal/lib/browser/base/terminal-service').TerminalService} */
    const terminalService = container.get(TerminalService);
    const applicationShell = container.get(ApplicationShell);
    const keybindings = container.get(KeybindingRegistry);
    const commands = container.get(CommandRegistry);
    const editorManager = container.get(EditorManager);
    const workspaceService = container.get(WorkspaceService);

    const toTearDown = new DisposableCollection();
    afterEach(() => toTearDown.dispose());

    it('partial keybinding should not override full in the same scope', async () => {
        const terminal = /** @type {import('@theia/terminal/lib/browser/terminal-widget-impl').TerminalWidgetImpl} */
            (await terminalService.newTerminal({}));
        toTearDown.push(Disposable.create(() => terminal.dispose()));
        terminalService.open(terminal, { mode: 'activate' });
        await applicationShell.waitForActivation(terminal.id);
        const waitForCommand = new Deferred();
        toTearDown.push(commands.onWillExecuteCommand(e => waitForCommand.resolve(e.commandId)));
        keybindings.dispatchKeyDown({
            code: Key.KEY_K.code,
            metaKey: isOSX,
            ctrlKey: !isOSX
        }, terminal.node);
        const executedCommand = await waitForCommand.promise;
        assert.equal(executedCommand, TerminalCommands.TERMINAL_CLEAR.id);
    });

    it('disabled keybinding should not override enabled', async () => {
        const id = '__test:keybindings.left';
        toTearDown.push(commands.registerCommand({ id }, {
            execute: () => { }
        }));
        toTearDown.push(keybindings.registerKeybinding({
            command: id,
            keybinding: 'left',
            when: 'false'
        }));

        const editor = await editorManager.open(workspaceService.tryGetRoots()[0].resource.resolve('package.json'), {
            mode: 'activate',
            selection: {
                start: {
                    line: 0,
                    character: 1
                }
            }
        });
        toTearDown.push(editor);

        const waitForCommand = new Deferred();
        toTearDown.push(commands.onWillExecuteCommand(e => waitForCommand.resolve(e.commandId)));
        keybindings.dispatchKeyDown({
            code: Key.ARROW_LEFT.code
        }, editor.node);
        const executedCommand = await waitForCommand.promise;
        assert.notEqual(executedCommand, id);
    });

    it('later registered keybinding should has higher priority', async () => {
        const id = '__test:keybindings.copy';
        toTearDown.push(commands.registerCommand({ id }, {
            execute: () => { }
        }));
        const keybiding = keybindings.getKeybindingsForCommand(CommonCommands.COPY.id)[0];
        toTearDown.push(keybindings.registerKeybinding({
            command: id,
            keybinding: keybiding.keybinding
        }));
        const waitForCommand = new Deferred();
        toTearDown.push(commands.onWillExecuteCommand(e => waitForCommand.resolve(e.commandId)));
        keybindings.dispatchKeyDown({
            code: Key.KEY_C.code,
            metaKey: isOSX,
            ctrlKey: !isOSX
        });
        const executedCommand = await waitForCommand.promise;
        assert.equal(executedCommand, id);
    });

});
