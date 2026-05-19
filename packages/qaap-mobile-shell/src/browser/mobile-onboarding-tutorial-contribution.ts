// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { MOBILE_NARROW_VIEWPORT_MEDIA_QUERY } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { MobileHaptics } from './mobile-haptics';

// Breakpoint matches `mobile-workbench.css` and {@link MOBILE_NARROW_VIEWPORT_MEDIA_QUERY} in core.

type StepPlacement = 'top' | 'bottom' | 'center';
type StepDemo = 'swipe-right' | 'tap';

interface TutorialStep {
    id: string;
    title: string;
    body: string;
    /** Resolver for the element to highlight; absent steps render centered (no spotlight). */
    target?: () => HTMLElement | undefined;
    /** Optional animated demo overlay (swipe gesture, tap pulse, …). */
    demo?: StepDemo;
    /** Where to anchor the tooltip relative to the spotlight (or viewport when `center`). */
    placement: StepPlacement;
}

/**
 * First-launch in-app tutorial for the mobile (≤ 767 px) layout.
 *
 * Highlights the primitives introduced by `MobileOneColumnShellContribution`:
 *   1. Left-edge swipe → opens the Explorer (sheet)
 *   2. Bottom activity bar = agent-first command surface
 *   3. The dedicated "Agent" button for the chat sheet
 *   4. The single-tab "Recents" header in the main panel
 *
 * The overlay never blocks pointer events on the underlying workbench: the dim backdrop and
 * spotlight ring use `pointer-events: none`, so users can complete the gesture they are being
 * taught and the tutorial will advance organically on Next or via the gesture itself.
 *
 * Persistence: `StorageService.theia.mobile.tutorial.seen=true` once the user finishes or
 * dismisses the tutorial. A dedicated `Help: Replay Mobile Tutorial` command is registered so
 * users can reopen it from the command palette or the Getting Started page.
 */
@injectable()
export class MobileOnboardingTutorialContribution implements FrontendApplicationContribution, CommandContribution {

    static readonly STORAGE_KEY = 'theia.mobile.tutorial.seen';

    static readonly REPLAY_COMMAND: Command = Command.toLocalizedCommand({
        id: 'theia.mobile.onboarding.replay',
        category: 'Help',
        label: 'Replay Mobile Tutorial',
    }, 'theia/core/mobile/replayTutorial', 'theia/core/common/help');

    @inject(StorageService)
    protected readonly storage: StorageService;

    protected readonly toDispose = new DisposableCollection();
    protected readonly mobileMq: MediaQueryList | undefined =
        typeof window !== 'undefined' ? window.matchMedia(MOBILE_NARROW_VIEWPORT_MEDIA_QUERY) : undefined;

    protected overlay: HTMLElement | undefined;
    protected backdrop: HTMLElement | undefined;
    protected spotlight: HTMLElement | undefined;
    protected tooltip: HTMLElement | undefined;
    protected demoLayer: HTMLElement | undefined;
    protected currentIndex = 0;
    protected steps: TutorialStep[] = [];
    protected reflowRaf = 0;
    protected active = false;

    onDidInitializeLayout(_app: FrontendApplication): void {
        this.mobileMq?.addEventListener('change', this.onMediaChange);
        if (this.mobileMq?.matches) {
            this.maybeStartFirstRun().catch(() => { /* swallow: tutorial is best-effort */ });
        }
    }

    onStop(): void {
        this.mobileMq?.removeEventListener('change', this.onMediaChange);
        this.dismiss(false);
        this.toDispose.dispose();
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(MobileOnboardingTutorialContribution.REPLAY_COMMAND, {
            execute: () => this.start(true),
            isEnabled: () => !!this.mobileMq?.matches,
            isVisible: () => !!this.mobileMq?.matches,
        });
    }

    protected readonly onMediaChange = (): void => {
        // Leaving mobile mode while the tutorial is open would leave dangling absolutely-positioned
        // overlays on top of the desktop shell. Dismiss without marking as "seen" so a return to
        // narrow viewport re-prompts on next launch.
        if (!this.mobileMq?.matches) {
            this.dismiss(false);
        }
    };

    protected async maybeStartFirstRun(): Promise<void> {
        const seen = await this.storage.getData<boolean>(MobileOnboardingTutorialContribution.STORAGE_KEY, false);
        if (!seen && this.mobileMq?.matches) {
            // Wait a frame so the shell finishes its mobile layout transition before we measure
            // targets (bottom bar, edge zones, …) for the spotlight.
            requestAnimationFrame(() => this.start(false));
        }
    }

