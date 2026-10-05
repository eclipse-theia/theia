// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { enableJSDOM } from '../test/jsdom';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '../frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import * as chai from 'chai';
import { Container } from 'inversify';
import { CancellationToken, CommandRegistry, Emitter } from '../../common';
import { CorePreferences } from '../../common/core-preferences';
import { ContextKeyService, ContextKeyServiceDummyImpl } from '../context-key-service';
import { KeybindingRegistry } from '../keybinding';
import { QuickAccessRegistry } from './quick-access';
import { QuickCommandService } from './quick-command-service';
import { QuickInputService, QuickPickItem } from './quick-input-service';

disableJSDOM();

const expect = chai.expect;

class RecordingContextKeyService extends ContextKeyServiceDummyImpl {
    activeContext: unknown;

    override withContext<T>(context: unknown, callback: () => T): T {
        const previous = this.activeContext;
        this.activeContext = context;
        try {
            return callback();
        } finally {
            this.activeContext = previous;
        }
    }
}

describe('quick-command-service', () => {

    let editor: HTMLElement;
    let quickInput: HTMLInputElement;
    let contextKeyService: RecordingContextKeyService;
    let commandRegistry: CommandRegistry;
    let onHideEmitter: Emitter<void>;
    let quickInputService: { previousFocusElement?: HTMLElement, onHide: Emitter<void>['event'] };
    let service: QuickCommandService;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        editor = document.createElement('div');
        editor.tabIndex = 0;
        quickInput = document.createElement('input');
        document.body.append(editor, quickInput);
        // Focus has moved to the quick input, as it does while the palette is open.
        quickInput.focus();

        contextKeyService = new RecordingContextKeyService();
        commandRegistry = new CommandRegistry({ getContributions: () => [] });
        onHideEmitter = new Emitter<void>();
        quickInputService = { previousFocusElement: editor, onHide: onHideEmitter.event };

        const container = new Container();
        container.bind(ContextKeyService).toConstantValue(contextKeyService);
        container.bind(CommandRegistry).toConstantValue(commandRegistry);
        container.bind(CorePreferences).toConstantValue(<CorePreferences>{ 'workbench.commandPalette.history': 50 });
        container.bind(QuickAccessRegistry).toConstantValue(<QuickAccessRegistry>{});
        container.bind(KeybindingRegistry).toConstantValue(<KeybindingRegistry><unknown>{ getKeybindingsForCommand: () => [] });
        container.bind(QuickInputService).toConstantValue(<QuickInputService><unknown>quickInputService);
        container.bind(QuickCommandService).toSelf();
        service = container.get(QuickCommandService);
    });

    afterEach(() => {
        editor.remove();
        quickInput.remove();
        onHideEmitter.dispose();
    });

    function inEditorContext(): boolean {
        return contextKeyService.activeContext === editor;
    }

    function picks(): QuickPickItem[] {
        return service.getPicks('', CancellationToken.None).filter((pick): pick is QuickPickItem => pick.type !== 'separator');
    }

    it('evaluates command enablement against the element focused before the quick input opened', () => {
        commandRegistry.registerCommand({ id: 'test.editorOnly', label: 'Editor Only' }, { execute: () => { }, isEnabled: inEditorContext });

        expect(picks().map(pick => pick.label)).to.deep.equal(['Editor Only']);
    });

    it('evaluates item state against the element focused before the quick input opened', () => {
        commandRegistry.registerCommand({ id: 'test.toggle', label: 'Toggle' }, { execute: () => { }, isEnabled: inEditorContext, isToggled: inEditorContext });

        const [item] = picks();
        expect(item.alwaysShow).to.be.true;
        expect(item.iconClasses).to.not.be.undefined;
    });

    it('evaluates pushed command contexts against the element focused before the quick input opened', () => {
        contextKeyService.match = () => inEditorContext();
        commandRegistry.registerCommand({ id: 'test.when', label: 'When' }, { execute: () => { } });
        service.pushCommandContext('test.when', 'editorFocus');

        expect(picks().map(pick => pick.label)).to.deep.equal(['When']);
    });

    it('restores focus to the element focused before the quick input opened on execute', () => {
        commandRegistry.registerCommand({ id: 'test.command', label: 'Command' }, { execute: () => { } });

        picks()[0].execute!();

        expect(document.activeElement).to.equal(editor);
    });

    it('falls back to the active element when items are created without a reset', () => {
        commandRegistry.registerCommand({ id: 'test.command', label: 'Command' }, { execute: () => { } });
        const item = service.toItem({ id: 'test.command', label: 'Command' });
        editor.focus();

        item.execute!();

        expect(document.activeElement).to.equal(quickInput);
    });

    it('forgets the context element when the quick input is hidden', () => {
        commandRegistry.registerCommand({ id: 'test.command', label: 'Command' }, { execute: () => { } });
        service.reset();
        onHideEmitter.fire();

        const item = service.toItem({ id: 'test.command', label: 'Command' });
        editor.focus();
        item.execute!();

        expect(document.activeElement).to.equal(quickInput);
    });

});
