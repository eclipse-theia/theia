// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { codicon, LabelProvider, Message, open, OpenerService, ReactWidget } from '@theia/core/lib/browser';
import { QuickInputService } from '@theia/core/lib/common/quick-pick-service';
import { CommandService } from '@theia/core/lib/common/command';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import {
    QAAP_GIT_REVIEW_API_PATH,
    type QaapGitChangedFile,
    type QaapGitCommitWorkflowAction,
    type QaapGitFileDiffResponse,
    type QaapGitHunkLine,
} from '../common/qaap-git-review';
import { middleTruncatePath, splitRepoRelativePath } from './qaap-diff-review-path';

/** Git extension commands used by the bulk review actions. */
const GIT_STAGE_ALL = 'git.stageAll';
const GIT_CLEAN_ALL = 'git.cleanAll';
const GIT_COMMIT = 'git.commit';
const PR_CREATE = 'pr.create';
const PR_PUSH_AND_CREATE = 'pr.pushAndCreate';

interface QaapGitCommitMenuOption {
    action: QaapGitCommitWorkflowAction;
    label: string;
}

const GIT_COMMIT_MENU_OPTIONS: QaapGitCommitMenuOption[] = [
    {
        action: 'create-branch-commit-push',
        label: nls.localize('qaap/mobileProjects/createBranchCommitPush', 'Create Branch, Commit & Push'),
    },
    {
        action: 'commit-push',
        label: nls.localize('qaap/mobileProjects/commitPush', 'Commit & Push'),
    },
    {
        action: 'commit',
        label: nls.localize('qaap/mobileProjects/commit', 'Commit'),
    },
    {
        action: 'commit-create-pr',
        label: nls.localize('qaap/mobileProjects/commitCreatePr', 'Commit & Create PR'),
    },
];

/** Context lines above this count collapse into an expandable bar (Cursor agent diff style). */
const CONTEXT_COLLAPSE_THRESHOLD = 4;

export interface QaapDiffReviewRepositoryContext {
    rootUri: string;
    rootFsPath: string;
    /** When false, accept/reject actions are disabled (workspace must be open for git commands). */
    isActiveWorkspace: boolean;
}

/**
 * Review surface: lists working-tree changes, shows each file's diff inline, and offers a per-file
 * shortcut to the full editor. Embedded in Work Hub or opened as a standalone widget.
 */
@injectable()
export class QaapDiffReviewWidget extends ReactWidget {

    static readonly ID = 'qaap-diff-review';
    static readonly LABEL = nls.localize('qaap/diff/reviewLabel', 'Working changes');

    @inject(ScmService)
    protected readonly scmService: ScmService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(CommandService)
    protected readonly commands: CommandService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    protected readonly toDisposeOnRepository = new DisposableCollection();

    /** When set (Work Hub embed), overrides the SCM-selected repository. */
    protected repositoryContext: QaapDiffReviewRepositoryContext | undefined;

    protected rootUri: string | undefined;
    protected rootFsPath: string | undefined;
    protected bulkActionsEnabled = true;

    protected files: QaapGitChangedFile[] = [];
    protected selectedPath: string | undefined;
    protected diff: QaapGitFileDiffResponse | undefined;
    protected loadingDiff = false;
    protected runningBulkAction = false;
    protected error: string | undefined;
    protected filesPanelCollapsed = false;
    /** Embedded in Work Hub: denser layout, file list collapsed by default. */
    protected workHubEmbed = false;
    /** Embedded in the execution-view Review tab (transcript sheet). */
    protected transcriptEmbed = false;
    /** Changes tab: checks + composer live in the panel below the diff widget. */
    protected transcriptExternalChrome = false;
    protected reviewComposerDraft = '';
    protected runningFileAction = false;
    protected branchName: string | undefined;
    protected commitMenuOpen = false;
    protected readonly agentFileDiffs = new Map<string, QaapGitFileDiffResponse>();
    protected loadingAgentDiffs = false;
    protected readonly expandedContextBlocks = new Set<string>();
    protected onTranscriptAgentFeedback: ((message: string) => void | Promise<void>) | undefined;
    protected onReviewStatsChange: ((stats: { fileCount: number; adds: number; dels: number; pending: number }) => void) | undefined;

    /** Called when the widget is mounted inside {@link MobileProjectsPanel} Work Hub diff. */
    enableWorkHubEmbed(): void {
        if (this.workHubEmbed && !this.transcriptEmbed) {
            return;
        }
        this.transcriptEmbed = false;
        this.workHubEmbed = true;
        this.filesPanelCollapsed = true;
        this.removeClass('qaap-diff-review--transcript');
        this.removeClass('qaap-diff-review--transcript-agent');
        this.addClass('qaap-diff-review--work-hub');
        this.update();
    }

    /** Execution-view Changes tab: Cursor-style unified diff scroll. */
    enableTranscriptEmbed(options?: { externalChrome?: boolean }): void {
        this.workHubEmbed = false;
        this.transcriptEmbed = true;
        this.transcriptExternalChrome = options?.externalChrome ?? false;
        this.agentFileDiffs.clear();
        this.expandedContextBlocks.clear();
        this.branchName = undefined;
        this.removeClass('qaap-diff-review--work-hub');
        this.addClass('qaap-diff-review--transcript');
        this.addClass('qaap-diff-review--transcript-agent');
        this.node.classList.toggle('qaap-mod-external-chrome', this.transcriptExternalChrome);
        this.applyTranscriptAgentLayoutStyles();
        this.update();
    }

    protected applyTranscriptAgentLayoutStyles(): void {
        const node = this.node;
        node.style.display = 'flex';
        node.style.flexDirection = 'column';
        node.style.flex = '1 1 auto';
        node.style.minHeight = '0';
        node.style.height = '100%';
        node.style.overflow = 'hidden';
    }

