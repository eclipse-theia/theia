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

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { DeployedPlugin, PluginIdentifiers, PluginMetadata, WalkthroughContribution, WalkthroughStepContribution } from '@theia/plugin-ext/lib/common/plugin-protocol';

import { OpenerService, open } from '@theia/core/lib/browser/opener-service';
import { ILogger } from '@theia/core/lib/common/logger';
import { MessageService } from '@theia/core/lib/common/message-service';
import { nls } from '@theia/core/lib/common/nls';
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
    /** The plugins that are not loaded because the workspace is not trusted. */
    readonly disabledByTrust: ReadonlySet<string>;
    readonly onDidChangePlugins: Event<void>;
}

const WALKTHROUGH_PROGRESS_KEY = 'walkthrough-progress';
const ON_CONTEXT_EVENT_PREFIX = 'onContext:';

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

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(ILogger) @named('getting-started:WalkthroughService')
    protected readonly logger: ILogger;

    protected readonly walkthroughs = new Map<string, Walkthrough>();
    /** The definition each walkthrough was registered from, to detect a changed contribution. */
    protected readonly contributionSignatures = new Map<string, string>();
    protected readonly toDispose = new DisposableCollection();

    protected readonly onDidChangeWalkthroughsEmitter = new Emitter<void>();
    readonly onDidChangeWalkthroughs: Event<void> = this.onDidChangeWalkthroughsEmitter.event;

    protected readonly onDidChangeSelectionEmitter = new Emitter<void>();
    readonly onDidChangeSelection: Event<void> = this.onDidChangeSelectionEmitter.event;

    protected progressState: WalkthroughProgressState = { completedSteps: {} };
    /** Resolves once the persisted progress has been read and the initial sync has run. */
    protected progressReady: Promise<void> = Promise.resolve();
    protected knownPluginIds: Set<string> = new Set();
    protected pluginBaselineEstablished = false;

    protected selectedWalkthroughId: string | undefined;
    protected selectedStepId: string | undefined;

    /** Cache of {@link getContextKeys}, invalidated whenever the set of walkthroughs changes. */
    protected contextKeys: Set<string> | undefined;

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.onDidChangeWalkthroughsEmitter);
        this.toDispose.push(this.onDidChangeSelectionEmitter);
        // Plugins are deployed while the progress is still being read. Registering a walkthrough before
        // that would report its completed steps as pending, so every sync waits for the progress.
        this.progressReady = this.loadProgress().then(() => {
            this.syncWalkthroughsFromPlugins();
            this.establishPluginBaseline();
        });

        this.toDispose.push(this.pluginSupport.onDidChangePlugins(() => this.handlePluginsChanged()));

        this.toDispose.push(this.commandRegistry.onDidExecuteCommand(e => {
            this.handleCompletionEvent(`onCommand:${e.commandId}`);
        }));

        this.toDispose.push(this.preferenceService.onPreferenceChanged(e => {
            this.handleCompletionEvent(`onSettingChanged:${e.preferenceName}`);
        }));

        this.toDispose.push(this.viewEventSource.onDidExpandView(viewId => {
            this.handleCompletionEvent(`onView:${viewId}`);
        }));

        this.toDispose.push(this.contextKeyService.onDidChange(event => {
            if (event.affects(this.getContextKeys())) {
                this.completeMatchingContextSteps();
                this.handleVisibilityChanged();
            }
        }));
    }

    protected async handlePluginsChanged(): Promise<void> {
        await this.progressReady;
        const previousIds = this.knownPluginIds;
        const baselineEstablished = this.pluginBaselineEstablished;
        this.syncWalkthroughsFromPlugins();
        this.establishPluginBaseline();
        if (!baselineEstablished) {
            // The plugins deployed while the application was starting are not new installations.
            return;
        }
        for (const newId of this.knownPluginIds) {
            if (!previousIds.has(newId)) {
                this.handleCompletionEvent(`extensionInstalled:${newId}`);
                this.handleExtensionInstalledAutoOpen(newId);
            }
        }
    }

    /**
     * Complete every pending step whose `onContext:` expression currently holds.
     */
    protected completeMatchingContextSteps(): void {
        for (const [walkthroughId, walkthrough] of this.walkthroughs) {
            for (const step of walkthrough.steps) {
                if (step.isComplete || !step.completionEvents) {
                    continue;
                }
                for (const completionEvent of step.completionEvents) {
                    if (completionEvent.startsWith(ON_CONTEXT_EVENT_PREFIX) && this.contextKeyService.match(completionEvent.substring(ON_CONTEXT_EVENT_PREFIX.length))) {
                        this.markStepComplete(walkthroughId, step.id);
                    }
                }
            }
        }
    }

    /**
     * The context keys that the `when` clauses and the `onContext:` completion events of all registered
     * walkthroughs depend on.
     *
     * The set is cached because context keys change very frequently, while walkthroughs rarely do.
     */
    protected getContextKeys(): Set<string> {
        if (!this.contextKeys) {
            const keys = new Set<string>();
            const collect = (expression: string | undefined) => {
                if (expression) {
                    this.contextKeyService.parseKeys(expression)?.forEach(key => keys.add(key));
                }
            };
            for (const walkthrough of this.walkthroughs.values()) {
                collect(walkthrough.when);
                for (const step of walkthrough.steps) {
                    collect(step.when);
                    step.completionEvents
                        ?.filter(event => event.startsWith(ON_CONTEXT_EVENT_PREFIX))
                        .forEach(event => collect(event.substring(ON_CONTEXT_EVENT_PREFIX.length)));
                }
            }
            this.contextKeys = keys;
        }
        return this.contextKeys;
    }

    /**
     * Whether a `when` clause currently holds. A contribution without a `when` clause is always visible.
     */
    protected isVisible(when: string | undefined): boolean {
        return !when || this.contextKeyService.match(when);
    }

    /**
     * Restricts a walkthrough to the steps that are currently visible.
     *
     * Hidden steps also stay out of the progress, so that a walkthrough whose remaining steps do not apply to
     * this platform or workspace can still be completed.
     */
    protected toVisibleWalkthrough(walkthrough: Walkthrough): Walkthrough {
        const steps = walkthrough.steps.filter(step => this.isVisible(step.when));
        return steps.length === walkthrough.steps.length ? walkthrough : { ...walkthrough, steps };
    }

    protected handleVisibilityChanged(): void {
        if (this.selectedWalkthroughId !== undefined && !this.selectedWalkthrough) {
            // The selected walkthrough is no longer visible, so the welcome view must not keep showing it.
            this.clearSelection();
        }
        this.onDidChangeWalkthroughsEmitter.fire();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    /**
     * Remember the currently deployed plugins as the set that is not considered newly installed.
     *
     * Plugins are deployed asynchronously while the application starts, so the baseline can only be trusted
     * once plugins have actually arrived. Without this, every plugin of a fresh session would look like a new
     * installation and - with `workbench.welcomePage.walkthroughs.openOnInstall` enabled - open a walkthrough
     * on startup.
     */
    protected establishPluginBaseline(): void {
        this.knownPluginIds = new Set(this.pluginSupport.plugins.map(p => p.model.id));
        if (this.knownPluginIds.size > 0) {
            this.pluginBaselineEstablished = true;
        }
    }

    protected async loadProgress(): Promise<void> {
        this.progressState = await this.storageService.getData<WalkthroughProgressState>(
            WALKTHROUGH_PROGRESS_KEY,
            { completedSteps: {} }
        );
    }

    protected async saveProgress(): Promise<void> {
        await this.storageService.setData(WALKTHROUGH_PROGRESS_KEY, this.progressState);
    }

    protected syncWalkthroughsFromPlugins(): void {
        const plugins = this.pluginSupport.plugins;
        const seenIds = new Set<string>();

        for (const pluginMeta of plugins) {
            if (pluginMeta.outOfSync) {
                // An uninstalled or disabled plugin stays loaded until the next reload, but its walkthroughs
                // must not be offered any more.
                continue;
            }
            const unversionedId = PluginIdentifiers.componentsToUnversionedId(pluginMeta.model);
            if (this.pluginSupport.disabledByTrust.has(unversionedId)) {
                // A plugin restricted by workspace trust contributes nothing, so there is nothing to walk through.
                continue;
            }
            const deployed = this.pluginSupport.getPlugin(unversionedId);
            if (!deployed?.contributes?.walkthroughs) {
                continue;
            }
            for (const contribution of deployed.contributes.walkthroughs) {
                const fullId = `${contribution.pluginId}.${contribution.id}`;
                seenIds.add(fullId);
                // Re-register when the definition changed, for instance because the plugin was updated.
                const signature = JSON.stringify(contribution);
                if (this.contributionSignatures.get(fullId) !== signature) {
                    this.contributionSignatures.set(fullId, signature);
                    this.registerWalkthrough(contribution);
                }
            }
        }

        let changed = false;
        for (const id of this.walkthroughs.keys()) {
            if (!seenIds.has(id)) {
                this.walkthroughs.delete(id);
                this.contributionSignatures.delete(id);
                this.contextKeys = undefined;
                changed = true;
            }
        }
        if (changed) {
            if (this.selectedWalkthroughId && !this.walkthroughs.has(this.selectedWalkthroughId)) {
                // The selected walkthrough was contributed by a plugin that is no longer available.
                this.clearSelection();
            }
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
            when: contribution.when,
            icon: contribution.icon,
            pluginId: contribution.pluginId,
            pluginIcon: contribution.pluginIcon
        };

        this.walkthroughs.set(fullId, walkthrough);
        this.contextKeys = undefined;
        // A context key that is already set has to complete its steps right away; without this, a step keyed on a
        // static context - `onContext:isLinux` for instance - would wait for a change that never comes.
        this.completeMatchingContextSteps();
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

    /**
     * All walkthroughs whose `when` clause currently holds, restricted to their currently visible steps.
     */
    getWalkthroughs(): Walkthrough[] {
        return Array.from(this.walkthroughs.values())
            .filter(walkthrough => this.isVisible(walkthrough.when))
            .map(walkthrough => this.toVisibleWalkthrough(walkthrough));
    }

    /**
     * The walkthrough with the given id, or `undefined` if it is unknown or its `when` clause does not hold.
     */
    getWalkthrough(id: string): Walkthrough | undefined {
        const walkthrough = this.walkthroughs.get(id);
        return walkthrough && this.isVisible(walkthrough.when) ? this.toVisibleWalkthrough(walkthrough) : undefined;
    }

    async markStepComplete(walkthroughId: string, stepId: string): Promise<void> {
        return this.setStepComplete(walkthroughId, stepId, true);
    }

    /**
     * Take the completion mark off a step again, for example when it was completed by mistake.
     */
    async markStepIncomplete(walkthroughId: string, stepId: string): Promise<void> {
        return this.setStepComplete(walkthroughId, stepId, false);
    }

    protected async setStepComplete(walkthroughId: string, stepId: string, isComplete: boolean): Promise<void> {
        const walkthrough = this.walkthroughs.get(walkthroughId);
        if (!walkthrough) {
            return;
        }

        const stepIndex = walkthrough.steps.findIndex(s => s.id === stepId);
        if (stepIndex === -1 || walkthrough.steps[stepIndex].isComplete === isComplete) {
            return;
        }

        const updatedSteps = walkthrough.steps.map((s, i) =>
            i === stepIndex ? { ...s, isComplete } : s
        );
        const updatedWalkthrough: Walkthrough = { ...walkthrough, steps: updatedSteps };
        this.walkthroughs.set(walkthroughId, updatedWalkthrough);

        const completedSteps = this.progressState.completedSteps[walkthroughId] ?? [];
        this.progressState.completedSteps[walkthroughId] = isComplete
            ? (completedSteps.includes(stepId) ? completedSteps : [...completedSteps, stepId])
            : completedSteps.filter(id => id !== stepId);

        await this.saveProgress();
        this.onDidChangeWalkthroughsEmitter.fire();
    }

    /**
     * Mark every step of the given walkthrough as complete, persisting the progress once.
     */
    async markAllStepsComplete(walkthroughId: string): Promise<void> {
        const walkthrough = this.walkthroughs.get(walkthroughId);
        // Only the steps that apply right now are completed; a hidden step may become relevant again later.
        const visibleStepIds = new Set(this.getWalkthrough(walkthroughId)?.steps.map(step => step.id));
        if (!walkthrough || walkthrough.steps.every(step => step.isComplete || !visibleStepIds.has(step.id))) {
            return;
        }

        const updatedSteps = walkthrough.steps.map(step => step.isComplete || !visibleStepIds.has(step.id) ? step : { ...step, isComplete: true });
        this.walkthroughs.set(walkthroughId, { ...walkthrough, steps: updatedSteps });
        this.progressState.completedSteps[walkthroughId] = updatedSteps.filter(step => step.isComplete).map(step => step.id);

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
        const walkthrough = this.getWalkthrough(walkthroughId);
        if (!walkthrough) {
            return { completed: 0, total: 0 };
        }
        const completed = walkthrough.steps.filter(s => s.isComplete).length;
        return { completed, total: walkthrough.steps.length };
    }

    /**
     * The walkthrough that is currently opened in the welcome view, if any.
     * While a walkthrough is selected, the welcome view renders it instead of its regular content.
     */
    get selectedWalkthrough(): Walkthrough | undefined {
        return this.selectedWalkthroughId === undefined ? undefined : this.getWalkthrough(this.selectedWalkthroughId);
    }

    /**
     * The step of the {@link selectedWalkthrough} whose content is currently shown, if any.
     */
    get selectedStep(): WalkthroughStep | undefined {
        const walkthrough = this.selectedWalkthrough;
        if (!walkthrough || this.selectedStepId === undefined) {
            return undefined;
        }
        return walkthrough.steps.find(step => step.id === this.selectedStepId);
    }

    /**
     * Open the given walkthrough in the welcome view and preselect its first pending step.
     * Does nothing if no walkthrough is registered under that id.
     */
    selectWalkthrough(walkthroughId: string): void {
        const walkthrough = this.getWalkthrough(walkthroughId) ?? this.getWalkthrough(this.fromVSCodeWalkthroughId(walkthroughId));
        if (!walkthrough) {
            return;
        }
        this.selectedWalkthroughId = walkthrough.id;
        this.selectedStepId = this.getFirstPendingStep(walkthrough)?.id;
        this.onDidChangeSelectionEmitter.fire();
    }

    /**
     * Show the content of the given step of the currently selected walkthrough.
     */
    selectStep(stepId: string): void {
        const walkthrough = this.selectedWalkthrough;
        if (!walkthrough || this.selectedStepId === stepId || !walkthrough.steps.some(step => step.id === stepId)) {
            return;
        }
        this.selectedStepId = stepId;
        this.onDidChangeSelectionEmitter.fire();
    }

    /**
     * Close the currently selected walkthrough and return the welcome view to its regular content.
     */
    clearSelection(): void {
        if (this.selectedWalkthroughId === undefined) {
            return;
        }
        this.selectedWalkthroughId = undefined;
        this.selectedStepId = undefined;
        this.onDidChangeSelectionEmitter.fire();
    }

    protected getFirstPendingStep(walkthrough: Walkthrough): WalkthroughStep | undefined {
        return walkthrough.steps.find(step => !step.isComplete) ?? walkthrough.steps[0];
    }

    /**
     * VS Code refers to a walkthrough as `publisher.name#walkthroughId`, for example in the `command:` links of a
     * step description, while the ids used here are fully dot-separated.
     */
    protected fromVSCodeWalkthroughId(walkthroughId: string): string {
        return walkthroughId.replace('#', '.');
    }

    /**
     * Handle a link click from a walkthrough step description.
     * Fires the `onLink:{url}` completion event and opens the link.
     *
     * Walkthroughs commonly link to `command:` URIs that Theia does not implement. Such a link must not
     * reject unhandled, so the failure is reported to the user instead.
     */
    async handleLinkClick(url: string): Promise<void> {
        this.handleCompletionEvent(`onLink:${url}`);
        try {
            await open(this.openerService, new URI(this.normalizeLinkUrl(url)));
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Could not open the walkthrough link '${url}'.`, error);
            this.messageService.error(nls.localize('theia/getting-started/walkthroughLinkFailed', "Could not open '{0}': {1}", url, reason));
        }
    }

    /**
     * VS Code walkthroughs use `command:toSide:<commandId>` to open the result of a command beside the walkthrough.
     * Theia has no generic equivalent, so the command is executed as usual rather than failing to resolve.
     */
    protected normalizeLinkUrl(url: string): string {
        const toSidePrefix = 'command:toSide:';
        return url.startsWith(toSidePrefix) ? `command:${url.substring(toSidePrefix.length)}` : url;
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
        for (const walkthrough of this.getWalkthroughs()) {
            if (walkthrough.pluginId === pluginId) {
                this.commandRegistry.executeCommand(WalkthroughCommands.OPEN_WALKTHROUGH.id, walkthrough.id);
                return;
            }
        }
    }
}
