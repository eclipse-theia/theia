// *****************************************************************************
// Copyright (C) 2026 JuliaHub and others.
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

import { enableJSDOM } from './test/jsdom.js';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from './frontend-application-config-provider.js';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Container } from 'inversify';
import { Disposable, Emitter } from '../common/index.js';
import { CommandRegistry } from '../common/command.js';
import { MenuModelRegistry } from '../common/menu/index.js';
import { ViewContainer, ViewContainerIdentifier } from './view-container.js';
import { FrontendApplicationStateService } from './frontend-application-state.js';
import { ContextMenuRenderer } from './context-menu-renderer.js';
import { WidgetManager } from './widget-manager.js';
import { SplitPositionHandler } from './shell/split-panels.js';
import { TabBarToolbarRegistry } from './shell/tab-bar-toolbar/tab-bar-toolbar-registry.js';
import { TabBarToolbarFactory } from './shell/tab-bar-toolbar/tab-bar-toolbar.js';
import { ProgressBarFactory } from './progress-bar-factory.js';
import { ApplicationShell } from './shell/application-shell.js';
import { TabBarDecoratorService } from './shell/tab-bar-decorator.js';
import { ContextKeyService } from './context-key-service.js';
import { KeybindingRegistry } from './keybinding.js';
import { Panel, Widget } from './widgets/index.js';
import { timeout } from '../common/promise-util.js';

disableJSDOM();