    setTranscriptAgentFeedbackHandler(
        handler: ((message: string) => void | Promise<void>) | undefined,
    ): void {
        this.onTranscriptAgentFeedback = handler;
    }

    setReviewStatsChangeHandler(
        handler: ((stats: { fileCount: number; adds: number; dels: number; pending: number }) => void) | undefined,
    ): void {
        this.onReviewStatsChange = handler;
    }

    @postConstruct()
    protected init(): void {
        this.id = QaapDiffReviewWidget.ID;
        this.title.label = QaapDiffReviewWidget.LABEL;
        this.title.caption = QaapDiffReviewWidget.LABEL;
        this.title.iconClass = codicon('diff-multiple');
        this.title.closable = true;
        this.addClass('qaap-diff-review');

        this.toDispose.push(this.scmService.onDidChangeSelectedRepository(() => this.trackRepository()));
        this.toDispose.push(this.toDisposeOnRepository);
        this.toDispose.push(Disposable.create(() => this.detachCommitMenuListener()));
        this.trackRepository();
    }

    /** Work Hub: point the widget at a specific project repository. */
    setRepositoryContext(context: QaapDiffReviewRepositoryContext | undefined): void {
        this.repositoryContext = context;
        this.trackRepository();
    }

    protected trackRepository(): void {
        this.toDisposeOnRepository.dispose();
        if (this.repositoryContext) {
            this.rootUri = this.repositoryContext.rootUri;
            this.rootFsPath = this.repositoryContext.rootFsPath;
            this.bulkActionsEnabled = this.repositoryContext.isActiveWorkspace;
            void this.refresh();
            return;
        }
        const repository = this.scmService.selectedRepository;
        this.rootUri = repository?.provider.rootUri;
        this.bulkActionsEnabled = true;
        if (repository) {
            this.toDisposeOnRepository.push(repository.provider.onDidChange(() => void this.refresh()));
        }
        void this.refresh();
    }

    protected override onActivateRequest(message: Message): void {
        super.onActivateRequest(message);
        this.trackRepository();
        this.node.focus();
    }

    protected async refresh(): Promise<void> {
        if (!this.repositoryContext) {
            this.rootFsPath = this.rootUri ? await this.fileService.fsPath(new URI(this.rootUri)) : undefined;
        }
        if (!this.rootFsPath) {
            this.files = [];
            this.selectedPath = undefined;
            this.diff = undefined;
            this.error = undefined;
            this.update();
            return;
        }
        try {
            const response = await fetch(
                `${QAAP_GIT_REVIEW_API_PATH}/changes?root=${encodeURIComponent(this.rootFsPath)}`,
                { credentials: 'include' },
            );
            if (!response.ok) {
                throw new Error(`changes request failed (${response.status})`);
            }
            const body = await response.json() as { files?: QaapGitChangedFile[]; branch?: string };
            this.files = body.files ?? [];
            this.branchName = body.branch;
            this.error = undefined;
            this.notifyReviewStats();
            if (this.transcriptEmbed && this.transcriptExternalChrome) {
                await this.loadAllAgentDiffs();
                return;
            }
            const stillThere = this.files.some(file => file.path === this.selectedPath);
            const next = stillThere ? this.selectedPath : this.files[0]?.path;
            if (next !== this.selectedPath || (next && !this.diff)) {
                await this.selectFile(next);
                return;
            }
        } catch (error) {
            this.error = error instanceof Error ? error.message : String(error);
        }
        this.update();
    }

    protected async fetchFileDiff(path: string): Promise<QaapGitFileDiffResponse | undefined> {
        if (!this.rootFsPath) {
            return undefined;
        }
        const response = await fetch(
            `${QAAP_GIT_REVIEW_API_PATH}/diff?root=${encodeURIComponent(this.rootFsPath)}&file=${encodeURIComponent(path)}`,
            { credentials: 'include' },
        );
        if (!response.ok) {
            throw new Error(`diff request failed (${response.status})`);
        }
        return await response.json() as QaapGitFileDiffResponse;
    }

    protected async loadAllAgentDiffs(): Promise<void> {
        this.agentFileDiffs.clear();
        if (this.files.length === 0 || !this.rootFsPath) {
            this.update();
            return;
        }
        this.loadingAgentDiffs = true;
        this.update();
        try {
            await Promise.all(this.files.map(async file => {
                try {
                    const diff = await this.fetchFileDiff(file.path);
                    if (diff) {
                        this.agentFileDiffs.set(file.path, diff);
                    }
                } catch {
                    /* per-file errors are surfaced when that section renders */
                }
            }));
        } finally {
            this.loadingAgentDiffs = false;
            this.update();
        }
    }

    protected async selectFile(path: string | undefined): Promise<void> {
        this.selectedPath = path;
        this.diff = undefined;
        if (!path || !this.rootFsPath) {
            this.update();
            return;
        }
        this.loadingDiff = true;
        this.update();
        try {
            this.diff = await this.fetchFileDiff(path);
        } catch (error) {
            this.error = error instanceof Error ? error.message : String(error);
        } finally {
            this.loadingDiff = false;
            this.update();
        }
    }

    protected fileUri(path: string): URI | undefined {
        return this.rootUri ? new URI(this.rootUri).resolve(path) : undefined;
    }

    protected notifyReviewStats(): void {
        if (!this.onReviewStatsChange) {
            return;
        }
        const totals = this.files.reduce(
            (acc, file) => ({ adds: acc.adds + file.adds, dels: acc.dels + file.dels }),
            { adds: 0, dels: 0 },
        );
        this.onReviewStatsChange({
            fileCount: this.files.length,
            adds: totals.adds,
            dels: totals.dels,
            pending: this.files.filter(file => !file.staged).length,
        });
    }

