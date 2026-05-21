// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { matchesMobileNarrowViewport } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalWatcher } from '@theia/terminal/lib/common/terminal-watcher';
import { MiniBrowserOpenHandler } from '@theia/mini-browser/lib/browser/mini-browser-open-handler';
import { QaapProjectBootstrapDetector } from './qaap-project-bootstrap-detector';
import {
    QaapBootstrapPhase,
    QaapForwardedPort,
    QaapMonorepoAppCandidate,
    QaapProjectDescriptor,
    QaapProjectKind,
    isMonorepoDescriptor,
} from './qaap-project-bootstrap-types';
import { probeQaapDevPreviewPort, toProxiedDevPreviewUrl } from './qaap-dev-preview-client';
import {
    getImplicitDevPort,
    getQaapIdeListenPort,
    isReservedIdePort,
    resolveBootstrapDevPort,
    wrapDevCommandForPort,
} from './qaap-project-bootstrap-port';
import {
    extractDevOutputProbePorts,
    extractTerminalFailureLine,
    isTerminalDoesNotExistError,
    terminalOutputNeedsInstall,
    terminalOutputNextDevLock,
} from './qaap-project-bootstrap-dev-errors';
import { MobileProjectsService } from './mobile-projects-service';

/** Terminal titles created by {@link QaapProjectBootstrapService.spawnCommand}. */
const BOOTSTRAP_DEV_TERMINAL_TITLE_PREFIX = 'Dev (';
const BOOTSTRAP_INSTALL_TERMINAL_TITLE_PREFIX = 'Install (';

/** Storage key used to remember per-workspace user intent (skip / installed). */
const STORAGE_KEY = 'qaap.projectBootstrap.state.v1';

/**
 * Matches `http(s)://host:port` tokens printed by common dev servers (Vite, Next, CRA, Astro,
 * Remix, Nuxt). Hosts are restricted to local addresses so we do not pick up unrelated URLs that
 * the user may print in logs (e.g. external API endpoints in startup banners).
 * Used with `matchAll` so a single chunk can yield multiple ports.
 */
const DEV_URL_REGEX = /\b(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::(\d{2,5}))?\/?[^\s\u001b]*)/gi;

/** Strip ANSI escape sequences so URL detection works against raw xterm output. */
const ANSI_REGEX = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/** Node / Theia emit this when the dev port is already bound by another process. */
const PORT_IN_USE_REGEX = /EADDRINUSE|address already in use/i;

/** Keep only the tail of dev stdout so we can surface the last error line on fast exit. */
const DEV_OUTPUT_TAIL_MAX = 12_000;

/** Retries when mobile UI disposes the terminal widget before the backend session is ready. */
const TERMINAL_SPAWN_MAX_ATTEMPTS = 3;
const TERMINAL_SPAWN_RETRY_DELAY_MS = 450;
const TERMINAL_READY_DELAY_MS = 120;

/** Extracts `127.0.0.1:3000` / `localhost:5173` from an `EADDRINUSE` line. */
const PORT_IN_USE_ADDR_REGEX = /(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]|::1):(\d{2,5})/i;

/** After this delay, open the hinted preview URL even when stdout never prints a parseable URL. */
const DEV_PREVIEW_FALLBACK_MS = 6000;

export interface QaapBootstrapStateChange {
    readonly phase: QaapBootstrapPhase;
    readonly descriptor?: QaapProjectDescriptor;
    /** Set when the dev server printed a URL we could open. */
    readonly previewUrl?: string;
    /** Optional error message; populated for `install-failed` / `run-failed`. */
    readonly error?: string;
    /** When true, run Install (not another bare dev retry) to recover. */
    readonly needsInstall?: boolean;
    /** True when the last run failed because the dev port was already taken. */
    readonly portInUse?: boolean;
    /** Port we believe is already serving the app (for "Open preview" recovery). */
    readonly existingServerPort?: number;
    /** The monorepo app currently selected, when applicable. */
    readonly selectedApp?: QaapMonorepoAppCandidate;
    /**
     * Primary port the dev server bound to in a previous session. Lets the UI surface
     * "Resume preview · :3001" instead of a generic call to action once the user has at least once
     * successfully launched this workspace.
     */
    readonly lastPort?: number;
}

interface PersistedEntry {
    /** Workspace root URI string, used as map key. */
    readonly root: string;
    /** Phase the user "left" the bootstrap in; used so we do not re-prompt forever. */
    readonly phase: QaapBootstrapPhase;
    /** Last detected `package.json` name (so a rename forces a redetect). */
    readonly name?: string;
    /** Last selected monorepo app, keyed by relative path (so we restore it on reload). */
    readonly selectedAppPath?: string;
    /** Primary port observed on the most recent successful run, used to label the resume action. */
    readonly lastPort?: number;
}

/**
 * Drives the "open a repo → install deps → run dev server → show preview" experience.
 * Pure orchestrator: it does not render UI, instead it exposes state through {@link onStateChange}
 * so contributions can surface banners/snackbars/preview tabs at the right time.
 */
@injectable()
export class QaapProjectBootstrapService {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(QaapProjectBootstrapDetector)
    protected readonly detector: QaapProjectBootstrapDetector;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(TerminalWatcher)
    protected readonly terminalWatcher: TerminalWatcher;

    @inject(MiniBrowserOpenHandler)
    protected readonly miniBrowser: MiniBrowserOpenHandler;

    @inject(MobileProjectsService)
    protected readonly hubProjects: MobileProjectsService;

