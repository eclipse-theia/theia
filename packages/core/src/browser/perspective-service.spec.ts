// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { enableJSDOM } from './test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import * as sinon from 'sinon';
import { PerspectiveService, PerspectiveDescriptor } from './perspective-service';
import { ApplicationShell } from './shell/application-shell';
import { Widget } from '@lumino/widgets';

disableJSDOM();

describe('PerspectiveService', () => {
    let service: PerspectiveService;
    let addWidgetStub: sinon.SinonStub;
    let activateWidgetStub: sinon.SinonStub;
    let getTabBarForStub: sinon.SinonStub;
    let getAreaForStub: sinon.SinonStub;
    let getOrCreateWidgetStub: sinon.SinonStub;
    let getLayoutDataStub: sinon.SinonStub;
    let setLayoutDataStub: sinon.SinonStub;
    let testWidget: Widget;
    let toTearDown: () => void;

    beforeEach(() => {
        toTearDown = enableJSDOM();
        service = new PerspectiveService();
        testWidget = new Widget();
        testWidget.id = 'test-widget';

        addWidgetStub = sinon.stub().resolves();
        activateWidgetStub = sinon.stub().resolves(undefined);
        getTabBarForStub = sinon.stub().returns(undefined);
        getAreaForStub = sinon.stub().returns(undefined);
        getOrCreateWidgetStub = sinon.stub().resolves(testWidget);
        getLayoutDataStub = sinon.stub().returns({ mainPanel: {}, bottomPanel: {} });
        setLayoutDataStub = sinon.stub().resolves();

        const mockShell = {
            addWidget: addWidgetStub,
            activateWidget: activateWidgetStub,
            getTabBarFor: getTabBarForStub,
            getAreaFor: getAreaForStub,
            getLayoutData: getLayoutDataStub,
            setLayoutData: setLayoutDataStub
        };

        const mockWidgetManager = {
            getOrCreateWidget: getOrCreateWidgetStub
        };

        // Assign mocks via property access since we can't use DI in tests
        (service as unknown as Record<string, unknown>)['shell'] = mockShell;
        (service as unknown as Record<string, unknown>)['widgetManager'] = mockWidgetManager;
    });

    afterEach(() => {
        sinon.restore();
        toTearDown();
    });

    it('should register a perspective', () => {
        const descriptor: PerspectiveDescriptor = {
            id: 'test',
            label: 'Test',
            viewPlacements: new Map([['widget-a', 'main' as ApplicationShell.Area]])
        };

        service.registerPerspective(descriptor);

        const perspectives = service.getRegisteredPerspectives();
        expect(perspectives).to.have.lengthOf(1);
        expect(perspectives[0].id).to.equal('test');
        expect(perspectives[0].label).to.equal('Test');
    });

    it('should register multiple perspectives', () => {
        service.registerPerspective({
            id: 'perspective-1',
            label: 'Perspective 1',
            viewPlacements: new Map()
        });
        service.registerPerspective({
            id: 'perspective-2',
            label: 'Perspective 2',
            viewPlacements: new Map()
        });

        expect(service.getRegisteredPerspectives()).to.have.lengthOf(2);
    });

    it('should return undefined for active perspective when none is set', () => {
        expect(service.getActivePerspective()).to.be.undefined;
    });

    it('should return undefined from getAreaForView when no perspective is active', () => {
        service.registerPerspective({
            id: 'test',
            label: 'Test',
            viewPlacements: new Map([['widget-a', 'main' as ApplicationShell.Area]])
        });

        expect(service.getAreaForView('widget-a')).to.be.undefined;
    });

    it('should return the override area when a perspective is active', async () => {
        service.registerPerspective({
            id: 'test',
            label: 'Test',
            viewPlacements: new Map([['widget-a', 'main' as ApplicationShell.Area]])
        });

        await service.switchPerspective('test');

        expect(service.getAreaForView('widget-a')).to.equal('main');
    });

    it('should return undefined for views not in the perspective placement map', async () => {
        service.registerPerspective({
            id: 'test',
            label: 'Test',
            viewPlacements: new Map([['widget-a', 'main' as ApplicationShell.Area]])
        });

        await service.switchPerspective('test');

        expect(service.getAreaForView('widget-b')).to.be.undefined;
    });

    it('should switch perspectives and update the active perspective', async () => {
        service.registerPerspective({
            id: 'first',
            label: 'First',
            viewPlacements: new Map()
        });
        service.registerPerspective({
            id: 'second',
            label: 'Second',
            viewPlacements: new Map()
        });

        await service.switchPerspective('first');
        expect(service.getActivePerspective()?.id).to.equal('first');

        await service.switchPerspective('second');
        expect(service.getActivePerspective()?.id).to.equal('second');
    });

    it('should fire onDidChangePerspective event when switching', async () => {
        service.registerPerspective({
            id: 'test',
            label: 'Test',
            viewPlacements: new Map()
        });

        const spy = sinon.spy();
        service.onDidChangePerspective(spy);

        await service.switchPerspective('test');

        expect(spy.calledOnce).to.be.true;
        expect(spy.calledWith('test')).to.be.true;
    });

    it('should not switch to a non-existent perspective', async () => {
        const spy = sinon.spy();
        service.onDidChangePerspective(spy);

        await service.switchPerspective('nonexistent');

        expect(spy.called).to.be.false;
        expect(service.getActivePerspective()).to.be.undefined;
    });

    it('should call onDeactivate on old perspective and onActivate on new perspective', async () => {
        const onDeactivate = sinon.spy();
        const onActivate = sinon.spy();

        service.registerPerspective({
            id: 'old',
            label: 'Old',
            viewPlacements: new Map(),
            onDeactivate
        });
        service.registerPerspective({
            id: 'new',
            label: 'New',
            viewPlacements: new Map(),
            onActivate
        });

        await service.switchPerspective('old');
        await service.switchPerspective('new');

        expect(onDeactivate.calledOnce).to.be.true;
        expect(onActivate.calledOnce).to.be.true;
        expect(onDeactivate.calledBefore(onActivate)).to.be.true;
    });

    it('should add widgets to the target area during switch', async () => {
        service.registerPerspective({
            id: 'test',
            label: 'Test',
            viewPlacements: new Map([['test-widget', 'main' as ApplicationShell.Area]])
        });

        await service.switchPerspective('test');

        expect(getOrCreateWidgetStub.calledWith('test-widget')).to.be.true;
        expect(addWidgetStub.calledOnce).to.be.true;
        expect(addWidgetStub.calledWith(testWidget, sinon.match({ area: 'main' }))).to.be.true;
    });

    it('should skip adding widget if already in the correct area', async () => {
        getTabBarForStub.returns({});
        getAreaForStub.returns('main');

        service.registerPerspective({
            id: 'test',
            label: 'Test',
            viewPlacements: new Map([['test-widget', 'main' as ApplicationShell.Area]])
        });

        await service.switchPerspective('test');

        expect(addWidgetStub.called).to.be.false;
    });

    it('should call initialize and register contributions', () => {
        const mockContribution = {
            registerPerspectives: sinon.spy()
        };

        (service as unknown as Record<string, unknown>)['contributions'] = {
            getContributions: () => [mockContribution]
        };

        service.initialize();

        expect(mockContribution.registerPerspectives.calledOnce).to.be.true;
        expect(mockContribution.registerPerspectives.calledWith(service)).to.be.true;
    });

    it('should handle initialize with no contributions', () => {
        (service as unknown as Record<string, unknown>)['contributions'] = undefined;

        expect(() => service.initialize()).to.not.throw();
    });

    // --- New tests for no-op guard, layout save/restore, and default perspective ---

    it('should register the default "Theia IDE" perspective on initialize', () => {
        service.initialize();

        const perspectives = service.getRegisteredPerspectives();
        const defaultPerspective = perspectives.find(p => p.id === PerspectiveService.DEFAULT_PERSPECTIVE_ID);
        expect(defaultPerspective).to.not.be.undefined;
        expect(defaultPerspective!.label).to.equal('Theia IDE');
        expect(defaultPerspective!.viewPlacements.size).to.equal(0);
    });

    it('should set the default perspective as the initial active perspective', () => {
        service.initialize();

        const active = service.getActivePerspective();
        expect(active).to.not.be.undefined;
        expect(active!.id).to.equal(PerspectiveService.DEFAULT_PERSPECTIVE_ID);
    });

    it('should not re-apply when switching to the already-active perspective', async () => {
        service.registerPerspective({
            id: 'test',
            label: 'Test',
            viewPlacements: new Map([['test-widget', 'main' as ApplicationShell.Area]]),
            onActivate: sinon.spy(),
            onDeactivate: sinon.spy()
        });

        await service.switchPerspective('test');

        // Reset all stubs
        addWidgetStub.resetHistory();
        setLayoutDataStub.resetHistory();
        getOrCreateWidgetStub.resetHistory();
        getLayoutDataStub.resetHistory();
        const eventSpy = sinon.spy();
        service.onDidChangePerspective(eventSpy);

        const descriptor = service.getActivePerspective()!;
        const onActivateSpy = descriptor.onActivate as sinon.SinonSpy;
        const onDeactivateSpy = descriptor.onDeactivate as sinon.SinonSpy;
        onActivateSpy.resetHistory();
        onDeactivateSpy.resetHistory();

        // Switch to the same perspective again
        await service.switchPerspective('test');

        expect(addWidgetStub.called).to.be.false;
        expect(setLayoutDataStub.called).to.be.false;
        expect(getOrCreateWidgetStub.called).to.be.false;
        expect(getLayoutDataStub.called).to.be.false;
        expect(eventSpy.called).to.be.false;
        expect(onActivateSpy.called).to.be.false;
        expect(onDeactivateSpy.called).to.be.false;
    });

    it('should save layout when switching away from a perspective', async () => {
        service.registerPerspective({
            id: 'perspA',
            label: 'A',
            viewPlacements: new Map()
        });
        service.registerPerspective({
            id: 'perspB',
            label: 'B',
            viewPlacements: new Map()
        });

        await service.switchPerspective('perspA');

        const layoutA = { mainPanel: { widgets: ['editor1'] }, bottomPanel: {} };
        getLayoutDataStub.returns(layoutA);

        // Switch to B — should save A's layout
        await service.switchPerspective('perspB');

        expect(getLayoutDataStub.called).to.be.true;

        const layoutB = { mainPanel: { widgets: ['something-else'] }, bottomPanel: {} };
        getLayoutDataStub.returns(layoutB);
        setLayoutDataStub.resetHistory();

        // Switch back to A — should restore A's saved layout
        await service.switchPerspective('perspA');

        expect(setLayoutDataStub.calledOnce).to.be.true;
        expect(setLayoutDataStub.calledWith(layoutA)).to.be.true;
    });

    it('should restore saved layout when switching back to a perspective', async () => {
        service.registerPerspective({
            id: 'perspA',
            label: 'A',
            viewPlacements: new Map([['test-widget', 'left' as ApplicationShell.Area]])
        });
        service.registerPerspective({
            id: 'perspB',
            label: 'B',
            viewPlacements: new Map()
        });

        // Activate A (first time — applies viewPlacements)
        await service.switchPerspective('perspA');

        const layoutA = { mainPanel: { widgets: ['editor-customized'] }, bottomPanel: {} };
        getLayoutDataStub.returns(layoutA);

        // Switch to B (saves A's layout)
        await service.switchPerspective('perspB');

        const layoutB = { mainPanel: { widgets: ['something-else'] }, bottomPanel: {} };
        getLayoutDataStub.returns(layoutB);

        setLayoutDataStub.resetHistory();
        getOrCreateWidgetStub.resetHistory();
        addWidgetStub.resetHistory();

        // Switch back to A — should restore saved layout, NOT apply viewPlacements
        await service.switchPerspective('perspA');

        expect(setLayoutDataStub.calledOnce).to.be.true;
        expect(setLayoutDataStub.calledWith(layoutA)).to.be.true;
        expect(getOrCreateWidgetStub.called).to.be.false;
        expect(addWidgetStub.called).to.be.false;
    });

    it('should apply viewPlacements on first activation (no saved layout)', async () => {
        service.registerPerspective({
            id: 'fresh',
            label: 'Fresh',
            viewPlacements: new Map([['test-widget', 'main' as ApplicationShell.Area]])
        });

        await service.switchPerspective('fresh');

        expect(getOrCreateWidgetStub.calledWith('test-widget')).to.be.true;
        expect(addWidgetStub.calledOnce).to.be.true;
        expect(addWidgetStub.calledWith(testWidget, sinon.match({ area: 'main' }))).to.be.true;
        expect(setLayoutDataStub.called).to.be.false;
    });

    it('should not apply viewPlacements when a saved layout exists', async () => {
        service.registerPerspective({
            id: 'perspA',
            label: 'A',
            viewPlacements: new Map([['test-widget', 'left' as ApplicationShell.Area]])
        });
        service.registerPerspective({
            id: 'perspB',
            label: 'B',
            viewPlacements: new Map()
        });

        // First activation of A — viewPlacements applied
        await service.switchPerspective('perspA');
        expect(getOrCreateWidgetStub.called).to.be.true;

        // Switch to B (saves A's layout)
        await service.switchPerspective('perspB');

        getOrCreateWidgetStub.resetHistory();
        addWidgetStub.resetHistory();

        // Switch back to A — should restore layout, NOT use viewPlacements
        await service.switchPerspective('perspA');

        expect(getOrCreateWidgetStub.called).to.be.false;
        expect(addWidgetStub.called).to.be.false;
        expect(setLayoutDataStub.called).to.be.true;
    });

    it('should allow full round-trip: default → custom → default', async () => {
        service.initialize();

        service.registerPerspective({
            id: 'ai-first',
            label: 'AI First',
            viewPlacements: new Map([['test-widget', 'left' as ApplicationShell.Area]])
        });

        // Start in theia-ide (set by initialize)
        expect(service.getActivePerspective()?.id).to.equal(PerspectiveService.DEFAULT_PERSPECTIVE_ID);

        const defaultLayout = { mainPanel: { widgets: ['default-editor'] }, bottomPanel: {} };
        getLayoutDataStub.returns(defaultLayout);

        // Switch to ai-first (saves default layout)
        await service.switchPerspective('ai-first');
        expect(service.getActivePerspective()?.id).to.equal('ai-first');
        expect(getLayoutDataStub.called).to.be.true;
        expect(getOrCreateWidgetStub.calledWith('test-widget')).to.be.true;

        const aiLayout = { mainPanel: { widgets: ['ai-stuff'] }, bottomPanel: {} };
        getLayoutDataStub.returns(aiLayout);

        setLayoutDataStub.resetHistory();

        // Switch back to default (saves ai-first layout, restores default layout)
        await service.switchPerspective(PerspectiveService.DEFAULT_PERSPECTIVE_ID);
        expect(service.getActivePerspective()?.id).to.equal(PerspectiveService.DEFAULT_PERSPECTIVE_ID);
        expect(setLayoutDataStub.calledOnce).to.be.true;
        expect(setLayoutDataStub.calledWith(defaultLayout)).to.be.true;

        setLayoutDataStub.resetHistory();

        // Switch back to ai-first (saves default layout again, restores ai-first layout)
        await service.switchPerspective('ai-first');
        expect(service.getActivePerspective()?.id).to.equal('ai-first');
        expect(setLayoutDataStub.calledOnce).to.be.true;
        expect(setLayoutDataStub.calledWith(aiLayout)).to.be.true;
    });
});
