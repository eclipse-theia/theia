// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { Disposable } from '@theia/core/lib/common/disposable';
import {
    fetchQaapGithubPullRequests,
    mergeQaapGithubPullRequest,
    startGithubOAuth,
} from '@theia/qaap-adapters/lib/browser/qaap-github-auth-client';
import type {
    QaapGithubPullRequestFile,
    QaapGithubPullRequestLine,
    QaapGithubPullRequestSummary,
    QaapGithubRepositorySummary,
} from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import {
    createMobileSheetGrabber,
    installMobilePullToRefresh,
    installMobileSheetDragDismiss,
} from './mobile-sheet-gestures';
import { MobileSnackbar } from './mobile-snackbar';

type PullRequestDecision = 'approved' | 'rejected' | 'commented';
type PullRequestMergeState = 'idle' | 'merging' | 'deploying' | 'merged' | 'failed';
type DragMode = 'horizontal' | 'vertical';
type ToastKind = 'default' | 'success' | 'error';

interface PullRequestReview {
    decision: PullRequestDecision;
    comment?: string;
}

interface PullRequestHistoryEntry {
    file: QaapGithubPullRequestFile;
    review: PullRequestReview;
}

interface StoredPullRequestReview {
    decisions: Array<[string, PullRequestReview]>;
    history: Array<{ path: string; review: PullRequestReview }>;
    mergeState?: PullRequestMergeState;
}

export interface MobilePullRequestPanelDelegate {
    onDismiss(): void;
}

const QAAP_MOBILE_PR_STORAGE_PREFIX = 'qaap.mobilePr.review.';

export class MobilePullRequestPanel {

    protected readonly root: HTMLElement;
    protected readonly header: HTMLElement;
    protected readonly progressLabel: HTMLElement;
    protected readonly progressFill: HTMLElement;
    protected readonly approveCount: HTMLElement;
    protected readonly rejectCount: HTMLElement;
    protected readonly noteCount: HTMLElement;
    protected readonly hintRow: HTMLElement;
    protected readonly stack: HTMLElement;
    protected readonly ctaRow: HTMLElement;
    protected readonly toast: HTMLElement;
    protected pullRequests: QaapGithubPullRequestSummary[] = [];
    protected activePullRequest: QaapGithubPullRequestSummary | undefined;
    protected currentRepository: QaapGithubRepositorySummary | undefined;
    protected queue: QaapGithubPullRequestFile[] = [];
    protected decisions = new Map<string, PullRequestReview>();
    protected history: PullRequestHistoryEntry[] = [];
    protected visible = false;
    protected loaded = false;
    protected loading = false;
    protected signedOut = false;
    protected errorMessage: string | undefined;
    protected confirmingMerge = false;
    protected dragStartX = 0;
    protected dragStartY = 0;
    protected dragX = 0;
    protected pointerId: number | undefined;
    protected dragMode: DragMode | undefined;
    protected animating = false;
    protected expanded = false;
    protected mergeState: PullRequestMergeState = 'idle';
    protected mergeTimer: number | undefined;
    protected toastTimer: number | undefined;
    protected mergeError: string | undefined;
    protected dragDismissDispose: Disposable = Disposable.NULL;
    protected pullToRefreshDispose: Disposable = Disposable.NULL;
    /** Bumps on hide so in-flight `loadPullRequests` cannot append stale CTA rows after close. */
    protected loadRequestGeneration = 0;

    constructor(protected readonly delegate: MobilePullRequestPanelDelegate) {
        this.root = document.createElement('div');
        this.root.className = 'theia-mobile-pr';
        this.root.setAttribute('role', 'dialog');
        this.root.setAttribute('aria-modal', 'true');
        this.root.setAttribute('aria-hidden', 'true');
        this.root.hidden = true;

        const grabber = createMobileSheetGrabber();
        this.root.append(grabber);

        this.header = document.createElement('header');
        this.header.className = 'theia-mobile-pr-header';

        const progress = document.createElement('section');
        progress.className = 'theia-mobile-pr-progress';
        progress.setAttribute('aria-live', 'polite');
        this.progressLabel = document.createElement('span');
        this.progressLabel.className = 'theia-mobile-pr-progress-label';
        const track = document.createElement('span');
        track.className = 'theia-mobile-pr-progress-track';
        this.progressFill = document.createElement('span');
        this.progressFill.className = 'theia-mobile-pr-progress-fill';
        track.appendChild(this.progressFill);
        this.approveCount = document.createElement('span');
        this.approveCount.className = 'theia-mobile-pr-count theia-mod-approve';
        this.rejectCount = document.createElement('span');
        this.rejectCount.className = 'theia-mobile-pr-count theia-mod-reject';
        this.noteCount = document.createElement('span');
        this.noteCount.className = 'theia-mobile-pr-count theia-mod-note';
        progress.append(this.progressLabel, track, this.approveCount, this.rejectCount, this.noteCount);

        this.hintRow = document.createElement('div');
        this.hintRow.className = 'theia-mobile-pr-hints';
        this.hintRow.append(
            this.createTextSpan('<- changes'),
            this.createTextSpan('tap to expand'),
            this.createTextSpan('approve ->')
        );

        this.stack = document.createElement('section');
        this.stack.className = 'theia-mobile-pr-stack';

        this.ctaRow = document.createElement('footer');
        this.ctaRow.className = 'theia-mobile-pr-actions';

        this.toast = document.createElement('div');
        this.toast.className = 'theia-mobile-pr-toast';
        this.toast.setAttribute('role', 'status');
        this.toast.setAttribute('aria-live', 'polite');
        this.toast.hidden = true;

        this.root.append(this.header, progress, this.hintRow, this.stack, this.ctaRow, this.toast);

        this.dragDismissDispose = installMobileSheetDragDismiss({
            target: this.root,
            grip: grabber,
            onDismiss: () => this.hide(),
        });

        this.pullToRefreshDispose = installMobilePullToRefresh({
            scroller: this.stack,
            host: this.root,
            onRefresh: async () => {
                this.loaded = false;
                await this.loadPullRequests();
                MobileSnackbar.show(
                    nls.localize('qaap/mobilePr/refreshed', 'Pull requests refreshed'),
                    { kind: 'success', duration: 1400 }
                );
            },
        });
    }

