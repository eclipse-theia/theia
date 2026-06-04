// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { matchesMobileOneColumnLayout } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { MobileHaptics } from './mobile-haptics';
import { MobileSnackbar } from './mobile-snackbar';
import {
    QaapBootstrapStateChange,
    QaapProjectBootstrapService,
} from './qaap-project-bootstrap-service';
import type {
    QaapForwardedPort,
    QaapMonorepoFlavor,
    QaapProjectDescriptor,
} from './qaap-project-bootstrap-types';

/** Localized labels for framework chips on the banner. */
function frameworkLabel(kind: QaapProjectDescriptor['kind']): string {
    switch (kind) {
        case 'node-vite': return 'Vite';
        case 'node-next': return 'Next.js';
        case 'node-cra': return 'Create React App';
        case 'node-astro': return 'Astro';
        case 'node-remix': return 'Remix';
        case 'node-svelte': return 'SvelteKit';
        case 'node-nuxt': return 'Nuxt';
        case 'node-generic': return 'Node.js';
        case 'static': return 'Static site';
        default: return 'Project';
    }
}

function monorepoFlavorLabel(flavor: QaapMonorepoFlavor | undefined): string {
    switch (flavor) {
        case 'pnpm-workspace': return 'pnpm workspace';
        case 'npm-workspaces': return 'npm workspaces';
        case 'yarn-workspaces': return 'Yarn workspaces';
        case 'turborepo': return 'Turborepo';
        case 'nx': return 'Nx';
        case 'lerna': return 'Lerna';
        case 'implicit': return 'Monorepo';
        default: return 'Monorepo';
    }
}

/**
 * Renders the auto-detection banner above the bottom mobile bar and reacts to bootstrap state
 * transitions. The banner is intentionally compact (single line + 2 actions) so it doubles as a
 * desktop notification — `position: fixed` keeps it out of the Lumino layout flow.
 */
@injectable()
export class QaapProjectBootstrapContribution implements FrontendApplicationContribution {

    @inject(QaapProjectBootstrapService)
    protected readonly bootstrap: QaapProjectBootstrapService;

    @inject(CommandRegistry) @optional()
    protected readonly commands: CommandRegistry | undefined;

    protected banner: HTMLElement | undefined;
    protected portsFloater: HTMLElement | undefined;
    protected appPickerMenu: HTMLElement | undefined;
    protected pickerDismiss: (() => void) | undefined;
    /** Tracks the last phase we surfaced a snackbar for, so port-change re-renders do not re-toast. */
    protected lastAnnouncedPhase: QaapBootstrapStateChange['phase'] | undefined;
    protected readonly toDispose = new DisposableCollection();

    onStart(): void {
        this.toDispose.push(this.bootstrap.onStateChange(state => this.render(state)));
        // Ports live in their own widget; updates fire independently from phase changes so the
        // floater can appear/grow without re-rendering the banner.
        this.toDispose.push(this.bootstrap.onForwardedPortsChanged(ports => this.renderPortsFloater(ports)));
    }

    onDidInitializeLayout(): void {
        // On mobile the shell defers bootstrap until the projects landing is dismissed.
        if (matchesMobileOneColumnLayout()) {
            return;
        }
        void this.bootstrap.refreshFromCurrentWorkspace();
    }

    onStop(): void {
        this.closeAppPicker();
        this.removeBanner();
        this.removePortsFloater();
        this.toDispose.dispose();
    }

    protected render(state: QaapBootstrapStateChange): void {
        switch (state.phase) {
            case 'detected':
            case 'ready-to-run':
                this.showBanner(state);
                break;
            case 'installing':
                this.showBanner(state);
                break;
            case 'install-failed':
            case 'run-failed':
                this.showBanner(state);
                break;
            case 'starting':
                this.showBanner(state);
                this.announce(state.phase, () =>
                    MobileSnackbar.show(
                        nls.localize('qaap/projectBootstrap/starting', 'Starting dev server…'),
                        { duration: 1400 }
                    ));
                break;
            case 'running':
                // Old behavior restored: once the preview is up the banner goes away and the user
                // gets a transient toast confirming things are live. The persistent ports strip
                // lives in its own floating widget (see {@link renderPortsFloater}) so additional
                // dev URLs remain reachable without re-showing the banner.
                this.removeBanner();
                if (state.previewUrl) {
                    this.announce(state.phase, () =>
                        MobileSnackbar.show(
                            nls.localize('qaap/projectBootstrap/previewReady', 'Preview ready'),
                            { kind: 'success', duration: 1600 }
                        ));
                }
                break;
            case 'dismissed':
            case 'idle':
            default:
                this.removeBanner();
                this.lastAnnouncedPhase = undefined;
                break;
        }
    }