    protected render(): React.ReactNode {
        const totals = this.files.reduce(
            (acc, file) => ({ adds: acc.adds + file.adds, dels: acc.dels + file.dels }),
            { adds: 0, dels: 0 },
        );
        return (
            <div className='qaap-diff-review-body'>
                {this.error && <div className='qaap-diff-review-error'>{this.error}</div>}
                {!this.bulkActionsEnabled && this.files.length > 0 && !this.transcriptEmbed && (
                    <div className='qaap-diff-review-note qaap-diff-review-readonly-hint'>
                        {nls.localize(
                            'qaap/diff/openProjectToApply',
                            'Open this project in the workspace to accept or discard changes.',
                        )}
                    </div>
                )}
                {this.files.length === 0 ? this.renderEmpty() : this.transcriptEmbed && this.transcriptExternalChrome
                    ? this.renderAgentChangesContent(totals)
                    : this.renderContent(totals)}
            </div>
        );
    }

    protected renderEmpty(): React.ReactNode {
        const agent = this.transcriptEmbed && this.transcriptExternalChrome;
        return (
            <div className={`qaap-diff-review-empty${agent ? ' qaap-diff-review-empty--agent' : ''}`}>
                <i className={codicon(agent ? 'diff' : 'check-all')} />
                <p>{nls.localize('qaap/diff/noChanges', 'No changes to review.')}</p>
                <span>
                    {agent
                        ? nls.localize(
                            'qaap/mobileProjects/changesEmptyHint',
                            'When the agent edits files in this workspace, diffs will appear here.',
                        )
                        : nls.localize('qaap/diff/noChangesHint', 'Edits made by you or an agent will show up here.')}
                </span>
            </div>
        );
    }

    protected renderAgentChangesContent(totals: { adds: number; dels: number }): React.ReactNode {
        const count = this.files.length;
        return (
            <div className='qaap-agent-changes'>
                {this.renderAgentToolbar(totals, count)}
                <div className='qaap-agent-changes-scroll'>
                    {this.loadingAgentDiffs && this.agentFileDiffs.size === 0 && (
                        <div className='qaap-agent-changes-loading' aria-busy='true'>
                            <div className='qaap-agent-changes-loading-bar' />
                            <div className='qaap-agent-changes-loading-bar qaap-mod-short' />
                            <div className='qaap-agent-changes-loading-bar qaap-mod-shorter' />
                        </div>
                    )}
                    {this.files.map(file => this.renderAgentFileSection(file))}
                </div>
            </div>
        );
    }

    protected renderAgentToolbar(totals: { adds: number; dels: number }, count: number): React.ReactNode {
        const branch = this.branchName ?? '…';
        const summaryLabel = count === 1
            ? nls.localize('qaap/mobileProjects/uncommittedChangeOne', '1 Uncommitted Change')
            : nls.localize('qaap/mobileProjects/uncommittedChangeMany', '{0} Uncommitted Changes', String(count));
        const bulkDisabled = !this.bulkActionsEnabled || this.runningBulkAction || count === 0;
        return (
            <header className='qaap-agent-changes-toolbar'>
                <div className='qaap-agent-changes-toolbar-primary'>
                    <span className='qaap-agent-changes-scope'>
                        {nls.localize('qaap/mobileProjects/changesScopeLocal', 'Local')}
                    </span>
                    <span className='qaap-agent-changes-branch' title={branch}>
                        <i className={codicon('git-branch')} aria-hidden='true' />
                        <span>{branch}</span>
                    </span>
                    <span className='qaap-agent-changes-toolbar-spacer' />
                    {this.bulkActionsEnabled && this.renderAgentCommitControls(bulkDisabled)}
                </div>
                <div className='qaap-agent-changes-toolbar-secondary'>
                    <span className='qaap-agent-changes-summary'>
                        <i className={`${codicon('folder')} qaap-agent-changes-summary-icon`} aria-hidden='true' />
                        <span className='qaap-agent-changes-summary-label'>{summaryLabel}</span>
                        <span className='qaap-agent-changes-summary-stats'>
                            <span className='qaap-diff-add'>+{totals.adds}</span>
                            <span className='qaap-diff-del'>−{totals.dels}</span>
                        </span>
                    </span>
                    {this.renderAgentBulkActions(bulkDisabled)}
                </div>
            </header>
        );
    }