    dispose(): void {
        this.loadRequestGeneration++;
        this.visible = false;
        this.root.classList.remove('theia-mod-visible');
        this.root.setAttribute('aria-hidden', 'true');
        this.root.hidden = true;
        this.clearActionChrome();
        this.dragDismissDispose.dispose();
        this.dragDismissDispose = Disposable.NULL;
        this.pullToRefreshDispose.dispose();
        this.pullToRefreshDispose = Disposable.NULL;
        this.root.remove();
    }

    get node(): HTMLElement {
        return this.root;
    }

    isVisible(): boolean {
        return this.visible;
    }

    show(): void {
        this.visible = true;
        this.root.hidden = false;
        this.root.setAttribute('aria-hidden', 'false');
        this.root.classList.add('theia-mod-visible');
        if (!this.loaded) {
            void this.loadPullRequests();
        } else {
            this.render();
        }
    }

    /** Opens the swipe review UI for a PR already loaded by the Work Hub inbox. */
    showWithPullRequest(pullRequest: QaapGithubPullRequestSummary): void {
        this.visible = true;
        this.root.hidden = false;
        this.root.setAttribute('aria-hidden', 'false');
        this.root.classList.add('theia-mod-visible');
        this.loading = false;
        this.errorMessage = undefined;
        this.signedOut = false;
        this.loaded = true;
        const existing = this.pullRequests.find(
            candidate => candidate.owner === pullRequest.owner
                && candidate.repo === pullRequest.repo
                && candidate.number === pullRequest.number,
        );
        if (!existing) {
            this.pullRequests = [pullRequest, ...this.pullRequests];
        }
        this.usePullRequest(existing ?? pullRequest);
    }

    hide(): void {
        if (!this.visible) {
            return;
        }
        this.loadRequestGeneration++;
        this.visible = false;
        this.root.classList.remove('theia-mod-visible');
        this.root.setAttribute('aria-hidden', 'true');
        this.resetSheetPresentation();
        this.pointerId = undefined;
        this.dragX = 0;
        this.dragMode = undefined;
        this.hideToast();
        this.clearActionChrome();
        window.setTimeout(() => {
            if (!this.visible) {
                this.root.hidden = true;
            }
        }, 180);
        this.delegate.onDismiss();
    }

    protected async loadPullRequests(): Promise<void> {
        const generation = ++this.loadRequestGeneration;
        this.loading = true;
        this.errorMessage = undefined;
        this.signedOut = false;
        this.render();
        try {
            const response = await fetchQaapGithubPullRequests();
            if (generation !== this.loadRequestGeneration) {
                return;
            }
            this.loaded = true;
            this.loading = false;
            this.currentRepository = response.currentRepository;
            this.signedOut = !response.signedIn;
            this.pullRequests = response.pullRequests;
            if (!response.signedIn) {
                this.clearActivePullRequest();
            } else if (response.pullRequests.length === 0) {
                this.clearActivePullRequest();
            } else {
                const previousNumber = this.activePullRequest?.number;
                const previous = previousNumber !== undefined
                    ? response.pullRequests.find(pr => pr.number === previousNumber)
                    : undefined;
                this.usePullRequest(previous ?? response.pullRequests[0]);
            }
        } catch (err) {
            if (generation !== this.loadRequestGeneration) {
                return;
            }
            this.loaded = true;
            this.loading = false;
            this.errorMessage = err instanceof Error ? err.message : nls.localize('qaap/mobilePr/loadError', 'Failed to load pull requests.');
            this.clearActivePullRequest();
        }
        if (generation !== this.loadRequestGeneration) {
            return;
        }
        this.render();
    }

    protected clearActivePullRequest(): void {
        this.clearMergeTimer();
        this.activePullRequest = undefined;
        this.queue = [];
        this.decisions.clear();
        this.history = [];
        this.confirmingMerge = false;
        this.mergeState = 'idle';
        this.mergeError = undefined;
    }

    protected usePullRequest(pullRequest: QaapGithubPullRequestSummary): void {
        this.clearMergeTimer();
        this.activePullRequest = pullRequest;
        this.confirmingMerge = false;
        this.mergeError = undefined;
        this.expanded = false;
        this.dragX = 0;
        this.restoreReviewState();
    }

    protected restoreReviewState(): void {
        const pullRequest = this.activePullRequest;
        if (!pullRequest) {
            return;
        }
        this.decisions.clear();
        this.history = [];
        this.mergeState = 'idle';
        const stored = this.readStoredReview(pullRequest);
        if (stored) {
            for (const [path, review] of stored.decisions) {
                if (this.findFile(path)) {
                    this.decisions.set(path, review);
                }
            }
            for (const entry of stored.history) {
                const file = this.findFile(entry.path);
                if (file) {
                    this.history.push({ file, review: entry.review });
                }
            }
            if (stored.mergeState === 'merged') {
                this.mergeState = 'merged';
            }
        }
        this.queue = pullRequest.filesPreview.filter(file => !this.decisions.has(file.f));
    }

    /** Single place to reset footer actions (avoids stacked rows after re-open). */
    protected clearActionChrome(): void {
        this.root.querySelectorAll('.theia-mobile-pr-button-row, .theia-mobile-pr-quick-row').forEach(el => el.remove());
        this.ctaRow.replaceChildren();
    }

    protected setCtaContent(...nodes: Node[]): void {
        this.ctaRow.replaceChildren(...nodes);
    }

