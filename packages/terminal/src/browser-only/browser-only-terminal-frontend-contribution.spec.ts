// *****************************************************************************
// Copyright (C) 2026 robertjndw
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
// `ApplicationShell`, `ConfirmDialog` and `FileService` transitively import browser modules
// that touch `document` at load time.
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
// `WorkspaceService` transitively reads the frontend application config at module load time.
FrontendApplicationConfigProvider.set({});

// `xterm` probes for a canvas 2d context when it is loaded, which JSDOM does not implement and
// loudly reports. Nothing under test renders, so an inert stub is enough to keep the output clean.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window.HTMLCanvasElement.prototype as any).getContext = () => undefined;

import { expect } from 'chai';
import { Container, ContainerModule } from '@theia/core/shared/inversify';
import { ContributionProvider, Event, ILogger, MessageService, SelectionService } from '@theia/core';
import { ApplicationShell, LabelProvider, StorageService, WidgetManager } from '@theia/core/lib/browser';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { PreferenceService } from '@theia/core/lib/common';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { VariableResolverService } from '@theia/variable-resolver/lib/browser';
import { TerminalService } from '../browser/base/terminal-service';
import { TerminalFrontendContribution } from '../browser/terminal-frontend-contribution';
import { TerminalWatcher } from '../common/terminal-watcher';
import { ShellTerminalServerProxy } from '../common/shell-terminal-protocol';
import { TerminalPreferences } from '../common/terminal-preferences';
import { TerminalCopyOnSelectionHandler } from '../browser/terminal-copy-on-selection-handler';
import { TerminalCreationHandler } from '../browser/terminal-creation-handler';
import { ContributedTerminalProfileStore, TerminalProfileService, UserTerminalProfileStore } from '../browser/terminal-profile-service';
import { BrowserOnlyTerminalFrontendContribution } from './browser-only-terminal-frontend-contribution';

disableJSDOM();

/**
 * `TerminalFrontendContribution` (and hence its browser-only subclass) has many injected
 * dependencies, most of which are never touched by the browser-only overrides under test here.
 * Only `@postConstruct() init()` reaches into a handful of them (`shell`, `widgetManager`,
 * `contextKeyService`, `terminalWatcher`) - those get working fakes, everything else gets an
 * inert placeholder just to satisfy the injector.
 */
function bindTerminalTestDependencies(container: Container, onError: (message: string) => void = () => { /* no-op */ }): void {
    const inert = <T>(): T => ({} as unknown as T);

    container.bind(ApplicationShell).toConstantValue({
        activeWidget: undefined,
        onDidChangeCurrentWidget: Event.None,
        onDidChangeActiveWidget: Event.None
    } as unknown as ApplicationShell);
    container.bind(WidgetManager).toConstantValue({ onDidCreateWidget: Event.None } as unknown as WidgetManager);
    container.bind(ContextKeyService).toConstantValue({ createKey: () => ({ set: () => { /* no-op */ } }) } as unknown as ContextKeyService);
    container.bind(TerminalWatcher).toConstantValue({
        onStoreTerminalEnvVariablesRequested: Event.None,
        onUpdateTerminalEnvVariablesRequested: Event.None
    } as unknown as TerminalWatcher);
    container.bind(MessageService).toConstantValue({
        error: (message: string) => { onError(message); return Promise.resolve(undefined); }
    } as unknown as MessageService);
    container.bind(ILogger).toConstantValue(new MockLogger() as unknown as ILogger);
    container.bind(ContributionProvider).toConstantValue({ getContributions: () => [] }).whenTargetNamed(TerminalCreationHandler);

    container.bind(ShellTerminalServerProxy).toConstantValue(inert());
    container.bind(FileService).toConstantValue(inert());
    container.bind(SelectionService).toConstantValue(inert());
    container.bind(LabelProvider).toConstantValue(inert());
    container.bind(WorkspaceService).toConstantValue(inert());
    container.bind(TerminalProfileService).toConstantValue(inert());
    container.bind(UserTerminalProfileStore).toConstantValue(inert());
    container.bind(ContributedTerminalProfileStore).toConstantValue(inert());
    container.bind(VariableResolverService).toConstantValue(inert());
    container.bind(StorageService).toConstantValue(inert());
    container.bind(PreferenceService).toConstantValue(inert());
    container.bind(TerminalPreferences).toConstantValue(inert());
    container.bind(TerminalCopyOnSelectionHandler).toConstantValue(inert());
    container.bind(ClipboardService).toConstantValue(inert());
}

