// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';

type PullRequestDecision = 'approved' | 'rejected';
type PullRequestLineType = 'add' | 'del' | 'ctx';

interface PullRequestMeta {
    number: number;
    title: string;
    branch: string;
    base: string;
    author: string;
    files: number;
    adds: number;
    dels: number;
    tests: string;
}

interface PullRequestLine {
    t: PullRequestLineType;
    n: number;
    s: string;
}

interface PullRequestFile {
    f: string;
    ext: string;
    adds: number;
    dels: number;
    preview: PullRequestLine[];
}

interface PullRequestHistoryEntry {
    file: PullRequestFile;
    decision: PullRequestDecision;
}

export interface MobilePullRequestPanelDelegate {
    onDismiss(): void;
}

const PR_META: PullRequestMeta = {
    number: 284,
    title: 'Add Google OAuth sign-in with NextAuth',
    branch: 'feat/oauth-google',
    base: 'main',
    author: 'Halo',
    files: 5,
    adds: 67,
    dels: 5,
    tests: 'passing',
};

const PR_FILES: PullRequestFile[] = [
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
];

export class MobilePullRequestPanel {

    protected readonly root: HTMLElement;
    protected readonly progressLabel: HTMLElement;
    protected readonly progressFill: HTMLElement;
    protected readonly approveCount: HTMLElement;
    protected readonly rejectCount: HTMLElement;
    protected readonly hintRow: HTMLElement;
    protected readonly stack: HTMLElement;
    protected readonly ctaRow: HTMLElement;
    protected queue: PullRequestFile[] = [...PR_FILES];
    protected decisions = new Map<string, PullRequestDecision>();
    protected history: PullRequestHistoryEntry[] = [];
    protected visible = false;
    protected dragStartX = 0;
    protected dragX = 0;
    protected pointerId: number | undefined;
    protected animating = false;
    protected expanded = false;

    constructor(protected readonly delegate: MobilePullRequestPanelDelegate) {
        this.root = document.createElement('div');
        this.root.className = 'theia-mobile-pr';
        this.root.setAttribute('role', 'dialog');
        this.root.setAttribute('aria-modal', 'true');
        this.root.setAttribute('aria-hidden', 'true');
        this.root.hidden = true;

        const header = this.createHeader();
        const progress = document.createElement('section');
        progress.className = 'theia-mobile-pr-progress';
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
        progress.append(this.progressLabel, track, this.approveCount, this.rejectCount);

        this.hintRow = document.createElement('div');
        this.hintRow.className = 'theia-mobile-pr-hints';
        this.hintRow.append(
            this.createTextSpan('<- reject'),
            this.createTextSpan('tap to expand'),
            this.createTextSpan('approve ->')
        );

        this.stack = document.createElement('section');
        this.stack.className = 'theia-mobile-pr-stack';

        this.ctaRow = document.createElement('footer');
        this.ctaRow.className = 'theia-mobile-pr-actions';

        this.root.append(header, progress, this.hintRow, this.stack, this.ctaRow);
        this.render();
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
        window.setTimeout(() => {
            if (!this.visible) {
                this.root.hidden = true;
            }
        }, 180);
        this.delegate.onDismiss();
    }

    protected createHeader(): HTMLElement {
        const header = document.createElement('header');
        header.className = 'theia-mobile-pr-header';

        const top = document.createElement('div');
        top.className = 'theia-mobile-pr-meta-row';
        const authored = document.createElement('span');
        authored.className = 'theia-mobile-pr-authored';
        authored.append(
            this.createIcon('codicon-sparkle'),
            document.createTextNode(` ${nls.localize('qaap/mobilePr/authored', '{0} authored', PR_META.author)}`)
        );
        const branch = document.createElement('span');
        branch.className = 'theia-mobile-pr-branch';
        branch.textContent = `#${PR_META.number} - ${PR_META.branch} -> ${PR_META.base}`;
        top.append(authored, branch);

        const title = document.createElement('h1');
        title.className = 'theia-mobile-pr-title';
        title.textContent = PR_META.title;

        const stats = document.createElement('div');
        stats.className = 'theia-mobile-pr-stats';
        const files = document.createElement('span');
        files.textContent = `${nls.localize('qaap/mobilePr/files', 'files')} ${PR_META.files}`;
        const adds = document.createElement('span');
        adds.className = 'theia-mod-add';
        adds.textContent = `+${PR_META.adds}`;
        const dels = document.createElement('span');
        dels.className = 'theia-mod-del';
        dels.textContent = `-${PR_META.dels}`;
        const tests = document.createElement('span');
        tests.className = 'theia-mod-tests';
        tests.append(this.createIcon('codicon-check'), document.createTextNode(` tests ${PR_META.tests}`));
        stats.append(files, adds, dels, tests);

        header.append(top, title, stats);
        return header;
    }