    protected readonly toDispose = new DisposableCollection();
    protected readonly stateEmitter = new Emitter<QaapBootstrapStateChange>();
    readonly onStateChange: Event<QaapBootstrapStateChange> = this.stateEmitter.event;

    protected readonly forwardedPortsEmitter = new Emitter<QaapForwardedPort[]>();
    /** Fires whenever the list of detected ports changes (added / removed / opened in preview). */
    readonly onForwardedPortsChanged: Event<QaapForwardedPort[]> = this.forwardedPortsEmitter.event;

    protected _forwardedPorts: QaapForwardedPort[] = [];
    get forwardedPorts(): QaapForwardedPort[] { return this._forwardedPorts.slice(); }

    protected _phase: QaapBootstrapPhase = 'idle';
    protected _descriptor: QaapProjectDescriptor | undefined;
    protected _previewUrl: string | undefined;
    protected _error: string | undefined;
    /** Set when dev stdout indicates missing devDependencies (typical on NODE_ENV=production hosts). */
    protected _needsInstall = false;
    protected _selectedApp: QaapMonorepoAppCandidate | undefined;
    /** Primary port the dev server last bound to. Used to label "resume preview" once we restore. */
    protected _lastPort: number | undefined;
    /** Set when stdout mentions `EADDRINUSE` so failure handlers can offer recovery. */
    protected _portConflictDetected = false;
    protected _portConflictPort: number | undefined;
    /** Invalidates stale terminal exit/close callbacks when a new dev run starts. */
    protected devRunGeneration = 0;
    /** Invalidates in-flight install when the workspace session is reset. */
    protected installGeneration = 0;
    protected refreshDebounceTimer: number | undefined;
    /** Port we asked the dev server to bind to (may differ from the framework default when Qaap uses :3000). */
    protected activeDevPortHint: number | undefined;
    /** Tracks the in-flight install/dev terminals so we can clean up on workspace switch. */
    protected installTerminal: TerminalWidget | undefined;
    protected devTerminal: TerminalWidget | undefined;
    protected devTerminalListener = Disposable.NULL;
    protected devPreviewFallbackTimers: number[] = [];
    /** Rolling tail of the current dev terminal output for failure diagnostics. */
    protected devOutputTail = '';

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.workspaceService.onWorkspaceChanged(() => {
            this.scheduleRefreshFromCurrentWorkspace();
        }));
        this.toDispose.push(this.workspaceService.onWorkspaceLocationChanged(() => {
            this.scheduleRefreshFromCurrentWorkspace();
        }));
        this.toDispose.push(Disposable.create(() => {
            if (typeof window !== 'undefined' && this.refreshDebounceTimer !== undefined) {
                window.clearTimeout(this.refreshDebounceTimer);
            }
        }));
        // Debug surface (used by integration tests and power users). Exposes the bare minimum to
        // simulate dev-server output and inspect state without hand-injecting through Inversify.
        if (typeof window !== 'undefined') {
            (window as unknown as { __qaapBootstrap?: object }).__qaapBootstrap = {
                getState: () => ({
                    phase: this._phase,
                    descriptor: this._descriptor?.name,
                    selectedApp: this._selectedApp?.relativePath,
                    forwardedPorts: this._forwardedPorts,
                }),
                feed: (chunk: string) => this.scanForDevUrl(chunk),
                setRunning: () => this.setPhase('running'),
                clearPorts: () => this.clearForwardedPorts(),
                // Integration test helper: spawns an arbitrary command and resolves with
                // `{ code, elapsedMs }` once `waitForExit` returns. Use to validate the new
                // exit-detection path without waiting for a real `npm install`.
                probeExit: async (command: string) => {
                    const t0 = Date.now();
                    const terminal = await this.spawnCommand({
                        title: 'qaap-probe',
                        command,
                        cwd: URI.fromFilePath('/tmp'),
                    });
                    const code = await this.waitForExit(terminal);
                    return { code, elapsedMs: Date.now() - t0 };
                },
            };
        }
    }

    get phase(): QaapBootstrapPhase { return this._phase; }
    get needsInstall(): boolean { return this._needsInstall; }
    get descriptor(): QaapProjectDescriptor | undefined { return this._descriptor; }
    get previewUrl(): string | undefined { return this._previewUrl; }
    get selectedApp(): QaapMonorepoAppCandidate | undefined { return this._selectedApp; }
    get lastPort(): number | undefined { return this._lastPort; }

    /** Current bootstrap state for UI contributions and AI tools. */
    getStateSnapshot(): QaapBootstrapStateChange {
        return this.buildStateChange(this._phase);
    }

    /**
     * Readable install/dev failure extracted from terminal output (for AI tools and `#qaap.bootstrap`).
     */
    getBootstrapFailureDetail(): { terminalFailure: string; terminalTail?: string } | undefined {
        const phase = this._phase;
        if (phase !== 'install-failed' && phase !== 'run-failed') {
            return undefined;
        }
        const terminal = phase === 'install-failed' ? this.installTerminal : this.devTerminal;
        const tail = terminal && !terminal.isDisposed
            ? this.readTerminalTail(terminal, 80)
            : this.devOutputTail;
        const fallback = this._error ?? (phase === 'install-failed' ? 'Install failed' : 'Dev server failed');
        return {
            terminalFailure: extractTerminalFailureLine(tail, fallback),
            terminalTail: tail.length > 0 ? tail.slice(-1500) : undefined,
        };
    }

    /**
     * Returns the dev command + cwd that should be spawned. For monorepos this is the selected
     * app's command (running inside the app's folder). For single-package projects it is the
     * descriptor-level dev command at the workspace root.
     */
    protected resolveDevPlan(): { command: string; cwd: URI; expectedPort?: number; kind: QaapProjectKind } | undefined {
        const descriptor = this._descriptor;
        if (!descriptor) {
            return undefined;
        }
        const app = this._selectedApp;
        if (app) {
            // pnpm workspaces: filter commands run from the workspace root, not the package folder.
            const cwd = descriptor.packageManager === 'pnpm' ? descriptor.rootUri : app.rootUri;
            return { command: app.devCommand, cwd, expectedPort: app.expectedPort, kind: app.kind };
        }
        if (descriptor.devCommand) {
            return {
                command: descriptor.devCommand,
                cwd: descriptor.rootUri,
                expectedPort: descriptor.expectedPort,
                kind: descriptor.kind,
            };
        }
        return undefined;
    }

    /**
     * Builds the shell command and target port for a dev run, shifting off the IDE port when needed
     * so `next dev` / CRA do not kill the Qaap backend on :3000.
     */
    protected buildDevSpawnPlan(plan: {
        command: string;
        expectedPort?: number;
        kind: QaapProjectKind;
    }): { command: string; targetPort?: number } {
        const idePort = getQaapIdeListenPort();
        const frameworkPort = plan.expectedPort ?? getImplicitDevPort(plan.kind);
        const targetPort = resolveBootstrapDevPort(frameworkPort, idePort);
        if (targetPort === undefined) {
            return { command: plan.command, targetPort: undefined };
        }
        if (targetPort !== undefined) {
            return {
                command: wrapDevCommandForPort(plan.command, targetPort, plan.kind),
                targetPort,
            };
        }
        return { command: plan.command, targetPort: undefined };
    }

    /** Select a monorepo app; updates the dev plan that {@link runDevServer} will use. */
    selectMonorepoApp(candidate: QaapMonorepoAppCandidate | undefined): void {
        this._selectedApp = candidate;
        if (this._descriptor && candidate) {
            this.persistPhase(this._phase === 'detected' ? 'detected' : 'ready-to-run', candidate);
        }
        this.setPhase(this._phase === 'detected' || this._phase === 'ready-to-run'
            ? (this._descriptor?.nodeModulesPresent ? 'ready-to-run' : 'detected')
            : this._phase);
    }

    /**
     * Called by contributions when the user clicks "Install" on the banner.
     * Idempotent: no-ops when there is no actionable descriptor or an install is already running.
     */
    async runInstall(): Promise<void> {
        const descriptor = this._descriptor;
        if (!descriptor || this._phase === 'installing') {
            return;
        }
        const installId = ++this.installGeneration;
        this.setPhase('installing');
        try {
            const terminal = await this.spawnCommandWithRetry({
                title: `Install (${descriptor.packageManager})`,
                command: descriptor.installCommand,
                cwd: descriptor.rootUri,
                reveal: false,
            });
            if (installId !== this.installGeneration) {
                this.disposeBootstrapTerminal(terminal);
                return;
            }
            this.installTerminal = terminal;
            const exitCode = await this.waitForExit(terminal);
            if (installId !== this.installGeneration || terminal.isDisposed) {
                return;
            }
            // node-pty / Theia can emit `code: undefined` on clean exits (see node-pty#751); treat
            // a missing code as a successful exit so a working install doesn't get flagged as
            // failed just because the kernel didn't surface the exit syscall value.
            if (exitCode !== undefined && exitCode !== 0) {
                const tail = this.readTerminalTail(terminal);
                this._needsInstall = terminalOutputNeedsInstall(tail);
                this._error = extractTerminalFailureLine(tail, `Install exited with code ${exitCode}`);
                this.setPhase('install-failed');
                return;
            }
            this._needsInstall = false;
            await this.refreshDescriptorAfterInstall();
            this.persistPhase('ready-to-run');
            this.setPhase('ready-to-run');
            // Auto-chain to dev server when a runnable plan is available (single-package script or a
            // selected monorepo app). For monorepos with no app picked yet we stop here so the user
            // can choose which app to preview — running an arbitrary one would be surprising.
            if (this.resolveDevPlan()) {
                await this.runDevServer();
            }
        } catch (e) {
            const raw = e instanceof Error ? e.message : String(e);
            this._error = this.toUserFacingDevError(raw);
            this.setPhase('install-failed');
        } finally {
            this.installTerminal = undefined;
        }
    }

    /**
     * Called by contributions when the user clicks "Run" on the banner (or auto after install).
     * Spawns the dev script, listens to its output, and opens the preview when a URL appears.
     */
    async runDevServer(): Promise<void> {
        const plan = this.resolveDevPlan();
        const descriptor = this._descriptor;
        if (!plan || !descriptor || this._phase === 'starting' || this._phase === 'running') {
            return;
        }
        this.beginDevRun();
        this.clearForwardedPorts();
        this._portConflictDetected = false;
        this._portConflictPort = undefined;
        this._error = undefined;
        this._needsInstall = false;
        this.devOutputTail = '';
        this.activeDevPortHint = undefined;
        const runId = ++this.devRunGeneration;
        this.setPhase('starting');

        const spawnPlan = this.buildDevSpawnPlan(plan);
        this.activeDevPortHint = spawnPlan.targetPort;

        // Another terminal may already be serving this app (common when `watch` + bootstrap both run).
        if (await this.tryAttachToExistingServer(this.collectProbePorts({ expectedPort: spawnPlan.targetPort }))) {
            return;
        }

        try {
            const label = this._selectedApp?.name ?? descriptor.name;
            const spawnOptions = {
                title: `Dev (${label})`,
                command: spawnPlan.command,
                cwd: plan.cwd,
            };
            const terminal = matchesMobileNarrowViewport()
                ? await this.spawnCommandWithRetry(spawnOptions)
                : await this.spawnCommand(spawnOptions);
            if (runId !== this.devRunGeneration) {
                return;
            }
            this.devTerminal = terminal;
            this.devTerminalListener.dispose();
            const onOutput = terminal.onOutput(data => {
                this.appendDevOutput(data);
                this.scanDevOutput(data, { expectedPort: spawnPlan.targetPort });
            });
            // Process exit is broadcast through TerminalWatcher (not via onTerminalDidClose, which
            // only fires when the *widget* is disposed). We filter by terminalId so a parallel
            // install terminal exiting doesn't accidentally flip the dev phase.
            const onProcessExit = this.terminalWatcher.onTerminalExit(event => {
                if (event.terminalId !== terminal.terminalId || runId !== this.devRunGeneration) {
                    return;
                }
                if (this._phase === 'starting' || this._phase === 'running') {
                    void this.failDevRun(`Dev server exited with code ${event.code ?? '?'}`, plan, runId);
                }
            });
            const onWidgetClose = terminal.onTerminalDidClose(() => {
                if (runId !== this.devRunGeneration) {
                    return;
                }
                if (this._phase === 'starting' || this._phase === 'running') {
                    void this.failDevRun('Dev server tab closed.', plan, runId);
                }
            });
            this.devTerminalListener = new DisposableCollection(onOutput, onProcessExit, onWidgetClose);
            this.toDispose.push(this.devTerminalListener);

            // Fallback: if the user has a known framework we already know the default port; route
            // through the port-forwarding machinery so the fallback shows up in the strip just like
            // a stdout-detected URL would.
            if (spawnPlan.targetPort) {
                this.scheduleDevPreviewFallback(runId, spawnPlan.targetPort);
            }
        } catch (e) {
            if (runId !== this.devRunGeneration) {
                return;
            }
            const raw = e instanceof Error ? e.message : String(e);
            await this.failDevRun(this.toUserFacingDevError(raw), plan, runId);
        }
    }

    /** User dismissed the banner; remember so we do not nag on every reload. */
    skip(): void {
        if (this._descriptor) {
            this.persistPhase('dismissed');
        }
        this.setPhase('dismissed');
    }

    /** Re-show the banner after a previous dismissal; called from the secondary action sheet. */
    reset(): void {
        if (this._descriptor) {
            this.persistPhase(this._descriptor.nodeModulesPresent ? 'ready-to-run' : 'detected');
        }
        void this.refreshFromCurrentWorkspace();
    }

    /** Focus the existing preview (or open it if a URL was previously detected). */
    async focusPreview(): Promise<void> {
        if (this._previewUrl) {
            await this.openPreview(this._previewUrl);
        }
    }

    /**
     * When the dev port is already bound, probe common ports and open the preview against the
     * server that is already listening instead of asking the user to free the port first.
     */
    async openExistingPreview(): Promise<void> {
        const plan = this.resolveDevPlan();
        const attached = await this.tryAttachToExistingServer(this.collectProbePorts(plan));
        if (attached) {
            this._error = undefined;
            this._portConflictDetected = false;
            this._portConflictPort = undefined;
            this.cleanupDevTerminal();
            return;
        }
        this._error = 'No dev server responded on the expected port.';
        this.setPhase('run-failed');
    }

    /**
     * Debounce workspace churn so we do not tear down install/dev terminals mid-flight.
     * {@link refreshFromCurrentWorkspace} re-runs detection and honors persisted user decisions.
     */
    protected scheduleRefreshFromCurrentWorkspace(): void {
        if (typeof window === 'undefined') {
            void this.refreshFromCurrentWorkspace();
            return;
        }
        if (this.refreshDebounceTimer !== undefined) {
            window.clearTimeout(this.refreshDebounceTimer);
        }
        this.refreshDebounceTimer = window.setTimeout(() => {
            this.refreshDebounceTimer = undefined;
            void this.refreshFromCurrentWorkspace();
        }, 450);
    }

    async refreshFromCurrentWorkspace(): Promise<void> {
        const roots = await this.workspaceService.roots;
        const first = roots[0];
        const nextRootKey = first?.resource.toString() ?? '';
        const currentRootKey = this._descriptor?.rootUri.toString() ?? '';
        if (
            (this._phase === 'installing' || this._phase === 'starting')
            && nextRootKey.length > 0
            && nextRootKey === currentRootKey
        ) {
            return;
        }
        this.resetBootstrapSessionForWorkspace();
        this.clearForwardedPorts();
        if (!first) {
            this._descriptor = undefined;
            this._previewUrl = undefined;
            this._selectedApp = undefined;
            this.setPhase('idle');
            return;
        }
        const descriptor = await this.detector.detect(first.resource);
        this._descriptor = descriptor;
        this._previewUrl = undefined;
        this._error = undefined;
        this._selectedApp = undefined;
        this._lastPort = undefined;
        this._portConflictDetected = false;
        this._portConflictPort = undefined;
        if (!descriptor) {
            this.setPhase('idle');
            return;
        }
        const persisted = this.readPersisted(descriptor.rootUri.toString());
        // Restore the previously selected monorepo app when it still exists; this avoids the user
        // having to repick after a reload.
        if (persisted?.selectedAppPath) {
            this._selectedApp = descriptor.apps.find(app => app.relativePath === persisted.selectedAppPath);
        }
        if (persisted?.lastPort !== undefined) {
            this._lastPort = isReservedIdePort(persisted.lastPort)
                ? undefined
                : persisted.lastPort;
        }
        if (!this._selectedApp && isMonorepoDescriptor(descriptor) && descriptor.apps.length === 1) {
            // Only one runnable app — pick it implicitly so the user gets one-tap "Run & Preview".
            this._selectedApp = descriptor.apps[0];
        }
        if (persisted && persisted.name === descriptor.name) {
            // Transient phases (`running`, `starting`, `installing`) are not real after a reload:
            // the spawned terminal is gone, the dev URL no longer responds, and the user is back
            // at "ready to launch". Downgrade them so the banner reappears with a `Run & Preview`
            // (or `Install`) action instead of silently restoring a dead `running` state.
            const restored = this.normalizeRestoredPhase(persisted.phase, descriptor);
            this.setPhase(restored);
            return;
        }
        this.setPhase(descriptor.nodeModulesPresent ? 'ready-to-run' : 'detected');
    }

    /**
     * Maps a persisted phase to the phase we should boot into. Terminal phases (`dismissed`,
     * `ready-to-run`, `detected`, failures) round-trip unchanged; transient ones collapse to the
     * appropriate "actionable" phase based on whether `node_modules` is on disk now.
     */
    protected normalizeRestoredPhase(phase: QaapBootstrapPhase, descriptor: QaapProjectDescriptor): QaapBootstrapPhase {
        switch (phase) {
            case 'running':
            case 'starting':
            case 'installing':
                return descriptor.nodeModulesPresent ? 'ready-to-run' : 'detected';
            default:
                return phase;
        }
    }

    protected scanDevOutput(data: string, plan: { expectedPort?: number }): void {
        if (this._phase !== 'starting' && this._phase !== 'running') {
            return;
        }
        const clean = data.replace(ANSI_REGEX, '');
        if (PORT_IN_USE_REGEX.test(clean)) {
            this._portConflictDetected = true;
            const fromLog = this.extractPortFromInUseMessage(clean);
            if (fromLog !== undefined) {
                this._portConflictPort = fromLog;
            }
            void this.tryAttachToExistingServer(this.collectProbePorts(plan));
        }
        for (const port of extractDevOutputProbePorts(clean)) {
            if (this._portConflictPort === undefined) {
                this._portConflictPort = port;
            }
            void this.tryAttachToExistingServer(this.collectProbePorts(plan));
        }
        this.scanForDevUrl(clean);
    }

    protected scanForDevUrl(data: string): void {
        if (this._phase !== 'starting' && this._phase !== 'running') {
            return;
        }
        const clean = data.replace(ANSI_REGEX, '');
        const matches = clean.matchAll(DEV_URL_REGEX);
        for (const match of matches) {
            const url = this.normalizeDevUrl(match[1]);
            if (!url) {
                continue;
            }
            const port = this.extractPort(url);
            if (port === undefined) {
                continue;
            }
            const effectivePort = isReservedIdePort(port) && this.activeDevPortHint !== undefined
                ? this.activeDevPortHint
                : port;
            if (isReservedIdePort(effectivePort)) {
                continue;
            }
            this.recordForwardedPort(effectivePort, toProxiedDevPreviewUrl(effectivePort));
        }
    }

    protected normalizeDevUrl(raw: string): string | undefined {
        try {
            // Trim trailing punctuation introduced by log decorations (e.g. `).`, `,`).
            const sanitized = raw.replace(/[),.;]+$/, '');
            const parsed = new URL(sanitized);
            // Drop empty paths so we keep the URL canonical for the dedup map.
            return parsed.toString().replace(/\/$/, '');
        } catch {
            return undefined;
        }
    }

    protected extractPort(url: string): number | undefined {
        try {
            const parsed = new URL(url);
            if (parsed.port) {
                return Number(parsed.port);
            }
            if (parsed.protocol === 'http:') { return 80; }
            if (parsed.protocol === 'https:') { return 443; }
        } catch {
            return undefined;
        }
        return undefined;
    }

    /**
     * Adds (or refreshes) a forwarded-port entry. The first port observed becomes the "primary"
     * preview that is auto-opened; subsequent ports just appear in the strip and only open when the
     * user taps them. This mirrors Codespaces' "your dev server printed a URL" behavior while
     * still surfacing all the auxiliary endpoints (websockets, admin UI, mock APIs, …).
     */
    protected recordForwardedPort(port: number, url: string): void {
        if (isReservedIdePort(port)) {
            return;
        }
        const existing = this._forwardedPorts.find(p => p.port === port);
        if (existing) {
            return;
        }
        const isPrimary = this._forwardedPorts.length === 0;
        const next: QaapForwardedPort = {
            port,
            url,
            firstSeenAt: Date.now(),
            previewOpen: false,
            primary: isPrimary,
        };
        this._forwardedPorts = [...this._forwardedPorts, next].sort((a, b) => a.firstSeenAt - b.firstSeenAt);
        this.forwardedPortsEmitter.fire(this.forwardedPorts);
        if (isPrimary) {
            // Remember the primary port so the next session can offer a "resume preview · :3001"
            // action instead of a generic "Run & Preview" CTA.
            this._lastPort = port;
            void this.openPreview(url, /* primary */ true);
        }
    }

    /**
     * Opens an additional forwarded port in its own mini-browser tab (not the shared "Preview"
     * widget that the primary port uses). The tab is keyed on the URL so re-tapping a pill simply
     * activates the existing tab.
     */
    async openForwardedPort(port: QaapForwardedPort): Promise<void> {
        if (port.primary) {
            // Primary ports go through the shared preview widget so users can swap between dev URLs
            // without spawning new tabs by accident.
            await this.openPreview(port.url, true);
            return;
        }
        try {
            await this.miniBrowser.open(new URI(port.url));
            this.markPortOpened(port.port, true);
        } catch (e) {
            console.error('[qaap-project-bootstrap] failed to open forwarded port', e);
        }
    }

    protected markPortOpened(port: number, open: boolean): void {
        let changed = false;
        this._forwardedPorts = this._forwardedPorts.map(p => {
            if (p.port !== port || p.previewOpen === open) {
                return p;
            }
            changed = true;
            return { ...p, previewOpen: open };
        });
        if (changed) {
            this.forwardedPortsEmitter.fire(this.forwardedPorts);
        }
    }

    /**
     * Ports to probe when attaching to an already-running dev server, most specific first.
     */
    protected collectProbePorts(plan?: { expectedPort?: number }): number[] {
        const idePort = getQaapIdeListenPort();
        const ports: number[] = [];
        if (this._portConflictPort !== undefined) {
            ports.push(this._portConflictPort);
        }
        if (plan?.expectedPort !== undefined) {
            ports.push(plan.expectedPort);
        }
        if (this.activeDevPortHint !== undefined) {
            ports.push(this.activeDevPortHint);
        }
        if (this._lastPort !== undefined) {
            ports.push(this._lastPort);
        }
        for (const port of extractDevOutputProbePorts(this.devOutputTail)) {
            ports.push(port);
        }
        return [...new Set(ports.filter(p => p > 0 && p < 65536 && p !== idePort))];
    }

    protected extractPortFromInUseMessage(text: string): number | undefined {
        const match = PORT_IN_USE_ADDR_REGEX.exec(text);
        if (!match) {
            return undefined;
        }
        const port = Number(match[1]);
        return Number.isFinite(port) ? port : undefined;
    }

    /**
     * Opens the preview on the port we asked the dev server to bind to when stdout never prints a
     * URL (common when logs still mention :3000 while the process listens on :3001).
     */
    protected scheduleDevPreviewFallback(runId: number, port: number): void {
        const tryOpen = async (): Promise<void> => {
            if (runId !== this.devRunGeneration) {
                return;
            }
            if (this._phase !== 'starting' || this._previewUrl) {
                return;
            }
            if (this._forwardedPorts.some(p => p.port === port)) {
                return;
            }
            await this.tryAttachToExistingServer([port]);
        };
        this.devPreviewFallbackTimers.push(
            window.setTimeout(() => {
                void tryOpen();
            }, 4500),
            window.setTimeout(() => {
                void tryOpen();
            }, DEV_PREVIEW_FALLBACK_MS),
        );
    }

    /**
     * Returns true when a user dev server (not the Qaap IDE) is listening and the preview was opened.
     */
    protected async tryAttachToExistingServer(ports: number[]): Promise<boolean> {
        if (ports.length === 0 || this._previewUrl) {
            return !!this._previewUrl;
        }
        for (const port of ports) {
            if (isReservedIdePort(port)) {
                continue;
            }
            const probe = await probeQaapDevPreviewPort(port);
            if (!probe.ready) {
                continue;
            }
            this._portConflictPort = port;
            this.recordForwardedPort(port, probe.previewUrl);
            return true;
        }
        return false;
    }

    /**
     * On dev failure, try to attach to an already-running server (port conflict / tab closed while
     * another terminal still serves the app) before surfacing `run-failed`.
     */
    protected async failDevRun(
        message: string,
        plan: { expectedPort?: number },
        runId: number,
    ): Promise<void> {
        if (runId !== this.devRunGeneration) {
            return;
        }
        if (this._phase !== 'starting' && this._phase !== 'running') {
            return;
        }
        if (this._previewUrl) {
            this.cleanupDevTerminal();
            return;
        }
        const probePorts = this.collectProbePorts(plan);
        const attached = await this.tryAttachToExistingServer(probePorts);
        if (attached || this._previewUrl) {
            this._error = undefined;
            this._portConflictDetected = false;
            this.cleanupDevTerminal();
            return;
        }
        const nextLock = terminalOutputNextDevLock(this.devOutputTail);
        const portConflict = this._portConflictDetected || PORT_IN_USE_REGEX.test(message) || nextLock;
        const conflictPort = this._portConflictPort
            ?? extractDevOutputProbePorts(this.devOutputTail)[0]
            ?? this.activeDevPortHint
            ?? plan.expectedPort;
        this._needsInstall = terminalOutputNeedsInstall(this.devOutputTail);
        this._error = portConflict && conflictPort
            ? `Port :${conflictPort} is already in use. Another terminal may already be serving the app.`
            : extractTerminalFailureLine(this.devOutputTail, this.toUserFacingDevError(message));
        this.setPhase('run-failed');
    }

    protected appendDevOutput(data: string): void {
        this.devOutputTail = (this.devOutputTail + data).slice(-DEV_OUTPUT_TAIL_MAX);
    }

    protected readTerminalTail(terminal: TerminalWidget, maxLines: number = 40): string {
        try {
            const length = terminal.buffer.length;
            const start = Math.max(0, length - maxLines);
            return terminal.buffer.getLines(start, length - start, true).join('\n');
        } catch {
            return '';
        }
    }

    protected async spawnCommandWithRetry(options: {
        title: string;
        command: string;
        cwd: URI;
        reveal?: boolean;
    }): Promise<TerminalWidget> {
        let lastError: unknown;
        for (let attempt = 0; attempt < TERMINAL_SPAWN_MAX_ATTEMPTS; attempt++) {
            if (attempt > 0) {
                await this.delay(TERMINAL_SPAWN_RETRY_DELAY_MS * attempt);
            }
            try {
                const terminal = await this.spawnCommand(options);
                await this.delay(TERMINAL_READY_DELAY_MS);
                return terminal;
            } catch (e) {
                lastError = e;
                const message = e instanceof Error ? e.message : String(e);
                if (!isTerminalDoesNotExistError(message)) {
                    throw e;
                }
            }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }

    protected delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /** Re-scan `node_modules` / dev tooling after a successful install. */
    protected async refreshDescriptorAfterInstall(): Promise<void> {
        const roots = await this.workspaceService.roots;
        const root = roots[0]?.resource;
        if (!root) {
            return;
        }
        const descriptor = await this.detector.detect(root);
        if (descriptor) {
            this._descriptor = descriptor;
        }
    }

    protected async openPreview(url: string, isPrimary: boolean = true): Promise<void> {
        try {
            await this.miniBrowser.openPreview(url);
            this._previewUrl = url;
            if (isPrimary) {
                const targetPort = this.extractPort(url);
                if (targetPort !== undefined) {
                    this.markPortOpened(targetPort, true);
                }
            }
            this.persistPhase('running');
            this.setPhase('running');
            this.syncHubSession('running');
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('qaap-bootstrap-preview-opened', { detail: { url } }));
            }
        } catch (e) {
            console.error('[qaap-project-bootstrap] failed to open preview', e);
            this._error = e instanceof Error ? e.message : String(e);
            this.setPhase('run-failed');
        }
    }

    protected async spawnCommand(options: {
        title: string;
        command: string;
        cwd: URI;
        /** When false, skip `terminalService.open` (avoids mobile races during long installs). */
        reveal?: boolean;
    }): Promise<TerminalWidget> {
        // Spawn the command DIRECTLY (no interactive shell wrapper) so the process actually exits
        // when the command completes. We use a login shell so the user's `node` / `pnpm` / `npm`
        // resolve from `~/.nvm`, `/opt/homebrew/bin`, etc. Without `-l` the PATH would be the
        // minimal one inherited from the IDE, which on macOS often lacks node entirely.
        const { shellPath, shellArgs } = this.buildShellInvocation(options.command);
        const terminal = await this.terminalService.newTerminal({
            title: options.title,
            cwd: FileUri.fsPath(options.cwd.toString()),
            shellPath,
            shellArgs,
            destroyTermOnClose: true,
        });
        await terminal.start();
        if (options.reveal !== false) {
            // On mobile, revealing the bottom terminal panel can dispose/recreate widgets mid-start.
            this.terminalService.open(terminal, { mode: matchesMobileNarrowViewport() ? 'open' : 'reveal' });
        }
        return terminal;
    }

    /** Maps low-level terminal backend errors to actionable copy for the bootstrap banner. */
    protected toUserFacingDevError(message: string): string {
        if (isTerminalDoesNotExistError(message)) {
            return 'The install/dev terminal was closed too early (often a double tap on Preview or a workspace refresh). Wait a moment, then tap Retry once.';
        }
        if (/ENOENT|no such file or directory/i.test(message)) {
            return 'Project folder not found on the server. Re-open the repo from Projects.';
        }
        if (/command not found|not found:/i.test(message)) {
            const pm = this._descriptor?.packageManager ?? 'npm';
            if (pm === 'pnpm' && /pnpm/.test(message)) {
                return 'pnpm is not available in this environment. Rebuild the Qaap Docker image (Corepack + pnpm) or run Install from a terminal with pnpm in PATH.';
            }
            return `Node/${pm} not available in the server shell. Install Node and ${pm} in the Docker image or run Install first.`;
        }
        return message;
    }

    /** Picks the right shell wrapper for the host platform. */
    protected buildShellInvocation(command: string): { shellPath: string; shellArgs: string[] } {
        const isWindows = typeof navigator !== 'undefined' && /win/i.test(navigator.platform);
        if (isWindows) {
            return { shellPath: 'cmd.exe', shellArgs: ['/d', '/s', '/c', command] };
        }
        return { shellPath: '/bin/bash', shellArgs: ['-l', '-c', command] };
    }

    /**
     * Resolves once the spawned process exits. We do NOT rely on `onTerminalDidClose` here —
     * that only fires when the *widget* is disposed (e.g. user clicks the X tab). The actual
     * process exit is broadcast via {@link TerminalWatcher.onTerminalExit}; we filter by the
     * terminal's id so concurrent install / dev terminals don't cross-resolve.
     */
    protected waitForExit(terminal: TerminalWidget): Promise<number | undefined> {
        return new Promise(resolve => {
            // Edge case: the process may already be gone by the time we subscribe (very fast
            // commands), so check the synchronous status first.
            if (terminal.exitStatus) {
                resolve(terminal.exitStatus.code);
                return;
            }
            const subscription = this.terminalWatcher.onTerminalExit(event => {
                if (event.terminalId === terminal.terminalId) {
                    subscription.dispose();
                    closeSub.dispose();
                    resolve(event.code);
                }
            });
            // Also unblock if the widget is closed before the process emits exit (user clicks X).
            const closeSub = terminal.onTerminalDidClose(() => {
                subscription.dispose();
                closeSub.dispose();
                resolve(terminal.exitStatus?.code);
            });
        });
    }

    /** Stops listeners/timers and the current dev terminal before a new dev run (keeps other Dev tabs). */
    protected beginDevRun(): void {
        this.devRunGeneration++;
        this.cancelDevPreviewFallbacks();
        this.cleanupDevTerminal();
    }

    /** Full reset when switching workspace or reloading bootstrap state. */
    protected resetBootstrapSessionForWorkspace(): void {
        this.installGeneration++;
        this.beginDevRun();
        this.disposeBootstrapTerminal(this.installTerminal);
        this.installTerminal = undefined;
        this.disposeOrphanBootstrapTerminals();
    }

    protected cancelDevPreviewFallbacks(): void {
        for (const timerId of this.devPreviewFallbackTimers) {
            window.clearTimeout(timerId);
        }
        this.devPreviewFallbackTimers = [];
    }

    protected cleanupDevTerminal(): void {
        this.devTerminalListener.dispose();
        this.devTerminalListener = Disposable.NULL;
        this.disposeBootstrapTerminal(this.devTerminal);
        this.devTerminal = undefined;
    }

    protected disposeBootstrapTerminal(terminal: TerminalWidget | undefined): void {
        if (!terminal) {
            return;
        }
        try {
            if (!terminal.isDisposed) {
                terminal.dispose();
            }
        } catch {
            /* widget may already be gone after a full page reload */
        }
    }

    /** Dev/install terminals survive a frontend reload; stop them so they cannot reclaim :3000. */
    protected disposeOrphanBootstrapTerminals(): void {
        for (const terminal of this.terminalService.all) {
            const title = terminal.title.label ?? '';
            if (title.startsWith(BOOTSTRAP_DEV_TERMINAL_TITLE_PREFIX)
                || title.startsWith(BOOTSTRAP_INSTALL_TERMINAL_TITLE_PREFIX)) {
                this.disposeBootstrapTerminal(terminal);
            }
        }
    }

    protected clearForwardedPorts(): void {
        if (this._forwardedPorts.length === 0) {
            return;
        }
        this._forwardedPorts = [];
        this.forwardedPortsEmitter.fire([]);
    }

    protected buildStateChange(phase: QaapBootstrapPhase): QaapBootstrapStateChange {
        const portInUse = phase === 'run-failed'
            && (this._portConflictDetected
                || PORT_IN_USE_REGEX.test(this._error ?? '')
                || terminalOutputNextDevLock(this.devOutputTail));
        const existingServerPort = this._portConflictPort
            ?? extractDevOutputProbePorts(this.devOutputTail)[0]
            ?? this._lastPort;
        return {
            phase,
            descriptor: this._descriptor,
            previewUrl: this._previewUrl,
            error: this._error,
            needsInstall: this._needsInstall || undefined,
            selectedApp: this._selectedApp,
            lastPort: this._lastPort,
            portInUse: portInUse || undefined,
            existingServerPort: portInUse ? existingServerPort : undefined,
        };
    }

    protected setPhase(phase: QaapBootstrapPhase): void {
        this._phase = phase;
        this.stateEmitter.fire(this.buildStateChange(phase));
        this.syncHubSession(phase);
    }

    protected syncHubSession(phase: QaapBootstrapPhase): void {
        const agentState = phase === 'running' ? 'working'
            : phase === 'install-failed' || phase === 'run-failed' ? 'review'
            : phase === 'idle' || phase === 'dismissed' ? 'idle'
            : 'working';
        void this.hubProjects.recordProjectSession({
            bootstrapPhase: phase,
            previewUrl: this._previewUrl,
            agentState,
            lastTask: phase === 'running'
                ? 'Dev preview running'
                : phase === 'installing'
                ? 'Installing dependencies…'
                : phase === 'starting'
                ? 'Starting dev server…'
                : undefined,
        }).catch(() => undefined);
    }

    protected persistPhase(phase: QaapBootstrapPhase, selectedApp?: QaapMonorepoAppCandidate): void {
        const descriptor = this._descriptor;
        if (!descriptor || typeof localStorage === 'undefined') {
            return;
        }
        const all = this.readAllPersisted();
        const next: PersistedEntry = {
            root: descriptor.rootUri.toString(),
            phase,
            name: descriptor.name,
            selectedAppPath: (selectedApp ?? this._selectedApp)?.relativePath,
            lastPort: this._lastPort,
        };
        all[next.root] = next;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        } catch {
            /* quota exceeded — non-fatal */
        }
    }

    protected readPersisted(rootKey: string): PersistedEntry | undefined {
        return this.readAllPersisted()[rootKey];
    }

    protected readAllPersisted(): Record<string, PersistedEntry> {
        if (typeof localStorage === 'undefined') {
            return {};
        }
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return {};
            }
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }
}