    protected render(): void {
        this.renderHeader();
        this.clearActionChrome();
        if (this.loading && !this.activePullRequest) {
            this.renderProgress(0, 0, 0, 0, 0);
            this.hintRow.hidden = true;
            this.stack.replaceChildren(this.createBusyState());
            return;
        }
        if (this.signedOut) {
            this.renderProgress(0, 0, 0, 0, 0);
            this.hintRow.hidden = true;
            this.stack.replaceChildren(this.createSignInState());
            this.renderSignInActions();
            return;
        }
        if (this.errorMessage && !this.activePullRequest) {
            this.renderProgress(0, 0, 0, 0, 0);
            this.hintRow.hidden = true;
            this.stack.replaceChildren(this.createErrorState());
            this.renderErrorActions();
            return;
        }
        if (!this.activePullRequest) {
            this.renderProgress(0, 0, 0, 0, 0);
            this.hintRow.hidden = true;
            this.stack.replaceChildren(this.createEmptyState());
            this.renderEmptyActions();
            return;
        }
        const stats = this.reviewStats();
        const allReviewed = this.queue.length === 0;
        this.renderProgress(stats.reviewed, stats.total, stats.approved, stats.rejected, stats.commented);
        this.hintRow.hidden = allReviewed;
        this.stack.replaceChildren();
        if (allReviewed) {
            this.stack.appendChild(this.createDoneState(stats));
        } else {
            this.stack.appendChild(this.createCardStack());
        }
        this.renderActions(allReviewed, stats);
    }

    protected renderHeader(): void {
        this.header.replaceChildren();
        const pullRequest = this.activePullRequest;
        const repoLabel = this.repositoryLabel();
        const top = document.createElement('div');
        top.className = 'theia-mobile-pr-meta-row';

        const repoChip = document.createElement('span');
        repoChip.className = 'theia-mobile-pr-repo';
        repoChip.append(
            this.createIcon('codicon-github'),
            this.createTextSpan(repoLabel)
        );

        const spacer = document.createElement('span');
        spacer.className = 'theia-mobile-pr-spacer';

        top.append(repoChip, spacer);

        if (pullRequest) {
            const externalLink = document.createElement('a');
            externalLink.className = 'theia-mobile-pr-icon-btn theia-mod-link codicon codicon-link-external';
            externalLink.href = pullRequest.htmlUrl;
            externalLink.target = '_blank';
            externalLink.rel = 'noopener noreferrer';
            externalLink.title = nls.localize('qaap/mobilePr/openOnGithub', 'Open on GitHub');
            externalLink.setAttribute('aria-label', externalLink.title);
            top.append(externalLink);
        }

        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.className = 'theia-mobile-pr-icon-btn codicon codicon-refresh';
        refresh.title = nls.localize('qaap/mobilePr/refresh', 'Refresh pull requests');
        refresh.setAttribute('aria-label', refresh.title);
        if (this.loading) {
            refresh.classList.add('codicon-modifier-spin');
        }
        refresh.disabled = this.loading || this.mergeState === 'merging' || this.mergeState === 'deploying';
        refresh.addEventListener('click', () => { void this.loadPullRequests(); });
        top.append(refresh);

        this.header.append(top);

        if (this.pullRequests.length > 1 && pullRequest) {
            this.header.append(this.createPullRequestPicker(pullRequest));
        }

        if (pullRequest) {
            const titleRow = document.createElement('div');
            titleRow.className = 'theia-mobile-pr-title-row';
            const number = document.createElement('span');
            number.className = 'theia-mobile-pr-number';
            number.textContent = `#${pullRequest.number}`;
            const title = document.createElement('h1');
            title.className = 'theia-mobile-pr-title';
            title.textContent = pullRequest.title;
            titleRow.append(number, title);

            const branchRow = document.createElement('div');
            branchRow.className = 'theia-mobile-pr-branchrow';
            branchRow.append(
                this.createIcon('codicon-git-branch'),
                this.createClassedTextSpan('theia-mobile-pr-branch-name', pullRequest.branch),
                this.createIcon('codicon-arrow-right'),
                this.createClassedTextSpan('theia-mobile-pr-branch-name theia-mod-base', pullRequest.base),
                this.createClassedTextSpan('theia-mobile-pr-author', `@${pullRequest.author}`)
            );

            const stats = document.createElement('div');
            stats.className = 'theia-mobile-pr-stats';
            stats.append(
                this.createStatChip('codicon-file', `${pullRequest.files} ${nls.localize('qaap/mobilePr/files', 'files')}`),
                this.createClassedTextSpan('theia-mod-add', `+${pullRequest.adds}`),
                this.createClassedTextSpan('theia-mod-del', `-${pullRequest.dels}`),
                this.createTestsPill(pullRequest.tests)
            );

            this.header.append(titleRow, branchRow, stats);
        }
    }

    protected createPullRequestPicker(pullRequest: QaapGithubPullRequestSummary): HTMLElement {
        const picker = document.createElement('div');
        picker.className = 'theia-mobile-pr-picker';
        picker.setAttribute('role', 'tablist');
        picker.setAttribute('aria-label', nls.localize('qaap/mobilePr/pickerLabel', 'Select pull request'));
        for (const candidate of this.pullRequests) {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'theia-mobile-pr-picker-tab';
            tab.setAttribute('role', 'tab');
            const active = candidate.number === pullRequest.number;
            if (active) {
                tab.classList.add('theia-mod-active');
                tab.setAttribute('aria-selected', 'true');
            } else {
                tab.setAttribute('aria-selected', 'false');
            }
            tab.title = candidate.title;
            const number = document.createElement('span');
            number.className = 'theia-mobile-pr-picker-num';
            number.textContent = `#${candidate.number}`;
            const label = document.createElement('span');
            label.className = 'theia-mobile-pr-picker-title';
            label.textContent = candidate.title;
            tab.append(number, label);
            tab.addEventListener('click', () => {
                if (candidate.number === this.activePullRequest?.number) {
                    return;
                }
                this.usePullRequest(candidate);
                this.render();
            });
            picker.appendChild(tab);
        }
        return picker;
    }

    protected repositoryLabel(): string {
        const pr = this.activePullRequest;
        if (pr) {
            return `${pr.owner}/${pr.repo}`;
        }
        const repo = this.currentRepository;
        if (repo) {
            return repo.fullName;
        }
        return nls.localize('qaap/mobilePr/noRepo', 'No repository open');
    }