    /**
     * Open the tutorial overlay.
     *
     * @param replay when `true`, do not check the "seen" flag – used by the replay command.
     */
    protected start(replay: boolean): void {
        if (typeof document === 'undefined' || !this.mobileMq?.matches) {
            return;
        }
        if (this.active && replay) {
            // Reset to first step on explicit replay.
            this.currentIndex = 0;
            this.renderCurrentStep();
            return;
        }
        if (this.active) {
            return;
        }
        this.active = true;
        this.steps = this.buildSteps();
        this.currentIndex = 0;
        this.ensureOverlayElements();
        this.renderCurrentStep();
        window.addEventListener('resize', this.scheduleReflow, { passive: true });
        window.addEventListener('orientationchange', this.scheduleReflow, { passive: true });
        document.addEventListener('keydown', this.onKeyDown);
    }

    protected dismiss(markSeen: boolean): void {
        if (!this.active) {
            return;
        }
        this.active = false;
        window.removeEventListener('resize', this.scheduleReflow);
        window.removeEventListener('orientationchange', this.scheduleReflow);
        document.removeEventListener('keydown', this.onKeyDown);
        if (this.reflowRaf) {
            cancelAnimationFrame(this.reflowRaf);
            this.reflowRaf = 0;
        }
        if (this.overlay?.parentElement) {
            this.overlay.parentElement.removeChild(this.overlay);
        }
        this.overlay = undefined;
        this.backdrop = undefined;
        this.spotlight = undefined;
        this.tooltip = undefined;
        this.demoLayer = undefined;
        if (markSeen) {
            this.storage.setData(MobileOnboardingTutorialContribution.STORAGE_KEY, true)
                .catch(() => { /* swallow: storage failures should not block the UI */ });
        }
    }

    protected ensureOverlayElements(): void {
        if (this.overlay) {
            return;
        }
        const overlay = document.createElement('div');
        overlay.className = 'theia-mobile-onboarding-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'false');
        overlay.setAttribute(
            'aria-label',
            nls.localize('theia/core/mobile/onboarding/title', 'Mobile tutorial')
        );

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-onboarding-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        overlay.appendChild(backdrop);

        const spotlight = document.createElement('div');
        spotlight.className = 'theia-mobile-onboarding-spotlight';
        spotlight.setAttribute('aria-hidden', 'true');
        overlay.appendChild(spotlight);

        const demoLayer = document.createElement('div');
        demoLayer.className = 'theia-mobile-onboarding-demo';
        demoLayer.setAttribute('aria-hidden', 'true');
        overlay.appendChild(demoLayer);

        const tooltip = document.createElement('div');
        tooltip.className = 'theia-mobile-onboarding-tooltip';
        tooltip.setAttribute('role', 'group');
        overlay.appendChild(tooltip);

        document.body.appendChild(overlay);

        this.overlay = overlay;
        this.backdrop = backdrop;
        this.spotlight = spotlight;
        this.demoLayer = demoLayer;
        this.tooltip = tooltip;
    }