    protected renderAgentCommitControls(disabled: boolean): React.ReactNode {
        return (
            <div className='qaap-agent-changes-commit-group'>
                <button
                    type='button'
                    className='qaap-agent-changes-commit-btn'
                    disabled={disabled}
                    onClick={() => { void this.runCommitAction('create-branch-commit'); }}
                >
                    {nls.localize('qaap/mobileProjects/createBranchAndCommit', 'Create Branch & Commit')}
                </button>
                <div className='qaap-agent-changes-commit-menu-wrap'>
                    <button
                        type='button'
                        className={`qaap-agent-changes-commit-menu${this.commitMenuOpen ? ' qaap-mod-open' : ''}`}
                        disabled={disabled}
                        title={nls.localize('qaap/mobileProjects/commitOptions', 'Commit options')}
                        aria-label={nls.localize('qaap/mobileProjects/commitOptions', 'Commit options')}
                        aria-expanded={this.commitMenuOpen}
                        aria-haspopup='menu'
                        onClick={this.onToggleCommitMenu}
                    >
                        <i className={codicon('chevron-down')} aria-hidden='true' />
                    </button>
                    {this.commitMenuOpen && (
                        <div className='qaap-agent-changes-commit-dropdown' role='menu'>
                            {GIT_COMMIT_MENU_OPTIONS.map(option => (
                                <button
                                    key={option.action}
                                    type='button'
                                    role='menuitem'
                                    className='qaap-agent-changes-commit-dropdown-item'
                                    onClick={() => { void this.runCommitAction(option.action); }}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    protected readonly onToggleCommitMenu = (event: React.MouseEvent): void => {
        event.stopPropagation();
        if (this.commitMenuOpen) {
            this.closeCommitMenu();
        } else {
            this.openCommitMenu();
        }
    };

    protected openCommitMenu(): void {
        this.commitMenuOpen = true;
        this.attachCommitMenuListener();
        this.update();
    }

    protected closeCommitMenu(): void {
        if (!this.commitMenuOpen) {
            return;
        }
        this.commitMenuOpen = false;
        this.detachCommitMenuListener();
        this.update();
    }

    protected commitMenuListener: ((event: MouseEvent) => void) | undefined;

    protected attachCommitMenuListener(): void {
        this.detachCommitMenuListener();
        this.commitMenuListener = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) {
                return;
            }
            if (this.node.contains(target)) {
                return;
            }
            this.closeCommitMenu();
        };
        window.setTimeout(() => {
            if (this.commitMenuListener) {
                document.addEventListener('mousedown', this.commitMenuListener);
            }
        }, 0);
    }

    protected detachCommitMenuListener(): void {
        if (this.commitMenuListener) {
            document.removeEventListener('mousedown', this.commitMenuListener);
            this.commitMenuListener = undefined;
        }
    }

    protected async runCommitAction(action: QaapGitCommitWorkflowAction): Promise<void> {
        this.closeCommitMenu();
        if (this.runningBulkAction || !this.bulkActionsEnabled || this.files.length === 0 || !this.rootFsPath) {
            return;
        }
        const needsBranch = action === 'create-branch-commit' || action === 'create-branch-commit-push';
        let branchName: string | undefined;
        if (needsBranch) {
            branchName = await this.quickInputService.input({
                title: nls.localize('qaap/mobileProjects/newBranchTitle', 'Create branch'),
                placeHolder: nls.localize('qaap/mobileProjects/newBranchPlaceholder', 'feature/my-change'),
                prompt: nls.localize('qaap/mobileProjects/newBranchPrompt', 'Name for the new branch'),
            });
            if (!branchName?.trim()) {
                return;
            }
            branchName = branchName.trim();
        }
        let message: string | undefined;
        if (action !== 'commit') {
            message = await this.quickInputService.input({
                title: nls.localize('qaap/mobileProjects/commitMessageTitle', 'Commit message'),
                placeHolder: nls.localize('qaap/mobileProjects/commitMessagePlaceholder', 'Describe your changes'),
                prompt: nls.localize('qaap/mobileProjects/commitMessagePrompt', 'Message for this commit'),
            });
            if (!message?.trim()) {
                return;
            }
        }
        this.runningBulkAction = true;
        this.error = undefined;
        this.update();
        try {
            if (action === 'commit') {
                await this.commands.executeCommand(GIT_STAGE_ALL);
                await this.commands.executeCommand(GIT_COMMIT);
            } else {
                const response = await fetch(`${QAAP_GIT_REVIEW_API_PATH}/commit-workflow`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        root: this.rootFsPath,
                        action,
                        branchName,
                        message: message!.trim(),
                    }),
                });
                if (!response.ok) {
                    const body = await response.json().catch(() => ({})) as { error?: string };
                    throw new Error(body.error ?? `commit workflow failed (${response.status})`);
                }
                if (action === 'commit-create-pr') {
                    await this.openCreatePullRequest();
                }
            }
            await this.refresh();
        } catch (error) {
            this.error = error instanceof Error ? error.message : String(error);
            this.update();
        } finally {
            this.runningBulkAction = false;
            this.update();
        }
    }

    protected async openCreatePullRequest(): Promise<void> {
        const repoPath = this.rootFsPath;
        if (!repoPath) {
            return;
        }
        try {
            await this.commands.executeCommand(PR_PUSH_AND_CREATE, { repoPath });
        } catch {
            await this.commands.executeCommand(PR_CREATE, { repoPath });
        }
    }

    protected renderAgentBulkActions(disabled: boolean): React.ReactNode {
        if (!this.bulkActionsEnabled) {
            return undefined;
        }
        return (
            <span className='qaap-agent-changes-bulk-actions'>
                <button
                    type='button'
                    className='qaap-diff-review-icon-btn'
                    title={nls.localize('qaap/diff/discardAll', 'Discard all')}
                    aria-label={nls.localize('qaap/diff/discardAll', 'Discard all')}
                    disabled={disabled}
                    onClick={this.onDiscardAll}
                >
                    <i className={codicon('discard')} />
                </button>
                <button
                    type='button'
                    className='qaap-diff-review-icon-btn qaap-mod-accept'
                    title={nls.localize('qaap/diff/acceptAll', 'Accept all hunks')}
                    aria-label={nls.localize('qaap/diff/acceptAll', 'Accept all hunks')}
                    disabled={disabled}
                    onClick={this.onAcceptAll}
                >
                    <i className={codicon('check')} />
                </button>
            </span>
        );
    }

    protected renderAgentFileSection(file: QaapGitChangedFile): React.ReactNode {
        const diff = this.agentFileDiffs.get(file.path);
        const displayPath = middleTruncatePath(file.path);
        const isNew = isUntrackedFile(file);
        const fileClass = [
            'qaap-agent-changes-file',
            isNew ? 'qaap-agent-changes-file--new' : '',
        ].filter(Boolean).join(' ');
        return (
            <section key={file.path} className={fileClass}>
                <div className='qaap-agent-changes-filehdr'>
                    <button
                        type='button'
                        className='qaap-agent-changes-filehdr-main'
                        title={file.path}
                        onClick={() => this.onOpenInEditor(file.path)}
                    >
                        <i className={this.iconFor(file.path)} aria-hidden='true' />
                        <span className='qaap-agent-changes-path'>{displayPath}</span>
                        {isNew && (
                            <span className='qaap-agent-changes-new-badge'>
                                {nls.localize('qaap/diff/newFile', 'New')}
                            </span>
                        )}
                    </button>
                    <span className='qaap-agent-changes-filehdr-stats'>
                        <span className='qaap-diff-add'>+{file.adds}</span>
                        <span className='qaap-diff-del'>−{file.dels}</span>
                    </span>
                    <span className='qaap-agent-changes-filehdr-actions'>
                        {this.bulkActionsEnabled && (
                            <>
                                <button
                                    type='button'
                                    className='qaap-diff-review-icon-btn'
                                    title={nls.localize('qaap/diff/discardFile', 'Discard file changes')}
                                    aria-label={nls.localize('qaap/diff/discardFile', 'Discard file changes')}
                                    disabled={this.runningFileAction}
                                    onClick={() => { void this.rejectFile(file.path); }}
                                >
                                    <i className={codicon('discard')} />
                                </button>
                                <button
                                    type='button'
                                    className='qaap-diff-review-icon-btn qaap-mod-accept'
                                    title={nls.localize('qaap/diff/acceptFile', 'Accept file changes')}
                                    aria-label={nls.localize('qaap/diff/acceptFile', 'Accept file changes')}
                                    disabled={this.runningFileAction}
                                    onClick={() => { void this.acceptFile(file.path); }}
                                >
                                    <i className={codicon('check')} />
                                </button>
                            </>
                        )}
                    </span>
                </div>
                <div className='qaap-agent-changes-hunks'>
                    {diff ? this.renderAgentFileDiff(file.path, diff) : (
                        <div className='qaap-diff-review-note qaap-mod-compact'>
                            {this.loadingAgentDiffs
                                ? nls.localize('qaap/diff/loading', 'Loading diff…')
                                : nls.localize('qaap/diff/loadFailed', 'Could not load diff for this file.')}
                        </div>
                    )}
                </div>
            </section>
        );
    }

    protected renderAgentFileDiff(path: string, diff: QaapGitFileDiffResponse): React.ReactNode {
        if (diff.binary) {
            return <div className='qaap-diff-review-note'>{nls.localize('qaap/diff/binary', 'Binary file — open in the editor to inspect.')}</div>;
        }
        if (diff.hunks.length === 0) {
            return <div className='qaap-diff-review-note'>{nls.localize('qaap/diff/noHunks', 'No textual changes.')}</div>;
        }
        return diff.hunks.map((hunk, hunkIndex) => (
            <div key={hunkIndex} className='qaap-diff-review-hunk qaap-diff-review-hunk--agent'>
                {this.renderCollapsedHunkLines(path, hunkIndex, hunk.lines)}
            </div>
        ));
    }

    protected renderCollapsedHunkLines(path: string, hunkIndex: number, lines: QaapGitHunkLine[]): React.ReactNode {
        const segments = buildContextSegments(lines);
        return segments.map((segment, segmentIndex) => {
            if (segment.kind === 'lines') {
                return (
                    <React.Fragment key={`lines-${hunkIndex}-${segmentIndex}`}>
                        {segment.lines.map((line, lineIndex) => (
                            <DiffLine key={lineIndex} line={line} agentStyle={true} />
                        ))}
                    </React.Fragment>
                );
            }
            const blockId = `${path}:${hunkIndex}:${segmentIndex}`;
            const expanded = this.expandedContextBlocks.has(blockId);
            if (expanded) {
                return (
                    <React.Fragment key={blockId}>
                        <CollapsedContextBar
                            count={segment.lines.length}
                            expanded={true}
                            onToggle={() => this.onToggleContextBlock(blockId)}
                        />
                        {segment.lines.map((line, lineIndex) => (
                            <DiffLine key={lineIndex} line={line} agentStyle={true} />
                        ))}
                    </React.Fragment>
                );
            }
            return (
                <CollapsedContextBar
                    key={blockId}
                    count={segment.lines.length}
                    expanded={false}
                    onToggle={() => this.onToggleContextBlock(blockId)}
                />
            );
        });
    }

    protected renderContent(totals: { adds: number; dels: number }): React.ReactNode {
        const collapsed = this.filesPanelCollapsed;
        return (
            <div className={`qaap-diff-review-layout${collapsed ? ' qaap-diff-review-layout--files-collapsed' : ''}`}>
                <div className='qaap-diff-review-main'>
                    {this.renderDiffToolbar(totals)}
                    {this.renderDiff()}
                </div>
                <aside
                    className='qaap-diff-review-sidebar'
                    aria-label={nls.localize('qaap/diff/changesSidebar', 'Changed files')}
                    aria-hidden={collapsed}
                >
                    {!this.workHubEmbed && this.renderSidebarHeader()}
                    <div className='qaap-diff-review-files'>
                        {this.files.map(file => (
                            <FileRow
                                key={file.path}
                                file={file}
                                selected={file.path === this.selectedPath}
                                iconClass={this.iconFor(file.path)}
                                compact={this.workHubEmbed}
                                onSelect={this.onSelectFile}
                                onOpenEditor={this.onOpenInEditor}
                            />
                        ))}
                    </div>
                </aside>
                {this.renderFooter()}
            </div>
        );
    }

    protected renderSidebarHeader(): React.ReactNode {
        const count = this.files.length;
        return (
            <header className='qaap-diff-review-sidebar-head'>
                <div className='qaap-diff-review-sidebar-titles'>
                    <span className='qaap-diff-review-title'>
                        {nls.localize('qaap/diff/changes', 'Changes')}
                    </span>
                    <span className='qaap-diff-review-sub'>
                        {count === 1
                            ? nls.localize('qaap/diff/oneFile', '1 file')
                            : nls.localize('qaap/diff/nFiles', '{0} files', count)}
                    </span>
                </div>
                <span className='qaap-diff-review-spacer' />
                <button
                    type='button'
                    className='qaap-diff-review-icon-btn'
                    title={nls.localize('qaap/diff/refresh', 'Refresh')}
                    aria-label={nls.localize('qaap/diff/refresh', 'Refresh')}
                    onClick={this.onRefresh}
                >
                    <i className={codicon('refresh')} />
                </button>
                {count > 0 && this.bulkActionsEnabled && (
                    <button
                        type='button'
                        className='qaap-diff-review-icon-btn'
                        title={nls.localize('qaap/diff/discardAll', 'Discard all')}
                        onClick={this.onDiscardAll}
                    >
                        <i className={codicon('discard')} />
                    </button>
                )}
            </header>
        );
    }

    protected renderDiffToolbar(totals: { adds: number; dels: number }): React.ReactNode {
        const count = this.files.length;
        const index = this.files.findIndex(f => f.path === this.selectedPath);
        const canPrev = index > 0;
        const canNext = index >= 0 && index < this.files.length - 1;
        const selected = index >= 0 ? this.files[index] : undefined;
        const selectedParts = selected ? splitRepoRelativePath(selected.path) : undefined;
        const toolbarClass = this.workHubEmbed
            ? 'qaap-diff-review-toolbar qaap-diff-review-toolbar--work-hub'
            : 'qaap-diff-review-toolbar';
        return (
            <header className={toolbarClass}>
                <div className='qaap-diff-review-toolbar-row'>
                    <button
                        type='button'
                        className='qaap-diff-review-icon-btn qaap-diff-review-files-toggle'
                        title={this.filesPanelCollapsed
                            ? nls.localize('qaap/diff/showFiles', 'Show changed files')
                            : nls.localize('qaap/diff/hideFiles', 'Hide changed files')}
                        aria-expanded={!this.filesPanelCollapsed}
                        onClick={this.onToggleFilesPanel}
                    >
                        <i className={codicon(this.filesPanelCollapsed ? 'list-tree' : 'chevron-down')} />
                    </button>
                    <span className='qaap-diff-review-toolbar-summary'>
                        {count === 1
                            ? nls.localize('qaap/diff/oneFile', '1 file')
                            : nls.localize('qaap/diff/nFiles', '{0} files', count)}
                        {' · '}
                        <span className='qaap-diff-add'>+{totals.adds}</span>
                        {' '}
                        <span className='qaap-diff-del'>−{totals.dels}</span>
                    </span>
                    <span className='qaap-diff-review-spacer' />
                    {this.workHubEmbed && this.renderToolbarActions(count)}
                    {!this.workHubEmbed && (
                        <span className='qaap-diff-review-view-label' aria-hidden='true'>
                            {nls.localize('qaap/diff/unifiedView', 'Unified')}
                        </span>
                    )}
                    <button
                        type='button'
                        className='qaap-diff-review-icon-btn'
                        title={nls.localize('qaap/diff/previousFile', 'Previous file')}
                        disabled={!canPrev}
                        onClick={this.onPreviousFile}
                    >
                        <i className={codicon('chevron-up')} />
                    </button>
                    <button
                        type='button'
                        className='qaap-diff-review-icon-btn'
                        title={nls.localize('qaap/diff/nextFile', 'Next file')}
                        disabled={!canNext}
                        onClick={this.onNextFile}
                    >
                        <i className={codicon('chevron-down')} />
                    </button>
                </div>
                {this.workHubEmbed && this.filesPanelCollapsed && selected && selectedParts && (
                    <div className='qaap-diff-review-toolbar-file'>
                        <i className={this.iconFor(selected.path)} />
                        <span className='qaap-diff-review-toolbar-file-ident'>
                            <span className='qaap-diff-review-toolbar-file-base'>{selectedParts.base}</span>
                            {selectedParts.dir && (
                                <span className='qaap-diff-review-toolbar-file-dir'>{selectedParts.dir}</span>
                            )}
                        </span>
                        <span className='qaap-diff-review-stats'>
                            <span className='qaap-diff-add'>+{selected.adds}</span>
                            <span className='qaap-diff-del'>−{selected.dels}</span>
                        </span>
                        <button
                            type='button'
                            className='qaap-diff-review-icon-btn'
                            title={nls.localize('qaap/diff/openInEditor', 'Open in editor')}
                            onClick={() => this.onOpenInEditor(selected.path)}
                        >
                            <i className={codicon('go-to-file')} />
                        </button>
                    </div>
                )}
            </header>
        );
    }

    protected renderToolbarActions(fileCount: number): React.ReactNode {
        return (
            <>
                <button
                    type='button'
                    className='qaap-diff-review-icon-btn'
                    title={nls.localize('qaap/diff/refresh', 'Refresh')}
                    aria-label={nls.localize('qaap/diff/refresh', 'Refresh')}
                    onClick={this.onRefresh}
                >
                    <i className={codicon('refresh')} />
                </button>
                {fileCount > 0 && this.bulkActionsEnabled && (
                    <button
                        type='button'
                        className='qaap-diff-review-icon-btn'
                        title={nls.localize('qaap/diff/discardAll', 'Discard all')}
                        aria-label={nls.localize('qaap/diff/discardAll', 'Discard all')}
                        onClick={this.onDiscardAll}
                    >
                        <i className={codicon('discard')} />
                    </button>
                )}
            </>
        );
    }

    protected renderDiff(): React.ReactNode {
        const file = this.files.find(f => f.path === this.selectedPath);
        const parts = file ? splitRepoRelativePath(file.path) : undefined;
        const showPaneHead = file && parts && (!this.workHubEmbed || !this.filesPanelCollapsed);
        return (
            <div className='qaap-diff-review-pane'>
                {showPaneHead && (
                    <div className='qaap-diff-review-pane-head'>
                        <i className={this.iconFor(file.path)} />
                        <div className='qaap-diff-review-pane-ident'>
                            <span className='qaap-diff-review-pane-base'>{parts.base}</span>
                            {parts.dir && (
                                <span className='qaap-diff-review-pane-dir'>{parts.dir}</span>
                            )}
                        </div>
                        <span className='qaap-diff-review-spacer' />
                        <span className='qaap-diff-review-stats'>
                            <span className='qaap-diff-add'>+{file.adds}</span>
                            <span className='qaap-diff-del'>−{file.dels}</span>
                        </span>
                        <button
                            type='button'
                            className='qaap-diff-review-icon-btn'
                            title={nls.localize('qaap/diff/openInEditor', 'Open in editor')}
                            onClick={() => this.onOpenInEditor(file.path)}
                        >
                            <i className={codicon('go-to-file')} />
                        </button>
                    </div>
                )}
                <div className='qaap-diff-review-hunks'>
                    {this.renderHunkBody()}
                </div>
            </div>
        );
    }

    protected renderHunkBody(): React.ReactNode {
        if (this.loadingDiff) {
            return <div className='qaap-diff-review-note'>{nls.localize('qaap/diff/loading', 'Loading diff…')}</div>;
        }
        if (!this.diff) {
            return undefined;
        }
        if (this.diff.binary) {
            return <div className='qaap-diff-review-note'>{nls.localize('qaap/diff/binary', 'Binary file — open in the editor to inspect.')}</div>;
        }
        if (this.diff.hunks.length === 0) {
            return <div className='qaap-diff-review-note'>{nls.localize('qaap/diff/noHunks', 'No textual changes.')}</div>;
        }
        return this.diff.hunks.map((hunk, hunkIndex) => (
            <div key={hunkIndex} className='qaap-diff-review-hunk'>
                <div className='qaap-diff-review-hunk-header'>{hunk.header}</div>
                {hunk.lines.map((line, lineIndex) => (
                    <DiffLine key={lineIndex} line={line} />
                ))}
            </div>
        ));
    }

    protected renderFooter(): React.ReactNode {
        if (!this.bulkActionsEnabled) {
            return undefined;
        }
        const disabled = this.runningBulkAction || this.files.length === 0;
        return (
            <div className='qaap-diff-review-footer'>
                <button
                    type='button'
                    className='qaap-diff-review-btn qaap-diff-review-btn--reject'
                    onClick={this.onDiscardAll}
                    disabled={disabled}
                >
                    {nls.localize('qaap/diff/reject', 'Reject')}
                </button>
                <button
                    type='button'
                    className='qaap-diff-review-btn qaap-diff-review-btn--accept'
                    onClick={this.onAcceptAll}
                    disabled={disabled}
                >
                    {nls.localize('qaap/diff/acceptAll', 'Accept all hunks')}
                </button>
            </div>
        );
    }

    protected iconFor(path: string): string {
        const uri = this.fileUri(path);
        return uri ? this.labelProvider.getIcon(uri) + ' qaap-diff-review-glyph' : codicon('file');
    }

    protected readonly onSelectFile = (path: string): void => {
        if (path !== this.selectedPath) {
            if (this.workHubEmbed && !this.transcriptEmbed) {
                this.filesPanelCollapsed = true;
            }
            void this.selectFile(path);
        }
    };

    protected readonly onOpenInEditor = (path: string): void => {
        const uri = this.fileUri(path);
        if (uri) {
            void open(this.openerService, uri);
        }
    };

    protected readonly onRefresh = (): void => {
        void this.refresh();
    };

    protected readonly onToggleFilesPanel = (): void => {
        this.filesPanelCollapsed = !this.filesPanelCollapsed;
        this.update();
    };

    protected readonly onPreviousFile = (): void => {
        this.navigateFile(-1);
    };

    protected readonly onNextFile = (): void => {
        this.navigateFile(1);
    };

    protected navigateFile(delta: number): void {
        const index = this.files.findIndex(f => f.path === this.selectedPath);
        if (index < 0) {
            return;
        }
        const next = this.files[index + delta];
        if (next) {
            void this.selectFile(next.path);
        }
    }

    protected readonly onToggleContextBlock = (blockId: string): void => {
        if (this.expandedContextBlocks.has(blockId)) {
            this.expandedContextBlocks.delete(blockId);
        } else {
            this.expandedContextBlocks.add(blockId);
        }
        this.update();
    };

    protected readonly onReviewComposerDraftChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        this.reviewComposerDraft = event.target.value;
        this.update();
    };

    protected readonly onReviewComposerSubmit = (event: React.FormEvent): void => {
        event.preventDefault();
        const message = this.reviewComposerDraft.trim();
        if (!message || !this.onTranscriptAgentFeedback) {
            return;
        }
        this.reviewComposerDraft = '';
        this.update();
        void Promise.resolve(this.onTranscriptAgentFeedback(message));
    };

    protected async acceptFile(path: string): Promise<void> {
        await this.runFileAction(`${QAAP_GIT_REVIEW_API_PATH}/stage`, path);
    }

    protected async rejectFile(path: string): Promise<void> {
        await this.runFileAction(`${QAAP_GIT_REVIEW_API_PATH}/discard`, path);
    }

    protected async runFileAction(endpoint: string, file: string): Promise<void> {
        if (this.runningFileAction || !this.rootFsPath || !this.bulkActionsEnabled) {
            return;
        }
        this.runningFileAction = true;
        this.error = undefined;
        this.update();
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ root: this.rootFsPath, file }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({})) as { error?: string };
                throw new Error(body.error ?? `request failed (${response.status})`);
            }
            await this.refresh();
        } catch (error) {
            this.error = error instanceof Error ? error.message : String(error);
            this.update();
        } finally {
            this.runningFileAction = false;
            this.update();
        }
    }

    protected readonly onAcceptAll = (): void => {
        void this.runBulkAction(GIT_STAGE_ALL);
    };

    protected readonly onDiscardAll = (): void => {
        void this.runBulkAction(GIT_CLEAN_ALL);
    };

    protected async runBulkAction(commandId: string): Promise<void> {
        if (this.runningBulkAction || !this.bulkActionsEnabled) {
            return;
        }
        this.runningBulkAction = true;
        this.error = undefined;
        this.update();
        try {
            await this.commands.executeCommand(commandId);
            await this.refresh();
        } catch (error) {
            this.error = error instanceof Error ? error.message : String(error);
        } finally {
            this.runningBulkAction = false;
            this.update();
        }
    }
}

