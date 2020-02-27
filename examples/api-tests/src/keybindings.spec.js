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
    const { TerminalService } = require('@theia/terminal/lib/browser/base/terminal-service');
    const { TerminalCommands } = require('@theia/terminal/lib/browser/terminal-frontend-contribution');
    const { ApplicationShell } = require('@theia/core/lib/browser/shell/application-shell');
    const { KeybindingRegistry } = require('@theia/core/lib/browser/keybinding');
    const { CommandRegistry } = require('@theia/core/lib/common/command');
    const { Deferred } = require('@theia/core/lib/common/promise-util');
    const { Key } = require('@theia/core/lib/browser/keys');
    const { EditorManager } = require('@theia/editor/lib/browser/editor-manager');
    const Uri = require('@theia/core/lib/common/uri');
    const { WorkspaceService } = require('@theia/workspace/lib/browser/workspace-service');
    const { MonacoEditor } = require('@theia/monaco/lib/browser/monaco-editor');

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
            metaKey: true,
            ctrlKey: true
        }, terminal.node);
        const executedCommand = await waitForCommand.promise;
        assert.equal(executedCommand, TerminalCommands.TERMINAL_CLEAR.id);
    });

    it("disabled keybinding should not override enabled", async () => {
        const id = '__test:keybindings.left';
        toTearDown.push(commands.registerCommand({ id }, {
            execute: () => { }
        }));
        toTearDown.push(keybindings.registerKeybinding({
            command: '__test:keybindings.left',
            keybinding: 'left',
            when: 'false'
        }, true));

        const editor = await editorManager.open(new Uri.default(workspaceService.tryGetRoots()[0].uri).resolve('package.json'), {
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

});