describe('BrowserOnlyTerminalFrontendContribution', () => {

    /** Records every message reported through `MessageService.error`. */
    let errorMessages: string[];

    let contribution: BrowserOnlyTerminalFrontendContribution;

    beforeEach(() => {
        errorMessages = [];

        const container = new Container();
        container.bind(BrowserOnlyTerminalFrontendContribution).toSelf().inSingletonScope();
        container.bind(TerminalService).toService(BrowserOnlyTerminalFrontendContribution);
        bindTerminalTestDependencies(container, message => errorMessages.push(message));

        contribution = container.get(BrowserOnlyTerminalFrontendContribution);
    });

    it('rejects programmatic terminal creation instead of returning a dead widget', async () => {
        try {
            await contribution.newTerminal({});
            expect.fail('newTerminal() should have rejected');
        } catch (error) {
            expect((error as Error).message).to.equal('Terminals are not supported in a browser-only application.');
        }
    });

    it('resolves the default shell to an empty string without touching the (nonexistent) backend', async () => {
        // `shellTerminalServer` is bound to an inert placeholder above: reaching for it would throw.
        const shell = await contribution.getDefaultShell();
        expect(shell).to.equal('');
    });

    it('reports the limitation and creates no widget when opening a terminal from the UI', async () => {
        // `openTerminal` is the entry point for the "Create New Terminal" command and the
        // profile quick-pick; `widgetManager` is left as an inert placeholder above, so a
        // widget-creating code path would throw here rather than quietly succeed.
        await (contribution as unknown as { openTerminal(): Promise<void> }).openTerminal();

        expect(errorMessages).to.deep.equal(['Terminals are not supported in a browser-only application.']);
    });

    it('reports the limitation when opening a terminal for the active workspace', async () => {
        await (contribution as unknown as { openActiveWorkspaceTerminal(): Promise<void> }).openActiveWorkspaceTerminal();

        expect(errorMessages).to.deep.equal(['Terminals are not supported in a browser-only application.']);
    });

    it('reports the limitation when opening a terminal from a file/folder context menu', async () => {
        await contribution.openInTerminal({ toString: () => 'file:///workspace' } as unknown as Parameters<TerminalFrontendContribution['openInTerminal']>[0]);

        expect(errorMessages).to.deep.equal(['Terminals are not supported in a browser-only application.']);
    });

    it('does not attempt to create or restore a terminal at startup', async () => {
        // The base implementation calls `newTerminal` and logs an error when it fails; the
        // browser-only override must skip that attempt entirely so no such error is logged.
        await contribution.initializeLayout();

        expect(errorMessages).to.be.empty;
    });

    it('rebinding TerminalFrontendContribution redirects every toService(TerminalFrontendContribution) binding', () => {
        // Mirrors how `terminal-frontend-module.ts` binds `TerminalService` and other contribution
        // points via `toService(TerminalFrontendContribution)`, and how `terminal-frontend-only-module.ts`
        // rebinds `TerminalFrontendContribution` itself so that every one of those lazily-resolved
        // bindings is redirected to the browser-only implementation - not just `TerminalService`.
        const module = new ContainerModule((bind, unbind, isBound, rebind) => {
            bind(TerminalFrontendContribution).toSelf().inSingletonScope();
            bind(TerminalService).toService(TerminalFrontendContribution);
        });
        const browserOnlyModule = new ContainerModule((bind, unbind, isBound, rebind) => {
            rebind(TerminalFrontendContribution).to(BrowserOnlyTerminalFrontendContribution).inSingletonScope();
        });

        const container = new Container();
        container.load(module);
        bindTerminalTestDependencies(container);

        // simulates `terminal-frontend-only-module.ts` loading after `terminal-frontend-module.ts`
        container.load(browserOnlyModule);

        const resolved = container.get(TerminalService);
        expect(resolved).to.be.instanceOf(BrowserOnlyTerminalFrontendContribution);
    });
});
