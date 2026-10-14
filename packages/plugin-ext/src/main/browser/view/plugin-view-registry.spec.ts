// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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
// PluginViewRegistry transitively imports browser widgets (Lumino) that touch `document` at load time.
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
// Some transitively imported modules read the frontend config at load time.
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Command, Disposable } from '@theia/core/lib/common';
import { PluginViewRegistry, ViewContainerInfo, PLUGIN_VIEW_DATA_FACTORY_ID } from './plugin-view-registry';
import { PluginViewType, ViewWelcome } from '../../../common';

disableJSDOM();

interface RegisteredMenuAction {
    commandId: string;
    label: string;
    when?: string;
}

/**
 * Minimal stand-in for {@link MenuModelRegistry} that records the menu actions registered for the
 * "Views" menu and removes them again when the returned disposable is disposed. This lets us assert
 * on the labels {@link PluginViewRegistry} ends up showing without wiring the full DI container.
 */
class RecordingMenuModelRegistry {
    readonly actions = new Map<string, RegisteredMenuAction>();

    registerMenuAction(_menuPath: unknown, action: RegisteredMenuAction): Disposable {
        this.actions.set(action.commandId, { ...action });
        return Disposable.create(() => this.actions.delete(action.commandId));
    }
}

describe('PluginViewRegistry - view menu labels', () => {

    let registry: PluginViewRegistry;
    let menus: RecordingMenuModelRegistry;

    const internals = (): {
        viewContainers: Map<string, ViewContainerInfo>;
        registerViewMenuAction(containerId: string, label: string): Disposable;
    } => registry as unknown as {
        viewContainers: Map<string, ViewContainerInfo>;
        registerViewMenuAction(containerId: string, label: string): Disposable;
    };

    function registerContainer(id: string, label: string, location: string): Disposable {
        internals().viewContainers.set(id, { id, location, options: { label }, onViewAdded: () => { } });
        return internals().registerViewMenuAction(id, label);
    }

    beforeEach(() => {
        registry = new PluginViewRegistry();
        menus = new RecordingMenuModelRegistry();
        (registry as unknown as { menus: unknown }).menus = menus;
    });

    it('uses the plain label for a single container', () => {
        registerContainer('a', 'Claude Code', 'left');
        expect(menus.actions.get('a')?.label).to.equal('Claude Code');
    });

    it('leaves distinct labels unsuffixed', () => {
        registerContainer('a', 'Explorer', 'left');
        registerContainer('b', 'Claude Code', 'right');
        expect(menus.actions.get('a')?.label).to.equal('Explorer');
        expect(menus.actions.get('b')?.label).to.equal('Claude Code');
    });

    it('suffixes the location when two containers share a label', () => {
        registerContainer('a', 'Claude Code', 'left');
        registerContainer('b', 'Claude Code', 'right');
        expect(menus.actions.get('a')?.label).to.equal('Claude Code (Side Bar)');
        expect(menus.actions.get('b')?.label).to.equal('Claude Code (Secondary Side Bar)');
    });

    it('drops the suffix from the remaining container once the duplicate is removed', () => {
        registerContainer('a', 'Claude Code', 'left');
        const disposeB = registerContainer('b', 'Claude Code', 'right');

        disposeB.dispose();

        expect(menus.actions.get('a')?.label).to.equal('Claude Code');
        expect(menus.actions.has('b')).to.equal(false);
    });

});

const welcome = (view: string): ViewWelcome => ({ view, content: `[Hi](command:${view}.hi)`, order: 0 });