function FileRow(props: {
    file: QaapGitChangedFile;
    selected: boolean;
    iconClass: string;
    compact?: boolean;
    onSelect: (path: string) => void;
    onOpenEditor: (path: string) => void;
}): React.ReactElement {
    const { file } = props;
    const { base, dir } = splitRepoRelativePath(file.path);
    const onSelect = React.useCallback(() => props.onSelect(file.path), [props, file.path]);
    const onOpen = React.useCallback((event: React.MouseEvent) => {
        event.stopPropagation();
        props.onOpenEditor(file.path);
    }, [props, file.path]);
    const rowClass = [
        'qaap-diff-review-row',
        props.selected ? 'qaap-diff-review-row--selected' : '',
        props.compact ? 'qaap-diff-review-row--compact' : '',
    ].filter(Boolean).join(' ');
    return (
        <div
            className={rowClass}
            onClick={onSelect}
            role='button'
            tabIndex={0}
            title={file.path}
            onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect();
                }
            }}
        >
            <i className={props.iconClass} />
            <span className='qaap-diff-review-name'>
                <span className='qaap-diff-review-name-base'>{base}</span>
                {dir && <span className='qaap-diff-review-name-dir'>{dir}</span>}
            </span>
            <span className='qaap-diff-review-stats'>
                <span className='qaap-diff-add'>+{file.adds}</span>
                <span className='qaap-diff-del'>−{file.dels}</span>
            </span>
            {file.staged && (
                <span className='qaap-diff-review-approved' title='Staged'>
                    <i className={codicon('check')} />
                </span>
            )}
            <button
                type='button'
                className='qaap-diff-review-open'
                title={nls.localize('qaap/diff/openInEditor', 'Open in editor')}
                onClick={onOpen}
            >
                <i className={codicon('go-to-file')} />
            </button>
        </div>
    );
}

