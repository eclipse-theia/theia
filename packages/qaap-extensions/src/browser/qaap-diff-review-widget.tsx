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
} from '@theia/qaap-mobile-shell/lib/common/qaap-git-review';

/** Git extension commands used by the bulk review actions. */
const GIT_STAGE_ALL = 'git.stageAll';
const GIT_CLEAN_ALL = 'git.cleanAll';

/**
 * Mobile review surface: lists working-tree changes, shows each file's diff inline (no need to
 * leave the view), and offers a per-file shortcut to the full Qaap editor. Bound to the "Diff"
 * entry of the mobile bottom navigation bar.
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

    /** `file://` URI of the repository root, used to build per-file URIs. */
    protected rootUri: string | undefined;
    /** Absolute fs path of the repository root, passed to the backend endpoint. */
    protected rootFsPath: string | undefined;

    protected files: QaapGitChangedFile[] = [];
    protected selectedPath: string | undefined;
    protected diff: QaapGitFileDiffResponse | undefined;
    protected loadingDiff = false;
    protected runningBulkAction = false;
    protected error: string | undefined;

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

    protected trackRepository(): void {
        this.toDisposeOnRepository.dispose();
        const repository = this.scmService.selectedRepository;
        this.rootUri = repository?.provider.rootUri;
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

    /** Reload the changed-file list and refresh the selected file's diff. */
    protected async refresh(): Promise<void> {
        this.rootFsPath = this.rootUri ? await this.fileService.fsPath(new URI(this.rootUri)) : undefined;
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
                {this.renderHeader(totals)}
                {this.error && <div className='qaap-diff-review-error'>{this.error}</div>}
                {this.files.length === 0 ? this.renderEmpty() : this.renderContent()}
            </div>
        );
    }

    protected renderHeader(totals: { adds: number; dels: number }): React.ReactNode {
        const count = this.files.length;
        return (
            <header className='qaap-diff-review-header'>
                <span className='qaap-diff-review-title'>
                    {nls.localize('qaap/diff/workingChanges', 'Working changes')}
                </span>
                {count > 0 && (
                    <span className='qaap-diff-review-sub'>
                        {count === 1
                            ? nls.localize('qaap/diff/oneFile', '1 file')
                            : nls.localize('qaap/diff/nFiles', '{0} files', count)}
                        {' · '}
                        <span className='qaap-diff-add'>+{totals.adds}</span>
                        {' '}
                        <span className='qaap-diff-del'>−{totals.dels}</span>
                    </span>
                )}
                <span className='qaap-diff-review-spacer' />
                <button
                    type='button'
                    className='qaap-diff-review-chip'
                    title={nls.localize('qaap/diff/backgroundTasks', 'Background tasks')}
                    onClick={this.onOpenTasks}
                >
                    <i className={codicon('server-process')} />
                </button>
                {count > 0 && (
                    <button type='button' className='qaap-diff-review-chip' onClick={this.onDiscardAll}>
                        {nls.localize('qaap/diff/discardAll', 'Discard all')}
                    </button>
                )}
            </header>
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

    protected renderContent(): React.ReactNode {
        return (
            <>
                <div className='qaap-diff-review-files'>
                    {this.files.map(file => (
                        <FileRow
                            key={file.path}
                            file={file}
                            selected={file.path === this.selectedPath}
                            iconClass={this.iconFor(file.path)}
                            onSelect={this.onSelectFile}
                            onOpenEditor={this.onOpenInEditor}
                        />
                    ))}
                </div>
                {this.renderDiff()}
                {this.renderFooter()}
            </>
        );
    }

    protected renderDiff(): React.ReactNode {
        const file = this.files.find(f => f.path === this.selectedPath);
        return (
            <div className='qaap-diff-review-pane'>
                {file && (
                    <div className='qaap-diff-review-pane-head'>
                        <i className={this.iconFor(file.path)} />
                        <span className='qaap-diff-review-pane-path'>{file.path}</span>
                        <span className='qaap-diff-review-spacer' />
                        <span className='qaap-diff-add'>+{file.adds}</span>
                        <span className='qaap-diff-del'>−{file.dels}</span>
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
            void this.selectFile(path);
        }
    };

    protected readonly onOpenInEditor = (path: string): void => {
        const uri = this.fileUri(path);
        if (uri) {
            void open(this.openerService, uri);
        }
    };

    protected readonly onOpenTasks = (): void => {
        void this.commands.executeCommand('qaap.agentTasks.open');
    };

    protected readonly onAcceptAll = (): void => {
        void this.runBulkAction(GIT_STAGE_ALL);
    };

    protected readonly onDiscardAll = (): void => {
        // git.cleanAll shows its own confirmation dialog before discarding.
        void this.runBulkAction(GIT_CLEAN_ALL);
    };

    protected async runBulkAction(commandId: string): Promise<void> {
        if (this.runningBulkAction) {
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

/** A changed-file row. Extracted so click handlers are not re-bound on every parent render. */
function FileRow(props: {
    file: QaapGitChangedFile;
    selected: boolean;
    iconClass: string;
    onSelect: (path: string) => void;
    onOpenEditor: (path: string) => void;
}): React.ReactElement {
    const { file } = props;
    const onSelect = React.useCallback(() => props.onSelect(file.path), [props, file.path]);
    const onOpen = React.useCallback((event: React.MouseEvent) => {
        event.stopPropagation();
        props.onOpenEditor(file.path);
    }, [props, file.path]);
    return (
        <div
            className={`qaap-diff-review-row${props.selected ? ' qaap-diff-review-row--selected' : ''}`}
            onClick={onSelect}
        >
            <i className={props.iconClass} />
            <span className='qaap-diff-review-name' title={file.path}>{file.path}</span>
            <span className='qaap-diff-add'>+{file.adds}</span>
            <span className='qaap-diff-del'>−{file.dels}</span>
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

/** A single diff line in the inline hunk view. */
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
