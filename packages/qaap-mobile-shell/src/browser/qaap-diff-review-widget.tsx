// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { codicon, LabelProvider, Message, open, OpenerService, ReactWidget } from '@theia/core/lib/browser';
import { CommandService } from '@theia/core/lib/common/command';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import {
    QAAP_GIT_REVIEW_API_PATH,
    type QaapGitChangedFile,
    type QaapGitFileDiffResponse,
    type QaapGitHunkLine,
} from '../common/qaap-git-review';
import { splitRepoRelativePath } from './qaap-diff-review-path';

/** Git extension commands used by the bulk review actions. */
const GIT_STAGE_ALL = 'git.stageAll';
const GIT_CLEAN_ALL = 'git.cleanAll';

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

    /** Called when the widget is mounted inside {@link MobileProjectsPanel}. */
    enableWorkHubEmbed(): void {
        if (this.workHubEmbed) {
            return;
        }
        this.workHubEmbed = true;
        this.filesPanelCollapsed = true;
        this.addClass('qaap-diff-review--work-hub');
        this.update();
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
            const body = await response.json() as { files?: QaapGitChangedFile[] };
            this.files = body.files ?? [];
            this.error = undefined;
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
            const response = await fetch(
                `${QAAP_GIT_REVIEW_API_PATH}/diff?root=${encodeURIComponent(this.rootFsPath)}&file=${encodeURIComponent(path)}`,
                { credentials: 'include' },
            );
            if (!response.ok) {
                throw new Error(`diff request failed (${response.status})`);
            }
            this.diff = await response.json() as QaapGitFileDiffResponse;
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

    protected render(): React.ReactNode {
        const totals = this.files.reduce(
            (acc, file) => ({ adds: acc.adds + file.adds, dels: acc.dels + file.dels }),
            { adds: 0, dels: 0 },
        );
        return (
            <div className='qaap-diff-review-body'>
                {this.error && <div className='qaap-diff-review-error'>{this.error}</div>}
                {!this.bulkActionsEnabled && this.files.length > 0 && (
                    <div className='qaap-diff-review-note qaap-diff-review-readonly-hint'>
                        {nls.localize(
                            'qaap/diff/openProjectToApply',
                            'Open this project in the workspace to accept or discard changes.',
                        )}
                    </div>
                )}
                {this.files.length === 0 ? this.renderEmpty() : this.renderContent(totals)}
            </div>
        );
    }

    protected renderEmpty(): React.ReactNode {
        return (
            <div className='qaap-diff-review-empty'>
                <i className={codicon('check-all')} />
                <p>{nls.localize('qaap/diff/noChanges', 'No changes to review.')}</p>
                <span>{nls.localize('qaap/diff/noChangesHint', 'Edits made by you or an agent will show up here.')}</span>
            </div>
        );
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
            if (this.workHubEmbed) {
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

function DiffLine(props: { line: QaapGitHunkLine }): React.ReactElement {
    const { line } = props;
    const sign = line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' ';
    const number = line.type === 'del' ? line.oldNumber : line.newNumber;
    return (
        <div className={`qaap-diff-review-line qaap-diff-review-line--${line.type}`}>
            <span className='qaap-diff-review-gutter'>{number ?? ''}</span>
            <span className='qaap-diff-review-sign'>{sign}</span>
            <span className='qaap-diff-review-code'>{line.text}</span>
        </div>
    );
}
