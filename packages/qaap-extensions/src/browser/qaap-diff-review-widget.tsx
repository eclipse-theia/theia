// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { codicon, Message, ReactWidget } from '@theia/core/lib/browser';
import { CommandService } from '@theia/core/lib/common/command';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { ScmResource } from '@theia/scm/lib/browser/scm-provider';

/** Git extension commands used by the review actions. */
const GIT_STAGE_ALL = 'git.stageAll';
const GIT_CLEAN_ALL = 'git.cleanAll';

/**
 * Mobile review surface: lists working-tree changes (whatever an agent — or the user — has
 * produced) and lets the user open each file's diff, stage all, or discard all. Bound to the
 * "Diff" entry of the mobile bottom navigation bar.
 */
@injectable()
export class QaapDiffReviewWidget extends ReactWidget {

    static readonly ID = 'qaap-diff-review';
    static readonly LABEL = nls.localize('qaap/diff/reviewLabel', 'Changes');

    @inject(ScmService)
    protected readonly scmService: ScmService;

    @inject(CommandService)
    protected readonly commands: CommandService;

    protected readonly toDisposeOnRepository = new DisposableCollection();

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
        if (repository) {
            this.toDisposeOnRepository.push(repository.provider.onDidChange(() => this.update()));
            const onResources = repository.provider.onDidChangeResources;
            if (onResources) {
                this.toDisposeOnRepository.push(onResources(() => this.update()));
            }
        }
        this.update();
    }

    protected override onActivateRequest(message: Message): void {
        super.onActivateRequest(message);
        this.trackRepository();
        this.node.focus();
    }

    /** All resources of the selected repository, grouped (working tree, staged, …). */
    protected collectGroups(): { id: string; label: string; resources: ScmResource[] }[] {
        const repository = this.scmService.selectedRepository;
        if (!repository) {
            return [];
        }
        return repository.provider.groups
            .filter(group => group.resources.length > 0)
            .map(group => ({ id: group.id, label: group.label, resources: [...group.resources] }));
    }

    protected render(): React.ReactNode {
        const groups = this.collectGroups();
        const total = groups.reduce((sum, group) => sum + group.resources.length, 0);
        return (
            <div className='qaap-diff-review-body'>
                {this.renderHeader(total)}
                {total === 0 ? this.renderEmpty() : this.renderGroups(groups)}
                {total > 0 && this.renderFooter()}
            </div>
        );
    }

    protected renderHeader(total: number): React.ReactNode {
        return (
            <header className='qaap-diff-review-header'>
                <span className='qaap-diff-review-title'>
                    {nls.localize('qaap/diff/workingChanges', 'Working changes')}
                </span>
                <span className='qaap-diff-review-count'>
                    {total === 1
                        ? nls.localize('qaap/diff/oneFile', '1 file')
                        : nls.localize('qaap/diff/nFiles', '{0} files', total)}
                </span>
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

    protected renderGroups(groups: { id: string; label: string; resources: ScmResource[] }[]): React.ReactNode {
        return (
            <div className='qaap-diff-review-list'>
                {groups.map(group => (
                    <div key={group.id} className='qaap-diff-review-group'>
                        <div className='qaap-diff-review-group-label'>{group.label}</div>
                        {group.resources.map((resource, index) => this.renderResource(group.id, index, resource))}
                    </div>
                ))}
            </div>
        );
    }

    protected renderResource(groupId: string, index: number, resource: ScmResource): React.ReactNode {
        const path = resource.sourceUri.path;
        const letter = resource.decorations?.letter ?? '?';
        const tooltip = resource.decorations?.tooltip ?? '';
        return (
            <ResourceRow
                key={`${groupId}:${index}:${resource.sourceUri.toString()}`}
                name={path.base}
                dir={path.dir.toString()}
                letter={letter}
                tooltip={tooltip}
                resource={resource}
            />
        );
    }

    protected renderFooter(): React.ReactNode {
        return (
            <div className='qaap-diff-review-footer'>
                <button
                    type='button'
                    className='qaap-diff-review-btn qaap-diff-review-btn--reject'
                    onClick={this.onRejectAll}
                >
                    {nls.localize('qaap/diff/discardAll', 'Discard all')}
                </button>
                <button
                    type='button'
                    className='qaap-diff-review-btn qaap-diff-review-btn--accept'
                    onClick={this.onAcceptAll}
                >
                    {nls.localize('qaap/diff/stageAll', 'Stage all')}
                </button>
            </div>
        );
    }

    protected readonly onAcceptAll = (): void => {
        // git.cleanAll/stageAll already show their own confirmation where destructive.
        void this.commands.executeCommand(GIT_STAGE_ALL);
    };

    protected readonly onRejectAll = (): void => {
        void this.commands.executeCommand(GIT_CLEAN_ALL);
    };
}

/** A single changed file. Extracted so the click handler is not re-bound on every render. */
function ResourceRow(props: {
    name: string;
    dir: string;
    letter: string;
    tooltip: string;
    resource: ScmResource;
}): React.ReactElement {
    const onOpen = React.useCallback(() => {
        void props.resource.open();
    }, [props.resource]);
    return (
        <div className='qaap-diff-review-row' title={props.tooltip} onClick={onOpen}>
            <span className={`qaap-diff-review-status qaap-diff-review-status--${props.letter.toLowerCase()}`}>
                {props.letter}
            </span>
            <span className='qaap-diff-review-name'>{props.name}</span>
            <span className='qaap-diff-review-dir'>{props.dir}</span>
            <i className={`qaap-diff-review-chevron ${codicon('chevron-right')}`} />
        </div>
    );
}
