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

        const mockShell = {
            addWidget: addWidgetStub,
            activateWidget: activateWidgetStub,
            getTabBarFor: getTabBarForStub,
            getAreaFor: getAreaForStub
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
});