describe('PluginViewRegistry - welcome-only views', () => {

    interface FakeTreeViewWidget {
        model: { root?: unknown };
        welcomeArg?: ViewWelcome[];
        handleViewWelcomeContentChange(welcomes: ViewWelcome[]): void;
    }

    let registry: PluginViewRegistry;
    let createdWidget: FakeTreeViewWidget;
    let getOrCreateCalls: Array<{ factoryId: string; options: unknown }>;

    const internals = (): {
        views: Map<string, [string, { type?: unknown }]>;
        viewDataProviders: Map<string, unknown>;
        viewsWelcome: Map<string, ViewWelcome[]>;
        createViewDataWidget(viewId: string): Promise<unknown>;
    } => registry as unknown as {
        views: Map<string, [string, { type?: unknown }]>;
        viewDataProviders: Map<string, unknown>;
        viewsWelcome: Map<string, ViewWelcome[]>;
        createViewDataWidget(viewId: string): Promise<unknown>;
    };

    beforeEach(() => {
        registry = new PluginViewRegistry();
        getOrCreateCalls = [];
        createdWidget = {
            model: {},
            handleViewWelcomeContentChange(welcomes: ViewWelcome[]): void {
                this.welcomeArg = welcomes;
            }
        };
        (registry as unknown as { widgetManager: unknown }).widgetManager = {
            getOrCreateWidget: async (factoryId: string, options: unknown) => {
                getOrCreateCalls.push({ factoryId, options });
                return createdWidget;
            }
        };
        internals().views.set('actions', ['container', {}]);
    });

    it('creates a welcome widget for a view with welcomes but no data provider', async () => {
        const welcomes = [welcome('actions')];
        internals().viewsWelcome.set('actions', welcomes);

        const widget = await internals().createViewDataWidget('actions');

        expect(widget).to.equal(createdWidget);
        expect(getOrCreateCalls).to.have.lengthOf(1);
        expect(getOrCreateCalls[0].factoryId).to.equal(PLUGIN_VIEW_DATA_FACTORY_ID);
        expect(getOrCreateCalls[0].options).to.deep.equal({ id: 'actions' });
        expect(createdWidget.welcomeArg).to.equal(welcomes);
        expect(createdWidget.model.root).to.not.equal(undefined);
    });

    it('returns undefined for a view with neither a provider nor welcomes', async () => {
        const widget = await internals().createViewDataWidget('actions');

        expect(widget).to.equal(undefined);
        expect(getOrCreateCalls).to.have.lengthOf(0);
    });

});

describe('PluginViewRegistry - welcome-only views on expand', () => {

    const noop = () => Disposable.NULL;

    let registry: PluginViewRegistry;
    let view: { widgets: unknown[] };
    let prepared: unknown[];

    const internals = (): {
        views: Map<string, [string, { type?: unknown }]>;
        viewDataProviders: Map<string, unknown>;
        viewsWelcome: Map<string, ViewWelcome[]>;
        onDidExpandViewEmitter: { fire(viewId: string): void };
        init(): void;
    } => registry as unknown as {
        views: Map<string, [string, { type?: unknown }]>;
        viewDataProviders: Map<string, unknown>;
        viewsWelcome: Map<string, ViewWelcome[]>;
        onDidExpandViewEmitter: { fire(viewId: string): void };
        init(): void;
    };

    async function expand(viewId: string): Promise<void> {
        internals().onDidExpandViewEmitter.fire(viewId);
        await new Promise(resolve => setTimeout(resolve));
    }

    beforeEach(() => {
        registry = new PluginViewRegistry();
        view = { widgets: [] };
        prepared = [];
        Object.assign(registry, {
            shell: { activeWidget: undefined, onDidChangeActiveWidget: noop, initialized: new Promise(() => { }) },
            viewContextKeys: { focusedView: { reset: () => { } } },
            contextKeyService: { onDidChange: noop },
            widgetManager: { onWillCreateWidget: noop, onDidCreateWidget: noop, getWidget: async () => view },
            prepareView: async (widget: unknown) => { prepared.push(widget); }
        });
        internals().init();
        internals().views.set('actions', ['container', {}]);
        internals().viewsWelcome.set('actions', [welcome('actions')]);
    });

    it('prepares an empty welcome-only view when it is expanded, as after restoring a saved layout', async () => {
        await expand('actions');

        expect(prepared).to.deep.equal([view]);
    });

    it('leaves a view with a data provider to the provider', async () => {
        internals().viewDataProviders.set('actions', () => undefined);

        await expand('actions');

        expect(prepared).to.have.lengthOf(0);
    });

    it('leaves a view that already has content alone', async () => {
        view.widgets.push({});

        await expand('actions');

        expect(prepared).to.have.lengthOf(0);
    });

    it('leaves a view without welcomes alone', async () => {
        internals().viewsWelcome.delete('actions');

        await expand('actions');

        expect(prepared).to.have.lengthOf(0);
    });

    it('leaves a webview view alone', async () => {
        internals().views.set('actions', ['container', { type: PluginViewType.Webview }]);

        await expand('actions');

        expect(prepared).to.have.lengthOf(0);
    });

});