    protected buildSteps(): TutorialStep[] {
        return [
            {
                id: 'swipe-explorer',
                title: nls.localize('theia/core/mobile/onboarding/swipe/title', 'Swipe → to open Explorer'),
                body: nls.localize(
                    'theia/core/mobile/onboarding/swipe/body',
                    'Drag your finger from the left edge of the screen to slide the file Explorer in as a sheet. Drag back ← (or tap the dimmed area) to close it.'
                ),
                target: () => document.querySelector<HTMLElement>('.theia-mobile-edgeSwipeZone-left') ?? undefined,
                demo: 'swipe-right',
                placement: 'center',
            },
            {
                id: 'bottom-bar',
                title: nls.localize('theia/core/mobile/onboarding/bottomBar/title', 'Bottom bar — agent-first'),
                body: nls.localize(
                    'theia/core/mobile/onboarding/bottomBar/body',
                    'The bar at the bottom is your primary workspace on mobile: Agent, Preview, Files, Diff, Tasks, Skills, Terminal and Editor — always one tap away.'
                ),
                target: () => document.getElementById('theia-mobile-bottom-bar') ?? undefined,
                placement: 'top',
            },
            {
                id: 'agent-button',
                title: nls.localize('theia/core/mobile/onboarding/agent/title', 'Tap Agent to chat'),
                body: nls.localize(
                    'theia/core/mobile/onboarding/agent/body',
                    'On a phone you mostly drive the IDE through the AI Agent. Tap this button to open the chat sheet and start a task.'
                ),
                target: () => document.querySelector<HTMLElement>(
                    '#theia-mobile-bottom-bar .theia-mobile-bottom-activity-btn[data-action-id="agent"]'
                ) ?? undefined,
                demo: 'tap',
                placement: 'top',
            },
            {
                id: 'editor-tabs',
                title: nls.localize('theia/core/mobile/onboarding/tabs/title', 'Scroll the tab bar'),
                body: nls.localize(
                    'theia/core/mobile/onboarding/tabs/body',
                    'With several editors open, swipe sideways on the tab titles to see every open editor, then tap one to switch.'
                ),
                target: () => document.querySelector<HTMLElement>(
                    '#theia-main-content-panel .lm-TabBar.theia-app-centers'
                ) ?? undefined,
                placement: 'bottom',
            },
        ];
    }

    protected readonly scheduleReflow = (): void => {
        if (this.reflowRaf) {
            return;
        }
        this.reflowRaf = requestAnimationFrame(() => {
            this.reflowRaf = 0;
            this.positionForCurrentStep();
        });
    };