    protected render(): void {
        const total = PR_FILES.length;
        const reviewed = this.decisions.size;
        const approved = [...this.decisions.values()].filter(value => value === 'approved').length;
        const rejected = [...this.decisions.values()].filter(value => value === 'rejected').length;
        const allReviewed = this.queue.length === 0;

        this.progressLabel.textContent = `${reviewed} / ${total} reviewed`;
        this.progressFill.style.width = `${(reviewed / total) * 100}%`;
        this.approveCount.textContent = approved > 0 ? `ok ${approved}` : '';
        this.rejectCount.textContent = rejected > 0 ? `x ${rejected}` : '';
        this.hintRow.hidden = allReviewed;

        this.stack.replaceChildren();
        if (allReviewed) {
            this.stack.appendChild(this.createDoneState(approved, rejected));
        } else {
            this.stack.appendChild(this.createCardStack());
        }
        this.renderActions(allReviewed, rejected);
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
        rejectLabel.append(this.createIcon('codicon-close'), document.createTextNode(' Reject'));
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

    protected createFileCard(file: PullRequestFile, top: boolean): HTMLElement {
        const card = document.createElement('article');
        card.className = top ? 'theia-mobile-pr-card theia-mod-top' : 'theia-mobile-pr-card theia-mod-next';
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
        for (const line of file.preview) {
            body.appendChild(this.createDiffLine(line));
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

    protected createDiffLine(line: PullRequestLine): HTMLElement {
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

    protected createDoneState(approved: number, rejected: number): HTMLElement {
        const done = document.createElement('div');
        done.className = 'theia-mobile-pr-done';
        const icon = this.createIcon('codicon-check');
        icon.classList.add('theia-mobile-pr-done-icon');
        const title = document.createElement('strong');
        title.textContent = nls.localize('qaap/mobilePr/allReviewed', 'All reviewed');
        const summary = document.createElement('span');
        summary.textContent = `${approved} approved - ${rejected} rejected`;
        done.append(icon, title, summary);
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'theia-mobile-pr-secondary';
        reset.textContent = nls.localize('qaap/mobilePr/reviewAgain', 'Review again');
        reset.addEventListener('click', () => this.reset());
        done.appendChild(reset);
        return done;
    }

    protected renderActions(allReviewed: boolean, rejected: number): void {
        this.ctaRow.replaceChildren();
        if (allReviewed) {
            const undo = this.createActionButton('secondary', nls.localize('qaap/mobilePr/undo', 'Undo'), 'codicon-discard', () => this.undo());
            undo.disabled = this.history.length === 0;
            const merge = this.createActionButton(
                'primary',
                rejected > 0 ? nls.localize('qaap/mobilePr/resolveFirst', 'Resolve rejections first') : nls.localize('qaap/mobilePr/merge', 'Merge & deploy'),
                'codicon-git-merge',
                () => undefined
            );
            merge.disabled = rejected > 0;
            this.ctaRow.append(undo, merge);
            return;
        }
        const reject = this.createActionButton('secondary', nls.localize('qaap/mobilePr/reject', 'Reject'), 'codicon-close', () => this.decideTop('rejected'));
        const undo = this.createActionButton('ghost', nls.localize('qaap/mobilePr/undo', 'Undo'), 'codicon-discard', () => this.undo());
        undo.disabled = this.history.length === 0;
        const approve = this.createActionButton('primary', nls.localize('qaap/mobilePr/approve', 'Approve'), 'codicon-check', () => this.decideTop('approved'));
        this.ctaRow.append(reject, undo, approve);
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
        this.dragX = 0;
        card.setPointerCapture(event.pointerId);
    }

    protected onPointerMove(event: PointerEvent, card: HTMLElement): void {
        if (this.pointerId !== event.pointerId) {
            return;
        }
        this.dragX = event.clientX - this.dragStartX;
        this.applyDragStyles(card.parentElement);
    }

    protected onPointerUp(event: PointerEvent, card: HTMLElement): void {
        if (this.pointerId !== event.pointerId) {
            return;
        }
        this.pointerId = undefined;
        card.releasePointerCapture(event.pointerId);
        if (Math.abs(this.dragX) < 8) {
            this.expanded = !this.expanded;
            this.dragX = 0;
            this.render();
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

    protected decideTop(decision: PullRequestDecision): void {
        const top = this.queue[0];
        if (!top || this.animating) {
            return;
        }
        this.animating = true;
        this.dragX = decision === 'approved' ? 420 : -420;
        this.applyDragStyles(this.stack.querySelector('.theia-mobile-pr-card-host'), true);
        window.setTimeout(() => {
            this.decisions.set(top.f, decision);
            this.history.push({ file: top, decision });
            this.queue = this.queue.filter(file => file.f !== top.f);
            this.dragX = 0;
            this.animating = false;
            this.expanded = false;
            this.render();
        }, 220);
    }

    protected undo(): void {
        const last = this.history.pop();
        if (!last) {
            return;
        }
        this.decisions.delete(last.file.f);
        this.queue = [last.file, ...this.queue.filter(file => file.f !== last.file.f)];
        this.dragX = 0;
        this.expanded = false;
        this.render();
    }

    protected reset(): void {
        this.queue = [...PR_FILES];
        this.decisions.clear();
        this.history = [];
        this.dragX = 0;
        this.expanded = false;
        this.render();
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
}
