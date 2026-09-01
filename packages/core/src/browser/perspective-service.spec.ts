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
import { PerspectiveServiceImpl, PerspectiveDescriptor, WidgetAreaResolverImpl } from './perspective-service';
import { ApplicationShell } from './shell/application-shell';
import { AbstractViewContribution, ViewContributionOptions } from './shell/view-contribution';
import { FrontendApplicationContribution } from './frontend-application-contribution';
import { DockLayout, Panel, Widget } from '@lumino/widgets';
import { SidePanel } from './shell/side-panel-handler';
disableJSDOM();

describe('PerspectiveService', () => {
    let service: PerspectiveServiceImpl;
    let addWidgetStub: sinon.SinonStub;
    let activateWidgetStub: sinon.SinonStub;
    let getTabBarForStub: sinon.SinonStub;
    let getAreaForStub: sinon.SinonStub;
    let getOrCreateWidgetStub: sinon.SinonStub;
    let getLayoutDataStub: sinon.SinonStub;
    let setLayoutDataStub: sinon.SinonStub;
    let collapsePanelStub: sinon.SinonStub;
    let widgetAreaResolver: WidgetAreaResolverImpl;
    let tryGetWidgetStub: sinon.SinonStub;
    let getWidgetsStub: sinon.SinonStub;
    let mockLogger: { debug: sinon.SinonStub; warn: sinon.SinonStub };
    let testWidget: Widget;
    let toTearDown: () => void;

    beforeEach(() => {
        toTearDown = enableJSDOM();
        service = new PerspectiveServiceImpl();
        testWidget = new Widget();
        testWidget.id = 'test-widget';

        addWidgetStub = sinon.stub().resolves();
        activateWidgetStub = sinon.stub().resolves(undefined);
        getTabBarForStub = sinon.stub().returns(undefined);
        getAreaForStub = sinon.stub().returns(undefined);
        getOrCreateWidgetStub = sinon.stub().resolves(testWidget);
        getLayoutDataStub = sinon.stub().returns({ mainPanel: {}, bottomPanel: {} });
        setLayoutDataStub = sinon.stub().resolves();
        collapsePanelStub = sinon.stub().resolves();
        widgetAreaResolver = new WidgetAreaResolverImpl();
        getWidgetsStub = sinon.stub().returns([]);
        mockLogger = { debug: sinon.stub(), warn: sinon.stub() };

        const mockShell = {
            addWidget: addWidgetStub,
            activateWidget: activateWidgetStub,
            getTabBarFor: getTabBarForStub,
            getAreaFor: getAreaForStub,
            getLayoutData: getLayoutDataStub,
            setLayoutData: setLayoutDataStub,
            collapsePanel: collapsePanelStub,
            getWidgets: getWidgetsStub
        };

        tryGetWidgetStub = sinon.stub().returns(undefined);

        const mockWidgetManager = {
            getOrCreateWidget: getOrCreateWidgetStub,
            tryGetWidget: tryGetWidgetStub
        };

        // Assign mocks via property access since we can't use DI in tests
        (service as unknown as Record<string, unknown>)['shell'] = mockShell;
        (service as unknown as Record<string, unknown>)['widgetManager'] = mockWidgetManager;
        (service as unknown as Record<string, unknown>)['logger'] = mockLogger;
        (service as unknown as Record<string, unknown>)['widgetAreaResolver'] = widgetAreaResolver;
        (service as unknown as Record<string, unknown>)['appContributions'] = {
            getContributions: () => [] as FrontendApplicationContribution[]
        };
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

    it('should register the default perspective on initialize', () => {
        service.initialize();

        const perspectives = service.getRegisteredPerspectives();
        const defaultPerspective = perspectives.find(p => p.id === PerspectiveServiceImpl.DEFAULT_PERSPECTIVE_ID);
        expect(defaultPerspective).to.not.be.undefined;
        expect(defaultPerspective!.label).to.equal('Default');
        expect(defaultPerspective!.viewPlacements.size).to.equal(0);
    });

    it('should set the default perspective as the initial active perspective', () => {
        service.initialize();

        const active = service.getActivePerspective();
        expect(active).to.not.be.undefined;
        expect(active!.id).to.equal(PerspectiveServiceImpl.DEFAULT_PERSPECTIVE_ID);
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

        // Start in default (set by initialize)
        expect(service.getActivePerspective()?.id).to.equal(PerspectiveServiceImpl.DEFAULT_PERSPECTIVE_ID);

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
        await service.switchPerspective(PerspectiveServiceImpl.DEFAULT_PERSPECTIVE_ID);
        expect(service.getActivePerspective()?.id).to.equal(PerspectiveServiceImpl.DEFAULT_PERSPECTIVE_ID);
        expect(setLayoutDataStub.calledOnce).to.be.true;
        expect(setLayoutDataStub.calledWith(defaultLayout)).to.be.true;

        setLayoutDataStub.resetHistory();

        // Switch back to ai-first (saves default layout again, restores ai-first layout)
        await service.switchPerspective('ai-first');
        expect(service.getActivePerspective()?.id).to.equal('ai-first');
        expect(setLayoutDataStub.calledOnce).to.be.true;
        expect(setLayoutDataStub.calledWith(aiLayout)).to.be.true;
    });

    // --- Chrome control options tests ---

    it('should collapse areas on first activation only', async () => {
        service.registerPerspective({
            id: 'collapse-test',
            label: 'Collapse Test',
            viewPlacements: new Map(),
            chromeOptions: { collapseAreas: ['left'] }
        });
        service.registerPerspective({
            id: 'other',
            label: 'Other',
            viewPlacements: new Map()
        });

        // First activation — should collapse
        await service.switchPerspective('collapse-test');
        expect(collapsePanelStub.calledOnce).to.be.true;
        expect(collapsePanelStub.calledWith('left')).to.be.true;

        collapsePanelStub.resetHistory();

        // Switch away (saves layout)
        await service.switchPerspective('other');

        collapsePanelStub.resetHistory();

        // Switch back — should restore saved layout, NOT collapse again
        await service.switchPerspective('collapse-test');
        expect(collapsePanelStub.called).to.be.false;
    });

    it('should collapse multiple areas on first activation', async () => {
        service.registerPerspective({
            id: 'multi-collapse',
            label: 'Multi Collapse',
            viewPlacements: new Map(),
            chromeOptions: { collapseAreas: ['left', 'bottom'] }
        });

        await service.switchPerspective('multi-collapse');

        expect(collapsePanelStub.calledTwice).to.be.true;
        expect(collapsePanelStub.calledWith('left')).to.be.true;
        expect(collapsePanelStub.calledWith('bottom')).to.be.true;
    });

    it('should not collapse areas when perspective has no collapseAreas', async () => {
        service.registerPerspective({
            id: 'no-collapse',
            label: 'No Collapse',
            viewPlacements: new Map()
        });

        await service.switchPerspective('no-collapse');

        expect(collapsePanelStub.called).to.be.false;
    });

    // --- WidgetAreaResolver tests ---

    it('should resolve widget area from active perspective via the WidgetAreaResolver', async () => {
        service.initialize();

        service.registerPerspective({
            id: 'resolver-test',
            label: 'Resolver Test',
            viewPlacements: new Map([['my-widget', 'right' as ApplicationShell.Area]])
        });

        await service.switchPerspective('resolver-test');

        expect(widgetAreaResolver.resolveArea('my-widget', 'left')).to.equal('right');
    });

    it('should return undefined from the resolver for unmapped widgets', async () => {
        service.initialize();

        service.registerPerspective({
            id: 'resolver-test',
            label: 'Resolver Test',
            viewPlacements: new Map([['my-widget', 'right' as ApplicationShell.Area]])
        });

        await service.switchPerspective('resolver-test');

        expect(widgetAreaResolver.resolveArea('unknown-widget', 'main')).to.be.undefined;
    });

    it('should return undefined from the resolver when default perspective is active', () => {
        service.initialize();

        // Default perspective has empty viewPlacements
        expect(widgetAreaResolver.resolveArea('any-widget', 'main')).to.be.undefined;
    });

    // --- Logger tests ---

    it('should log warning when widget creation fails during switchPerspective', async () => {
        const widgetError = new Error('No factory registered');
        getOrCreateWidgetStub.rejects(widgetError);

        service.registerPerspective({
            id: 'fail-test',
            label: 'Fail Test',
            viewPlacements: new Map([['missing-widget', 'main' as ApplicationShell.Area]])
        });

        await service.switchPerspective('fail-test');

        expect(mockLogger.warn.calledOnce).to.be.true;
        expect(mockLogger.warn.firstCall.args[0]).to.equal('Failed to create or place widget for perspective');
        expect(mockLogger.warn.firstCall.args[1]).to.equal(widgetError);
    });

    it('should log warning when widget activation fails during switchPerspective', async () => {
        const activationError = new Error('Activation failed');
        activateWidgetStub.rejects(activationError);

        service.registerPerspective({
            id: 'activate-fail',
            label: 'Activate Fail',
            viewPlacements: new Map([['test-widget', 'main' as ApplicationShell.Area]])
        });

        await service.switchPerspective('activate-fail');

        expect(mockLogger.warn.called).to.be.true;
        const activateCall = mockLogger.warn.getCalls().find(
            (c: sinon.SinonSpyCall) => c.args[0] === 'Failed to activate widget for perspective'
        );
        expect(activateCall).to.not.be.undefined;
        expect(activateCall!.args[1]).to.equal(activationError);
    });

    // --- Reentrancy guard tests ---

    it('should handle two rapid switchPerspective calls without interleaving', async () => {
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

        const promise1 = service.switchPerspective('first');
        const promise2 = service.switchPerspective('second');

        await Promise.all([promise1, promise2]);

        expect(service.getActivePerspective()?.id).to.equal('second');
    });

    it('should serialize perspective switches with reentrancy guard', async () => {
        const callOrder: string[] = [];

        service.registerPerspective({
            id: 'perspA',
            label: 'A',
            viewPlacements: new Map(),
            onActivate: () => callOrder.push('activate-A')
        });
        service.registerPerspective({
            id: 'perspB',
            label: 'B',
            viewPlacements: new Map(),
            onActivate: () => callOrder.push('activate-B')
        });

        const p1 = service.switchPerspective('perspA');
        const p2 = service.switchPerspective('perspB');

        await Promise.all([p1, p2]);

        expect(callOrder).to.deep.equal(['activate-A', 'activate-B']);
        expect(service.getActivePerspective()?.id).to.equal('perspB');
    });

    it('should serialize three or more concurrent perspective switches', async () => {
        const callOrder: string[] = [];

        service.registerPerspective({
            id: 'perspA',
            label: 'A',
            viewPlacements: new Map(),
            onActivate: () => callOrder.push('activate-A')
        });
        service.registerPerspective({
            id: 'perspB',
            label: 'B',
            viewPlacements: new Map(),
            onActivate: () => callOrder.push('activate-B')
        });
        service.registerPerspective({
            id: 'perspC',
            label: 'C',
            viewPlacements: new Map(),
            onActivate: () => callOrder.push('activate-C')
        });

        const p1 = service.switchPerspective('perspA');
        const p2 = service.switchPerspective('perspB');
        const p3 = service.switchPerspective('perspC');

        await Promise.all([p1, p2, p3]);

        expect(callOrder).to.deep.equal(['activate-A', 'activate-B', 'activate-C']);
        expect(service.getActivePerspective()?.id).to.equal('perspC');
    });

    // --- onLayoutRestored() tests ---

    it('should not throw when onLayoutRestored is called with an unregistered perspective', () => {
        service.initialize();

        expect(() => service.onLayoutRestored('non-existent')).to.not.throw();
    });

    // --- Rejection resilience tests ---

    it('should warn and continue when setLayoutData rejects during saved layout restore', async () => {
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

        // Switch to A, then to B (saves A's layout)
        await service.switchPerspective('perspA');
        await service.switchPerspective('perspB');

        // Make setLayoutData reject
        setLayoutDataStub.rejects(new Error('layout error'));

        const eventSpy = sinon.spy();
        service.onDidChangePerspective(eventSpy);

        // Switch back to A — should not throw
        await service.switchPerspective('perspA');

        expect(service.getActivePerspective()?.id).to.equal('perspA');
        expect(eventSpy.calledOnce).to.be.true;
        expect(eventSpy.calledWith('perspA')).to.be.true;
        expect(mockLogger.warn.calledOnce).to.be.true;
        expect(mockLogger.warn.firstCall.args[0]).to.equal('Failed to apply layout for perspective');
    });

    it('should warn and continue when collapsePanel rejects on first activation', async () => {
        service.registerPerspective({
            id: 'collapse-fail',
            label: 'Collapse Fail',
            viewPlacements: new Map(),
            chromeOptions: { collapseAreas: ['left'] }
        });

        collapsePanelStub.rejects(new Error('collapse error'));

        const eventSpy = sinon.spy();
        service.onDidChangePerspective(eventSpy);

        // Switch — should not throw
        await service.switchPerspective('collapse-fail');

        expect(service.getActivePerspective()?.id).to.equal('collapse-fail');
        expect(eventSpy.calledOnce).to.be.true;
        expect(mockLogger.warn.calledOnce).to.be.true;
        expect(mockLogger.warn.firstCall.args[0]).to.equal('Failed to apply layout for perspective');
    });

    it('should not drop queued switches when layout application fails', async () => {
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
        service.registerPerspective({
            id: 'perspC',
            label: 'C',
            viewPlacements: new Map()
        });

        // Switch to A, then to B (saves A's layout)
        await service.switchPerspective('perspA');
        await service.switchPerspective('perspB');

        // Make setLayoutData reject only on first call, then resolve
        setLayoutDataStub.resetBehavior();
        setLayoutDataStub.onFirstCall().rejects(new Error('layout error'));
        setLayoutDataStub.onSecondCall().resolves();

        // Queue: switch to A (will fail layout restore), then switch to C
        const p1 = service.switchPerspective('perspA');
        const p2 = service.switchPerspective('perspC');

        await Promise.all([p1, p2]);

        expect(service.getActivePerspective()?.id).to.equal('perspC');
    });

    // --- resetCurrentPerspective tests ---

    describe('resetCurrentPerspective', () => {
        it('should clear saved layout and re-apply viewPlacements on reset for non-default perspective', async () => {
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

            await service.switchPerspective('perspA');

            const layoutA = { mainPanel: { widgets: ['customized'] }, bottomPanel: {} };
            getLayoutDataStub.returns(layoutA);

            // Switch to B (saves A's layout)
            await service.switchPerspective('perspB');

            // Switch back to A (restores saved layout)
            await service.switchPerspective('perspA');

            // Verify saved layout exists
            expect(service.getSavedLayout('perspA')).to.not.be.undefined;

            // Reset stubs to track reset behavior
            setLayoutDataStub.resetHistory();
            getOrCreateWidgetStub.resetHistory();
            addWidgetStub.resetHistory();
            activateWidgetStub.resetHistory();

            await service.resetCurrentPerspective();

            // Saved layout should be cleared
            expect(service.getSavedLayout('perspA')).to.be.undefined;

            // Should re-apply viewPlacements
            expect(getOrCreateWidgetStub.calledWith('test-widget')).to.be.true;
            expect(addWidgetStub.called).to.be.true;
        });

        it('should call onActivate callback', async () => {
            const onActivate = sinon.spy();
            service.registerPerspective({
                id: 'activate-reset',
                label: 'Activate Reset',
                viewPlacements: new Map(),
                onActivate
            });

            await service.switchPerspective('activate-reset');
            onActivate.resetHistory();

            await service.resetCurrentPerspective();

            expect(onActivate.calledOnce).to.be.true;
        });

        it('should fire onDidChangePerspective event', async () => {
            service.registerPerspective({
                id: 'event-reset',
                label: 'Event Reset',
                viewPlacements: new Map()
            });

            await service.switchPerspective('event-reset');

            const spy = sinon.spy();
            service.onDidChangePerspective(spy);

            await service.resetCurrentPerspective();

            expect(spy.calledOnce).to.be.true;
            expect(spy.calledWith('event-reset')).to.be.true;
        });

        it('should not affect other perspectives\' saved layouts', async () => {
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

            // Activate A, then B, to create saved layouts for both
            await service.switchPerspective('perspA');

            const layoutA = { mainPanel: { widgets: ['a-stuff'] }, bottomPanel: {} };
            getLayoutDataStub.returns(layoutA);

            await service.switchPerspective('perspB');

            const layoutB = { mainPanel: { widgets: ['b-stuff'] }, bottomPanel: {} };
            getLayoutDataStub.returns(layoutB);

            // Switch back to A (saves B's layout)
            await service.switchPerspective('perspA');

            // Reset A
            await service.resetCurrentPerspective();

            // A's saved layout should be cleared
            expect(service.getSavedLayout('perspA')).to.be.undefined;
            // B's saved layout should be preserved
            expect(service.getSavedLayout('perspB')).to.equal(layoutB);
        });

        it('should serialize with other switchPerspective calls', async () => {
            const callOrder: string[] = [];

            service.registerPerspective({
                id: 'perspA',
                label: 'A',
                viewPlacements: new Map(),
                onActivate: () => callOrder.push('activate-A')
            });
            service.registerPerspective({
                id: 'perspB',
                label: 'B',
                viewPlacements: new Map(),
                onActivate: () => callOrder.push('activate-B')
            });

            await service.switchPerspective('perspA');
            callOrder.length = 0;

            // Queue a reset and a switch concurrently
            const p1 = service.resetCurrentPerspective();
            const p2 = service.switchPerspective('perspB');

            await Promise.all([p1, p2]);

            expect(callOrder).to.deep.equal(['activate-A', 'activate-B']);
            expect(service.getActivePerspective()?.id).to.equal('perspB');
        });

        it('should do nothing when no active perspective is set', async () => {
            // No perspective active (activePerspectiveId is undefined)
            const spy = sinon.spy();
            service.onDidChangePerspective(spy);

            await service.resetCurrentPerspective();

            expect(spy.called).to.be.false;
            expect(getOrCreateWidgetStub.called).to.be.false;
        });
    });

    describe('resetDefaultPerspective', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        function createMockViewContribution(
            options: ViewContributionOptions
        ): AbstractViewContribution<Widget> & FrontendApplicationContribution {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const contribution = Object.create(AbstractViewContribution.prototype) as any;
            contribution.options = options;
            contribution.widgetManager = {
                getOrCreateWidget: getOrCreateWidgetStub,
                tryGetWidget: tryGetWidgetStub
            };
            contribution.shell = (service as unknown as Record<string, unknown>)['shell'];
            contribution.openView = sinon.stub().resolves(testWidget);
            return contribution;
        }

        function createMockNonViewContribution(): FrontendApplicationContribution {
            const contrib: FrontendApplicationContribution = {};
            return contrib;
        }

        it('should relocate open view from wrong area to defaultViewOptions.area', async () => {
            service.initialize();

            const explorerWidget = new Widget();
            explorerWidget.id = 'explorer';
            const explorerPanel = new Panel();
            Widget.attach(explorerPanel, document.body);
            explorerPanel.addWidget(explorerWidget);

            tryGetWidgetStub.withArgs('explorer').returns(explorerWidget);
            getAreaForStub.withArgs(explorerWidget).returns('right');

            const contribution = createMockViewContribution({
                widgetId: 'explorer',
                widgetName: 'Explorer',
                defaultWidgetOptions: { area: 'left' }
            });

            (service as unknown as Record<string, unknown>)['appContributions'] = {
                getContributions: () => [contribution]
            };

            await service.resetCurrentPerspective();

            expect(addWidgetStub.calledWith(explorerWidget, sinon.match({ area: 'left' }))).to.be.true;

            explorerPanel.dispose();
        });

        it('should skip views already in correct area', async () => {
            service.initialize();

            const explorerWidget = new Widget();
            explorerWidget.id = 'explorer';
            const explorerPanel = new Panel();
            Widget.attach(explorerPanel, document.body);
            explorerPanel.addWidget(explorerWidget);

            tryGetWidgetStub.withArgs('explorer').returns(explorerWidget);
            getAreaForStub.withArgs(explorerWidget).returns('left');

            const contribution = createMockViewContribution({
                widgetId: 'explorer',
                widgetName: 'Explorer',
                defaultWidgetOptions: { area: 'left' }
            });

            (service as unknown as Record<string, unknown>)['appContributions'] = {
                getContributions: () => [contribution]
            };

            addWidgetStub.resetHistory();

            await service.resetCurrentPerspective();

            expect(addWidgetStub.called).to.be.false;

            explorerPanel.dispose();
        });

        it('should skip views not attached', async () => {
            service.initialize();

            const explorerWidget = new Widget();
            explorerWidget.id = 'explorer';
            // Not attached to any parent

            tryGetWidgetStub.withArgs('explorer').returns(explorerWidget);

            const contribution = createMockViewContribution({
                widgetId: 'explorer',
                widgetName: 'Explorer',
                defaultWidgetOptions: { area: 'left' }
            });

            (service as unknown as Record<string, unknown>)['appContributions'] = {
                getContributions: () => [contribution]
            };

            addWidgetStub.resetHistory();

            await service.resetCurrentPerspective();

            // Phase 1 should not try to relocate (not attached)
            // Phase 2 will call initializeLayout
            expect(addWidgetStub.called).to.be.false;
        });

        it('should call openView on AbstractViewContribution instances', async () => {
            service.initialize();

            const contribution = createMockViewContribution({
                widgetId: 'explorer',
                widgetName: 'Explorer',
                defaultWidgetOptions: { area: 'left' }
            });

            (service as unknown as Record<string, unknown>)['appContributions'] = {
                getContributions: () => [contribution]
            };

            await service.resetCurrentPerspective();

            expect((contribution.openView as sinon.SinonStub).calledOnce).to.be.true;
            expect((contribution.openView as sinon.SinonStub).calledWith({ activate: false })).to.be.true;
        });

        it('should NOT call openView on non-AbstractViewContribution contributions', async () => {
            service.initialize();

            const nonViewContrib = createMockNonViewContribution();

            (service as unknown as Record<string, unknown>)['appContributions'] = {
                getContributions: () => [nonViewContrib]
            };

            // Should not throw
            await service.resetCurrentPerspective();
        });

        it('should handle combined scenario: open view in wrong area + closed view', async () => {
            service.initialize();

            // Explorer is open but in the wrong area
            const explorerWidget = new Widget();
            explorerWidget.id = 'explorer';
            const panel = new Panel();
            Widget.attach(panel, document.body);
            panel.addWidget(explorerWidget);

            tryGetWidgetStub.withArgs('explorer').returns(explorerWidget);
            getAreaForStub.withArgs(explorerWidget).returns('right');

            const explorerContrib = createMockViewContribution({
                widgetId: 'explorer',
                widgetName: 'Explorer',
                defaultWidgetOptions: { area: 'left' }
            });

            // SCM is closed (tryGetWidget returns undefined)
            tryGetWidgetStub.withArgs('scm').returns(undefined);

            const scmContrib = createMockViewContribution({
                widgetId: 'scm',
                widgetName: 'SCM',
                defaultWidgetOptions: { area: 'left' }
            });

            (service as unknown as Record<string, unknown>)['appContributions'] = {
                getContributions: () => [explorerContrib, scmContrib]
            };

            addWidgetStub.resetHistory();

            await service.resetCurrentPerspective();

            // Phase 1: Explorer should be relocated
            expect(addWidgetStub.calledWith(explorerWidget, sinon.match({ area: 'left' }))).to.be.true;
            // Phase 2: Both should have openView called
            expect((explorerContrib.openView as sinon.SinonStub).calledOnce).to.be.true;
            expect((scmContrib.openView as sinon.SinonStub).calledOnce).to.be.true;

            panel.dispose();
        });

        it('should use viewContainerId as effectiveWidgetId when set', async () => {
            service.initialize();

            const containerWidget = new Widget();
            containerWidget.id = 'explorer-container';
            const panel = new Panel();
            Widget.attach(panel, document.body);
            panel.addWidget(containerWidget);

            tryGetWidgetStub.withArgs('explorer-container').returns(containerWidget);
            getAreaForStub.withArgs(containerWidget).returns('right');

            const contribution = createMockViewContribution({
                widgetId: 'explorer',
                viewContainerId: 'explorer-container',
                widgetName: 'Explorer',
                defaultWidgetOptions: { area: 'left' }
            });

            (service as unknown as Record<string, unknown>)['appContributions'] = {
                getContributions: () => [contribution]
            };

            addWidgetStub.resetHistory();

            await service.resetCurrentPerspective();

            expect(tryGetWidgetStub.calledWith('explorer-container')).to.be.true;
            expect(addWidgetStub.calledWith(containerWidget, sinon.match({ area: 'left' }))).to.be.true;

            panel.dispose();
        });

        it('should handle openView errors gracefully', async () => {
            service.initialize();

            const contribution = createMockViewContribution({
                widgetId: 'broken',
                widgetName: 'Broken',
                defaultWidgetOptions: { area: 'left' }
            });
            (contribution.openView as sinon.SinonStub).rejects(new Error('openView failed'));

            (service as unknown as Record<string, unknown>)['appContributions'] = {
                getContributions: () => [contribution]
            };

            // Should not throw
            await service.resetCurrentPerspective();

            expect(mockLogger.warn.called).to.be.true;
        });

        it('should handle widget relocation errors gracefully', async () => {
            service.initialize();

            const explorerWidget = new Widget();
            explorerWidget.id = 'explorer';
            const panel = new Panel();
            Widget.attach(panel, document.body);
            panel.addWidget(explorerWidget);

            tryGetWidgetStub.withArgs('explorer').returns(explorerWidget);
            getAreaForStub.withArgs(explorerWidget).returns('right');
            addWidgetStub.rejects(new Error('relocation failed'));

            const contribution = createMockViewContribution({
                widgetId: 'explorer',
                widgetName: 'Explorer',
                defaultWidgetOptions: { area: 'left' }
            });

            (service as unknown as Record<string, unknown>)['appContributions'] = {
                getContributions: () => [contribution]
            };

            // Should not throw
            await service.resetCurrentPerspective();

            expect(mockLogger.warn.called).to.be.true;

            panel.dispose();
        });

        it('should fire onDidChangePerspective event on default perspective reset', async () => {
            service.initialize();

            (service as unknown as Record<string, unknown>)['appContributions'] = {
                getContributions: () => []
            };

            const spy = sinon.spy();
            service.onDidChangePerspective(spy);

            await service.resetCurrentPerspective();

            expect(spy.calledOnce).to.be.true;
            expect(spy.calledWith(PerspectiveServiceImpl.DEFAULT_PERSPECTIVE_ID)).to.be.true;
        });

        it('should skip contributions without defaultViewOptions.area in Phase 1', async () => {
            service.initialize();

            const contribution = createMockViewContribution({
                widgetId: 'no-area',
                widgetName: 'No Area',
                defaultWidgetOptions: {}
            });

            (service as unknown as Record<string, unknown>)['appContributions'] = {
                getContributions: () => [contribution]
            };

            addWidgetStub.resetHistory();

            await service.resetCurrentPerspective();

            // Phase 1 should skip (no target area)
            // Phase 2 should still call openView
            expect((contribution.openView as sinon.SinonStub).calledOnce).to.be.true;
        });
    });

    describe('layout healing on perspective switch', () => {
        it('should replace disposed side panel widget when switching back to a perspective', async () => {
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

            // Create a widget and then dispose it to simulate cross-perspective closure
            const disposedWidget = new Widget();
            disposedWidget.id = 'explorer-widget';
            disposedWidget.dispose();
            expect(disposedWidget.isDisposed).to.be.true;

            const freshWidget = new Widget();
            freshWidget.id = 'explorer-widget';
            getOrCreateWidgetStub.withArgs('explorer-widget').resolves(freshWidget);

            const savedLayout: ApplicationShell.LayoutData = {
                leftPanel: {
                    type: 'sidepanel',
                    items: [{ widget: disposedWidget, rank: 0, expanded: true }]
                } as SidePanel.LayoutData,
                mainPanel: undefined,
                bottomPanel: undefined
            };

            // Switch to A, then to B
            await service.switchPerspective('perspA');
            await service.switchPerspective('perspB');

            // Manually set the saved layout for A with the disposed widget
            service.setSavedLayout('perspA', savedLayout);

            setLayoutDataStub.resetHistory();
            getOrCreateWidgetStub.resetHistory();

            // Switch back to A
            await service.switchPerspective('perspA');

            expect(getOrCreateWidgetStub.calledWith('explorer-widget')).to.be.true;
            expect(setLayoutDataStub.calledOnce).to.be.true;
            // The layout should now contain the fresh widget
            const restoredLayout = setLayoutDataStub.firstCall.args[0] as ApplicationShell.LayoutData;
            expect(restoredLayout.leftPanel!.items![0].widget).to.equal(freshWidget);
        });

        it('should replace disposed dock panel widget (main area)', async () => {
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

            const disposedWidget = new Widget();
            disposedWidget.id = 'editor-widget';
            disposedWidget.dispose();

            const freshWidget = new Widget();
            freshWidget.id = 'editor-widget';
            getOrCreateWidgetStub.withArgs('editor-widget').resolves(freshWidget);

            const savedLayout: ApplicationShell.LayoutData = {
                mainPanel: {
                    main: {
                        type: 'tab-area',
                        widgets: [disposedWidget],
                        currentIndex: 0
                    } as DockLayout.ITabAreaConfig
                },
                bottomPanel: undefined
            };

            await service.switchPerspective('perspA');
            await service.switchPerspective('perspB');
            service.setSavedLayout('perspA', savedLayout);

            setLayoutDataStub.resetHistory();
            getOrCreateWidgetStub.resetHistory();

            await service.switchPerspective('perspA');

            expect(getOrCreateWidgetStub.calledWith('editor-widget')).to.be.true;
            const restoredLayout = setLayoutDataStub.firstCall.args[0] as ApplicationShell.LayoutData;
            expect((restoredLayout.mainPanel!.main as DockLayout.ITabAreaConfig).widgets[0]).to.equal(freshWidget);
        });

        it('should handle recreation failure gracefully', async () => {
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

            const disposedWidget = new Widget();
            disposedWidget.id = 'broken-widget';
            disposedWidget.dispose();

            getOrCreateWidgetStub.withArgs('broken-widget').rejects(new Error('No factory'));

            const savedLayout: ApplicationShell.LayoutData = {
                leftPanel: {
                    type: 'sidepanel',
                    items: [{ widget: disposedWidget, rank: 0, expanded: true }]
                } as SidePanel.LayoutData,
                mainPanel: undefined,
                bottomPanel: undefined
            };

            await service.switchPerspective('perspA');
            await service.switchPerspective('perspB');
            service.setSavedLayout('perspA', savedLayout);

            mockLogger.warn.resetHistory();
            setLayoutDataStub.resetHistory();

            await service.switchPerspective('perspA');

            // Widget should be set to undefined in the layout
            const restoredLayout = setLayoutDataStub.firstCall.args[0] as ApplicationShell.LayoutData;
            expect(restoredLayout.leftPanel!.items![0].widget).to.be.undefined;
            // Warn log should have been called
            expect(mockLogger.warn.called).to.be.true;
            const healCall = mockLogger.warn.getCalls().find(
                (c: sinon.SinonSpyCall) => c.args[0] === 'Failed to recreate disposed widget for perspective layout'
            );
            expect(healCall).to.not.be.undefined;
            // setLayoutData should still be called
            expect(setLayoutDataStub.calledOnce).to.be.true;
        });

        it('should handle recreation failure in dock panel by splicing widget', async () => {
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

            const disposedWidget = new Widget();
            disposedWidget.id = 'broken-widget';
            disposedWidget.dispose();

            const goodWidget = new Widget();
            goodWidget.id = 'good-widget';

            getOrCreateWidgetStub.withArgs('broken-widget').rejects(new Error('No factory'));

            const savedLayout: ApplicationShell.LayoutData = {
                mainPanel: {
                    main: {
                        type: 'tab-area',
                        widgets: [goodWidget, disposedWidget],
                        currentIndex: 0
                    } as DockLayout.ITabAreaConfig
                },
                bottomPanel: undefined
            };

            await service.switchPerspective('perspA');
            await service.switchPerspective('perspB');
            service.setSavedLayout('perspA', savedLayout);

            setLayoutDataStub.resetHistory();

            await service.switchPerspective('perspA');

            const restoredLayout = setLayoutDataStub.firstCall.args[0] as ApplicationShell.LayoutData;
            const tabArea = restoredLayout.mainPanel!.main as DockLayout.ITabAreaConfig;
            // The broken widget should have been spliced out
            expect(tabArea.widgets).to.have.lengthOf(1);
            expect(tabArea.widgets[0]).to.equal(goodWidget);
        });

        it('should not touch non-disposed widgets', async () => {
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

            const liveWidget = new Widget();
            liveWidget.id = 'live-widget';

            const disposedWidget = new Widget();
            disposedWidget.id = 'dead-widget';
            disposedWidget.dispose();

            const freshWidget = new Widget();
            freshWidget.id = 'dead-widget';
            getOrCreateWidgetStub.withArgs('dead-widget').resolves(freshWidget);

            const savedLayout: ApplicationShell.LayoutData = {
                leftPanel: {
                    type: 'sidepanel',
                    items: [
                        { widget: liveWidget, rank: 0, expanded: true },
                        { widget: disposedWidget, rank: 1, expanded: false }
                    ]
                } as SidePanel.LayoutData,
                mainPanel: undefined,
                bottomPanel: undefined
            };

            await service.switchPerspective('perspA');
            await service.switchPerspective('perspB');
            service.setSavedLayout('perspA', savedLayout);

            getOrCreateWidgetStub.resetHistory();
            setLayoutDataStub.resetHistory();

            await service.switchPerspective('perspA');

            // Only the disposed widget should trigger getOrCreateWidget
            expect(getOrCreateWidgetStub.calledOnce).to.be.true;
            expect(getOrCreateWidgetStub.calledWith('dead-widget')).to.be.true;
            // The live widget should remain unchanged
            const restoredLayout = setLayoutDataStub.firstCall.args[0] as ApplicationShell.LayoutData;
            expect(restoredLayout.leftPanel!.items![0].widget).to.equal(liveWidget);
            expect(restoredLayout.leftPanel!.items![1].widget).to.equal(freshWidget);
        });

        it('should handle nested split-area configs', async () => {
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

            const disposedWidget = new Widget();
            disposedWidget.id = 'nested-widget';
            disposedWidget.dispose();

            const freshWidget = new Widget();
            freshWidget.id = 'nested-widget';
            getOrCreateWidgetStub.withArgs('nested-widget').resolves(freshWidget);

            const liveWidget = new Widget();
            liveWidget.id = 'other-widget';

            const savedLayout: ApplicationShell.LayoutData = {
                mainPanel: {
                    main: {
                        type: 'split-area',
                        orientation: 'horizontal',
                        sizes: [0.5, 0.5],
                        children: [
                            {
                                type: 'tab-area',
                                widgets: [liveWidget],
                                currentIndex: 0
                            } as DockLayout.ITabAreaConfig,
                            {
                                type: 'tab-area',
                                widgets: [disposedWidget],
                                currentIndex: 0
                            } as DockLayout.ITabAreaConfig
                        ]
                    } as DockLayout.ISplitAreaConfig
                },
                bottomPanel: undefined
            };

            await service.switchPerspective('perspA');
            await service.switchPerspective('perspB');
            service.setSavedLayout('perspA', savedLayout);

            getOrCreateWidgetStub.resetHistory();
            setLayoutDataStub.resetHistory();

            await service.switchPerspective('perspA');

            expect(getOrCreateWidgetStub.calledWith('nested-widget')).to.be.true;
            const restoredLayout = setLayoutDataStub.firstCall.args[0] as ApplicationShell.LayoutData;
            const splitArea = restoredLayout.mainPanel!.main as DockLayout.ISplitAreaConfig;
            expect((splitArea.children[0] as DockLayout.ITabAreaConfig).widgets[0]).to.equal(liveWidget);
            expect((splitArea.children[1] as DockLayout.ITabAreaConfig).widgets[0]).to.equal(freshWidget);
        });

        it('should handle empty/missing panel sections', async () => {
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

            const savedLayout: ApplicationShell.LayoutData = {
                mainPanel: undefined,
                bottomPanel: undefined,
                leftPanel: undefined,
                rightPanel: undefined
            };

            await service.switchPerspective('perspA');
            await service.switchPerspective('perspB');
            service.setSavedLayout('perspA', savedLayout);

            setLayoutDataStub.resetHistory();

            // Should not throw
            await service.switchPerspective('perspA');

            expect(setLayoutDataStub.calledOnce).to.be.true;
        });

        it('should heal bottom panel disposed widgets', async () => {
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

            const disposedWidget = new Widget();
            disposedWidget.id = 'bottom-widget';
            disposedWidget.dispose();

            const freshWidget = new Widget();
            freshWidget.id = 'bottom-widget';
            getOrCreateWidgetStub.withArgs('bottom-widget').resolves(freshWidget);

            const savedLayout: ApplicationShell.LayoutData = {
                mainPanel: undefined,
                bottomPanel: {
                    config: {
                        main: {
                            type: 'tab-area',
                            widgets: [disposedWidget],
                            currentIndex: 0
                        } as DockLayout.ITabAreaConfig
                    }
                }
            };

            await service.switchPerspective('perspA');
            await service.switchPerspective('perspB');
            service.setSavedLayout('perspA', savedLayout);

            getOrCreateWidgetStub.resetHistory();
            setLayoutDataStub.resetHistory();

            await service.switchPerspective('perspA');

            expect(getOrCreateWidgetStub.calledWith('bottom-widget')).to.be.true;
            const restoredLayout = setLayoutDataStub.firstCall.args[0] as ApplicationShell.LayoutData;
            expect((restoredLayout.bottomPanel!.config!.main as DockLayout.ITabAreaConfig).widgets[0]).to.equal(freshWidget);
        });

        it('should heal right panel disposed widgets', async () => {
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

            const disposedWidget = new Widget();
            disposedWidget.id = 'right-widget';
            disposedWidget.dispose();

            const freshWidget = new Widget();
            freshWidget.id = 'right-widget';
            getOrCreateWidgetStub.withArgs('right-widget').resolves(freshWidget);

            const savedLayout: ApplicationShell.LayoutData = {
                mainPanel: undefined,
                bottomPanel: undefined,
                rightPanel: {
                    type: 'sidepanel',
                    items: [{ widget: disposedWidget, rank: 0, expanded: true }]
                } as SidePanel.LayoutData
            };

            await service.switchPerspective('perspA');
            await service.switchPerspective('perspB');
            service.setSavedLayout('perspA', savedLayout);

            getOrCreateWidgetStub.resetHistory();
            setLayoutDataStub.resetHistory();

            await service.switchPerspective('perspA');

            expect(getOrCreateWidgetStub.calledWith('right-widget')).to.be.true;
            const restoredLayout = setLayoutDataStub.firstCall.args[0] as ApplicationShell.LayoutData;
            expect(restoredLayout.rightPanel!.items![0].widget).to.equal(freshWidget);
        });
    });

    describe('Plumbing API (layout persistence)', () => {
        it('should expose defaultPerspectiveId matching the static constant', () => {
            expect(service.defaultPerspectiveId).to.equal(PerspectiveServiceImpl.DEFAULT_PERSPECTIVE_ID);
        });

        it('should return default perspective ID when none is set', () => {
            expect(service.getActivePerspectiveId()).to.equal(PerspectiveServiceImpl.DEFAULT_PERSPECTIVE_ID);
        });

        it('should return active perspective ID after switching', async () => {
            service.registerPerspective({
                id: 'test-persp',
                label: 'Test',
                viewPlacements: new Map()
            });
            await service.switchPerspective('test-persp');
            expect(service.getActivePerspectiveId()).to.equal('test-persp');
        });

        it('should round-trip getSavedLayout/setSavedLayout', () => {
            const layout = { mainPanel: { widgets: ['w1'] }, bottomPanel: {} } as unknown as ApplicationShell.LayoutData;
            service.setSavedLayout('persp-x', layout);

            expect(service.getSavedLayout('persp-x')).to.equal(layout);
        });

        it('should return undefined for non-existent saved layout', () => {
            expect(service.getSavedLayout('no-such-persp')).to.be.undefined;
        });

        it('should return correct saved perspective IDs', () => {
            const layout1 = { mainPanel: {} } as unknown as ApplicationShell.LayoutData;
            const layout2 = { mainPanel: {} } as unknown as ApplicationShell.LayoutData;
            service.setSavedLayout('a', layout1);
            service.setSavedLayout('b', layout2);

            const ids = service.getSavedPerspectiveIds();
            expect(ids).to.include('a');
            expect(ids).to.include('b');
            expect(ids).to.have.lengthOf(2);
        });

        it('should set active perspective ID only for registered perspectives', () => {
            service.registerPerspective({
                id: 'registered',
                label: 'Registered',
                viewPlacements: new Map()
            });

            expect(service.setActivePerspectiveId('registered')).to.be.true;
            expect(service.getActivePerspectiveId()).to.equal('registered');

            expect(service.setActivePerspectiveId('unregistered')).to.be.false;
            expect(service.getActivePerspectiveId()).to.equal('registered');
        });

        it('should clear all saved layouts', () => {
            const layout = { mainPanel: {} } as unknown as ApplicationShell.LayoutData;
            service.setSavedLayout('a', layout);
            service.setSavedLayout('b', layout);

            service.clearSavedLayouts();

            expect(service.getSavedPerspectiveIds()).to.have.lengthOf(0);
            expect(service.getSavedLayout('a')).to.be.undefined;
            expect(service.getSavedLayout('b')).to.be.undefined;
        });
    });

    describe('collectWidgetIds', () => {
        it('should collect IDs from side panel items', () => {
            const widgetA = new Widget();
            widgetA.id = 'widget-a';
            const widgetB = new Widget();
            widgetB.id = 'widget-b';

            const layout: ApplicationShell.LayoutData = {
                leftPanel: {
                    type: 'sidepanel',
                    items: [
                        { widget: widgetA, rank: 0, expanded: true },
                        { widget: widgetB, rank: 1, expanded: false }
                    ]
                } as SidePanel.LayoutData,
                mainPanel: undefined,
                bottomPanel: undefined
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ids = (service as any).collectWidgetIds(layout);
            expect(ids.has('widget-a')).to.be.true;
            expect(ids.has('widget-b')).to.be.true;
            expect(ids.size).to.equal(2);
        });

        it('should collect IDs from dock panel tab-areas', () => {
            const widgetA = new Widget();
            widgetA.id = 'tab-widget-a';
            const widgetB = new Widget();
            widgetB.id = 'tab-widget-b';

            const layout: ApplicationShell.LayoutData = {
                mainPanel: {
                    main: {
                        type: 'tab-area',
                        widgets: [widgetA, widgetB],
                        currentIndex: 0
                    } as DockLayout.ITabAreaConfig
                },
                bottomPanel: undefined
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ids = (service as any).collectWidgetIds(layout);
            expect(ids.has('tab-widget-a')).to.be.true;
            expect(ids.has('tab-widget-b')).to.be.true;
            expect(ids.size).to.equal(2);
        });

        it('should collect IDs from nested split-areas', () => {
            const widgetA = new Widget();
            widgetA.id = 'split-a';
            const widgetB = new Widget();
            widgetB.id = 'split-b';

            const layout: ApplicationShell.LayoutData = {
                mainPanel: {
                    main: {
                        type: 'split-area',
                        orientation: 'horizontal',
                        sizes: [0.5, 0.5],
                        children: [
                            {
                                type: 'tab-area',
                                widgets: [widgetA],
                                currentIndex: 0
                            } as DockLayout.ITabAreaConfig,
                            {
                                type: 'tab-area',
                                widgets: [widgetB],
                                currentIndex: 0
                            } as DockLayout.ITabAreaConfig
                        ]
                    } as DockLayout.ISplitAreaConfig
                },
                bottomPanel: undefined
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ids = (service as any).collectWidgetIds(layout);
            expect(ids.has('split-a')).to.be.true;
            expect(ids.has('split-b')).to.be.true;
            expect(ids.size).to.equal(2);
        });

        it('should return empty set for empty/missing layout sections', () => {
            const layout: ApplicationShell.LayoutData = {
                mainPanel: undefined,
                bottomPanel: undefined,
                leftPanel: undefined,
                rightPanel: undefined
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ids = (service as any).collectWidgetIds(layout);
            expect(ids.size).to.equal(0);
        });

        it('should skip undefined widget entries in tab-areas', () => {
            const widgetA = new Widget();
            widgetA.id = 'valid-widget';

            const layout: ApplicationShell.LayoutData = {
                mainPanel: {
                    main: {
                        type: 'tab-area',
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        widgets: [widgetA, undefined as any],
                        currentIndex: 0
                    } as DockLayout.ITabAreaConfig
                },
                bottomPanel: undefined
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ids = (service as any).collectWidgetIds(layout);
            expect(ids.has('valid-widget')).to.be.true;
            expect(ids.size).to.equal(1);
        });

        it('should skip undefined widget entries in side panel items', () => {
            const widgetA = new Widget();
            widgetA.id = 'valid-side-widget';

            const layout: ApplicationShell.LayoutData = {
                leftPanel: {
                    type: 'sidepanel',
                    items: [
                        { widget: widgetA, rank: 0, expanded: true },
                        { widget: undefined, rank: 1, expanded: false }
                    ]
                } as SidePanel.LayoutData,
                mainPanel: undefined,
                bottomPanel: undefined
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ids = (service as any).collectWidgetIds(layout);
            expect(ids.has('valid-side-widget')).to.be.true;
            expect(ids.size).to.equal(1);
        });

        it('should collect IDs from bottom panel', () => {
            const widgetA = new Widget();
            widgetA.id = 'bottom-widget';

            const layout: ApplicationShell.LayoutData = {
                mainPanel: undefined,
                bottomPanel: {
                    config: {
                        main: {
                            type: 'tab-area',
                            widgets: [widgetA],
                            currentIndex: 0
                        } as DockLayout.ITabAreaConfig
                    }
                }
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ids = (service as any).collectWidgetIds(layout);
            expect(ids.has('bottom-widget')).to.be.true;
            expect(ids.size).to.equal(1);
        });

        it('should collect IDs from all panels', () => {
            const leftWidget = new Widget();
            leftWidget.id = 'left-w';
            const rightWidget = new Widget();
            rightWidget.id = 'right-w';
            const mainWidget = new Widget();
            mainWidget.id = 'main-w';
            const bottomWidget = new Widget();
            bottomWidget.id = 'bottom-w';

            const layout: ApplicationShell.LayoutData = {
                leftPanel: {
                    type: 'sidepanel',
                    items: [{ widget: leftWidget, rank: 0, expanded: true }]
                } as SidePanel.LayoutData,
                rightPanel: {
                    type: 'sidepanel',
                    items: [{ widget: rightWidget, rank: 0, expanded: true }]
                } as SidePanel.LayoutData,
                mainPanel: {
                    main: {
                        type: 'tab-area',
                        widgets: [mainWidget],
                        currentIndex: 0
                    } as DockLayout.ITabAreaConfig
                },
                bottomPanel: {
                    config: {
                        main: {
                            type: 'tab-area',
                            widgets: [bottomWidget],
                            currentIndex: 0
                        } as DockLayout.ITabAreaConfig
                    }
                }
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ids = (service as any).collectWidgetIds(layout);
            expect(ids.has('left-w')).to.be.true;
            expect(ids.has('right-w')).to.be.true;
            expect(ids.has('main-w')).to.be.true;
            expect(ids.has('bottom-w')).to.be.true;
            expect(ids.size).to.equal(4);
        });
    });

    describe('detachStrayWidgets', () => {
        it('should detach a left-panel widget whose ID is not in the layout ID set', () => {
            const strayWidget = new Widget();
            strayWidget.id = 'stray-left';
            const panel = new Panel();
            Widget.attach(panel, document.body);
            panel.addWidget(strayWidget);
            expect(strayWidget.isAttached).to.be.true;

            getWidgetsStub.withArgs('left').returns([strayWidget]);
            getWidgetsStub.withArgs('right').returns([]);

            const widgetIds = new Set<string>();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).detachStrayWidgets(widgetIds);

            expect(strayWidget.isAttached).to.be.false;

            panel.dispose();
        });

        it('should detach a right-panel widget whose ID is not in the layout ID set', () => {
            const strayWidget = new Widget();
            strayWidget.id = 'stray-right';
            const panel = new Panel();
            Widget.attach(panel, document.body);
            panel.addWidget(strayWidget);
            expect(strayWidget.isAttached).to.be.true;

            getWidgetsStub.withArgs('left').returns([]);
            getWidgetsStub.withArgs('right').returns([strayWidget]);

            const widgetIds = new Set<string>();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).detachStrayWidgets(widgetIds);

            expect(strayWidget.isAttached).to.be.false;

            panel.dispose();
        });

        it('should NOT detach a widget whose ID IS in the layout ID set', () => {
            const keptWidget = new Widget();
            keptWidget.id = 'kept-widget';
            const panel = new Panel();
            Widget.attach(panel, document.body);
            panel.addWidget(keptWidget);
            expect(keptWidget.isAttached).to.be.true;

            getWidgetsStub.withArgs('left').returns([keptWidget]);
            getWidgetsStub.withArgs('right').returns([]);

            const widgetIds = new Set<string>(['kept-widget']);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).detachStrayWidgets(widgetIds);

            expect(keptWidget.isAttached).to.be.true;

            panel.dispose();
        });

        it('should handle empty side panels gracefully', () => {
            getWidgetsStub.withArgs('left').returns([]);
            getWidgetsStub.withArgs('right').returns([]);

            const widgetIds = new Set<string>();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(() => (service as any).detachStrayWidgets(widgetIds)).to.not.throw();
        });

        it('should detach non-viewPlacements widget that leaked from another perspective', () => {
            // Simulate: Outline widget is in the left panel but not in the target layout
            const outlineWidget = new Widget();
            outlineWidget.id = 'outline-view';
            const panel = new Panel();
            Widget.attach(panel, document.body);
            panel.addWidget(outlineWidget);

            getWidgetsStub.withArgs('left').returns([outlineWidget]);
            getWidgetsStub.withArgs('right').returns([]);

            // Target layout has no widgets — outline should be detached
            const widgetIds = new Set<string>();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).detachStrayWidgets(widgetIds);

            expect(outlineWidget.isAttached).to.be.false;

            panel.dispose();
        });

        it('should detach multiple stray widgets from both panels', () => {
            const leftStray = new Widget();
            leftStray.id = 'left-stray';
            const rightStray = new Widget();
            rightStray.id = 'right-stray';
            const leftPanel = new Panel();
            const rightPanel = new Panel();
            Widget.attach(leftPanel, document.body);
            Widget.attach(rightPanel, document.body);
            leftPanel.addWidget(leftStray);
            rightPanel.addWidget(rightStray);

            getWidgetsStub.withArgs('left').returns([leftStray]);
            getWidgetsStub.withArgs('right').returns([rightStray]);

            const widgetIds = new Set<string>();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).detachStrayWidgets(widgetIds);

            expect(leftStray.isAttached).to.be.false;
            expect(rightStray.isAttached).to.be.false;

            leftPanel.dispose();
            rightPanel.dispose();
        });

        describe('stray widget cleanup during perspective switch', () => {
            let parentPanel: Panel;

            beforeEach(() => {
                parentPanel = new Panel();
                Widget.attach(parentPanel, document.body);
            });

            afterEach(() => {
                parentPanel.dispose();
            });

            it('should detach stray widgets when restoring a saved layout', async () => {
                const chatWidget = new Widget();
                chatWidget.id = 'chat-view';
                parentPanel.addWidget(chatWidget);

                getOrCreateWidgetStub.withArgs('chat-view').resolves(chatWidget);

                service.registerPerspective({
                    id: 'perspA',
                    label: 'A',
                    viewPlacements: new Map([['chat-view', 'main' as ApplicationShell.Area]])
                });
                service.registerPerspective({
                    id: 'perspB',
                    label: 'B',
                    viewPlacements: new Map()
                });

                // Activate A (first time — viewPlacements applied)
                await service.switchPerspective('perspA');

                // Simulate saving A's layout WITHOUT chat-view (user closed it)
                const layoutAWithoutChat: ApplicationShell.LayoutData = {
                    mainPanel: {
                        main: {
                            type: 'tab-area',
                            widgets: [],
                            currentIndex: -1
                        } as DockLayout.ITabAreaConfig
                    },
                    bottomPanel: undefined
                };
                getLayoutDataStub.returns(layoutAWithoutChat);

                // Switch to B (saves A's layout without chat)
                await service.switchPerspective('perspB');

                // chat-view is still attached (simulating the stray scenario)
                expect(chatWidget.isAttached).to.be.true;

                // When switching back to A, shell.getWidgets returns the stray
                getWidgetsStub.withArgs('left').returns([chatWidget]);
                getWidgetsStub.withArgs('right').returns([]);

                // Switch back to A — should restore layout and detach stray chat-view
                await service.switchPerspective('perspA');

                expect(chatWidget.isAttached).to.be.false;
            });

            it('should NOT detach a widget that IS in the saved layout (user customization preserved)', async () => {
                const chatWidget = new Widget();
                chatWidget.id = 'chat-view';
                parentPanel.addWidget(chatWidget);

                getOrCreateWidgetStub.withArgs('chat-view').resolves(chatWidget);

                service.registerPerspective({
                    id: 'perspA',
                    label: 'A',
                    viewPlacements: new Map([['chat-view', 'main' as ApplicationShell.Area]])
                });
                service.registerPerspective({
                    id: 'perspB',
                    label: 'B',
                    viewPlacements: new Map()
                });

                // Activate A
                await service.switchPerspective('perspA');

                // Simulate saving A's layout WITH chat-view in right panel
                const layoutAWithChat: ApplicationShell.LayoutData = {
                    rightPanel: {
                        type: 'sidepanel',
                        items: [{ widget: chatWidget, rank: 0, expanded: true }]
                    } as SidePanel.LayoutData,
                    mainPanel: undefined,
                    bottomPanel: undefined
                };
                getLayoutDataStub.returns(layoutAWithChat);

                // Switch to B (saves A's layout with chat)
                await service.switchPerspective('perspB');

                // When switching back, chat is in the right panel
                getWidgetsStub.withArgs('left').returns([]);
                getWidgetsStub.withArgs('right').returns([chatWidget]);

                // Switch back to A — chat IS in layout, should NOT be detached
                await service.switchPerspective('perspA');

                expect(chatWidget.isAttached).to.be.true;
            });

            it('should detach non-viewPlacements widget leaking from another perspective', async () => {
                // Outline is not in AI First's viewPlacements
                const outlineWidget = new Widget();
                outlineWidget.id = 'outline-view';
                parentPanel.addWidget(outlineWidget);

                service.registerPerspective({
                    id: 'ai-first',
                    label: 'AI First',
                    viewPlacements: new Map([['chat-view', 'main' as ApplicationShell.Area]])
                });
                service.registerPerspective({
                    id: 'default-persp',
                    label: 'Default',
                    viewPlacements: new Map()
                });

                // Activate AI First
                await service.switchPerspective('ai-first');

                // Save AI First layout without outline
                const aiLayout: ApplicationShell.LayoutData = {
                    mainPanel: {
                        main: {
                            type: 'tab-area',
                            widgets: [],
                            currentIndex: -1
                        } as DockLayout.ITabAreaConfig
                    },
                    bottomPanel: undefined
                };
                getLayoutDataStub.returns(aiLayout);

                // Switch to default (saves AI First layout)
                await service.switchPerspective('default-persp');

                // Outline is open in default's left panel
                expect(outlineWidget.isAttached).to.be.true;

                // Switch back to AI First — outline is a stray
                getWidgetsStub.withArgs('left').returns([outlineWidget]);
                getWidgetsStub.withArgs('right').returns([]);

                await service.switchPerspective('ai-first');

                // Outline should be detached (not in AI First's saved layout)
                expect(outlineWidget.isAttached).to.be.false;
            });
        });
    });
});