    protected readonly onKeyDown = (e: KeyboardEvent): void => {
        if (!this.active) {
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            this.dismiss(true);
        } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
            e.preventDefault();
            this.next();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            this.previous();
        }
    };

    protected next(): void {
        if (this.currentIndex >= this.steps.length - 1) {
            MobileHaptics.fire(MobileHaptics.SUCCESS);
            this.dismiss(true);
            return;
        }
        this.currentIndex += 1;
        MobileHaptics.fire(MobileHaptics.LIGHT);
        this.renderCurrentStep();
    }

    protected previous(): void {
        if (this.currentIndex === 0) {
            return;
        }
        this.currentIndex -= 1;
        MobileHaptics.fire(MobileHaptics.LIGHT);
        this.renderCurrentStep();
    }

    protected renderCurrentStep(): void {
        const step = this.steps[this.currentIndex];
        if (!step || !this.tooltip) {
            return;
        }
        this.tooltip.replaceChildren(this.buildTooltipContent(step));
        this.renderDemo(step);
        this.positionForCurrentStep();
    }

    protected buildTooltipContent(step: TutorialStep): DocumentFragment {
        const fragment = document.createDocumentFragment();

        const progress = document.createElement('div');
        progress.className = 'theia-mobile-onboarding-progress';
        progress.textContent = `${this.currentIndex + 1} / ${this.steps.length}`;
        fragment.appendChild(progress);

        const title = document.createElement('h3');
        title.className = 'theia-mobile-onboarding-title';
        title.textContent = step.title;
        fragment.appendChild(title);

        const body = document.createElement('p');
        body.className = 'theia-mobile-onboarding-body';
        body.textContent = step.body;
        fragment.appendChild(body);

        const actions = document.createElement('div');
        actions.className = 'theia-mobile-onboarding-actions';

        const skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.className = 'theia-mobile-onboarding-btn theia-mod-skip';
        skipBtn.textContent = nls.localizeByDefault('Skip');
        skipBtn.addEventListener('click', () => this.dismiss(true));
        actions.appendChild(skipBtn);

        const navGroup = document.createElement('div');
        navGroup.className = 'theia-mobile-onboarding-nav';

        if (this.currentIndex > 0) {
            const backBtn = document.createElement('button');
            backBtn.type = 'button';
            backBtn.className = 'theia-mobile-onboarding-btn theia-mod-back';
            backBtn.textContent = nls.localizeByDefault('Back');
            backBtn.addEventListener('click', () => this.previous());
            navGroup.appendChild(backBtn);
        }

        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'theia-mobile-onboarding-btn theia-mod-next';
        nextBtn.textContent = this.currentIndex === this.steps.length - 1
            ? nls.localizeByDefault('Done')
            : nls.localizeByDefault('Next');
        nextBtn.addEventListener('click', () => this.next());
        navGroup.appendChild(nextBtn);

        actions.appendChild(navGroup);
        fragment.appendChild(actions);
        return fragment;
    }

    protected renderDemo(step: TutorialStep): void {
        if (!this.demoLayer) {
            return;
        }
        this.demoLayer.replaceChildren();
        this.demoLayer.classList.remove('theia-mod-swipe-right', 'theia-mod-tap');
        if (step.demo === 'swipe-right') {
            this.demoLayer.classList.add('theia-mod-swipe-right');
            const dot = document.createElement('div');
            dot.className = 'theia-mobile-onboarding-finger';
            const arrow = document.createElement('span');
            arrow.className = 'theia-mobile-onboarding-arrow codicon codicon-arrow-right';
            this.demoLayer.append(dot, arrow);
        } else if (step.demo === 'tap') {
            this.demoLayer.classList.add('theia-mod-tap');
            const pulse = document.createElement('div');
            pulse.className = 'theia-mobile-onboarding-pulse';
            this.demoLayer.appendChild(pulse);
        }
    }

    protected positionForCurrentStep(): void {
        const step = this.steps[this.currentIndex];
        if (!step || !this.spotlight || !this.tooltip || !this.demoLayer) {
            return;
        }
        const target = step.target?.();
        const rect = target?.getBoundingClientRect();
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        const tooltipMargin = 12;

        // Spotlight
        if (rect && rect.width > 0 && rect.height > 0 && step.id !== 'swipe-explorer') {
            // Pad the spotlight a few px so the focus ring sits outside the target.
            const pad = 6;
            this.spotlight.style.display = 'block';
            this.spotlight.style.top = `${Math.max(rect.top - pad, 0)}px`;
            this.spotlight.style.left = `${Math.max(rect.left - pad, 0)}px`;
            this.spotlight.style.width = `${rect.width + pad * 2}px`;
            this.spotlight.style.height = `${rect.height + pad * 2}px`;
        } else {
            this.spotlight.style.display = 'none';
        }

        // Tooltip placement
        const tooltip = this.tooltip;
        tooltip.classList.remove('theia-mod-place-top', 'theia-mod-place-bottom', 'theia-mod-place-center');
        let placement = step.placement;
        if (placement !== 'center' && (!rect || rect.width === 0 || rect.height === 0)) {
            placement = 'center';
        }

        if (placement === 'center') {
            tooltip.classList.add('theia-mod-place-center');
            tooltip.style.removeProperty('top');
            tooltip.style.removeProperty('bottom');
            tooltip.style.left = '50%';
            tooltip.style.transform = 'translate(-50%, -50%)';
            tooltip.style.top = '50%';
        } else if (placement === 'top' && rect) {
            tooltip.classList.add('theia-mod-place-top');
            const bottomAnchor = viewportH - rect.top + tooltipMargin;
            tooltip.style.removeProperty('top');
            tooltip.style.bottom = `${Math.max(bottomAnchor, 16)}px`;
            tooltip.style.left = '50%';
            tooltip.style.transform = 'translateX(-50%)';
        } else if (placement === 'bottom' && rect) {
            tooltip.classList.add('theia-mod-place-bottom');
            const topAnchor = rect.bottom + tooltipMargin;
            tooltip.style.removeProperty('bottom');
            tooltip.style.top = `${Math.min(topAnchor, viewportH - 16)}px`;
            tooltip.style.left = '50%';
            tooltip.style.transform = 'translateX(-50%)';
        }

        // Demo overlay (swipe / tap) anchored to the spotlight where appropriate.
        if (step.demo === 'swipe-right') {
            this.demoLayer.style.display = 'block';
            this.demoLayer.style.top = `${Math.round(viewportH * 0.5) - 24}px`;
            this.demoLayer.style.left = '12px';
            this.demoLayer.style.width = `${Math.min(viewportW - 24, 240)}px`;
            this.demoLayer.style.height = '48px';
        } else if (step.demo === 'tap' && rect) {
            this.demoLayer.style.display = 'block';
            this.demoLayer.style.top = `${rect.top + rect.height / 2 - 24}px`;
            this.demoLayer.style.left = `${rect.left + rect.width / 2 - 24}px`;
            this.demoLayer.style.width = '48px';
            this.demoLayer.style.height = '48px';
        } else {
            this.demoLayer.style.display = 'none';
        }
    }

    /** Exposed for tests. */
    isActive(): boolean { return this.active; }
}