    /** Fire a snackbar exactly once per phase transition (idempotent on re-renders). */
    protected announce(phase: QaapBootstrapStateChange['phase'], emit: () => void): void {
        if (this.lastAnnouncedPhase === phase) {
            return;
        }
        this.lastAnnouncedPhase = phase;
        emit();
    }

    protected showBanner(state: QaapBootstrapStateChange): void {
        const descriptor = state.descriptor;
        if (!descriptor) {
            this.removeBanner();
            return;
        }
        const banner = this.ensureBanner();
        banner.dataset.phase = state.phase;
        banner.replaceChildren();

        const icon = document.createElement('span');
        icon.className = `qaap-project-bootstrap-icon codicon ${this.iconFor(state.phase)}`;
        icon.setAttribute('aria-hidden', 'true');
        banner.appendChild(icon);

        const text = document.createElement('div');
        text.className = 'qaap-project-bootstrap-text';

        const title = document.createElement('div');
        title.className = 'qaap-project-bootstrap-title';
        title.textContent = this.titleFor(state, descriptor);
        text.appendChild(title);

        const subtitle = document.createElement('div');
        subtitle.className = 'qaap-project-bootstrap-subtitle';
        subtitle.textContent = this.subtitleFor(state, descriptor);
        text.appendChild(subtitle);

        // Monorepo chip: lets the user swap the active app without going through the action sheet.
        if (descriptor.apps.length > 0 && state.selectedApp) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'qaap-project-bootstrap-chip';
            chip.title = nls.localize('qaap/projectBootstrap/chipSwitch', 'Switch monorepo app');
            const chipIcon = document.createElement('span');
            chipIcon.className = 'codicon codicon-symbol-namespace';
            chipIcon.setAttribute('aria-hidden', 'true');
            const chipLabel = document.createElement('span');
            chipLabel.textContent = state.selectedApp.relativePath;
            chip.append(chipIcon, chipLabel);
            chip.addEventListener('click', evt => {
                evt.stopPropagation();
                MobileHaptics.fire(MobileHaptics.LIGHT);
                this.openAppPicker(chip, descriptor);
            });
            text.appendChild(chip);
        }

        banner.appendChild(text);