describe('ViewContainer', () => {

    let container: ViewContainer;
    let appliedSizes: (number | undefined)[][];
    let sidePanel: Panel | undefined;
    let displayedHeight: number;
    let sizedAt: number[];

    function createViewContainer(): ViewContainer {
        const child = new Container({ defaultScope: 'Singleton' });
        child.bind(ViewContainer).toSelf();
        child.bind(ViewContainerIdentifier).toConstantValue({ id: 'test-container' });
        child.bind(FrontendApplicationStateService).toConstantValue({ state: 'ready' } as unknown as FrontendApplicationStateService);
        child.bind(ContextMenuRenderer).toConstantValue({} as ContextMenuRenderer);
        child.bind(CommandRegistry).toConstantValue({ registerCommand: () => Disposable.NULL, unregisterCommand: () => { } } as unknown as CommandRegistry);
        child.bind(MenuModelRegistry).toConstantValue({
            registerMenuAction: () => Disposable.NULL,
            unregisterMenuAction: () => { }
        } as unknown as MenuModelRegistry);
        child.bind(WidgetManager).toConstantValue({ getDescription: () => undefined } as unknown as WidgetManager);
        child.bind(SplitPositionHandler).toConstantValue({ setSplitHandlePosition: async () => 0 } as unknown as SplitPositionHandler);
        child.bind(TabBarToolbarRegistry).toConstantValue({ onDidChange: new Emitter<void>().event } as unknown as TabBarToolbarRegistry);
        child.bind(TabBarToolbarFactory).toConstantValue(() => Object.assign(new Widget(), {
            updateTarget: () => { },
            shouldHandleMouseEvent: () => false
        }));
        child.bind(ProgressBarFactory).toConstantValue(() => Disposable.NULL);
        child.bind(ApplicationShell).toConstantValue({} as ApplicationShell);
        child.bind(TabBarDecoratorService).toConstantValue({ fireDidChangeDecorations: () => { } } as unknown as TabBarDecoratorService);
        child.bind(ContextKeyService).toConstantValue({} as ContextKeyService);
        child.bind(KeybindingRegistry).toConstantValue({} as KeybindingRegistry);
        return child.get(ViewContainer);
    }

    function createWidget(id: string): Widget {
        const widget = new Widget();
        widget.id = id;
        widget.title.label = id;
        return widget;
    }

    async function reveal(): Promise<void> {
        Widget.attach(container, document.body);
        await timeout(0);
    }

    function attachToHiddenSidePanel(): void {
        sidePanel = new Panel();
        sidePanel.hide();
        sidePanel.addWidget(container);
        Widget.attach(sidePanel, document.body);
    }

    function addRestoredParts(): void {
        const first = createWidget('first');
        const second = createWidget('second');
        container.addWidget(first);
        container.addWidget(second);
        container.restoreState({
            parts: [
                { widget: first, partId: 'first', collapsed: false, hidden: false, relativeSize: 0.25, originalContainerId: 'test-container' },
                { widget: second, partId: 'second', collapsed: false, hidden: false, relativeSize: 0.75, originalContainerId: 'test-container' }
            ]
        });
    }

    before(() => {
        // jsdom has no animation frames.
        globalThis.requestAnimationFrame = callback => setTimeout(() => callback(Date.now())) as unknown as number;
    });

    after(() => {
        delete (globalThis as Partial<typeof globalThis>).requestAnimationFrame;
    });

    beforeEach(() => {
        disableJSDOM = enableJSDOM();
        container = createViewContainer();
        appliedSizes = [];
        sizedAt = [];
        displayedHeight = 400;
        const setPartSizes = container.containerLayout.setPartSizes.bind(container.containerLayout);
        container.containerLayout.setPartSizes = (weights: (number | undefined)[]) => {
            const applied = setPartSizes(weights);
            if (applied) {
                appliedSizes.push(weights);
                sizedAt.push(displayedHeight);
            }
            return applied;
        };
        // jsdom does no layout; a container that is not displayed has no size, as in a browser.
        Object.defineProperty(container.containerLayout.parent!.node, 'offsetHeight', { get: () => container.isVisible ? displayedHeight : 0 });
    });

    afterEach(() => {
        sidePanel?.dispose();
        sidePanel = undefined;
        container.dispose();
        disableJSDOM();
    });

    it('sizes its parts by their weights once it is revealed', async () => {
        container.addWidget(createWidget('first'), { weight: 2 });
        container.addWidget(createWidget('second'), { weight: 1 });

        await reveal();
        container.addWidget(createWidget('third'), { weight: 1 });
        await timeout(0);

        expect(appliedSizes).to.deep.equal([[2, 1]]);
    });

    it('keeps the sizes set on its first reveal when a part with a weight is dropped in later', async () => {
        container.addWidget(createWidget('first'));
        await reveal();

        container.addWidget(createWidget('dropped'), { weight: 2 });
        await timeout(0);

        expect(appliedSizes).to.deep.equal([[undefined]]);
    });

    it('sizes its parts when a side panel that was not displayed at attach is shown', async () => {
        attachToHiddenSidePanel();
        container.addWidget(createWidget('small'), { weight: 1 });
        container.addWidget(createWidget('large'), { weight: 3 });
        await timeout(0);

        sidePanel!.show();
        await timeout(0);

        expect(appliedSizes).to.deep.equal([[1, 3]]);
    });

    it('sizes its parts at the size the side panel is laid out to, not the size it is shown with', async () => {
        attachToHiddenSidePanel();
        container.addWidget(createWidget('small'), { weight: 1 });
        container.addWidget(createWidget('large'), { weight: 3 });
        displayedHeight = 100;

        sidePanel!.show();
        displayedHeight = 400;
        await timeout(0);

        expect(sizedAt).to.deep.equal([400]);
        expect(appliedSizes).to.deep.equal([[1, 3]]);
    });

    it('restores the part sizes when a side panel that was not displayed at attach is shown', async () => {
        attachToHiddenSidePanel();
        addRestoredParts();
        await timeout(0);

        sidePanel!.show();
        await timeout(0);

        expect(appliedSizes).to.deep.equal([[0.25, 0.75]]);
    });

    it('keeps the sizes of a restored layout when a part with a weight is added', async () => {
        addRestoredParts();

        container.addWidget(createWidget('third'), { weight: 2 });
        await reveal();

        expect(appliedSizes).to.deep.equal([[0.25, 0.75]]);
    });

});