    protected renderProgress(reviewed: number, total: number, approved: number, rejected: number, commented: number): void {
        this.progressLabel.textContent = total > 0 ? `${reviewed} / ${total} reviewed` : '0 reviewed';
        this.progressFill.style.width = total > 0 ? `${(reviewed / total) * 100}%` : '0';
        this.approveCount.textContent = approved > 0 ? `ok ${approved}` : '';
        this.rejectCount.textContent = rejected > 0 ? `x ${rejected}` : '';
        this.noteCount.textContent = commented > 0 ? `note ${commented}` : '';
    }

    protected createCardStack(): HTMLElement {
        const host = document.createElement('div');
        host.className = 'theia-mobile-pr-card-host';
        const approve = document.createElement('div');
        approve.className = 'theia-mobile-pr-backdrop theia-mod-approve';
        const approveLabel = document.createElement('span');
        approveLabel.append(document.createTextNode('Approve '), this.createIcon('codicon-check'));
        approve.appendChild(approveLabel);
        const reject = document.createElement('div');
        reject.className = 'theia-mobile-pr-backdrop theia-mod-reject';
        const rejectLabel = document.createElement('span');
        rejectLabel.append(this.createIcon('codicon-close'), document.createTextNode(' Changes'));
        reject.appendChild(rejectLabel);
        host.append(approve, reject);
        const next = this.queue[1];
        if (next) {
            host.appendChild(this.createFileCard(next, false));
        }
        const top = this.queue[0];
        if (top) {
            host.appendChild(this.createFileCard(top, true));
        }
        this.applyDragStyles(host);
        return host;
    }

    protected createFileCard(file: QaapGithubPullRequestFile, top: boolean): HTMLElement {
        const card = document.createElement('article');
        card.className = top ? 'theia-mobile-pr-card theia-mod-top' : 'theia-mobile-pr-card theia-mod-next';
        card.setAttribute('aria-label', `${file.f}, ${file.adds} additions, ${file.dels} deletions`);
        if (this.expanded && top) {
            card.classList.add('theia-mod-expanded');
        }
        const header = document.createElement('header');
        header.className = 'theia-mobile-pr-card-header';
        const glyph = document.createElement('span');
        glyph.className = 'theia-mobile-pr-file-glyph';
        glyph.textContent = file.ext;
        const name = document.createElement('span');
        name.className = 'theia-mobile-pr-file-name';
        name.textContent = file.f;
        const adds = document.createElement('span');
        adds.className = 'theia-mobile-pr-file-add';
        adds.textContent = `+${file.adds}`;
        const dels = document.createElement('span');
        dels.className = 'theia-mobile-pr-file-del';
        dels.textContent = `-${file.dels}`;
        header.append(glyph, name, adds, dels);
        const body = document.createElement('div');
        body.className = 'theia-mobile-pr-diff';
        if (file.preview.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'theia-mobile-pr-diff-empty';
            empty.textContent = nls.localize('qaap/mobilePr/noPreview', 'No inline preview available.');
            body.appendChild(empty);
        } else {
            for (const line of file.preview) {
                body.appendChild(this.createDiffLine(line));
            }
        }
        card.append(header, body);
        if (top) {
            card.addEventListener('pointerdown', event => this.onPointerDown(event, card));
            card.addEventListener('pointermove', event => this.onPointerMove(event, card));
            card.addEventListener('pointerup', event => this.onPointerUp(event, card));
            card.addEventListener('pointercancel', event => this.onPointerUp(event, card));
        }
        return card;
    }

    protected createDiffLine(line: QaapGithubPullRequestLine): HTMLElement {
        const row = document.createElement('div');
        row.className = `theia-mobile-pr-diff-line theia-mod-${line.t}`;
        const number = document.createElement('span');
        number.className = 'theia-mobile-pr-diff-number';
        number.textContent = String(line.n);
        const marker = document.createElement('span');
        marker.className = 'theia-mobile-pr-diff-marker';
        marker.textContent = line.t === 'add' ? '+' : line.t === 'del' ? '-' : ' ';
        const source = document.createElement('span');
        source.className = 'theia-mobile-pr-diff-source';
        source.textContent = line.s;
        row.append(number, marker, source);
        return row;
    }

    protected createBusyState(): HTMLElement {
        const busy = document.createElement('div');
        busy.className = 'theia-mobile-pr-empty';
        busy.append(
            this.createIcon('codicon-sync codicon-modifier-spin'),
            this.createTextSpan(nls.localize('qaap/mobilePr/loading', 'Loading pull requests...')),
            this.createClassedTextSpan('theia-mobile-pr-empty-hint', this.repositoryLabel())
        );
        return busy;
    }

    protected createSignInState(): HTMLElement {
        const state = document.createElement('div');
        state.className = 'theia-mobile-pr-empty theia-mod-signin';
        state.append(
            this.createIcon('codicon-github'),
            this.createTextSpan(nls.localize('qaap/mobilePr/signInTitle', 'Sign in to review pull requests')),
            this.createClassedTextSpan(
                'theia-mobile-pr-empty-hint',
                nls.localize('qaap/mobilePr/signInDetail', 'Connect your GitHub account to load the open PRs for the current repository.')
            )
        );
        return state;
    }

    protected createErrorState(): HTMLElement {
        const state = document.createElement('div');
        state.className = 'theia-mobile-pr-empty theia-mod-error';
        state.append(
            this.createIcon('codicon-warning'),
            this.createTextSpan(nls.localize('qaap/mobilePr/loadFailed', 'Could not load pull requests')),
            this.createClassedTextSpan('theia-mobile-pr-empty-hint', this.errorMessage ?? '')
        );
        return state;
    }

