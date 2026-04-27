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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { DeployedPlugin, PluginIdentifiers, PluginMetadata, WalkthroughContribution, WalkthroughStepContribution } from '@theia/plugin-ext/lib/common/plugin-protocol';

import { OpenerService, open } from '@theia/core/lib/browser/opener-service';
import { URI } from '@theia/core/lib/common/uri';
import { Walkthrough, WalkthroughStep } from '../common/walkthrough-types';
import { GettingStartedPreferences } from '../common/getting-started-preferences';
import { WalkthroughCommands } from '../common/walkthrough-commands';

export const WalkthroughViewEventSource = Symbol('WalkthroughViewEventSource');
export interface WalkthroughViewEventSource {
    readonly onDidExpandView: Event<string>;
}

export const WalkthroughPluginSupport = Symbol('WalkthroughPluginSupport');
export interface WalkthroughPluginSupport {
    readonly plugins: PluginMetadata[];
    getPlugin(id: PluginIdentifiers.UnversionedId): DeployedPlugin | undefined;
    readonly onDidChangePlugins: Event<void>;
}

const WALKTHROUGH_PROGRESS_KEY = 'walkthrough-progress';

interface WalkthroughProgressState {
    completedSteps: { [walkthroughId: string]: string[] };
}

@injectable()
export class WalkthroughService implements Disposable {

    @inject(StorageService)
    protected readonly storageService: StorageService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(GettingStartedPreferences)
    protected readonly gettingStartedPreferences: GettingStartedPreferences;

    @inject(WalkthroughPluginSupport)
    protected readonly pluginSupport: WalkthroughPluginSupport;

    @inject(WalkthroughViewEventSource)
    protected readonly viewEventSource: WalkthroughViewEventSource;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    protected readonly walkthroughs = new Map<string, Walkthrough>();
    protected readonly toDispose = new DisposableCollection();

    protected readonly onDidChangeWalkthroughsEmitter = new Emitter<void>();
    readonly onDidChangeWalkthroughs: Event<void> = this.onDidChangeWalkthroughsEmitter.event;

    protected readonly onDidSelectWalkthroughEmitter = new Emitter<string>();
    readonly onDidSelectWalkthrough: Event<string> = this.onDidSelectWalkthroughEmitter.event;

