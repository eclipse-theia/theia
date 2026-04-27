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
    let mockPlugins: { model: { id: string; publisher: string; name: string } }[];
    let mockDeployedPlugins: Map<string, any>;
    let mockContextKeyMatchResult: boolean;
    let executedCommands: { commandId: string; args: unknown[] }[];
    let mockPreferences: Record<string, unknown>;
    let onDidExpandViewEmitter: Emitter<string>;
    let mockOpenerGetOpener: () => Promise<{ open: (...args: unknown[]) => void }>;
    let mockOpenerOpenCalls: string[];

    function createContribution(overrides?: Partial<WalkthroughContribution>): WalkthroughContribution {
        return {
            id: 'test-walkthrough',
            title: 'Test Walkthrough',
            description: 'A walkthrough for testing',
            pluginId: 'test.publisher.test-plugin',
            extensionUri: '/path/to/extension',
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
            match: () => mockContextKeyMatchResult
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
        (service as any).pluginSupport = {
            get plugins(): { model: { id: string; publisher: string; name: string } }[] { return mockPlugins; },
            getPlugin: (id: string) => mockDeployedPlugins.get(id),
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

    describe('selectWalkthrough', () => {
        it('should fire onDidSelectWalkthrough for a known walkthrough', () => {
            (service as any).registerWalkthrough(createContribution());
            const wtId = 'test.publisher.test-plugin.test-walkthrough';

            let selectedId: string | undefined;
            service.onDidSelectWalkthrough(id => { selectedId = id; });
            service.selectWalkthrough(wtId);

            expect(selectedId).to.equal(wtId);
        });

        it('should not fire onDidSelectWalkthrough for unknown walkthrough', () => {
            let fired = false;
            service.onDidSelectWalkthrough(() => { fired = true; });
            service.selectWalkthrough('nonexistent');

            expect(fired).to.be.false;
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