    protected createEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-pr-empty';
        const repoLabel = this.repositoryLabel();
        const hasRepo = !!this.currentRepository;
        empty.append(
            this.createIcon('codicon-git-pull-request'),
            this.createTextSpan(
                hasRepo
                    ? nls.localize('qaap/mobilePr/noPullsForRepo', 'No open pull requests in {0}', repoLabel)
                    : nls.localize('qaap/mobilePr/noPulls', 'No open pull requests')
            ),
            this.createClassedTextSpan(
                'theia-mobile-pr-empty-hint',
                hasRepo
                    ? nls.localize('qaap/mobilePr/noPullsHint', 'Open a PR on GitHub or pull a branch into this workspace to start reviewing here.')
                    : nls.localize('qaap/mobilePr/noPullsDetail', 'Open a GitHub repository workspace to see its open pull requests.')
            )
        );
        return empty;
    }

    protected createDoneState(stats: ReturnType<MobilePullRequestPanel['reviewStats']>): HTMLElement {
        const done = document.createElement('div');
        done.className = 'theia-mobile-pr-done';
        if (this.confirmingMerge) {
            done.classList.add('theia-mod-confirm');
        }
        if (this.mergeState === 'merged') {
            done.classList.add('theia-mod-merged');
        } else if (this.mergeState === 'merging' || this.mergeState === 'deploying') {
            done.classList.add('theia-mod-merging');
        } else if (this.mergeState === 'failed') {
            done.classList.add('theia-mod-failed');
        }
        const icon = this.createIcon(this.mergeState === 'failed' ? 'codicon-warning' : this.confirmingMerge ? 'codicon-shield' : 'codicon-check');
        icon.classList.add('theia-mobile-pr-done-icon');
        const title = document.createElement('strong');
        title.textContent = this.doneTitle();
        const summary = document.createElement('span');
        summary.textContent = this.doneSummary(stats);
        done.append(icon, title, summary);
        if (this.mergeState === 'merged') {
            done.appendChild(this.createClassedTextSpan(
                'theia-mobile-pr-success',
                nls.localize('qaap/mobilePr/deployNotice', 'Merged in the current repository. Deploy started.')
            ));
        }
        if (this.mergeError) {
            done.appendChild(this.createClassedTextSpan('theia-mobile-pr-error', this.mergeError));
        }
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'theia-mobile-pr-secondary';
        reset.textContent = nls.localize('qaap/mobilePr/reviewAgain', 'Review again');
        reset.disabled = this.mergeState === 'merging' || this.mergeState === 'deploying';
        reset.addEventListener('click', () => this.reset());
        done.appendChild(reset);
        return done;
    }

    protected doneTitle(): string {
        if (this.mergeState === 'merged') {
            return nls.localize('qaap/mobilePr/deployedTitle', 'Merged & deployed');
        }
        if (this.mergeState === 'deploying') {
            return nls.localize('qaap/mobilePr/deployingTitle', 'Deploying');
        }
        if (this.mergeState === 'merging') {
            return nls.localize('qaap/mobilePr/mergingTitle', 'Merging');
        }
        if (this.mergeState === 'failed') {
            return nls.localize('qaap/mobilePr/mergeFailedTitle', 'Merge failed');
        }
        if (this.confirmingMerge) {
            return nls.localize('qaap/mobilePr/confirmTitle', 'Confirm merge');
        }
        return nls.localize('qaap/mobilePr/allReviewed', 'All reviewed');
    }

    protected doneSummary(stats: ReturnType<MobilePullRequestPanel['reviewStats']>): string {
        const pr = this.activePullRequest;
        if (this.mergeState === 'merged') {
            return nls.localize('qaap/mobilePr/deployedSummary', 'PR #{0} landed on {1}.', String(pr?.number ?? ''), pr?.base ?? 'base');
        }
        if (this.mergeState === 'deploying') {
            return nls.localize('qaap/mobilePr/deployingSummary', 'Merge complete. Starting deploy.');
        }
        if (this.mergeState === 'merging') {
            return nls.localize('qaap/mobilePr/mergingSummary', 'Submitting the approved review to GitHub.');
        }
        if (this.mergeState === 'failed') {
            return nls.localize('qaap/mobilePr/mergeFailedSummary', 'Nothing changed. You can retry after resolving the issue.');
        }
        if (this.confirmingMerge) {
            return nls.localize(
                'qaap/mobilePr/confirmSummary',
                '{0} approved files will merge into {1}.',
                String(stats.approved),
                pr?.base ?? 'base'
            );
        }
        return `${stats.approved} approved - ${stats.rejected} changes - ${stats.commented} notes`;
    }

    protected renderActions(allReviewed: boolean, stats: ReturnType<MobilePullRequestPanel['reviewStats']>): void {
        if (allReviewed) {
            this.renderReviewedActions(stats);
            return;
        }
        const top = this.queue[0];
        const quickRow = document.createElement('div');
        quickRow.className = 'theia-mobile-pr-quick-row';
        quickRow.append(
            this.createChipButton(nls.localize('qaap/mobilePr/fullDiff', 'Full diff'), 'codicon-open-preview', () => this.toggleExpanded()),
            this.createChipButton(nls.localize('qaap/mobilePr/quickLooksGood', 'Looks good'), 'codicon-comment-discussion', () => this.decideTop('approved', 'Looks good')),
            this.createChipButton(nls.localize('qaap/mobilePr/quickNeedsTests', 'Needs tests'), 'codicon-beaker', () => this.decideTop('commented', 'Needs tests')),
            this.createChipButton(nls.localize('qaap/mobilePr/quickSecurity', 'Security risk'), 'codicon-shield', () => this.decideTop('rejected', 'Security risk')),
        );
        const buttonRow = document.createElement('div');
        buttonRow.className = 'theia-mobile-pr-button-row';
        const reject = this.createActionButton('secondary', nls.localize('qaap/mobilePr/requestChanges', 'Changes'), 'codicon-close', () => this.decideTop('rejected'));
        const undo = this.createActionButton('ghost', nls.localize('qaap/mobilePr/undo', 'Undo'), 'codicon-discard', () => this.undo());
        undo.disabled = this.history.length === 0;
        const approve = this.createActionButton('primary', nls.localize('qaap/mobilePr/approve', 'Approve'), 'codicon-check', () => this.decideTop('approved'));
        if (!top) {
            reject.disabled = true;
            approve.disabled = true;
        }
        buttonRow.append(reject, undo, approve);
        this.setCtaContent(quickRow, buttonRow);
    }

    protected renderReviewedActions(stats: ReturnType<MobilePullRequestPanel['reviewStats']>): void {
        const blockers = stats.rejected + stats.commented;
        const buttonRow = document.createElement('div');
        buttonRow.className = 'theia-mobile-pr-button-row';
        if (this.confirmingMerge && this.mergeState === 'idle') {
            const cancel = this.createActionButton('secondary', nls.localize('qaap/mobilePr/cancel', 'Cancel'), 'codicon-close', () => {
                this.confirmingMerge = false;
                this.render();
            });
            const confirm = this.createActionButton('primary', nls.localize('qaap/mobilePr/confirmMerge', 'Confirm merge'), 'codicon-git-merge', () => { void this.executeMergeAndDeploy(); });
            buttonRow.append(cancel, confirm);
            this.setCtaContent(buttonRow);
            return;
        }
        const undo = this.createActionButton('secondary', nls.localize('qaap/mobilePr/undo', 'Undo'), 'codicon-discard', () => this.undo());
        undo.disabled = this.history.length === 0 || this.mergeState !== 'idle';
        const label = this.mergeButtonLabel(blockers);
        const icon = this.mergeState === 'merging' || this.mergeState === 'deploying' ? 'codicon-sync codicon-modifier-spin' : 'codicon-git-merge';
        const merge = this.createActionButton('primary', label, icon, () => this.startMergeConfirmation());
        merge.disabled = blockers > 0 || this.mergeState === 'merging' || this.mergeState === 'deploying' || this.mergeState === 'merged';
        if (this.mergeState === 'failed') {
            merge.disabled = false;
            merge.replaceChildren(this.createIcon('codicon-debug-restart'), this.createTextSpan(nls.localize('qaap/mobilePr/retryMerge', 'Retry merge')));
        }
        buttonRow.append(undo, merge);
        this.setCtaContent(buttonRow);
    }

    protected resetSheetPresentation(): void {
        this.root.style.transition = '';
        this.root.style.transform = '';
        this.root.style.opacity = '';
    }

    protected renderEmptyActions(): void {
        const buttonRow = document.createElement('div');
        buttonRow.className = 'theia-mobile-pr-button-row';
        const refresh = this.createActionButton(
            'primary',
            nls.localize('qaap/mobilePr/refresh', 'Refresh'),
            this.loading ? 'codicon-sync codicon-modifier-spin' : 'codicon-refresh',
            () => { void this.loadPullRequests(); }
        );
        refresh.disabled = this.loading;
        buttonRow.append(refresh);
        const repo = this.currentRepository;
        if (repo) {
            const open = document.createElement('a');
            open.className = 'theia-mobile-pr-action theia-mod-secondary';
            open.href = `${repo.htmlUrl}/pulls`;
            open.target = '_blank';
            open.rel = 'noopener noreferrer';
            open.append(
                this.createIcon('codicon-link-external'),
                this.createTextSpan(nls.localize('qaap/mobilePr/openPullsOnGithub', 'Open PRs on GitHub'))
            );
            buttonRow.append(open);
        }
        this.setCtaContent(buttonRow);
    }

    protected renderErrorActions(): void {
        const buttonRow = document.createElement('div');
        buttonRow.className = 'theia-mobile-pr-button-row';
        const retry = this.createActionButton(
            'primary',
            nls.localize('qaap/mobilePr/retry', 'Retry'),
            this.loading ? 'codicon-sync codicon-modifier-spin' : 'codicon-debug-restart',
            () => { void this.loadPullRequests(); }
        );
        retry.disabled = this.loading;
        buttonRow.append(retry);
        this.setCtaContent(buttonRow);
    }

    protected renderSignInActions(): void {
        const buttonRow = document.createElement('div');
        buttonRow.className = 'theia-mobile-pr-button-row';
        const signIn = this.createActionButton(
            'primary',
            nls.localize('qaap/mobilePr/signIn', 'Sign in with GitHub'),
            'codicon-github',
            () => startGithubOAuth()
        );
        buttonRow.append(signIn);
        this.setCtaContent(buttonRow);
    }

    protected mergeButtonLabel(blockers: number): string {
        if (this.mergeState === 'merged') {
            return nls.localize('qaap/mobilePr/deployed', 'Deployed');
        }
        if (this.mergeState === 'deploying') {
            return nls.localize('qaap/mobilePr/deploying', 'Deploying...');
        }
        if (this.mergeState === 'merging') {
            return nls.localize('qaap/mobilePr/merging', 'Merging...');
        }
        if (blockers > 0) {
            return nls.localize('qaap/mobilePr/resolveFirst', 'Resolve notes first');
        }
        return nls.localize('qaap/mobilePr/merge', 'Merge & deploy');
    }

    protected createActionButton(
        kind: 'primary' | 'secondary' | 'ghost',
        label: string,
        icon: string,
        onClick: () => void
    ): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `theia-mobile-pr-action theia-mod-${kind}`;
        button.setAttribute('aria-label', label);
        button.append(this.createIcon(icon), this.createTextSpan(label));
        button.addEventListener('click', onClick);
        return button;
    }

    protected createChipButton(label: string, icon: string, onClick: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'theia-mobile-pr-chip';
        button.append(this.createIcon(icon), this.createTextSpan(label));
        button.addEventListener('click', onClick);
        return button;
    }

    protected createStatChip(icon: string, text: string): HTMLElement {
        const span = document.createElement('span');
        span.className = 'theia-mobile-pr-stat-chip';
        span.append(this.createIcon(icon), this.createTextSpan(text));
        return span;
    }

    protected onPointerDown(event: PointerEvent, card: HTMLElement): void {
        if (this.animating || !this.queue.length) {
            return;
        }
        this.pointerId = event.pointerId;
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
        this.dragX = 0;
        this.dragMode = undefined;
        card.setPointerCapture(event.pointerId);
    }

    protected onPointerMove(event: PointerEvent, card: HTMLElement): void {
        if (this.pointerId !== event.pointerId) {
            return;
        }
        const dx = event.clientX - this.dragStartX;
        const dy = event.clientY - this.dragStartY;
        if (!this.dragMode) {
            if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 1.2) {
                this.dragMode = 'vertical';
                return;
            }
            if (Math.abs(dx) > 8) {
                this.dragMode = 'horizontal';
            }
        }
        if (this.dragMode !== 'horizontal') {
            return;
        }
        this.dragX = dx;
        this.applyDragStyles(card.parentElement);
    }

    protected onPointerUp(event: PointerEvent, card: HTMLElement): void {
        if (this.pointerId !== event.pointerId) {
            return;
        }
        this.pointerId = undefined;
        card.releasePointerCapture(event.pointerId);
        if (this.dragMode === 'vertical') {
            this.dragMode = undefined;
            return;
        }
        this.dragMode = undefined;
        if (Math.abs(this.dragX) < 8) {
            this.toggleExpanded();
            return;
        }
        if (Math.abs(this.dragX) > 100) {
            this.decideTop(this.dragX > 0 ? 'approved' : 'rejected');
        } else {
            this.dragX = 0;
            this.applyDragStyles(card.parentElement, true);
            window.setTimeout(() => this.render(), 160);
        }
    }

    protected toggleExpanded(): void {
        this.expanded = !this.expanded;
        this.dragX = 0;
        this.render();
    }

    protected decideTop(decision: PullRequestDecision, comment?: string): void {
        const top = this.queue[0];
        if (!top || this.animating) {
            return;
        }
        this.animating = true;
        this.dragX = decision === 'approved' ? 420 : -420;
        this.applyDragStyles(this.stack.querySelector('.theia-mobile-pr-card-host'), true);
        window.setTimeout(() => {
            const review: PullRequestReview = { decision, comment };
            this.decisions.set(top.f, review);
            this.history.push({ file: top, review });
            this.queue = this.queue.filter(file => file.f !== top.f);
            this.dragX = 0;
            this.animating = false;
            this.expanded = false;
            this.mergeState = 'idle';
            this.confirmingMerge = false;
            this.mergeError = undefined;
            this.saveReviewState();
            this.render();
            this.showUndoToast(top, review);
        }, 220);
    }

    protected startMergeConfirmation(): void {
        if (this.mergeState === 'failed') {
            void this.executeMergeAndDeploy();
            return;
        }
        if (this.queue.length > 0 || this.mergeState !== 'idle') {
            return;
        }
        const stats = this.reviewStats();
        if (stats.rejected > 0 || stats.commented > 0) {
            return;
        }
        this.confirmingMerge = true;
        this.render();
    }

    protected async executeMergeAndDeploy(): Promise<void> {
        const pr = this.activePullRequest;
        if (!pr || this.queue.length > 0 || this.mergeState === 'merging' || this.mergeState === 'deploying') {
            return;
        }
        this.clearMergeTimer();
        this.confirmingMerge = false;
        this.mergeError = undefined;
        this.mergeState = 'merging';
        this.render();
        try {
            const result = await mergeQaapGithubPullRequest({
                owner: pr.owner,
                repo: pr.repo,
                number: pr.number,
            });
            if (!result.merged) {
                throw new Error(result.message);
            }
            this.mergeState = 'deploying';
            this.render();
            await this.delay(900);
            this.mergeState = 'merged';
            this.saveReviewState();
            this.render();
            this.showToast(nls.localize('qaap/mobilePr/mergeDeployNotice', 'Merged. Deploy started for the current repository.'), 'success');
            this.fireConfetti();
        } catch (error) {
            this.mergeState = 'failed';
            this.mergeError = error instanceof Error ? error.message : nls.localize('qaap/mobilePr/mergeFailedGeneric', 'Merge failed.');
            this.render();
            this.showToast(this.mergeError, 'error');
        }
    }

    protected undo(): void {
        const last = this.history.pop();
        if (!last || this.mergeState === 'merging' || this.mergeState === 'deploying') {
            return;
        }
        this.clearMergeTimer();
        this.hideToast();
        this.decisions.delete(last.file.f);
        this.queue = [last.file, ...this.queue.filter(file => file.f !== last.file.f)];
        this.dragX = 0;
        this.expanded = false;
        this.mergeState = 'idle';
        this.confirmingMerge = false;
        this.mergeError = undefined;
        this.saveReviewState();
        this.render();
    }

    protected reset(): void {
        this.clearMergeTimer();
        this.hideToast();
        this.decisions.clear();
        this.history = [];
        this.dragX = 0;
        this.expanded = false;
        this.mergeState = 'idle';
        this.confirmingMerge = false;
        this.mergeError = undefined;
        this.queue = this.activePullRequest?.filesPreview ? [...this.activePullRequest.filesPreview] : [];
        this.saveReviewState();
        this.render();
    }

    protected showUndoToast(file: QaapGithubPullRequestFile, review: PullRequestReview): void {
        this.hideToast();
        this.toast.replaceChildren();
        this.toast.classList.remove('theia-mod-success', 'theia-mod-error');
        const label = this.createTextSpan(`${this.reviewLabel(review)} ${file.f}`);
        const undo = document.createElement('button');
        undo.type = 'button';
        undo.textContent = nls.localize('qaap/mobilePr/undo', 'Undo');
        undo.addEventListener('click', () => this.undo());
        this.toast.append(label, undo);
        this.toast.hidden = false;
        this.toast.classList.add('theia-mod-visible');
        this.toastTimer = window.setTimeout(() => this.hideToast(), 3200);
    }

    protected showToast(message: string, kind: ToastKind = 'default'): void {
        this.hideToast();
        this.toast.replaceChildren(this.createTextSpan(message));
        this.toast.classList.remove('theia-mod-success', 'theia-mod-error');
        if (kind !== 'default') {
            this.toast.classList.add(`theia-mod-${kind}`);
        }
        this.toast.hidden = false;
        this.toast.classList.add('theia-mod-visible');
        this.toastTimer = window.setTimeout(() => this.hideToast(), kind === 'success' ? 5200 : 3600);
    }

    protected hideToast(): void {
        if (this.toastTimer !== undefined) {
            window.clearTimeout(this.toastTimer);
            this.toastTimer = undefined;
        }
        this.toast.classList.remove('theia-mod-visible');
        this.toast.hidden = true;
    }

    protected fireConfetti(): void {
        const existing = this.root.querySelector('.theia-mobile-pr-confetti');
        existing?.remove();
        const confetti = document.createElement('div');
        confetti.className = 'theia-mobile-pr-confetti';
        confetti.setAttribute('aria-hidden', 'true');
        const colors = ['#2f7d4a', '#f2c94c', '#56a0d3', '#d96941', '#8a63d2'];
        for (let index = 0; index < 28; index++) {
            const piece = document.createElement('span');
            piece.style.setProperty('--x', `${Math.round((Math.random() - 0.5) * 260)}px`);
            piece.style.setProperty('--delay', `${Math.random() * 180}ms`);
            piece.style.setProperty('--rot', `${Math.round(Math.random() * 520 - 260)}deg`);
            piece.style.setProperty('--color', colors[index % colors.length]);
            confetti.appendChild(piece);
        }
        this.root.appendChild(confetti);
        window.setTimeout(() => confetti.remove(), 1700);
    }

    protected reviewLabel(review: PullRequestReview): string {
        if (review.comment) {
            return review.comment;
        }
        if (review.decision === 'approved') {
            return nls.localize('qaap/mobilePr/approved', 'Approved');
        }
        if (review.decision === 'commented') {
            return nls.localize('qaap/mobilePr/noted', 'Noted');
        }
        return nls.localize('qaap/mobilePr/changesRequested', 'Changes requested');
    }

    protected reviewStats(): { total: number; reviewed: number; approved: number; rejected: number; commented: number } {
        const values = [...this.decisions.values()];
        return {
            total: this.activePullRequest?.filesPreview.length ?? 0,
            reviewed: values.length,
            approved: values.filter(value => value.decision === 'approved').length,
            rejected: values.filter(value => value.decision === 'rejected').length,
            commented: values.filter(value => value.decision === 'commented').length,
        };
    }

    protected findFile(path: string): QaapGithubPullRequestFile | undefined {
        return this.activePullRequest?.filesPreview.find(file => file.f === path);
    }

    protected saveReviewState(): void {
        const pr = this.activePullRequest;
        if (!pr) {
            return;
        }
        try {
            const stored: StoredPullRequestReview = {
                decisions: [...this.decisions.entries()],
                history: this.history.map(entry => ({ path: entry.file.f, review: entry.review })),
                mergeState: this.mergeState === 'merged' ? 'merged' : undefined,
            };
            window.localStorage.setItem(this.storageKey(pr), JSON.stringify(stored));
        } catch {
            /* ignore storage quota/privacy failures */
        }
    }

    protected readStoredReview(pr: QaapGithubPullRequestSummary): StoredPullRequestReview | undefined {
        try {
            const raw = window.localStorage.getItem(this.storageKey(pr));
            return raw ? JSON.parse(raw) as StoredPullRequestReview : undefined;
        } catch {
            return undefined;
        }
    }

    protected storageKey(pr: QaapGithubPullRequestSummary): string {
        return `${QAAP_MOBILE_PR_STORAGE_PREFIX}${pr.owner}/${pr.repo}#${pr.number}`;
    }

    protected clearMergeTimer(): void {
        if (this.mergeTimer !== undefined) {
            window.clearTimeout(this.mergeTimer);
            this.mergeTimer = undefined;
        }
    }

    protected delay(ms: number): Promise<void> {
        return new Promise(resolve => {
            this.mergeTimer = window.setTimeout(() => {
                this.mergeTimer = undefined;
                resolve();
            }, ms);
        });
    }

    protected applyDragStyles(host: Element | null, animate = false): void {
        if (!(host instanceof HTMLElement)) {
            return;
        }
        const clamped = Math.max(-220, Math.min(220, this.dragX));
        const approveOpacity = Math.max(0, Math.min(1, clamped / 80));
        const rejectOpacity = Math.max(0, Math.min(1, -clamped / 80));
        const top = host.querySelector<HTMLElement>('.theia-mobile-pr-card.theia-mod-top');
        const approve = host.querySelector<HTMLElement>('.theia-mobile-pr-backdrop.theia-mod-approve');
        const reject = host.querySelector<HTMLElement>('.theia-mobile-pr-backdrop.theia-mod-reject');
        if (top) {
            top.style.transform = `translateX(${clamped}px) rotate(${clamped * 0.02}deg)`;
            top.style.transition = animate ? 'transform 180ms ease, opacity 180ms ease' : 'none';
        }
        if (approve) {
            approve.style.opacity = String(approveOpacity);
        }
        if (reject) {
            reject.style.opacity = String(rejectOpacity);
        }
    }

    protected createTestsPill(tests: QaapGithubPullRequestSummary['tests']): HTMLElement {
        const span = document.createElement('span');
        span.className = `theia-mod-tests theia-mod-tests-${tests}`;
        const icon = tests === 'failing' ? 'codicon-close' : tests === 'pending' ? 'codicon-clock' : tests === 'unknown' ? 'codicon-question' : 'codicon-check';
        span.append(this.createIcon(icon), document.createTextNode(` tests ${tests}`));
        return span;
    }

    protected createIcon(icon: string): HTMLElement {
        const span = document.createElement('span');
        span.className = `codicon ${icon}`;
        span.setAttribute('aria-hidden', 'true');
        return span;
    }

    protected createTextSpan(text: string): HTMLElement {
        const span = document.createElement('span');
        span.textContent = text;
        return span;
    }

    protected createClassedTextSpan(className: string, text: string): HTMLElement {
        const span = this.createTextSpan(text);
        span.className = className;
        return span;
    }
}