type ContextSegment =
    | { kind: 'lines'; lines: QaapGitHunkLine[] }
    | { kind: 'collapsed'; lines: QaapGitHunkLine[] };

function buildContextSegments(lines: QaapGitHunkLine[]): ContextSegment[] {
    const segments: ContextSegment[] = [];
    let ctxRun: QaapGitHunkLine[] = [];

    const flushCtx = (): void => {
        if (ctxRun.length === 0) {
            return;
        }
        if (ctxRun.length >= CONTEXT_COLLAPSE_THRESHOLD) {
            segments.push({ kind: 'collapsed', lines: ctxRun });
        } else {
            segments.push({ kind: 'lines', lines: ctxRun });
        }
        ctxRun = [];
    };

    for (const line of lines) {
        if (line.type === 'ctx') {
            ctxRun.push(line);
        } else {
            flushCtx();
            segments.push({ kind: 'lines', lines: [line] });
        }
    }
    flushCtx();
    return segments;
}

function CollapsedContextBar(props: { count: number; expanded: boolean; onToggle: () => void }): React.ReactElement {
    const label = props.count === 1
        ? nls.localize('qaap/diff/oneUnmodifiedLine', '1 unmodified line')
        : nls.localize('qaap/diff/nUnmodifiedLines', '{0} unmodified lines', String(props.count));
    const icon = props.expanded ? codicon('chevron-up') : codicon('chevron-down');
    return (
        <button
            type='button'
            className={`qaap-diff-review-collapsed${props.expanded ? ' qaap-mod-expanded' : ''}`}
            onClick={props.onToggle}
            aria-expanded={props.expanded}
        >
            <i className={`${icon} qaap-diff-review-collapsed-chevron`} aria-hidden='true' />
            <span>{label}</span>
        </button>
    );
}

function isUntrackedFile(file: QaapGitChangedFile): boolean {
    return file.status === 'U' || file.status === '?';
}

function DiffLine(props: { line: QaapGitHunkLine; agentStyle?: boolean }): React.ReactElement {
    const { line, agentStyle } = props;
    const sign = line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' ';
    const number = line.type === 'del' ? line.oldNumber : line.newNumber;
    const lineClass = [
        'qaap-diff-review-line',
        `qaap-diff-review-line--${line.type}`,
        agentStyle ? 'qaap-diff-review-line--agent' : '',
    ].filter(Boolean).join(' ');
    return (
        <div className={lineClass}>
            <span className='qaap-diff-review-gutter'>{number ?? ''}</span>
            {!agentStyle && <span className='qaap-diff-review-sign'>{sign}</span>}
            <span className='qaap-diff-review-code'>{line.text}</span>
        </div>
    );
}
