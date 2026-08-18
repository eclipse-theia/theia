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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from 'chai';
import { WalkthroughService } from './walkthrough-service';
import { Emitter } from '@theia/core/lib/common/event';
import { WalkthroughContribution } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { ContextKeyChangeEvent } from '@theia/core/lib/browser/context-key-service';

describe('WalkthroughService', () => {

    let service: WalkthroughService;
    let storedData: Record<string, unknown>;
    let onDidChangePluginsEmitter: Emitter<void>;
    let onDidExecuteCommandEmitter: Emitter<{ commandId: string }>;
    let onPreferenceChangedEmitter: Emitter<{ preferenceName: string }>;
    let onDidChangeContextKeyEmitter: Emitter<ContextKeyChangeEvent>;
    let mockPlugins: { model: { id: string; publisher: string; name: string }, outOfSync?: boolean }[];
    let mockDeployedPlugins: Map<string, any>;
    let mockContextKeyMatchResult: boolean;
    let executedCommands: { commandId: string; args: unknown[] }[];
    let mockPreferences: Record<string, unknown>;
    let onDidExpandViewEmitter: Emitter<string>;
    let mockOpenerGetOpener: () => Promise<{ open: (...args: unknown[]) => void }>;
    let mockOpenerOpenCalls: string[];
    let reportedErrors: string[];
    let mockDisabledByTrust: Set<string>;

    function createContribution(overrides?: Partial<WalkthroughContribution>): WalkthroughContribution {
        return {
            id: 'test-walkthrough',
            title: 'Test Walkthrough',
            description: 'A walkthrough for testing',
            pluginId: 'test.publisher.test-plugin',
            steps: [
                {
                    id: 'step1',
                    title: 'Step One',
                    description: 'First step',
                    completionEvents: ['onCommand:test.command'],
                },
                {
                    id: 'step2',
                    title: 'Step Two',
                    description: 'Second step',
                    completionEvents: ['onSettingChanged:editor.fontSize'],
                }
            ],
            ...overrides
        };
    }

    beforeEach(() => {
        storedData = {};
        onDidChangePluginsEmitter = new Emitter();
        onDidExecuteCommandEmitter = new Emitter();
        onPreferenceChangedEmitter = new Emitter();
        onDidChangeContextKeyEmitter = new Emitter();
        mockPlugins = [];
        mockDeployedPlugins = new Map();
        mockContextKeyMatchResult = false;
        executedCommands = [];
        mockOpenerOpenCalls = [];
        reportedErrors = [];
        mockDisabledByTrust = new Set();
        const mockOpener = { open: (...args: unknown[]) => { mockOpenerOpenCalls.push(String(args[0])); } };
        mockOpenerGetOpener = () => Promise.resolve(mockOpener);
        onDidExpandViewEmitter = new Emitter();
        mockPreferences = {
            'workbench.welcomePage.walkthroughs.openOnInstall': true
        };

        service = new WalkthroughService();

        // Manually wire dependencies
        (service as any).storageService = {
            getData: (key: string, defaultValue: unknown) => Promise.resolve(storedData[key] ?? defaultValue),
            setData: (key: string, value: unknown) => {
                storedData[key] = value;
                return Promise.resolve();
            }
        };
        (service as any).commandRegistry = {
            onDidExecuteCommand: onDidExecuteCommandEmitter.event,
            executeCommand: (commandId: string, ...args: unknown[]) => {
                executedCommands.push({ commandId, args });
                return Promise.resolve();
            }
        };
        (service as any).preferenceService = {
            onPreferenceChanged: onPreferenceChangedEmitter.event
        };
        (service as any).contextKeyService = {
            onDidChange: onDidChangeContextKeyEmitter.event,
            match: () => mockContextKeyMatchResult,
            // Good enough for the expressions used here: every identifier is a key.
            parseKeys: (expression: string) => new Set(expression.match(/[A-Za-z_][A-Za-z0-9_.]*/g) ?? [])
        };
        (service as any).gettingStartedPreferences = new Proxy({}, {
            get: (_target, prop) => mockPreferences[prop as string]
        });
        (service as any).viewEventSource = {
            onDidExpandView: onDidExpandViewEmitter.event
        };
        (service as any).openerService = {
            getOpener: () => mockOpenerGetOpener()
        };
        (service as any).logger = {
            warn: () => { },
            error: () => { },
            info: () => { },
            debug: () => { }
        };
        (service as any).messageService = {
            error: (message: string) => {
                reportedErrors.push(message);
                return Promise.resolve(undefined);
            }
        };
        (service as any).pluginSupport = {
            get plugins(): { model: { id: string; publisher: string; name: string }, outOfSync?: boolean }[] { return mockPlugins; },
            getPlugin: (id: string) => mockDeployedPlugins.get(id),
            get disabledByTrust(): ReadonlySet<string> { return mockDisabledByTrust; },
            onDidChangePlugins: onDidChangePluginsEmitter.event
        };
    });

    afterEach(() => {
        service.dispose();
        onDidChangePluginsEmitter.dispose();
        onDidExecuteCommandEmitter.dispose();
        onPreferenceChangedEmitter.dispose();
        onDidChangeContextKeyEmitter.dispose();
        onDidExpandViewEmitter.dispose();
    });

    describe('registerWalkthrough', () => {
        it('should register a walkthrough and make it retrievable', () => {
            const contribution = createContribution();
            (service as any).registerWalkthrough(contribution);

            const walkthroughs = service.getWalkthroughs();
            expect(walkthroughs).to.have.lengthOf(1);
            expect(walkthroughs[0].id).to.equal('test.publisher.test-plugin.test-walkthrough');
            expect(walkthroughs[0].title).to.equal('Test Walkthrough');
            expect(walkthroughs[0].steps).to.have.lengthOf(2);
        });

        it('should construct full ID from pluginId and walkthrough id', () => {
            const contribution = createContribution({ pluginId: 'my.plugin', id: 'my-wt' });
            (service as any).registerWalkthrough(contribution);

            expect(service.getWalkthrough('my.plugin.my-wt')).to.not.be.undefined;
        });

        it('should fire onDidChangeWalkthroughs event', () => {
            let fired = false;
            service.onDidChangeWalkthroughs(() => { fired = true; });

            (service as any).registerWalkthrough(createContribution());
            expect(fired).to.be.true;
        });

        it('should initialize steps as not complete', () => {
            (service as any).registerWalkthrough(createContribution());
            const walkthrough = service.getWalkthroughs()[0];
            for (const step of walkthrough.steps) {
                expect(step.isComplete).to.be.false;
            }
        });
    });

    describe('markStepComplete', () => {
        beforeEach(() => {
            (service as any).registerWalkthrough(createContribution());
        });

        it('should mark a step as complete', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            await service.markStepComplete(wtId, 'step1');

            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.true;
            expect(walkthrough.steps[1].isComplete).to.be.false;
        });

        it('should persist progress to storage', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            await service.markStepComplete(wtId, 'step1');

            const stored = storedData['walkthrough-progress'] as { completedSteps: Record<string, string[]> };
            expect(stored.completedSteps[wtId]).to.include('step1');
        });

        it('should fire onDidChangeWalkthroughs on completion', async () => {
            let fireCount = 0;
            service.onDidChangeWalkthroughs(() => { fireCount++; });
            const wtId = 'test.publisher.test-plugin.test-walkthrough';

            // fireCount starts at 0 after registering above event
            await service.markStepComplete(wtId, 'step1');
            expect(fireCount).to.equal(1);
        });

        it('should not fire event if step is already complete', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            await service.markStepComplete(wtId, 'step1');

            let fired = false;
            service.onDidChangeWalkthroughs(() => { fired = true; });
            await service.markStepComplete(wtId, 'step1');
            expect(fired).to.be.false;
        });

        it('should no-op for unknown walkthrough', async () => {
            await service.markStepComplete('nonexistent', 'step1');
            // should not throw
        });

        it('should no-op for unknown step', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            await service.markStepComplete(wtId, 'nonexistent-step');
            // should not throw
        });
    });

    describe('markStepIncomplete', () => {
        const wtId = 'test.publisher.test-plugin.test-walkthrough';

        beforeEach(() => {
            (service as any).registerWalkthrough(createContribution());
        });

        it('should take the completion mark off a step again', async () => {
            await service.markStepComplete(wtId, 'step1');
            expect(service.getWalkthrough(wtId)!.steps[0].isComplete).to.be.true;

            await service.markStepIncomplete(wtId, 'step1');

            expect(service.getWalkthrough(wtId)!.steps[0].isComplete).to.be.false;
        });

        it('should remove the step from the persisted progress', async () => {
            await service.markStepComplete(wtId, 'step1');
            await service.markStepComplete(wtId, 'step2');
            await service.markStepIncomplete(wtId, 'step1');

            expect((storedData['walkthrough-progress'] as any).completedSteps[wtId]).to.deep.equal(['step2']);
        });

        it('should no-op for a step that is not complete', async () => {
            let fired = false;
            service.onDidChangeWalkthroughs(() => { fired = true; });
            await service.markStepIncomplete(wtId, 'step1');

            expect(fired).to.be.false;
        });

        it('should no-op for an unknown step', async () => {
            let fired = false;
            service.onDidChangeWalkthroughs(() => { fired = true; });
            await service.markStepIncomplete(wtId, 'nonexistent');

            expect(fired).to.be.false;
        });

        it('should let the progress go back down', async () => {
            await service.markAllStepsComplete(wtId);
            expect(service.getStepProgress(wtId)).to.deep.equal({ completed: 2, total: 2 });

            await service.markStepIncomplete(wtId, 'step1');

            expect(service.getStepProgress(wtId)).to.deep.equal({ completed: 1, total: 2 });
        });
    });

    describe('markAllStepsComplete', () => {
        const wtId = 'test.publisher.test-plugin.test-walkthrough';

        beforeEach(() => {
            (service as any).registerWalkthrough(createContribution());
        });

        it('should complete every step', async () => {
            await service.markAllStepsComplete(wtId);

            const walkthrough = service.getWalkthrough(wtId)!;
            for (const step of walkthrough.steps) {
                expect(step.isComplete).to.be.true;
            }
        });

        it('should persist the progress once', async () => {
            await service.markAllStepsComplete(wtId);

            const stored = storedData['walkthrough-progress'] as any;
            expect(stored.completedSteps[wtId]).to.deep.equal(['step1', 'step2']);
        });

        it('should no-op when everything is already complete', async () => {
            await service.markAllStepsComplete(wtId);

            let fired = false;
            service.onDidChangeWalkthroughs(() => { fired = true; });
            await service.markAllStepsComplete(wtId);

            expect(fired).to.be.false;
        });

        it('should no-op for an unknown walkthrough', async () => {
            let fired = false;
            service.onDidChangeWalkthroughs(() => { fired = true; });
            await service.markAllStepsComplete('nonexistent');

            expect(fired).to.be.false;
        });
    });

    describe('resetProgress', () => {
        beforeEach(async () => {
            (service as any).registerWalkthrough(createContribution());
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            await service.markStepComplete(wtId, 'step1');
            await service.markStepComplete(wtId, 'step2');
        });

        it('should reset all steps to incomplete', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            await service.resetProgress(wtId);

            const walkthrough = service.getWalkthrough(wtId)!;
            for (const step of walkthrough.steps) {
                expect(step.isComplete).to.be.false;
            }
        });

        it('should remove progress from storage', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            await service.resetProgress(wtId);

            const stored = storedData['walkthrough-progress'] as { completedSteps: Record<string, string[]> };
            expect(stored.completedSteps[wtId]).to.be.undefined;
        });

        it('should no-op for unknown walkthrough', async () => {
            await service.resetProgress('nonexistent');
            // should not throw
        });
    });

    describe('getStepProgress', () => {
        beforeEach(() => {
            (service as any).registerWalkthrough(createContribution());
        });

        it('should return correct progress', () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            const progress = service.getStepProgress(wtId);
            expect(progress.completed).to.equal(0);
            expect(progress.total).to.equal(2);
        });

        it('should update after marking steps complete', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            await service.markStepComplete(wtId, 'step1');

            const progress = service.getStepProgress(wtId);
            expect(progress.completed).to.equal(1);
            expect(progress.total).to.equal(2);
        });

        it('should return zero for unknown walkthrough', () => {
            const progress = service.getStepProgress('nonexistent');
            expect(progress.completed).to.equal(0);
            expect(progress.total).to.equal(0);
        });
    });

    describe('completion event handling', () => {
        beforeEach(() => {
            (service as any).registerWalkthrough(createContribution());
            // Wire up the event handlers that @postConstruct would normally set up
            (service as any).toDispose.push(
                (service as any).commandRegistry.onDidExecuteCommand((e: { commandId: string }) => {
                    (service as any).handleCompletionEvent(`onCommand:${e.commandId}`);
                })
            );
            (service as any).toDispose.push(
                (service as any).preferenceService.onPreferenceChanged((e: { preferenceName: string }) => {
                    (service as any).handleCompletionEvent(`onSettingChanged:${e.preferenceName}`);
                })
            );
        });

        it('should complete step on matching command execution', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            onDidExecuteCommandEmitter.fire({ commandId: 'test.command' });

            // Give the async markStepComplete a tick to complete
            await new Promise(resolve => setTimeout(resolve, 10));

            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.true;
            expect(walkthrough.steps[1].isComplete).to.be.false;
        });

        it('should complete step on matching preference change', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            onPreferenceChangedEmitter.fire({ preferenceName: 'editor.fontSize' });

            await new Promise(resolve => setTimeout(resolve, 10));

            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.false;
            expect(walkthrough.steps[1].isComplete).to.be.true;
        });

        it('should not complete step on non-matching event', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            onDidExecuteCommandEmitter.fire({ commandId: 'unrelated.command' });

            await new Promise(resolve => setTimeout(resolve, 10));

            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.false;
            expect(walkthrough.steps[1].isComplete).to.be.false;
        });
    });

    describe('progress persistence', () => {
        it('should restore completed steps from storage on registration', async () => {
            storedData['walkthrough-progress'] = {
                completedSteps: {
                    'test.publisher.test-plugin.test-walkthrough': ['step1']
                }
            };

            // Simulate what loadProgress does
            await (service as any).loadProgress();
            (service as any).registerWalkthrough(createContribution());

            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.true;
            expect(walkthrough.steps[1].isComplete).to.be.false;
        });

        it('should not register a walkthrough before the persisted progress was read', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            const pluginId = 'test.publisher.test-plugin';
            storedData['walkthrough-progress'] = { completedSteps: { [wtId]: ['step1'] } };

            // Plugins are deployed while the storage read is still pending.
            let releaseStorage = () => { };
            const pendingRead = new Promise<void>(resolve => { releaseStorage = resolve; });
            (service as any).storageService = {
                getData: async (key: string, defaultValue: unknown) => {
                    await pendingRead;
                    return storedData[key] ?? defaultValue;
                },
                setData: () => Promise.resolve()
            };
            mockPlugins = [{ model: { id: pluginId, publisher: 'test.publisher', name: 'test-plugin' } }];
            mockDeployedPlugins.set(pluginId, { contributes: { walkthroughs: [createContribution()] } });

            (service as any).init();
            onDidChangePluginsEmitter.fire();
            expect(service.getWalkthroughs(), 'nothing may be registered yet').to.be.empty;

            releaseStorage();
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(service.getWalkthrough(wtId)!.steps[0].isComplete, 'the saved progress has to be applied').to.be.true;
        });

        it('should handle missing storage data gracefully', async () => {
            await (service as any).loadProgress();
            (service as any).registerWalkthrough(createContribution());

            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            const walkthrough = service.getWalkthrough(wtId)!;
            for (const step of walkthrough.steps) {
                expect(step.isComplete).to.be.false;
            }
        });
    });

    describe('extension icon', () => {
        it('should carry the icon of the contributing extension', () => {
            (service as any).registerWalkthrough(createContribution({ pluginIcon: 'hostedPlugin/pub_name/icon.png' }));

            const walkthrough = service.getWalkthrough('test.publisher.test-plugin.test-walkthrough')!;
            expect(walkthrough.pluginIcon).to.equal('hostedPlugin/pub_name/icon.png');
        });

        it('should leave the icon undefined when the extension declares none', () => {
            (service as any).registerWalkthrough(createContribution());

            const walkthrough = service.getWalkthrough('test.publisher.test-plugin.test-walkthrough')!;
            expect(walkthrough.pluginIcon).to.be.undefined;
        });
    });

    describe('selection', () => {
        const wtId = 'test.publisher.test-plugin.test-walkthrough';

        it('should have no selection initially', () => {
            expect(service.selectedWalkthrough).to.be.undefined;
            expect(service.selectedStep).to.be.undefined;
        });

        it('should retain the selected walkthrough and fire onDidChangeSelection', () => {
            (service as any).registerWalkthrough(createContribution());

            let fired = 0;
            service.onDidChangeSelection(() => { fired++; });
            service.selectWalkthrough(wtId);

            expect(fired).to.equal(1);
            expect(service.selectedWalkthrough?.id).to.equal(wtId);
        });

        it('should preselect the first pending step', () => {
            (service as any).registerWalkthrough(createContribution());
            service.selectWalkthrough(wtId);

            expect(service.selectedStep?.id).to.equal('step1');
        });

        it('should preselect the first step that is not yet complete', async () => {
            (service as any).registerWalkthrough(createContribution());
            await service.markStepComplete(wtId, 'step1');
            service.selectWalkthrough(wtId);

            expect(service.selectedStep?.id).to.equal('step2');
        });

        it('should accept the VS Code `publisher.name#walkthroughId` form', () => {
            (service as any).registerWalkthrough(createContribution());
            service.selectWalkthrough('test.publisher.test-plugin#test-walkthrough');

            expect(service.selectedWalkthrough?.id).to.equal(wtId);
        });

        it('should not select an unknown walkthrough', () => {
            let fired = false;
            service.onDidChangeSelection(() => { fired = true; });
            service.selectWalkthrough('nonexistent');

            expect(fired).to.be.false;
            expect(service.selectedWalkthrough).to.be.undefined;
        });

        it('should select another step of the selected walkthrough', () => {
            (service as any).registerWalkthrough(createContribution());
            service.selectWalkthrough(wtId);
            service.selectStep('step2');

            expect(service.selectedStep?.id).to.equal('step2');
        });

        it('should ignore a step that does not belong to the selected walkthrough', () => {
            (service as any).registerWalkthrough(createContribution());
            service.selectWalkthrough(wtId);
            service.selectStep('nonexistent');

            expect(service.selectedStep?.id).to.equal('step1');
        });

        it('should clear the selection', () => {
            (service as any).registerWalkthrough(createContribution());
            service.selectWalkthrough(wtId);

            let fired = 0;
            service.onDidChangeSelection(() => { fired++; });
            service.clearSelection();

            expect(fired).to.equal(1);
            expect(service.selectedWalkthrough).to.be.undefined;
            expect(service.selectedStep).to.be.undefined;
        });

        it('should not fire onDidChangeSelection when clearing an empty selection', () => {
            let fired = false;
            service.onDidChangeSelection(() => { fired = true; });
            service.clearSelection();

            expect(fired).to.be.false;
        });

        it('should reflect step completion in the selected step', async () => {
            (service as any).registerWalkthrough(createContribution());
            service.selectWalkthrough(wtId);
            await service.markStepComplete(wtId, 'step1');

            expect(service.selectedStep?.id).to.equal('step1');
            expect(service.selectedStep?.isComplete).to.be.true;
        });
    });

    describe('when clauses', () => {
        const wtId = 'test.publisher.test-plugin.test-walkthrough';

        it('should hide a walkthrough whose when clause does not hold', () => {
            mockContextKeyMatchResult = false;
            (service as any).registerWalkthrough(createContribution({ when: 'someKey' }));

            expect(service.getWalkthroughs()).to.be.empty;
            expect(service.getWalkthrough(wtId)).to.be.undefined;
        });

        it('should list a walkthrough whose when clause holds', () => {
            mockContextKeyMatchResult = true;
            (service as any).registerWalkthrough(createContribution({ when: 'someKey' }));

            expect(service.getWalkthroughs()).to.have.lengthOf(1);
        });

        it('should always list a walkthrough without a when clause', () => {
            mockContextKeyMatchResult = false;
            (service as any).registerWalkthrough(createContribution());

            expect(service.getWalkthroughs()).to.have.lengthOf(1);
        });

        it('should hide the steps whose when clause does not hold', () => {
            mockContextKeyMatchResult = false;
            (service as any).registerWalkthrough(createContribution({
                steps: [
                    { id: 'always', title: 'Always', description: 'd' },
                    { id: 'never', title: 'Never', description: 'd', when: 'someKey' }
                ]
            }));

            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps).to.have.lengthOf(1);
            expect(walkthrough.steps[0].id).to.equal('always');
        });

        it('should exclude hidden steps from the progress', () => {
            mockContextKeyMatchResult = false;
            (service as any).registerWalkthrough(createContribution({
                steps: [
                    { id: 'always', title: 'Always', description: 'd' },
                    { id: 'never', title: 'Never', description: 'd', when: 'someKey' }
                ]
            }));

            expect(service.getStepProgress(wtId)).to.deep.equal({ completed: 0, total: 1 });
        });

        it('should not select a hidden walkthrough', () => {
            mockContextKeyMatchResult = false;
            (service as any).registerWalkthrough(createContribution({ when: 'someKey' }));
            service.selectWalkthrough(wtId);

            expect(service.selectedWalkthrough).to.be.undefined;
        });

        it('should preselect the first pending visible step', () => {
            mockContextKeyMatchResult = false;
            (service as any).registerWalkthrough(createContribution({
                steps: [
                    { id: 'hidden', title: 'Hidden', description: 'd', when: 'someKey' },
                    { id: 'visible', title: 'Visible', description: 'd' }
                ]
            }));
            service.selectWalkthrough(wtId);

            expect(service.selectedStep?.id).to.equal('visible');
        });

        it('should re-evaluate visibility whenever it is queried', () => {
            mockContextKeyMatchResult = false;
            (service as any).registerWalkthrough(createContribution({ when: 'someKey' }));
            expect(service.getWalkthroughs()).to.be.empty;

            mockContextKeyMatchResult = true;
            expect(service.getWalkthroughs()).to.have.lengthOf(1);
        });

        it('should collect the context keys of every when clause and onContext event', () => {
            (service as any).registerWalkthrough(createContribution({
                when: 'walkthroughKey',
                steps: [{ id: 's1', title: 'S1', description: 'd', when: 'stepKey', completionEvents: ['onContext:eventKey'] }]
            }));

            const keys = (service as any).getContextKeys() as Set<string>;
            expect(Array.from(keys).sort()).to.deep.equal(['eventKey', 'stepKey', 'walkthroughKey']);
        });

        it('should notify when visibility changed', () => {
            (service as any).registerWalkthrough(createContribution({ when: 'someKey' }));

            let fired = false;
            service.onDidChangeWalkthroughs(() => { fired = true; });
            (service as any).handleVisibilityChanged();

            expect(fired).to.be.true;
        });

        it('should close a selected walkthrough that becomes hidden', () => {
            mockContextKeyMatchResult = true;
            (service as any).registerWalkthrough(createContribution({ when: 'someKey' }));
            service.selectWalkthrough(wtId);
            expect(service.selectedWalkthrough?.id).to.equal(wtId);

            mockContextKeyMatchResult = false;
            (service as any).handleVisibilityChanged();

            expect(service.selectedWalkthrough).to.be.undefined;
        });

        it('should mark only the visible steps done', async () => {
            mockContextKeyMatchResult = false;
            (service as any).registerWalkthrough(createContribution({
                steps: [
                    { id: 'always', title: 'Always', description: 'd' },
                    { id: 'never', title: 'Never', description: 'd', when: 'someKey' }
                ]
            }));

            await service.markAllStepsComplete(wtId);

            expect(storedData['walkthrough-progress']).to.deep.equal({ completedSteps: { [wtId]: ['always'] } });
        });
    });

    describe('getWalkthrough / getWalkthroughs', () => {
        it('should return undefined for non-existent walkthrough', () => {
            expect(service.getWalkthrough('nonexistent')).to.be.undefined;
        });

        it('should return empty array when no walkthroughs registered', () => {
            expect(service.getWalkthroughs()).to.be.empty;
        });

        it('should return all registered walkthroughs', () => {
            (service as any).registerWalkthrough(createContribution({ id: 'wt1' }));
            (service as any).registerWalkthrough(createContribution({ id: 'wt2' }));

            const walkthroughs = service.getWalkthroughs();
            expect(walkthroughs).to.have.lengthOf(2);
        });
    });

    describe('uninstalled and disabled plugins', () => {
        const pluginId = 'test.publisher.test-plugin';
        const wtId = 'test.publisher.test-plugin.test-walkthrough';

        beforeEach(() => {
            mockPlugins = [{ model: { id: pluginId, publisher: 'test.publisher', name: 'test-plugin' } }];
            mockDeployedPlugins.set(pluginId, { contributes: { walkthroughs: [createContribution()] } });
            (service as any).syncWalkthroughsFromPlugins();
        });

        it('should offer the walkthrough of an installed plugin', () => {
            expect(service.getWalkthrough(wtId)).to.not.be.undefined;
        });

        it('should replace a walkthrough whose definition changed', () => {
            expect(service.getWalkthrough(wtId)!.steps).to.have.lengthOf(2);

            // The plugin was updated and now contributes a single step.
            mockDeployedPlugins.set(pluginId, {
                contributes: {
                    walkthroughs: [createContribution({
                        steps: [{ id: 'only', title: 'Only Step', description: 'd' }]
                    })]
                }
            });
            (service as any).syncWalkthroughsFromPlugins();

            const steps = service.getWalkthrough(wtId)!.steps;
            expect(steps).to.have.lengthOf(1);
            expect(steps[0].id).to.equal('only');
        });

        it('should keep a walkthrough whose definition is unchanged', () => {
            let fired = false;
            service.onDidChangeWalkthroughs(() => { fired = true; });
            (service as any).syncWalkthroughsFromPlugins();

            expect(fired, 'an unchanged sync must not notify').to.be.false;
        });

        it('should not offer the walkthrough of a plugin restricted by workspace trust', () => {
            expect(service.getWalkthrough(wtId), 'offered while the workspace is trusted').to.not.be.undefined;

            mockDisabledByTrust.add(pluginId);
            (service as any).syncWalkthroughsFromPlugins();

            expect(service.getWalkthroughs()).to.be.empty;
        });

        it('should offer it again once the workspace is trusted', () => {
            mockDisabledByTrust.add(pluginId);
            (service as any).syncWalkthroughsFromPlugins();
            expect(service.getWalkthroughs()).to.be.empty;

            mockDisabledByTrust.delete(pluginId);
            (service as any).syncWalkthroughsFromPlugins();

            expect(service.getWalkthrough(wtId)).to.not.be.undefined;
        });

        it('should close a restricted walkthrough that was open', () => {
            service.selectWalkthrough(wtId);
            expect(service.selectedWalkthrough?.id).to.equal(wtId);

            mockDisabledByTrust.add(pluginId);
            (service as any).syncWalkthroughsFromPlugins();

            expect(service.selectedWalkthrough).to.be.undefined;
        });

        it('should drop the walkthrough once the plugin is out of sync', () => {
            // Theia keeps an uninstalled or disabled plugin loaded until the next reload, flagged as out of sync.
            mockPlugins[0].outOfSync = true;
            (service as any).syncWalkthroughsFromPlugins();

            expect(service.getWalkthrough(wtId)).to.be.undefined;
            expect(service.getWalkthroughs()).to.be.empty;
        });

        it('should notify when the walkthrough is dropped', () => {
            let fired = false;
            service.onDidChangeWalkthroughs(() => { fired = true; });
            mockPlugins[0].outOfSync = true;
            (service as any).syncWalkthroughsFromPlugins();

            expect(fired).to.be.true;
        });

        it('should close the walkthrough if it was open', () => {
            service.selectWalkthrough(wtId);
            expect(service.selectedWalkthrough?.id).to.equal(wtId);

            mockPlugins[0].outOfSync = true;
            (service as any).syncWalkthroughsFromPlugins();

            expect(service.selectedWalkthrough).to.be.undefined;
        });
    });

    describe('extensionInstalled completion event', () => {
        const walkthroughContribution = createContribution({
            steps: [
                {
                    id: 'install-step',
                    title: 'Install Extension',
                    description: 'Install the helper extension',
                    completionEvents: ['extensionInstalled:some.extension'],
                }
            ]
        });

        function setupPluginWithWalkthrough(): void {
            const pluginId = 'test.publisher.test-plugin';
            mockPlugins = [{ model: { id: pluginId, publisher: 'test.publisher', name: 'test-plugin' } }];
            mockDeployedPlugins.set(pluginId, {
                contributes: { walkthroughs: [walkthroughContribution] }
            });
        }

        beforeEach(() => {
            // Set up the plugin so the walkthrough is discovered via syncWalkthroughsFromPlugins
            setupPluginWithWalkthrough();
            (service as any).syncWalkthroughsFromPlugins();
            // Wire up the onDidChangePlugins handler manually (simulating @postConstruct)
            (service as any).toDispose.push(
                (service as any).pluginSupport.onDidChangePlugins(() => {
                    const previousIds = new Set((service as any).knownPluginIds);
                    (service as any).syncWalkthroughsFromPlugins();
                    const newIds = new Set(
                        (service as any).pluginSupport.plugins.map((p: any) => p.model.id)
                    );
                    for (const newId of newIds) {
                        if (!previousIds.has(newId)) {
                            (service as any).handleCompletionEvent(`extensionInstalled:${newId}`);
                            (service as any).handleExtensionInstalledAutoOpen(newId);
                        }
                    }
                    (service as any).knownPluginIds = newIds;
                })
            );
            // Mark the plugin as known initially so that the walkthrough plugin itself doesn't trigger
            (service as any).knownPluginIds = new Set(['test.publisher.test-plugin']);
        });

        it('should complete step when matching extension is installed', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            // Add a new plugin 'some.extension'
            mockPlugins.push({ model: { id: 'some.extension', publisher: 'some', name: 'extension' } });
            onDidChangePluginsEmitter.fire();

            await new Promise(resolve => setTimeout(resolve, 10));

            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.true;
        });

        it('should not fire extensionInstalled for plugins present at startup', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            // Mark some.extension as already known
            (service as any).knownPluginIds = new Set(['test.publisher.test-plugin', 'some.extension']);
            mockPlugins.push({ model: { id: 'some.extension', publisher: 'some', name: 'extension' } });
            onDidChangePluginsEmitter.fire();

            await new Promise(resolve => setTimeout(resolve, 10));

            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.false;
        });

        it('should not fire extensionInstalled when a plugin is removed', async () => {
            // Start with some.extension known
            (service as any).knownPluginIds = new Set(['test.publisher.test-plugin', 'some.extension']);
            // Don't add some.extension to mockPlugins (it's removed)
            onDidChangePluginsEmitter.fire();

            await new Promise(resolve => setTimeout(resolve, 10));

            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.false;
        });

        it('should not complete step when non-matching extension is installed', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            mockPlugins.push({ model: { id: 'other.extension', publisher: 'other', name: 'extension' } });
            onDidChangePluginsEmitter.fire();

            await new Promise(resolve => setTimeout(resolve, 10));

            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.false;
        });
    });

    describe('onContext completion event', () => {
        beforeEach(() => {
            (service as any).registerWalkthrough(createContribution({
                steps: [
                    {
                        id: 'context-step',
                        title: 'Context Step',
                        description: 'Completes on context key',
                        completionEvents: ['onContext:myFeature.enabled'],
                    }
                ]
            }));
            // Wire up the context key handler manually
            (service as any).toDispose.push(
                (service as any).contextKeyService.onDidChange((event: ContextKeyChangeEvent) => {
                    for (const [walkthroughId, walkthrough] of (service as any).walkthroughs) {
                        for (const step of walkthrough.steps) {
                            if (step.isComplete || !step.completionEvents) {
                                continue;
                            }
                            for (const completionEvent of step.completionEvents) {
                                if (completionEvent.startsWith('onContext:')) {
                                    const contextKey = completionEvent.substring('onContext:'.length);
                                    if (event.affects(new Set([contextKey])) && (service as any).contextKeyService.match(contextKey)) {
                                        service.markStepComplete(walkthroughId, step.id);
                                    }
                                }
                            }
                        }
                    }
                })
            );
        });

        it('should complete step when context key changes and becomes truthy', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            mockContextKeyMatchResult = true;
            onDidChangeContextKeyEmitter.fire({
                affects: (keys: { has(key: string): boolean }) => keys.has('myFeature.enabled')
            });

            await new Promise(resolve => setTimeout(resolve, 10));

            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.true;
        });

        it('should not complete step when context key changes but is not truthy', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            mockContextKeyMatchResult = false;
            onDidChangeContextKeyEmitter.fire({
                affects: (keys: { has(key: string): boolean }) => keys.has('myFeature.enabled')
            });

            await new Promise(resolve => setTimeout(resolve, 10));

            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.false;
        });

        it('should not complete step when unrelated context key changes', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            mockContextKeyMatchResult = true;
            onDidChangeContextKeyEmitter.fire({
                affects: (keys: { has(key: string): boolean }) => keys.has('unrelated.key')
            });

            await new Promise(resolve => setTimeout(resolve, 10));

            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.false;
        });
    });

    describe('onContext expressions', () => {
        it('should complete a step whose context expression already holds at registration', () => {
            mockContextKeyMatchResult = true;
            (service as any).registerWalkthrough(createContribution({
                steps: [{ id: 'static', title: 'Static', description: 'd', completionEvents: ['onContext:isLinux'] }]
            }));

            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            expect(service.getWalkthrough(wtId)!.steps[0].isComplete).to.be.true;
        });

        it('should react to a context expression rather than treating it as a single key', () => {
            (service as any).registerWalkthrough(createContribution({
                steps: [{ id: 'expr', title: 'Expression', description: 'd', completionEvents: ['onContext:foo && bar'] }]
            }));

            // The keys of the expression have to be recognised, not the expression string itself.
            const keys = (service as any).getContextKeys() as Set<string>;
            expect(Array.from(keys).sort()).to.deep.equal(['bar', 'foo']);

            mockContextKeyMatchResult = true;
            (service as any).completeMatchingContextSteps();

            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            expect(service.getWalkthrough(wtId)!.steps[0].isComplete).to.be.true;
        });
    });

    describe('onView completion event', () => {
        beforeEach(() => {
            (service as any).registerWalkthrough(createContribution({
                steps: [
                    {
                        id: 'view-step',
                        title: 'View Step',
                        description: 'Completes on view expand',
                        completionEvents: ['onView:myExtension.myView'],
                    }
                ]
            }));
            // Wire up the onView handler manually
            (service as any).toDispose.push(
                (service as any).viewEventSource.onDidExpandView((viewId: string) => {
                    (service as any).handleCompletionEvent(`onView:${viewId}`);
                })
            );
        });

        it('should complete step when matching view is expanded', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            onDidExpandViewEmitter.fire('myExtension.myView');

            await new Promise(resolve => setTimeout(resolve, 10));

            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.true;
        });

        it('should not complete step for non-matching view', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            onDidExpandViewEmitter.fire('someOther.view');

            await new Promise(resolve => setTimeout(resolve, 10));

            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.false;
        });

        it('should handle multiple onView completion events on different steps', async () => {
            // Register a second walkthrough with a different view event
            (service as any).registerWalkthrough(createContribution({
                id: 'multi-view-walkthrough',
                steps: [
                    {
                        id: 'view-step-a',
                        title: 'View Step A',
                        description: 'First view',
                        completionEvents: ['onView:view.alpha'],
                    },
                    {
                        id: 'view-step-b',
                        title: 'View Step B',
                        description: 'Second view',
                        completionEvents: ['onView:view.beta'],
                    }
                ]
            }));

            onDidExpandViewEmitter.fire('view.alpha');
            await new Promise(resolve => setTimeout(resolve, 10));

            const wtId = 'test.publisher.test-plugin.multi-view-walkthrough';
            let walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.true;
            expect(walkthrough.steps[1].isComplete).to.be.false;

            onDidExpandViewEmitter.fire('view.beta');
            await new Promise(resolve => setTimeout(resolve, 10));

            walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.true;
            expect(walkthrough.steps[1].isComplete).to.be.true;
        });
    });

    describe('onLink completion event', () => {
        beforeEach(() => {
            (service as any).registerWalkthrough(createContribution({
                steps: [
                    {
                        id: 'link-step',
                        title: 'Link Step',
                        description: 'Completes on link click',
                        completionEvents: ['onLink:https://example.com'],
                    }
                ]
            }));
        });

        it('should complete step and open link when handleLinkClick is called with matching URL', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            service.handleLinkClick('https://example.com');

            await new Promise(resolve => setTimeout(resolve, 10));

            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.true;
            expect(mockOpenerOpenCalls).to.have.lengthOf(1);
        });

        it('should not complete step for non-matching URL but still open link', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            service.handleLinkClick('https://other.com');

            await new Promise(resolve => setTimeout(resolve, 10));

            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.false;
            expect(mockOpenerOpenCalls).to.have.lengthOf(1);
        });

        it('should complete step with command: URI', async () => {
            (service as any).registerWalkthrough(createContribution({
                id: 'cmd-link-walkthrough',
                steps: [
                    {
                        id: 'cmd-link-step',
                        title: 'Command Link Step',
                        description: 'Completes on command link',
                        completionEvents: ['onLink:command:workbench.action.openSettings'],
                    }
                ]
            }));

            service.handleLinkClick('command:workbench.action.openSettings');

            await new Promise(resolve => setTimeout(resolve, 10));

            const wtId = 'test.publisher.test-plugin.cmd-link-walkthrough';
            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.true;
        });

        it('should strip the `toSide:` prefix before opening a command link', async () => {
            await service.handleLinkClick('command:toSide:jupyter.createnewnotebook');

            expect(mockOpenerOpenCalls).to.have.lengthOf(1);
            expect(mockOpenerOpenCalls[0]).to.equal('command:jupyter.createnewnotebook');
            expect(reportedErrors).to.be.empty;
        });

        it('should report an error instead of rejecting when the link cannot be opened', async () => {
            mockOpenerGetOpener = () => Promise.reject(new Error("The command 'missing.command' cannot be executed."));

            await service.handleLinkClick('command:missing.command');

            expect(reportedErrors).to.have.lengthOf(1);
            expect(reportedErrors[0]).to.contain('missing.command');
        });

        it('should still complete the step when the link cannot be opened', async () => {
            const wtId = 'test.publisher.test-plugin.test-walkthrough';
            mockOpenerGetOpener = () => Promise.reject(new Error('no opener'));

            await service.handleLinkClick('https://example.com');

            const walkthrough = service.getWalkthrough(wtId)!;
            expect(walkthrough.steps[0].isComplete).to.be.true;
        });
    });

    describe('openOnInstall preference', () => {
        const contribution = createContribution();

        function setupPluginWithWalkthrough(): void {
            const pluginId = 'test.publisher.test-plugin';
            mockPlugins = [{ model: { id: pluginId, publisher: 'test.publisher', name: 'test-plugin' } }];
            mockDeployedPlugins.set(pluginId, {
                contributes: { walkthroughs: [contribution] }
            });
        }

        beforeEach(() => {
            // Wire up the onDidChangePlugins handler manually
            (service as any).toDispose.push(
                (service as any).pluginSupport.onDidChangePlugins(() => {
                    const previousIds = new Set((service as any).knownPluginIds);
                    (service as any).syncWalkthroughsFromPlugins();
                    const newIds = new Set(
                        (service as any).pluginSupport.plugins.map((p: any) => p.model.id)
                    );
                    for (const newId of newIds) {
                        if (!previousIds.has(newId)) {
                            (service as any).handleCompletionEvent(`extensionInstalled:${newId}`);
                            (service as any).handleExtensionInstalledAutoOpen(newId);
                        }
                    }
                    (service as any).knownPluginIds = newIds;
                })
            );
        });

        it('should execute walkthrough.open when openOnInstall is true and extension has walkthroughs', () => {
            mockPreferences['workbench.welcomePage.walkthroughs.openOnInstall'] = true;
            setupPluginWithWalkthrough();
            onDidChangePluginsEmitter.fire();

            expect(executedCommands).to.have.lengthOf(1);
            expect(executedCommands[0].commandId).to.equal('walkthrough.open');
            expect(executedCommands[0].args[0]).to.equal('test.publisher.test-plugin.test-walkthrough');
        });

        it('should not execute walkthrough.open when openOnInstall is false', () => {
            mockPreferences['workbench.welcomePage.walkthroughs.openOnInstall'] = false;
            setupPluginWithWalkthrough();
            onDidChangePluginsEmitter.fire();

            expect(executedCommands).to.be.empty;
        });

        it('should not execute walkthrough.open when extension has no walkthroughs', () => {
            mockPreferences['workbench.welcomePage.walkthroughs.openOnInstall'] = true;
            // This plugin doesn't contribute walkthroughs
            mockPlugins = [{ model: { id: 'other.publisher.no-walkthroughs', publisher: 'other.publisher', name: 'no-walkthroughs' } }];
            onDidChangePluginsEmitter.fire();

            expect(executedCommands).to.be.empty;
        });
    });
});