    protected progressState: WalkthroughProgressState = { completedSteps: {} };
    protected progressLoaded = false;
    protected knownPluginIds: Set<string> = new Set();

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.onDidChangeWalkthroughsEmitter);
        this.toDispose.push(this.onDidSelectWalkthroughEmitter);
        this.loadProgress().then(() => {
            this.syncWalkthroughsFromPlugins();
            this.knownPluginIds = new Set(this.pluginSupport.plugins.map(p => p.model.id));
        });

        this.toDispose.push(this.pluginSupport.onDidChangePlugins(() => {
            const previousIds = new Set(this.knownPluginIds);
            this.syncWalkthroughsFromPlugins();
            const newIds = new Set(this.pluginSupport.plugins.map(p => p.model.id));
            for (const newId of newIds) {
                if (!previousIds.has(newId)) {
                    this.handleCompletionEvent(`extensionInstalled:${newId}`);
                    this.handleExtensionInstalledAutoOpen(newId);
                }
            }
            this.knownPluginIds = newIds;
        }));

        this.toDispose.push(this.commandRegistry.onDidExecuteCommand(e => {
            this.handleCompletionEvent(`onCommand:${e.commandId}`);
        }));

        this.toDispose.push(this.preferenceService.onPreferenceChanged(e => {
            this.handleCompletionEvent(`onSettingChanged:${e.preferenceName}`);
        }));

        // 5. onView: — on view expand (first open)
        this.toDispose.push(this.viewEventSource.onDidExpandView(viewId => {
            this.handleCompletionEvent(`onView:${viewId}`);
        }));

        this.toDispose.push(this.contextKeyService.onDidChange(event => {
            for (const [walkthroughId, walkthrough] of this.walkthroughs) {
                for (const step of walkthrough.steps) {
                    if (step.isComplete || !step.completionEvents) {
                        continue;
                    }
                    for (const completionEvent of step.completionEvents) {
                        if (completionEvent.startsWith('onContext:')) {
                            const contextKey = completionEvent.substring('onContext:'.length);
                            if (event.affects(new Set([contextKey])) && this.contextKeyService.match(contextKey)) {
                                this.markStepComplete(walkthroughId, step.id);
                            }
                        }
                    }
                }
            }
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected async loadProgress(): Promise<void> {
        this.progressState = await this.storageService.getData<WalkthroughProgressState>(
            WALKTHROUGH_PROGRESS_KEY,
            { completedSteps: {} }
        );
        this.progressLoaded = true;
    }

    protected async saveProgress(): Promise<void> {
        await this.storageService.setData(WALKTHROUGH_PROGRESS_KEY, this.progressState);
    }

    protected syncWalkthroughsFromPlugins(): void {
        const plugins = this.pluginSupport.plugins;
        const seenIds = new Set<string>();

        for (const pluginMeta of plugins) {
            const deployed = this.pluginSupport.getPlugin(
                PluginIdentifiers.componentsToUnversionedId(pluginMeta.model)
            );
            if (!deployed?.contributes?.walkthroughs) {
                continue;
            }
            for (const contribution of deployed.contributes.walkthroughs) {
                const fullId = `${contribution.pluginId}.${contribution.id}`;
                seenIds.add(fullId);
                if (!this.walkthroughs.has(fullId)) {
                    this.registerWalkthrough(contribution);
                }
            }
        }

        let changed = false;
        for (const id of this.walkthroughs.keys()) {
            if (!seenIds.has(id)) {
                this.walkthroughs.delete(id);
                changed = true;
            }
        }
        if (changed) {
            this.onDidChangeWalkthroughsEmitter.fire();
        }
    }

    protected registerWalkthrough(contribution: WalkthroughContribution): void {
        const fullId = `${contribution.pluginId}.${contribution.id}`;
        const completedSteps = this.progressState.completedSteps[fullId] || [];

        const steps: WalkthroughStep[] = contribution.steps.map(step => this.toWalkthroughStep(step, completedSteps));

        const walkthrough: Walkthrough = {
            id: fullId,
            title: contribution.title,
            description: contribution.description,
            steps,
            featuredFor: contribution.featuredFor,
            when: contribution.when,
            icon: contribution.icon,
            pluginId: contribution.pluginId,
            extensionUri: contribution.extensionUri
        };

        this.walkthroughs.set(fullId, walkthrough);
        this.onDidChangeWalkthroughsEmitter.fire();
    }

    protected toWalkthroughStep(step: WalkthroughStepContribution, completedSteps: string[]): WalkthroughStep {
        return {
            id: step.id,
            title: step.title,
            description: step.description,
            media: step.media,
            completionEvents: step.completionEvents,
            when: step.when,
            isComplete: completedSteps.includes(step.id)
        };
    }

    getWalkthroughs(): Walkthrough[] {
        return Array.from(this.walkthroughs.values());
    }

    getWalkthrough(id: string): Walkthrough | undefined {
        return this.walkthroughs.get(id);
    }

    async markStepComplete(walkthroughId: string, stepId: string): Promise<void> {
        const walkthrough = this.walkthroughs.get(walkthroughId);
        if (!walkthrough) {
            return;
        }

        const stepIndex = walkthrough.steps.findIndex(s => s.id === stepId);
        if (stepIndex === -1 || walkthrough.steps[stepIndex].isComplete) {
            return;
        }

        const updatedSteps = walkthrough.steps.map((s, i) =>
            i === stepIndex ? { ...s, isComplete: true } : s
        );
        const updatedWalkthrough: Walkthrough = { ...walkthrough, steps: updatedSteps };
        this.walkthroughs.set(walkthroughId, updatedWalkthrough);

        if (!this.progressState.completedSteps[walkthroughId]) {
            this.progressState.completedSteps[walkthroughId] = [];
        }
        if (!this.progressState.completedSteps[walkthroughId].includes(stepId)) {
            this.progressState.completedSteps[walkthroughId].push(stepId);
        }

        await this.saveProgress();
        this.onDidChangeWalkthroughsEmitter.fire();
    }

    async resetProgress(walkthroughId: string): Promise<void> {
        const walkthrough = this.walkthroughs.get(walkthroughId);
        if (!walkthrough) {
            return;
        }

        const updatedSteps = walkthrough.steps.map(s => ({ ...s, isComplete: false }));
        const updatedWalkthrough: Walkthrough = { ...walkthrough, steps: updatedSteps };
        this.walkthroughs.set(walkthroughId, updatedWalkthrough);

        delete this.progressState.completedSteps[walkthroughId];
        await this.saveProgress();
        this.onDidChangeWalkthroughsEmitter.fire();
    }

    getStepProgress(walkthroughId: string): { completed: number; total: number } {
        const walkthrough = this.walkthroughs.get(walkthroughId);
        if (!walkthrough) {
            return { completed: 0, total: 0 };
        }
        const completed = walkthrough.steps.filter(s => s.isComplete).length;
        return { completed, total: walkthrough.steps.length };
    }

    selectWalkthrough(walkthroughId: string): void {
        if (this.walkthroughs.has(walkthroughId)) {
            this.onDidSelectWalkthroughEmitter.fire(walkthroughId);
        }
    }

    /**
     * Handle a link click from a walkthrough step description.
     * Fires the `onLink:{url}` completion event and opens the link.
     */
    handleLinkClick(url: string): void {
        this.handleCompletionEvent(`onLink:${url}`);
        open(this.openerService, new URI(url));
    }

    protected handleCompletionEvent(event: string): void {
        for (const [walkthroughId, walkthrough] of this.walkthroughs) {
            for (const step of walkthrough.steps) {
                if (!step.isComplete && step.completionEvents?.includes(event)) {
                    this.markStepComplete(walkthroughId, step.id);
                }
            }
        }
    }

    protected handleExtensionInstalledAutoOpen(pluginId: string): void {
        if (!this.gettingStartedPreferences['workbench.welcomePage.walkthroughs.openOnInstall']) {
            return;
        }
        for (const walkthrough of this.walkthroughs.values()) {
            if (walkthrough.pluginId === pluginId) {
                this.commandRegistry.executeCommand(WalkthroughCommands.OPEN_WALKTHROUGH.id, walkthrough.id);
                return;
            }
        }
    }
}
