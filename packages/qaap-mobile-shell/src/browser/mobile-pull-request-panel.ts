// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { Disposable } from '@theia/core/lib/common/disposable';
import {
    fetchQaapGithubPullRequests,
    mergeQaapGithubPullRequest,
} from '@theia/qaap-adapters/lib/browser/qaap-github-auth-client';
import type {
    QaapGithubPullRequestFile,
    QaapGithubPullRequestLine,
    QaapGithubPullRequestSummary,
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

const DEMO_PR: QaapGithubPullRequestSummary = {
    owner: 'qaap',
    repo: 'demo',
    number: 284,
    title: 'Add Google OAuth sign-in with NextAuth',
    branch: 'feat/oauth-google',
    base: 'main',
    author: 'Halo',
    files: 5,
    adds: 67,
    dels: 5,
    tests: 'passing',
    htmlUrl: 'https://github.com/qaap/demo/pull/284',
    mergeable: true,
    filesPreview: [
        {
            f: 'app/api/auth/[...nextauth]/route.ts',
            ext: 'ts',
            adds: 47,
            dels: 0,
            preview: [
                { t: 'add', n: 1, s: "import NextAuth from 'next-auth';" },
                { t: 'add', n: 2, s: "import Google from 'next-auth/providers/google';" },
                { t: 'add', n: 3, s: '' },
                { t: 'add', n: 4, s: 'export const handler = NextAuth({' },
                { t: 'add', n: 5, s: '  providers: [' },
                { t: 'add', n: 6, s: '    Google({' },
                { t: 'add', n: 7, s: '      clientId: process.env.GOOGLE_CLIENT_ID!,' },
                { t: 'add', n: 8, s: '      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,' },
                { t: 'add', n: 9, s: '    }),' },
                { t: 'add', n: 10, s: '  ],' },
            ],
        },
        {
            f: 'app/auth/components/SignInButton.tsx',
            ext: 'tsx',
            adds: 12,
            dels: 3,
            preview: [
                { t: 'ctx', n: 12, s: 'export default function SignInButton() {' },
                { t: 'del', n: 14, s: "  <Button onClick={() => signIn('email')}>" },
                { t: 'del', n: 15, s: '    Continue with email' },
                { t: 'add', n: 14, s: '  <div className="flex flex-col gap-2">' },
                { t: 'add', n: 15, s: "    <Button onClick={() => signIn('google')}>" },
                { t: 'add', n: 16, s: '      <GoogleIcon /> Continue with Google' },
                { t: 'add', n: 17, s: '    </Button>' },
                { t: 'add', n: 18, s: "    <Button onClick={() => signIn('email')}>" },
                { t: 'add', n: 19, s: '      Continue with email' },
                { t: 'add', n: 20, s: '    </Button>' },
            ],
        },
        {
            f: 'app/auth/components/AuthLayout.tsx',
            ext: 'tsx',
            adds: 4,
            dels: 2,
            preview: [
                { t: 'ctx', n: 8, s: 'export function AuthLayout({ children }) {' },
                { t: 'del', n: 10, s: '  return <div className="auth">{children}</div>;' },
                { t: 'add', n: 10, s: '  return (' },
                { t: 'add', n: 11, s: '    <div className="auth flex flex-col items-center">' },
                { t: 'add', n: 12, s: '      {children}' },
                { t: 'add', n: 13, s: '    </div>' },
                { t: 'add', n: 14, s: '  );' },
            ],
        },
        {
            f: '.env.example',
            ext: 'env',
            adds: 2,
            dels: 0,
            preview: [
                { t: 'ctx', n: 12, s: 'NEXT_PUBLIC_API_URL=' },
                { t: 'ctx', n: 13, s: 'STRIPE_KEY=' },
                { t: 'add', n: 14, s: 'GOOGLE_CLIENT_ID=' },
                { t: 'add', n: 15, s: 'GOOGLE_CLIENT_SECRET=' },
            ],
        },
        {
            f: 'package.json',
            ext: 'json',
            adds: 2,
            dels: 0,
            preview: [
                { t: 'ctx', n: 14, s: '    "next": "14.2.0",' },
                { t: 'add', n: 15, s: '    "next-auth": "^4.24.7",' },
                { t: 'add', n: 16, s: '    "@auth/google": "^1.2.0",' },
                { t: 'ctx', n: 17, s: '    "react": "18.3.1",' },
            ],
        },
    ],
};

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
    protected queue: QaapGithubPullRequestFile[] = [];
    protected decisions = new Map<string, PullRequestReview>();
    protected history: PullRequestHistoryEntry[] = [];
    protected visible = false;
    protected loaded = false;
    protected loading = false;
    protected empty = false;
    protected demoMode = false;
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
        this.useDemoPullRequest(false);
        this.render();

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
        this.dragDismissDispose.dispose();
        this.dragDismissDispose = Disposable.NULL;
        this.pullToRefreshDispose.dispose();
        this.pullToRefreshDispose = Disposable.NULL;
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
        }
        this.render();
    }

    hide(): void {
        if (!this.visible) {
            return;
        }
        this.visible = false;
        this.root.classList.remove('theia-mod-visible');
        this.root.setAttribute('aria-hidden', 'true');
        this.pointerId = undefined;
        this.dragX = 0;
        this.dragMode = undefined;
        this.hideToast();
        window.setTimeout(() => {
            if (!this.visible) {
                this.root.hidden = true;
            }
        }, 180);
        this.delegate.onDismiss();
    }

    protected async loadPullRequests(): Promise<void> {
        this.loading = true;
        this.empty = false;
        this.render();
        try {
            const response = await fetchQaapGithubPullRequests();
            this.loaded = true;
            this.loading = false;
            if (response.pullRequests.length === 0) {
                this.empty = true;
                this.activePullRequest = undefined;
                this.queue = [];
                this.decisions.clear();
                this.history = [];
            } else {
                this.pullRequests = response.pullRequests;
                this.usePullRequest(response.pullRequests[0], false);
            }
        } catch {
            this.loaded = true;
            this.loading = false;
            this.useDemoPullRequest(true);
            this.showToast(nls.localize('qaap/mobilePr/demoFallback', 'Showing demo PR until GitHub pull requests are available.'));
        }
        this.render();
    }

    protected useDemoPullRequest(showDemoBadge: boolean): void {
        this.demoMode = showDemoBadge;
        this.empty = false;
        this.usePullRequest(DEMO_PR, showDemoBadge);
    }

    protected usePullRequest(pullRequest: QaapGithubPullRequestSummary, demoMode: boolean): void {
        this.clearMergeTimer();
        this.activePullRequest = pullRequest;
        this.demoMode = demoMode;
        this.confirmingMerge = false;
        this.mergeError = undefined;
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

    protected render(): void {
        this.renderHeader();
        if (this.loading) {
            this.renderProgress(0, 0, 0, 0, 0);
            this.hintRow.hidden = true;
            this.stack.replaceChildren(this.createBusyState());
            this.ctaRow.replaceChildren();
            return;
        }
        if (this.empty) {
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
        const top = document.createElement('div');
        top.className = 'theia-mobile-pr-meta-row';
        const authored = document.createElement('span');
        authored.className = 'theia-mobile-pr-authored';
        authored.append(
            this.createIcon(this.demoMode ? 'codicon-beaker' : 'codicon-github'),
            document.createTextNode(` ${this.demoMode ? 'Demo' : pullRequest?.author ?? 'GitHub'}`)
        );
        const branch = document.createElement('span');
        branch.className = 'theia-mobile-pr-branch';
        branch.textContent = pullRequest
            ? `${pullRequest.owner}/${pullRequest.repo} #${pullRequest.number} - ${pullRequest.branch} -> ${pullRequest.base}`
            : nls.localize('qaap/mobilePr/noActive', 'No active pull request');
        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.className = 'theia-mobile-pr-icon-btn codicon codicon-refresh';
        refresh.title = nls.localize('qaap/mobilePr/refresh', 'Refresh pull requests');
        refresh.setAttribute('aria-label', refresh.title);
        refresh.disabled = this.loading || this.mergeState === 'merging' || this.mergeState === 'deploying';
        refresh.addEventListener('click', () => { void this.loadPullRequests(); });
        top.append(authored, branch, refresh);

        const title = document.createElement('h1');
        title.className = 'theia-mobile-pr-title';
        title.textContent = pullRequest?.title ?? nls.localize('qaap/mobilePr/title', 'Pull requests');

        const stats = document.createElement('div');
        stats.className = 'theia-mobile-pr-stats';
        if (pullRequest) {
            stats.append(
                this.createTextSpan(`${nls.localize('qaap/mobilePr/files', 'files')} ${pullRequest.files}`),
                this.createClassedTextSpan('theia-mod-add', `+${pullRequest.adds}`),
                this.createClassedTextSpan('theia-mod-del', `-${pullRequest.dels}`),
                this.createTestsPill(pullRequest.tests)
            );
        } else {
            stats.appendChild(this.createTextSpan(nls.localize('qaap/mobilePr/emptySubtitle', 'No open pull requests found.')));
        }
        this.header.append(top, title, stats);
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
        busy.append(this.createIcon('codicon-sync codicon-modifier-spin'), this.createTextSpan(nls.localize('qaap/mobilePr/loading', 'Loading pull requests...')));
        return busy;
    }

    protected createEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-pr-empty';
        empty.append(
            this.createIcon('codicon-git-pull-request'),
            this.createTextSpan(nls.localize('qaap/mobilePr/noPulls', 'No open pull requests')),
            this.createTextSpan(nls.localize('qaap/mobilePr/noPullsDetail', 'Open PRs from the current repository will appear here.'))
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
        this.ctaRow.replaceChildren();
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
        this.ctaRow.append(quickRow, buttonRow);
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
            this.ctaRow.append(buttonRow);
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
        this.ctaRow.append(buttonRow);
    }

    protected renderEmptyActions(): void {
        const buttonRow = document.createElement('div');
        buttonRow.className = 'theia-mobile-pr-button-row';
        const refresh = this.createActionButton('secondary', nls.localize('qaap/mobilePr/refresh', 'Refresh'), 'codicon-refresh', () => { void this.loadPullRequests(); });
        const demo = this.createActionButton('primary', nls.localize('qaap/mobilePr/useDemo', 'Use demo PR'), 'codicon-beaker', () => {
            this.empty = false;
            this.useDemoPullRequest(true);
            this.render();
        });
        buttonRow.append(refresh, demo);
        this.ctaRow.append(buttonRow);
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
            if (!this.demoMode) {
                const result = await mergeQaapGithubPullRequest({
                    owner: pr.owner,
                    repo: pr.repo,
                    number: pr.number,
                });
                if (!result.merged) {
                    throw new Error(result.message);
                }
            } else {
                await this.delay(700);
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
