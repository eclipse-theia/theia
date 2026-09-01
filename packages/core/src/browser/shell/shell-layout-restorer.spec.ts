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

import { enableJSDOM } from '../test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import * as sinon from 'sinon';
import {
    ShellLayoutRestorer,
    PersistedPerspectiveData,
    PERSPECTIVE_LAYOUTS_STORAGE_KEY
} from './shell-layout-restorer';
import { ApplicationShell } from './application-shell';
disableJSDOM();

describe('ShellLayoutRestorer - Perspective Support', () => {
    let restorer: ShellLayoutRestorer;
    let mockStorageService: { setData: sinon.SinonStub; getData: sinon.SinonStub };
    let mockLogger: { info: sinon.SinonStub; error: sinon.SinonStub; warn: sinon.SinonStub };
    let mockWidgetManager: { getDescription: sinon.SinonStub };
    let mockShell: {
        getLayoutData: sinon.SinonStub;
        setLayoutData: sinon.SinonStub;
    };
    let mockApp: { shell: typeof mockShell };
    let mockProvider: {
        getActivePerspectiveId: sinon.SinonStub;
        getSavedPerspectiveIds: sinon.SinonStub;
        getSavedLayout: sinon.SinonStub;
        setSavedLayout: sinon.SinonStub;
        setActivePerspectiveId: sinon.SinonStub;
        clearSavedLayouts: sinon.SinonStub;
        onLayoutRestored: sinon.SinonStub;
        defaultPerspectiveId: string;
    };
    let mockTransformations: { getContributions: sinon.SinonStub };
    let mockMigrations: { getContributions: sinon.SinonStub };
    let mockWindowService: { isSafeToShutDown: sinon.SinonStub; reload: sinon.SinonStub };
    let mockThemeService: { reset: sinon.SinonStub };
    let toTearDown: () => void;

    beforeEach(() => {
        toTearDown = enableJSDOM();

        mockStorageService = {
            setData: sinon.stub().resolves(),
            getData: sinon.stub().resolves(undefined)
        };
        mockLogger = {
            info: sinon.stub(),
            error: sinon.stub(),
            warn: sinon.stub()
        };
        mockWidgetManager = {
            getDescription: sinon.stub().returns(undefined)
        };
        mockShell = {
            getLayoutData: sinon.stub().returns({ version: 999, mainPanel: {}, bottomPanel: {} }),
            setLayoutData: sinon.stub().resolves()
        };
        mockApp = { shell: mockShell };
        mockProvider = {
            getActivePerspectiveId: sinon.stub().returns('default'),
            getSavedPerspectiveIds: sinon.stub().returns([]),
            getSavedLayout: sinon.stub().returns(undefined),
            setSavedLayout: sinon.stub(),
            setActivePerspectiveId: sinon.stub().returns(true),
            clearSavedLayouts: sinon.stub(),
            onLayoutRestored: sinon.stub(),
            defaultPerspectiveId: 'default'
        };
        mockTransformations = {
            getContributions: sinon.stub().returns([])
        };
        mockMigrations = {
            getContributions: sinon.stub().returns([])
        };
        mockWindowService = {
            isSafeToShutDown: sinon.stub().resolves(true),
            reload: sinon.stub()
        };
        mockThemeService = {
            reset: sinon.stub()
        };

        restorer = new ShellLayoutRestorer(
            mockWidgetManager as never,
            mockLogger as never,
            mockStorageService as never
        );

        (restorer as unknown as Record<string, unknown>)['perspectiveService'] = mockProvider;
        (restorer as unknown as Record<string, unknown>)['transformations'] = mockTransformations;
        (restorer as unknown as Record<string, unknown>)['migrations'] = mockMigrations;
        (restorer as unknown as Record<string, unknown>)['windowService'] = mockWindowService;
        (restorer as unknown as Record<string, unknown>)['themeService'] = mockThemeService;
    });

    afterEach(() => {
        sinon.restore();
        toTearDown();
    });

    describe('storePerspectiveLayouts', () => {
        it('should read current shell layout as the active perspective layout', () => {

            mockProvider.getActivePerspectiveId.returns('persp-a');
            mockProvider.getSavedPerspectiveIds.returns([]);
            const currentLayout = { version: 999, mainPanel: { items: ['editor1'] }, bottomPanel: {} };
            mockShell.getLayoutData.returns(currentLayout);

            restorer.storeLayout(mockApp as never);

            const perspCall = mockStorageService.setData.getCalls().find(
                (c: sinon.SinonSpyCall) => c.args[0] === PERSPECTIVE_LAYOUTS_STORAGE_KEY && c.args[1] !== undefined
            );
            expect(perspCall).to.not.be.undefined;
            const data = perspCall!.args[1] as PersistedPerspectiveData;
            expect(data.activePerspectiveId).to.equal('persp-a');
            expect(data.layouts['persp-a']).to.be.a('string');
            // Verify it contains the current shell layout content
            const parsed = JSON.parse(data.layouts['persp-a']);
            expect(parsed.mainPanel.items).to.deep.equal(['editor1']);
        });

        it('should deflate all inactive perspective layouts from provider', () => {

            mockProvider.getActivePerspectiveId.returns('active');
            mockProvider.getSavedPerspectiveIds.returns(['active', 'inactive1', 'inactive2']);
            const inactiveLayout1 = { version: 999, mainPanel: { items: ['w1'] }, bottomPanel: {} } as unknown as ApplicationShell.LayoutData;
            const inactiveLayout2 = { version: 999, mainPanel: { items: ['w2'] }, bottomPanel: {} } as unknown as ApplicationShell.LayoutData;
            mockProvider.getSavedLayout.withArgs('inactive1').returns(inactiveLayout1);
            mockProvider.getSavedLayout.withArgs('inactive2').returns(inactiveLayout2);
            mockProvider.getSavedLayout.withArgs('active').returns(undefined);

            restorer.storeLayout(mockApp as never);

            const [, data] = mockStorageService.setData.firstCall.args as [string, PersistedPerspectiveData];
            expect(Object.keys(data.layouts)).to.have.lengthOf(3);
            expect(data.layouts).to.have.property('active');
            expect(data.layouts).to.have.property('inactive1');
            expect(data.layouts).to.have.property('inactive2');
        });

        it('should use shell layout for active perspective, not provider', () => {

            mockProvider.getActivePerspectiveId.returns('active');
            mockProvider.getSavedPerspectiveIds.returns(['active']);
            // Provider has stale data for the active perspective
            const staleLayout = { version: 999, mainPanel: { items: ['stale'] }, bottomPanel: {} } as unknown as ApplicationShell.LayoutData;
            mockProvider.getSavedLayout.withArgs('active').returns(staleLayout);
            // Shell has the current data
            const currentLayout = { version: 999, mainPanel: { items: ['current'] }, bottomPanel: {} };
            mockShell.getLayoutData.returns(currentLayout);

            restorer.storeLayout(mockApp as never);

            const [, data] = mockStorageService.setData.firstCall.args as [string, PersistedPerspectiveData];
            const parsed = JSON.parse(data.layouts['active']);
            // Should use shell data, not provider data
            expect(parsed.mainPanel.items).to.deep.equal(['current']);
        });

        it('should write to legacy key when only default perspective is used', () => {
            mockProvider.getActivePerspectiveId.returns('default');
            mockProvider.getSavedPerspectiveIds.returns([]);

            restorer.storeLayout(mockApp as never);

            // Should write to legacy key for backward compatibility
            const legacyCall = mockStorageService.setData.getCalls().find(
                (c: sinon.SinonSpyCall) => c.args[0] === 'layout'
            );
            expect(legacyCall).to.not.be.undefined;
            // Should clear the perspective key
            const perspClear = mockStorageService.setData.getCalls().find(
                (c: sinon.SinonSpyCall) => c.args[0] === PERSPECTIVE_LAYOUTS_STORAGE_KEY && c.args[1] === undefined
            );
            expect(perspClear).to.not.be.undefined;
        });

        it('should write to perspective key when multiple perspectives are used', () => {
            mockProvider.getActivePerspectiveId.returns('persp-a');
            mockProvider.getSavedPerspectiveIds.returns(['persp-a', 'persp-b']);
            const inactiveLayout = { version: 999, mainPanel: { items: ['b'] }, bottomPanel: {} } as unknown as ApplicationShell.LayoutData;
            mockProvider.getSavedLayout.withArgs('persp-b').returns(inactiveLayout);
            mockProvider.getSavedLayout.withArgs('persp-a').returns(undefined);

            restorer.storeLayout(mockApp as never);

            const perspCall = mockStorageService.setData.getCalls().find(
                (c: sinon.SinonSpyCall) => c.args[0] === PERSPECTIVE_LAYOUTS_STORAGE_KEY && c.args[1] !== undefined
            );
            expect(perspCall).to.not.be.undefined;
            // Should clear the legacy key
            const legacyClear = mockStorageService.setData.getCalls().find(
                (c: sinon.SinonSpyCall) => c.args[0] === 'layout' && c.args[1] === undefined
            );
            expect(legacyClear).to.not.be.undefined;
        });
    });

    describe('restorePerspectiveLayouts', () => {
        it('should inflate all layouts and push to provider', async () => {

            const persisted: PersistedPerspectiveData = {
                activePerspectiveId: 'persp-a',
                layouts: {
                    'persp-a': JSON.stringify({ version: 999, mainPanel: { items: ['a'] }, bottomPanel: {} }),
                    'persp-b': JSON.stringify({ version: 999, mainPanel: { items: ['b'] }, bottomPanel: {} })
                }
            };
            mockStorageService.getData.withArgs(PERSPECTIVE_LAYOUTS_STORAGE_KEY).resolves(persisted);

            // Return the inflated layout for the active persp when asked
            mockProvider.getSavedLayout.callsFake((id: string) => {
                if (id === 'persp-a') {
                    // After setSavedLayout is called, return the layout
                    const call = mockProvider.setSavedLayout.getCalls().find(
                        (c: sinon.SinonSpyCall) => c.args[0] === 'persp-a'
                    );
                    return call?.args[1];
                }
                return undefined;
            });

            const result = await restorer.restoreLayout(mockApp as never);

            expect(result).to.be.true;
            expect(mockProvider.setSavedLayout.callCount).to.equal(2);
            // Verify persp-a was set
            const setACall = mockProvider.setSavedLayout.getCalls().find(
                (c: sinon.SinonSpyCall) => c.args[0] === 'persp-a'
            );
            expect(setACall).to.not.be.undefined;
            // Verify persp-b was set
            const setBCall = mockProvider.setSavedLayout.getCalls().find(
                (c: sinon.SinonSpyCall) => c.args[0] === 'persp-b'
            );
            expect(setBCall).to.not.be.undefined;
        });

        it('should set active perspective ID on provider', async () => {

            const persisted: PersistedPerspectiveData = {
                activePerspectiveId: 'my-persp',
                layouts: {
                    'my-persp': JSON.stringify({ version: 999, mainPanel: {}, bottomPanel: {} })
                }
            };
            mockStorageService.getData.withArgs(PERSPECTIVE_LAYOUTS_STORAGE_KEY).resolves(persisted);

            mockProvider.getSavedLayout.callsFake((id: string) => {
                const call = mockProvider.setSavedLayout.getCalls().find(
                    (c: sinon.SinonSpyCall) => c.args[0] === id
                );
                return call?.args[1];
            });

            await restorer.restoreLayout(mockApp as never);

            expect(mockProvider.setActivePerspectiveId.calledWith('my-persp')).to.be.true;
        });

        it('should apply the active layout to the shell', async () => {

            const layoutData = { version: 999, mainPanel: { items: ['active-item'] }, bottomPanel: {} };
            const persisted: PersistedPerspectiveData = {
                activePerspectiveId: 'active',
                layouts: {
                    'active': JSON.stringify(layoutData)
                }
            };
            mockStorageService.getData.withArgs(PERSPECTIVE_LAYOUTS_STORAGE_KEY).resolves(persisted);

            mockProvider.getSavedLayout.callsFake((id: string) => {
                const call = mockProvider.setSavedLayout.getCalls().find(
                    (c: sinon.SinonSpyCall) => c.args[0] === id
                );
                return call?.args[1];
            });

            await restorer.restoreLayout(mockApp as never);

            expect(mockShell.setLayoutData.calledOnce).to.be.true;
            const applied = mockShell.setLayoutData.firstCall.args[0];
            expect(applied.mainPanel.items).to.deep.equal(['active-item']);
        });

        it('should apply transformations to all inflated layouts, not just the active one', async () => {

            const transformer = {
                transformLayoutOnRestore: sinon.stub()
            };
            mockTransformations.getContributions.returns([transformer]);

            const persisted: PersistedPerspectiveData = {
                activePerspectiveId: 'persp-a',
                layouts: {
                    'persp-a': JSON.stringify({ version: 999, mainPanel: {}, bottomPanel: {} }),
                    'persp-b': JSON.stringify({ version: 999, mainPanel: {}, bottomPanel: {} })
                }
            };
            mockStorageService.getData.withArgs(PERSPECTIVE_LAYOUTS_STORAGE_KEY).resolves(persisted);
            mockProvider.getSavedLayout.callsFake((id: string) => {
                const call = mockProvider.setSavedLayout.getCalls().find(
                    (c: sinon.SinonSpyCall) => c.args[0] === id
                );
                return call?.args[1];
            });

            await restorer.restoreLayout(mockApp as never);

            // Transformer should be called for both layouts
            expect(transformer.transformLayoutOnRestore.callCount).to.equal(2);
        });

        it('should fall back to provider active ID when persisted ID is not registered', async () => {

            const persisted: PersistedPerspectiveData = {
                activePerspectiveId: 'removed-persp',
                layouts: {
                    'removed-persp': JSON.stringify({ version: 999, mainPanel: {}, bottomPanel: {} }),
                    'default': JSON.stringify({ version: 999, mainPanel: { items: ['default-w'] }, bottomPanel: {} })
                }
            };
            mockStorageService.getData.withArgs(PERSPECTIVE_LAYOUTS_STORAGE_KEY).resolves(persisted);
            mockProvider.setActivePerspectiveId.returns(false);
            mockProvider.getActivePerspectiveId.returns('default');
            mockProvider.getSavedLayout.callsFake((id: string) => {
                const call = mockProvider.setSavedLayout.getCalls().find(
                    (c: sinon.SinonSpyCall) => c.args[0] === id
                );
                return call?.args[1];
            });

            const result = await restorer.restoreLayout(mockApp as never);

            expect(result).to.be.true;
            // Should apply 'default' layout to shell, not 'removed-persp'
            const applied = mockShell.setLayoutData.firstCall.args[0];
            expect(applied.mainPanel.items).to.deep.equal(['default-w']);
            // onLayoutRestored should be called with 'default'
            expect(mockProvider.onLayoutRestored.calledWith('default')).to.be.true;
        });

        it('should return false when no perspective data and no legacy data exists', async () => {

            mockStorageService.getData.resolves(undefined);

            const result = await restorer.restoreLayout(mockApp as never);

            expect(result).to.be.false;
        });

        it('should warn when a perspective layout fails to inflate', async () => {

            const persisted: PersistedPerspectiveData = {
                activePerspectiveId: 'good',
                layouts: {
                    'good': JSON.stringify({ version: 999, mainPanel: {}, bottomPanel: {} }),
                    'bad': 'invalid-json{'
                }
            };
            mockStorageService.getData.withArgs(PERSPECTIVE_LAYOUTS_STORAGE_KEY).resolves(persisted);

            mockProvider.getSavedLayout.callsFake((id: string) => {
                const call = mockProvider.setSavedLayout.getCalls().find(
                    (c: sinon.SinonSpyCall) => c.args[0] === id
                );
                return call?.args[1];
            });

            await restorer.restoreLayout(mockApp as never);

            // 'good' should be inflated successfully
            const goodCall = mockProvider.setSavedLayout.getCalls().find(
                (c: sinon.SinonSpyCall) => c.args[0] === 'good'
            );
            expect(goodCall).to.not.be.undefined;

            // Should warn about 'bad'
            expect(mockLogger.warn.called).to.be.true;
            const warnCall = mockLogger.warn.getCalls().find(
                (c: sinon.SinonSpyCall) => (c.args[0] as string).includes('bad')
            );
            expect(warnCall).to.not.be.undefined;
        });
    });

    describe('legacy migration', () => {
        it('should fall back to legacy key when perspective-layouts is absent', async () => {

            const legacyLayout = JSON.stringify({ version: 999, mainPanel: { items: ['legacy'] }, bottomPanel: {} });
            mockStorageService.getData.withArgs(PERSPECTIVE_LAYOUTS_STORAGE_KEY).resolves(undefined);
            mockStorageService.getData.withArgs('layout').resolves(legacyLayout);

            mockProvider.getSavedLayout.callsFake((id: string) => {
                const call = mockProvider.setSavedLayout.getCalls().find(
                    (c: sinon.SinonSpyCall) => c.args[0] === id
                );
                return call?.args[1];
            });

            const result = await restorer.restoreLayout(mockApp as never);

            expect(result).to.be.true;
            // Should push layout as 'default' perspective
            expect(mockProvider.setSavedLayout.calledOnce).to.be.true;
            expect(mockProvider.setSavedLayout.firstCall.args[0]).to.equal('default');
            // Should set active to 'default'
            expect(mockProvider.setActivePerspectiveId.calledWith('default')).to.be.true;
        });

        it('should keep the legacy key after a successful migration', async () => {

            const legacyLayout = JSON.stringify({ version: 999, mainPanel: { items: ['legacy'] }, bottomPanel: {} });
            mockStorageService.getData.withArgs(PERSPECTIVE_LAYOUTS_STORAGE_KEY).resolves(undefined);
            mockStorageService.getData.withArgs('layout').resolves(legacyLayout);

            mockProvider.getSavedLayout.callsFake((id: string) => {
                const call = mockProvider.setSavedLayout.getCalls().find(
                    (c: sinon.SinonSpyCall) => c.args[0] === id
                );
                return call?.args[1];
            });

            await restorer.restoreLayout(mockApp as never);

            // Restoring must not touch the key: it is rewritten or cleared by the next `storeLayout`,
            // so a crash before then still finds the layout where it was.
            const legacyWrite = mockStorageService.setData.getCalls().find(
                (c: sinon.SinonSpyCall) => c.args[0] === 'layout'
            );
            expect(legacyWrite).to.be.undefined;
        });

        it('should preserve legacy key when inflate fails', async () => {

            mockStorageService.getData.withArgs(PERSPECTIVE_LAYOUTS_STORAGE_KEY).resolves(undefined);
            mockStorageService.getData.withArgs('layout').resolves('not-valid-json{');

            const result = await restorer.restoreLayout(mockApp as never);

            expect(result).to.be.false;
            // Legacy key should NOT be cleared
            const legacyClear = mockStorageService.setData.getCalls().find(
                (c: sinon.SinonSpyCall) => c.args[0] === 'layout' && c.args[1] === undefined
            );
            expect(legacyClear).to.be.undefined;
            // No layout should have been saved
            expect(mockProvider.setSavedLayout.called).to.be.false;
            // Should warn about the failure
            expect(mockLogger.warn.called).to.be.true;
        });

        it('should apply migrated legacy layout to shell', async () => {

            const legacyLayout = JSON.stringify({ version: 999, mainPanel: { items: ['legacy-w'] }, bottomPanel: {} });
            mockStorageService.getData.withArgs(PERSPECTIVE_LAYOUTS_STORAGE_KEY).resolves(undefined);
            mockStorageService.getData.withArgs('layout').resolves(legacyLayout);

            mockProvider.getSavedLayout.callsFake((id: string) => {
                const call = mockProvider.setSavedLayout.getCalls().find(
                    (c: sinon.SinonSpyCall) => c.args[0] === id
                );
                return call?.args[1];
            });

            await restorer.restoreLayout(mockApp as never);

            expect(mockShell.setLayoutData.calledOnce).to.be.true;
        });
    });

    describe('storePerspectiveLayouts - error isolation', () => {
        it('should persist other perspectives when one inactive perspective deflate fails', () => {
            mockProvider.getActivePerspectiveId.returns('active');
            mockProvider.getSavedPerspectiveIds.returns(['active', 'good', 'bad']);

            const goodLayout = { version: 999, mainPanel: { items: ['good'] }, bottomPanel: {} } as unknown as ApplicationShell.LayoutData;
            // Create a layout with a circular reference that will cause JSON.stringify to throw
            const badLayout: Record<string, unknown> = { version: 999, mainPanel: {}, bottomPanel: {} };
            badLayout['self'] = badLayout;

            mockProvider.getSavedLayout.withArgs('good').returns(goodLayout);
            mockProvider.getSavedLayout.withArgs('bad').returns(badLayout);
            mockProvider.getSavedLayout.withArgs('active').returns(undefined);

            restorer.storeLayout(mockApp as never);

            // Multiple perspectives => writes to PERSPECTIVE_LAYOUTS_STORAGE_KEY and clears legacy
            const perspCall = mockStorageService.setData.getCalls().find(
                (c: sinon.SinonSpyCall) => c.args[0] === PERSPECTIVE_LAYOUTS_STORAGE_KEY && c.args[1] !== undefined
            );
            expect(perspCall).to.not.be.undefined;
            const data = perspCall!.args[1] as PersistedPerspectiveData;
            expect(data.layouts).to.have.property('active');
            expect(data.layouts).to.have.property('good');
            expect(data.layouts).to.not.have.property('bad');

            // Should warn about 'bad'
            expect(mockLogger.warn.called).to.be.true;
            const warnCall = mockLogger.warn.getCalls().find(
                (c: sinon.SinonSpyCall) => (c.args[0] as string).includes('bad')
            );
            expect(warnCall).to.not.be.undefined;
        });

        it('should persist inactive perspectives when active perspective deflate fails', () => {
            mockProvider.getActivePerspectiveId.returns('active');
            mockProvider.getSavedPerspectiveIds.returns(['active', 'inactive']);

            // Make the shell return a circular structure for the active perspective
            const circularLayout: Record<string, unknown> = { version: 999, mainPanel: {}, bottomPanel: {} };
            circularLayout['self'] = circularLayout;
            mockShell.getLayoutData.returns(circularLayout);

            const inactiveLayout = { version: 999, mainPanel: { items: ['inactive'] }, bottomPanel: {} } as unknown as ApplicationShell.LayoutData;
            mockProvider.getSavedLayout.withArgs('inactive').returns(inactiveLayout);

            restorer.storeLayout(mockApp as never);

            // Multiple perspectives (active + inactive) => writes to PERSPECTIVE_LAYOUTS_STORAGE_KEY
            const perspCall = mockStorageService.setData.getCalls().find(
                (c: sinon.SinonSpyCall) => c.args[0] === PERSPECTIVE_LAYOUTS_STORAGE_KEY && c.args[1] !== undefined
            );
            expect(perspCall).to.not.be.undefined;
            const data = perspCall!.args[1] as PersistedPerspectiveData;
            expect(data.layouts).to.not.have.property('active');
            expect(data.layouts).to.have.property('inactive');

            expect(mockLogger.warn.called).to.be.true;
        });

        it('should clear storage key when setData rejects (multi-perspective)', async () => {
            mockProvider.getActivePerspectiveId.returns('persp-a');
            mockProvider.getSavedPerspectiveIds.returns(['persp-a', 'persp-b']);
            const layout = { version: 999, mainPanel: {}, bottomPanel: {} } as unknown as ApplicationShell.LayoutData;
            mockProvider.getSavedLayout.withArgs('persp-b').returns(layout);

            // The perspective-layouts setData call rejects only the first time (when data is present)
            let perspCallCount = 0;
            mockStorageService.setData.callsFake((key: string, data: unknown) => {
                if (key === PERSPECTIVE_LAYOUTS_STORAGE_KEY && data !== undefined) {
                    perspCallCount++;
                    return Promise.reject(new Error('storage error'));
                }
                return Promise.resolve();
            });

            restorer.storeLayout(mockApp as never);

            // Allow the .catch() handler to execute
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(perspCallCount).to.equal(1);
            // Should have attempted to clear the perspective key
            const clearCall = mockStorageService.setData.getCalls().find(
                (c: sinon.SinonSpyCall) => c.args[0] === PERSPECTIVE_LAYOUTS_STORAGE_KEY && c.args[1] === undefined
            );
            expect(clearCall).to.not.be.undefined;

            expect(mockLogger.error.called).to.be.true;
        });
    });

    describe('restorePerspectiveLayouts - desync fallback', () => {
        it('should fall back to default perspective when active perspective has no saved layout', async () => {
            const persisted: PersistedPerspectiveData = {
                activePerspectiveId: 'custom',
                layouts: {
                    'default': JSON.stringify({ version: 999, mainPanel: { items: ['default-w'] }, bottomPanel: {} })
                }
            };
            mockStorageService.getData.withArgs(PERSPECTIVE_LAYOUTS_STORAGE_KEY).resolves(persisted);

            // 'custom' is a registered perspective, but has no layout entry
            mockProvider.setActivePerspectiveId.returns(true);

            // Track calls to setActivePerspectiveId to simulate state changes
            let currentActiveId = 'default';
            mockProvider.setActivePerspectiveId.callsFake((id: string) => {
                currentActiveId = id;
                return true;
            });
            mockProvider.getActivePerspectiveId.callsFake(() => currentActiveId);

            mockProvider.getSavedLayout.callsFake((id: string) => {
                const call = mockProvider.setSavedLayout.getCalls().find(
                    (c: sinon.SinonSpyCall) => c.args[0] === id
                );
                return call?.args[1];
            });

            const result = await restorer.restoreLayout(mockApp as never);

            expect(result).to.be.true;
            // Should have fallen back to default
            expect(mockLogger.warn.called).to.be.true;
            const warnCall = mockLogger.warn.getCalls().find(
                (c: sinon.SinonSpyCall) => (c.args[0] as string).includes('custom')
            );
            expect(warnCall).to.not.be.undefined;
            // Should have called onLayoutRestored with default
            expect(mockProvider.onLayoutRestored.calledWith('default')).to.be.true;
        });

        it('should call onLayoutRestored even when falling through to no layout', async () => {
            const persisted: PersistedPerspectiveData = {
                activePerspectiveId: 'custom',
                layouts: {}
            };
            mockStorageService.getData.withArgs(PERSPECTIVE_LAYOUTS_STORAGE_KEY).resolves(persisted);

            let currentActiveId = 'default';
            mockProvider.setActivePerspectiveId.callsFake((id: string) => {
                currentActiveId = id;
                return true;
            });
            mockProvider.getActivePerspectiveId.callsFake(() => currentActiveId);
            mockProvider.getSavedLayout.returns(undefined);

            const result = await restorer.restoreLayout(mockApp as never);

            expect(result).to.be.false;
            // onLayoutRestored should still be called
            expect(mockProvider.onLayoutRestored.calledOnce).to.be.true;
        });
    });

    describe('resetLayout', () => {
        it('should clear layouts and legacy layout keys', async () => {

            // Access private method
            await (restorer as unknown as Record<string, () => Promise<void>>)['resetLayout']();

            const setDataCalls = mockStorageService.setData.getCalls();
            const layoutClear = setDataCalls.find((c: sinon.SinonSpyCall) => c.args[0] === 'layout' && c.args[1] === undefined);
            const perspClear = setDataCalls.find((c: sinon.SinonSpyCall) => c.args[0] === PERSPECTIVE_LAYOUTS_STORAGE_KEY && c.args[1] === undefined);

            expect(layoutClear).to.not.be.undefined;
            expect(perspClear).to.not.be.undefined;
        });

        it('should call provider.clearSavedLayouts', async () => {

            await (restorer as unknown as Record<string, () => Promise<void>>)['resetLayout']();

            expect(mockProvider.clearSavedLayouts.calledOnce).to.be.true;
        });

        it('should reload the window after reset', async () => {

            await (restorer as unknown as Record<string, () => Promise<void>>)['resetLayout']();

            expect(mockWindowService.reload.calledOnce).to.be.true;
        });
    });

    describe('onLayoutRestored callback', () => {
        it('should call onLayoutRestored on provider after successful restore', async () => {

            const persisted: PersistedPerspectiveData = {
                activePerspectiveId: 'my-persp',
                layouts: {
                    'my-persp': JSON.stringify({ version: 999, mainPanel: {}, bottomPanel: {} })
                }
            };
            mockStorageService.getData.withArgs(PERSPECTIVE_LAYOUTS_STORAGE_KEY).resolves(persisted);

            let currentActiveId = 'default';
            mockProvider.setActivePerspectiveId.callsFake((id: string) => {
                currentActiveId = id;
                return true;
            });
            mockProvider.getActivePerspectiveId.callsFake(() => currentActiveId);

            mockProvider.getSavedLayout.callsFake((id: string) => {
                const call = mockProvider.setSavedLayout.getCalls().find(
                    (c: sinon.SinonSpyCall) => c.args[0] === id
                );
                return call?.args[1];
            });

            await restorer.restoreLayout(mockApp as never);

            expect(mockProvider.onLayoutRestored.calledOnce).to.be.true;
            expect(mockProvider.onLayoutRestored.calledWith('my-persp')).to.be.true;
        });

        it('should call onLayoutRestored even when no layout is restored', async () => {

            mockStorageService.getData.resolves(undefined);

            await restorer.restoreLayout(mockApp as never);

            expect(mockProvider.onLayoutRestored.calledOnce).to.be.true;
            expect(mockProvider.onLayoutRestored.calledWith('default')).to.be.true;
        });

        it('should call onLayoutRestored after layout is applied to shell', async () => {

            const persisted: PersistedPerspectiveData = {
                activePerspectiveId: 'active',
                layouts: {
                    'active': JSON.stringify({ version: 999, mainPanel: {}, bottomPanel: {} })
                }
            };
            mockStorageService.getData.withArgs(PERSPECTIVE_LAYOUTS_STORAGE_KEY).resolves(persisted);

            let currentActiveId = 'default';
            mockProvider.setActivePerspectiveId.callsFake((id: string) => {
                currentActiveId = id;
                return true;
            });
            mockProvider.getActivePerspectiveId.callsFake(() => currentActiveId);

            mockProvider.getSavedLayout.callsFake((id: string) => {
                const call = mockProvider.setSavedLayout.getCalls().find(
                    (c: sinon.SinonSpyCall) => c.args[0] === id
                );
                return call?.args[1];
            });

            await restorer.restoreLayout(mockApp as never);

            // onLayoutRestored should be called after setLayoutData
            expect(mockShell.setLayoutData.calledBefore(mockProvider.onLayoutRestored)).to.be.true;
        });
    });
});