describe('PluginViewRegistry - prepareView', () => {

    interface FakeViewWidget {
        options: { viewId: string };
        title: { label: string };
        widgets: unknown[];
        isDisposed: boolean;
        addWidget(widget: unknown): void;
    }

    let registry: PluginViewRegistry;
    let view: FakeViewWidget;
    let dataWidget: { isDisposed: boolean; dispose(): void };

    beforeEach(() => {
        registry = new PluginViewRegistry();
        view = {
            options: { viewId: 'actions' },
            title: { label: '' },
            widgets: [],
            isDisposed: false,
            addWidget(widget: unknown): void {
                this.widgets.push(widget);
            }
        };
        dataWidget = { isDisposed: false, dispose: () => { } };
        (registry as unknown as { views: Map<string, unknown> }).views.set('actions', ['container', { id: 'actions', name: 'Actions' }]);
        (registry as unknown as { createViewDataWidget: unknown }).createViewDataWidget = async () => dataWidget;
    });

    const prepareView = (): Promise<void> => (registry as unknown as { prepareView(widget: FakeViewWidget): Promise<void> }).prepareView(view);

    it('adds the created data widget to the view', async () => {
        await prepareView();

        expect(view.widgets).to.deep.equal([dataWidget]);
    });

    it('leaves the view empty when its data widget was disposed before it could be added', async () => {
        dataWidget.isDisposed = true;

        await prepareView();

        expect(view.widgets).to.have.lengthOf(0);
    });

});

describe('PluginViewRegistry - VS Code view commands', () => {

    let registry: PluginViewRegistry;
    let commands: Map<string, Command>;

    const internals = (): {
        doRegisterViewContainer(id: string, location: string, options: { label: string }): Disposable;
    } => registry as unknown as {
        doRegisterViewContainer(id: string, location: string, options: { label: string }): Disposable;
    };

    beforeEach(() => {
        registry = new PluginViewRegistry();
        commands = new Map();
        (registry as unknown as { commands: unknown }).commands = {
            registerCommand: (command: Command) => {
                commands.set(command.id, command);
                return Disposable.create(() => commands.delete(command.id));
            }
        };
        (registry as unknown as { menus: unknown }).menus = new RecordingMenuModelRegistry();
        (registry as unknown as { quickView: unknown }).quickView = { registerItem: () => Disposable.NULL };
    });

    it('registers the container id and the view focus and open commands once a view is added', () => {
        const containerId = 'workbench.view.extension.sample';
        internals().doRegisterViewContainer(containerId, 'left', { label: 'Sample' });
        expect(commands.has(containerId)).to.equal(false);

        const disposeView = registry.registerView('sample', { id: 'sample.view', name: 'Sample View' });

        expect(commands.get(containerId)).to.include({ label: 'Toggle Sample', category: 'View' });
        expect(commands.get('plugin.view-container.workbench.view.extension.sample.toggle')?.label).to.equal(undefined);
        expect(commands.get('sample.view.focus')).to.include({ label: 'Focus on Sample View View', category: 'Sample' });
        expect(commands.has('sample.view.open')).to.equal(true);

        disposeView.dispose();
        expect(commands.has('sample.view.focus')).to.equal(false);
        expect(commands.has('sample.view.open')).to.equal(false);
    });

});