        const actions = document.createElement('div');
        actions.className = 'qaap-project-bootstrap-actions';
        for (const action of this.actionsFor(state, descriptor)) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `qaap-project-bootstrap-action${action.primary ? ' qaap-mod-primary' : ''}`;
            btn.textContent = action.label;
            btn.addEventListener('click', () => {
                MobileHaptics.fire(MobileHaptics.LIGHT);
                void action.run();
            });
            actions.appendChild(btn);
        }
        banner.appendChild(actions);
    }

    /**
     * Maintains the floating ports widget. Created lazily the first time at least one port is
     * detected, and torn down when the list goes back to empty. Lives independently from the
     * bootstrap banner so it survives the banner closing on `running` and stays reachable for the
     * entire dev-server lifetime.
     */
    protected renderPortsFloater(ports: QaapForwardedPort[]): void {
        if (ports.length === 0) {
            this.removePortsFloater();
            return;
        }
        const host = this.ensurePortsFloater();
        // Repaint contents fully: a fresh DOM keeps the implementation predictable and matches
        // the (small) cardinality of port pills (rarely more than a handful).
        host.replaceChildren();
        const label = document.createElement('span');
        label.className = 'qaap-project-bootstrap-ports-label';
        label.textContent = nls.localize('qaap/projectBootstrap/portsLabel', 'Ports');
        host.appendChild(label);
        for (const port of ports) {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'qaap-project-bootstrap-port-pill';
            if (port.primary) { pill.classList.add('qaap-mod-primary'); }
            if (port.previewOpen) { pill.classList.add('qaap-mod-open'); }
            const dot = document.createElement('span');
            dot.className = 'qaap-project-bootstrap-port-dot';
            dot.setAttribute('aria-hidden', 'true');
            const portText = document.createElement('span');
            portText.className = 'qaap-project-bootstrap-port-number';
            portText.textContent = String(port.port);
            pill.append(dot, portText);
            pill.title = port.url;
            pill.addEventListener('click', evt => {
                evt.stopPropagation();
                MobileHaptics.fire(MobileHaptics.LIGHT);
                void this.bootstrap.openForwardedPort(port);
            });
            host.appendChild(pill);
        }
    }

    protected ensurePortsFloater(): HTMLElement {
        if (this.portsFloater) {
            return this.portsFloater;
        }
        const el = document.createElement('div');
        el.className = 'qaap-project-bootstrap-ports qaap-mod-floating';
        document.body.appendChild(el);
        this.portsFloater = el;
        return el;
    }

    protected removePortsFloater(): void {
        this.portsFloater?.remove();
        this.portsFloater = undefined;
    }

    /**
     * Floating menu (anchored to the chip or to the "Pick app" action) listing every runnable
     * monorepo app. Single tap selects the app and closes the menu — the bootstrap service will
     * re-emit state which redraws the banner with the chosen app.
     */
    protected openAppPicker(anchor: HTMLElement, descriptor: QaapProjectDescriptor): void {
        this.closeAppPicker();
        const menu = document.createElement('div');
        menu.className = 'qaap-project-bootstrap-picker';
        menu.setAttribute('role', 'menu');
        const header = document.createElement('div');
        header.className = 'qaap-project-bootstrap-picker-header';
        header.textContent = nls.localize(
            'qaap/projectBootstrap/pickAppHeader',
            'Choose app to preview ({0})',
            monorepoFlavorLabel(descriptor.monorepoFlavor)
        );
        menu.appendChild(header);
        for (const app of descriptor.apps) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'qaap-project-bootstrap-picker-item';
            item.setAttribute('role', 'menuitem');
            const name = document.createElement('span');
            name.className = 'qaap-project-bootstrap-picker-name';
            name.textContent = app.name;
            const detail = document.createElement('span');
            detail.className = 'qaap-project-bootstrap-picker-detail';
            detail.textContent = `${app.relativePath} · ${frameworkLabel(app.kind)}`;
            item.append(name, detail);
            item.addEventListener('click', () => {
                this.closeAppPicker();
                MobileHaptics.fire(MobileHaptics.LIGHT);
                this.bootstrap.selectMonorepoApp(app);
            });
            menu.appendChild(item);
        }
        document.body.appendChild(menu);
        this.appPickerMenu = menu;

        // Position the menu just above the anchor; clamp inside viewport.
        const rect = anchor.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        let left = rect.left;
        const minLeft = 8;
        const maxLeft = window.innerWidth - menuRect.width - 8;
        if (left < minLeft) { left = minLeft; }
        if (left > maxLeft) { left = maxLeft; }
        menu.style.left = `${Math.round(left)}px`;
        menu.style.bottom = `${Math.round(window.innerHeight - rect.top + 8)}px`;
        menu.classList.add('qaap-mod-visible');

        const onDocPointer = (ev: PointerEvent): void => {
            if (menu.contains(ev.target as Node)) {
                return;
            }
            this.closeAppPicker();
        };
        document.addEventListener('pointerdown', onDocPointer, true);
        this.pickerDismiss = () => document.removeEventListener('pointerdown', onDocPointer, true);
    }

    protected closeAppPicker(): void {
        this.pickerDismiss?.();
        this.pickerDismiss = undefined;
        if (this.appPickerMenu?.parentElement) {
            this.appPickerMenu.parentElement.removeChild(this.appPickerMenu);
        }
        this.appPickerMenu = undefined;
    }

    protected iconFor(phase: QaapBootstrapStateChange['phase']): string {
        switch (phase) {
            case 'installing': return 'codicon-loading codicon-modifier-spin';
            case 'starting': return 'codicon-loading codicon-modifier-spin';
            case 'install-failed':
            case 'run-failed': return 'codicon-error';
            case 'ready-to-run': return 'codicon-play';
            case 'detected':
            default: return 'codicon-rocket';
        }
    }

    /** Returns the framework label that best describes the current preview target. */
    protected activeFrameworkLabel(state: QaapBootstrapStateChange, descriptor: QaapProjectDescriptor): string {
        const app = state.selectedApp;
        return app ? frameworkLabel(app.kind) : frameworkLabel(descriptor.kind);
    }

    protected titleFor(state: QaapBootstrapStateChange, descriptor: QaapProjectDescriptor): string {
        const monorepoNeedsPick = descriptor.apps.length > 1 && !state.selectedApp;
        const framework = this.activeFrameworkLabel(state, descriptor);
        switch (state.phase) {
            case 'detected':
                if (monorepoNeedsPick) {
                    return nls.localize(
                        'qaap/projectBootstrap/monorepoDetected',
                        '{0} detected · {1} apps',
                        monorepoFlavorLabel(descriptor.monorepoFlavor),
                        descriptor.apps.length
                    );
                }
                return nls.localize('qaap/projectBootstrap/detected', '{0} project detected', framework);
            case 'installing':
                return nls.localize('qaap/projectBootstrap/installing', 'Installing dependencies…');
            case 'install-failed':
                return nls.localize('qaap/projectBootstrap/installFailed', 'Install failed');
            case 'ready-to-run':
                if (monorepoNeedsPick) {
                    return nls.localize(
                        'qaap/projectBootstrap/monorepoReady',
                        '{0} ready · choose an app',
                        monorepoFlavorLabel(descriptor.monorepoFlavor)
                    );
                }
                // If we have a remembered port, this workspace was launched before — reflect that
                // in the title so the user understands the banner is offering to resume, not start.
                if (state.lastPort) {
                    if (state.selectedApp) {
                        return nls.localize('qaap/projectBootstrap/resumeApp', 'Resume {0}', state.selectedApp.name);
                    }
                    return nls.localize('qaap/projectBootstrap/resume', 'Resume {0}', framework);
                }
                if (state.selectedApp) {
                    return nls.localize('qaap/projectBootstrap/readyToRunApp', 'Ready to run {0}', state.selectedApp.name);
                }
                return nls.localize('qaap/projectBootstrap/readyToRun', 'Ready to run {0}', framework);
            case 'starting':
                return nls.localize('qaap/projectBootstrap/starting', 'Starting dev server…');
            case 'running':
                if (state.selectedApp) {
                    return nls.localize('qaap/projectBootstrap/runningApp', '{0} running', state.selectedApp.name);
                }
                return nls.localize('qaap/projectBootstrap/running', '{0} running', framework);
            case 'run-failed':
                if (state.portInUse && state.error?.includes('Next.js is already running')) {
                    return nls.localize('qaap/projectBootstrap/nextAlreadyRunning', 'Next.js already running');
                }
                if (state.portInUse) {
                    return nls.localize('qaap/projectBootstrap/portInUse', 'Port already in use');
                }
                return nls.localize('qaap/projectBootstrap/runFailed', 'Dev server stopped');
            default:
                return descriptor.name;
        }
    }

    protected subtitleFor(state: QaapBootstrapStateChange, descriptor: QaapProjectDescriptor): string {
        const devCommand = state.selectedApp?.devCommand ?? descriptor.devCommandLabel ?? descriptor.devCommand;
        switch (state.phase) {
            case 'detected':
                return descriptor.installCommand;
            case 'ready-to-run':
                // Surface the remembered port alongside the dev command, e.g. `pnpm run dev · last on :3001`.
                if (state.lastPort && devCommand) {
                    return nls.localize(
                        'qaap/projectBootstrap/subtitleWithPort',
                        '{0} · last on :{1}',
                        devCommand,
                        state.lastPort
                    );
                }
                return devCommand ?? descriptor.installCommand;
            case 'installing':
                return descriptor.installCommand;
            case 'starting':
                return devCommand ?? '';
            case 'running':
                return devCommand ?? descriptor.name;
            case 'install-failed':
            case 'run-failed':
                return state.error ?? descriptor.name;
            default:
                return descriptor.name;
        }
    }

    protected cloudEnvAction(): { label: string; run: () => void | Promise<void> } | undefined {
        const id = 'qaap.cloud.openEnv';
        if (!this.commands?.getCommand(id)) {
            return undefined;
        }
        return {
            label: nls.localize('qaap/projectBootstrap/env', 'Env'),
            run: () => { void this.commands!.executeCommand(id); },
        };
    }

    protected actionsFor(state: QaapBootstrapStateChange, descriptor: QaapProjectDescriptor): { label: string; primary?: boolean; run: () => void | Promise<void> }[] {
        const monorepoNeedsPick = descriptor.apps.length > 1 && !state.selectedApp;
        const envAction = this.cloudEnvAction();
        switch (state.phase) {
            case 'detected':
                return [
                    {
                        label: nls.localize('qaap/projectBootstrap/install', 'Install'),
                        primary: true,
                        run: () => this.bootstrap.runInstall(),
                    },
                    {
                        label: nls.localize('qaap/projectBootstrap/skip', 'Not now'),
                        run: () => this.bootstrap.skip(),
                    },
                ];
            case 'ready-to-run':
                if (monorepoNeedsPick) {
                    return [
                        {
                            label: nls.localize('qaap/projectBootstrap/pickApp', 'Pick app'),
                            primary: true,
                            run: () => this.openAppPickerFromAction(descriptor),
                        },
                        {
                            label: nls.localize('qaap/projectBootstrap/dismiss', 'Dismiss'),
                            run: () => this.bootstrap.skip(),
                        },
                    ];
                }
                if (!state.selectedApp && !descriptor.devCommand) {
                    return [
                        {
                            label: nls.localize('qaap/projectBootstrap/dismiss', 'Dismiss'),
                            run: () => this.bootstrap.skip(),
                        },
                    ];
                }
                return [
                    {
                        label: state.lastPort
                            ? nls.localize(
                                'qaap/projectBootstrap/resumePreview',
                                'Resume preview · :{0}',
                                state.lastPort
                            )
                            : nls.localize('qaap/projectBootstrap/runPreview', 'Run & Preview'),
                        primary: true,
                        run: () => this.bootstrap.runDevServer(),
                    },
                    {
                        label: nls.localize('qaap/projectBootstrap/dismiss', 'Dismiss'),
                        run: () => this.bootstrap.skip(),
                    },
                ];
            case 'installing':
            case 'starting':
                return [
                    {
                        label: nls.localize('qaap/projectBootstrap/cancel', 'Cancel'),
                        run: () => this.bootstrap.skip(),
                    },
                ];
            case 'install-failed':
                return [
                    {
                        label: nls.localize('qaap/projectBootstrap/retry', 'Retry'),
                        primary: true,
                        run: () => this.bootstrap.runInstall(),
                    },
                    {
                        label: nls.localize('qaap/projectBootstrap/dismiss', 'Dismiss'),
                        run: () => this.bootstrap.skip(),
                    },
                ];
            case 'run-failed': {
                const recoveryPort = state.existingServerPort ?? state.lastPort;
                if (state.portInUse && recoveryPort) {
                    return [
                        {
                            label: nls.localize(
                                'qaap/projectBootstrap/openExistingPreview',
                                'Open preview · :{0}',
                                recoveryPort
                            ),
                            primary: true,
                            run: () => this.bootstrap.openExistingPreview(),
                        },
                        {
                            label: nls.localize('qaap/projectBootstrap/retry', 'Retry'),
                            run: () => this.bootstrap.runDevServer(),
                        },
                        {
                            label: nls.localize('qaap/projectBootstrap/dismiss', 'Dismiss'),
                            run: () => this.bootstrap.skip(),
                        },
                    ];
                }
                if (state.needsInstall) {
                    return [
                        {
                            label: nls.localize('qaap/projectBootstrap/install', 'Install'),
                            primary: true,
                            run: () => this.bootstrap.runInstall(),
                        },
                        {
                            label: nls.localize('qaap/projectBootstrap/retry', 'Retry'),
                            run: () => this.bootstrap.runDevServer(),
                        },
                        {
                            label: nls.localize('qaap/projectBootstrap/dismiss', 'Dismiss'),
                            run: () => this.bootstrap.skip(),
                        },
                    ];
                }
                return [
                    {
                        label: nls.localize('qaap/projectBootstrap/retry', 'Retry'),
                        primary: true,
                        run: () => this.bootstrap.runDevServer(),
                    },
                    {
                        label: nls.localize('qaap/projectBootstrap/dismiss', 'Dismiss'),
                        run: () => this.bootstrap.skip(),
                    },
                ];
            }
            case 'running': {
                const actions: { label: string; primary?: boolean; run: () => void | Promise<void> }[] = [
                    {
                        label: nls.localize('qaap/projectBootstrap/focusPreview', 'Focus preview'),
                        primary: true,
                        run: () => this.bootstrap.focusPreview(),
                    },
                ];
                if (envAction) {
                    actions.push(envAction);
                }
                actions.push({
                    label: nls.localize('qaap/projectBootstrap/dismiss', 'Dismiss'),
                    run: () => { this.bootstrap.skip(); },
                });
                return actions;
            }
            default:
                return [];
        }
    }

    /**
     * Called when the user clicks the "Pick app" primary action. We anchor the picker to the
     * banner itself so it floats above the workbench, mirroring the chip-anchored behavior.
     */
    protected openAppPickerFromAction(descriptor: QaapProjectDescriptor): void {
        const banner = this.banner;
        if (!banner) {
            return;
        }
        this.openAppPicker(banner, descriptor);
    }

    protected ensureBanner(): HTMLElement {
        if (this.banner && document.body.contains(this.banner)) {
            return this.banner;
        }
        const node = document.createElement('div');
        node.className = 'qaap-project-bootstrap-banner';
        node.setAttribute('role', 'status');
        node.setAttribute('aria-live', 'polite');
        document.body.appendChild(node);
        this.banner = node;
        this.toDispose.push(Disposable.create(() => this.removeBanner()));
        return node;
    }

    protected removeBanner(): void {
        this.closeAppPicker();
        if (this.banner?.parentElement) {
            this.banner.parentElement.removeChild(this.banner);
        }
        this.banner = undefined;
    }
}
