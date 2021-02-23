/********************************************************************************
 * Copyright (C) 2019 Arm and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import '../../src/browser/style/scm-amend-component.css';

import * as React from '@theia/core/shared/react';
import { ScmAvatarService } from './scm-avatar-service';
import { StorageService } from '@theia/core/lib/browser';
import { Disposable, DisposableCollection } from '@theia/core';

import { ScmRepository } from './scm-repository';
import { ScmAmendSupport, ScmCommit } from './scm-provider';

export interface ScmAmendComponentProps {
    style: React.CSSProperties | undefined,
    repository: ScmRepository,
    scmAmendSupport: ScmAmendSupport,
    setCommitMessage: (message: string) => void,
    avatarService: ScmAvatarService,
    storageService: StorageService,
}

interface ScmAmendComponentState {
    /**
     * This is used for transitioning.  When setting up a transition, we first set to render
     * the elements in their starting positions.  This includes creating the elements to be
     * transitioned in, even though those controls will not be visible when state is 'start'.
     * On the next frame after 'start', we render elements with their final positions and with
     * the transition properties.
     */
    transition: {
        state: 'none'
    } | {
        state: 'start' | 'transitioning',
        direction: 'up' | 'down',
        previousLastCommit: { commit: ScmCommit, avatar: string }
    };

    amendingCommits: { commit: ScmCommit, avatar: string }[];
    lastCommit: { commit: ScmCommit, avatar: string } | undefined;
}

const TRANSITION_TIME_MS = 300;
const REPOSITORY_STORAGE_KEY = 'scmRepository';

export class ScmAmendComponent extends React.Component<ScmAmendComponentProps, ScmAmendComponentState> {

    /**
     * a hint on how to animate an update, set by certain user action handlers
     * and used when updating the view based on a repository change
     */
    protected transitionHint: 'none' | 'amend' | 'unamend' = 'none';

    protected lastCommitHeight: number = 0;
    lastCommitScrollRef = (instance: HTMLDivElement) => {
        if (instance && this.lastCommitHeight === 0) {
            this.lastCommitHeight = instance.getBoundingClientRect().height;
        }
    };

    constructor(props: ScmAmendComponentProps) {
        super(props);

        this.state = {
            transition: { state: 'none' },
            amendingCommits: [],
            lastCommit: undefined
        };

        const setState = this.setState.bind(this);
        this.setState = newState => {
            if (!this.toDisposeOnUnmount.disposed) {
                setState(newState);
            }
        };
    }

    protected readonly toDisposeOnUnmount = new DisposableCollection();

    async componentDidMount(): Promise<void> {
        this.toDisposeOnUnmount.push(Disposable.create(() => { /* mark as mounted */ }));

        const lastCommit = await this.getLastCommit();
        this.setState({ amendingCommits: await this.buildAmendingList(lastCommit ? lastCommit.commit : undefined), lastCommit });

        if (this.toDisposeOnUnmount.disposed) {
            return;
        }
        this.toDisposeOnUnmount.push(
            this.props.repository.provider.onDidChange(() => this.fetchStatusAndSetState())
        );
    }

    componentWillUnmount(): void {
        this.toDisposeOnUnmount.dispose();
    }

    async fetchStatusAndSetState(): Promise<void> {
        const storageKey = this.getStorageKey();

        const nextCommit = await this.getLastCommit();
        if (nextCommit && this.state.lastCommit && nextCommit.commit.id === this.state.lastCommit.commit.id) {
            // No change here
        } else if (nextCommit === undefined && this.state.lastCommit === undefined) {
            // No change here
        } else if (this.transitionHint === 'none') {
            // If the 'last' commit changes, but we are not expecting an 'amend'
            // or 'unamend' to occur, then we clear out the list of amended commits.
            // This is because an unexpected change has happened to the repository,
            // perhaps the user committed, merged, or something.  The amended commits
            // will no longer be valid.

            // Note that there may or may not have been a previous lastCommit (if the
            // repository was previously empty with no initial commit then lastCommit
            // will be undefined).  Either way we clear the amending commits.
            await this.clearAmendingCommits();

            // There is a change to the last commit, but no transition hint so
            // the view just updates without transition.
            this.setState({ amendingCommits: [], lastCommit: nextCommit });
        } else {
            const amendingCommits = this.state.amendingCommits.concat([]); // copy the array

            const direction: 'up' | 'down' = this.transitionHint === 'amend' ? 'up' : 'down';
            switch (this.transitionHint) {
                case 'amend':
                    if (this.state.lastCommit) {
                        amendingCommits.push(this.state.lastCommit);

                        const serializedState = JSON.stringify({
                            amendingHeadCommitSha: amendingCommits[0].commit.id,
                            latestCommitSha: nextCommit ? nextCommit.commit.id : undefined
                        });
                        this.props.storageService.setData<string | undefined>(storageKey, serializedState);
                    }
                    break;
                case 'unamend':
                    amendingCommits.pop();
                    if (amendingCommits.length === 0) {
                        this.props.storageService.setData<string | undefined>(storageKey, undefined);
                    } else {
                        const serializedState = JSON.stringify({
                            amendingHeadCommitSha: amendingCommits[0].commit.id,
                            latestCommitSha: nextCommit ? nextCommit.commit.id : undefined
                        });
                        this.props.storageService.setData<string | undefined>(storageKey, serializedState);
                    }
                    break;
            }

            if (this.state.lastCommit && nextCommit) {
                const transitionData = { direction, previousLastCommit: this.state.lastCommit };
                this.setState({ lastCommit: nextCommit, amendingCommits, transition: { ...transitionData, state: 'start' } });
                this.onNextFrame(() => {
                    this.setState({ transition: { ...transitionData, state: 'transitioning' } });
                });

                setTimeout(
                    () => {
                        this.setState({ transition: { state: 'none' } });
                    },
                    TRANSITION_TIME_MS);
            } else {
                // No previous last commit so no transition
                this.setState({ transition: { state: 'none' }, amendingCommits, lastCommit: nextCommit });
            }
        }

        this.transitionHint = 'none';
    }

    private async clearAmendingCommits(): Promise<void> {
        const storageKey = this.getStorageKey();
        await this.props.storageService.setData<string | undefined>(storageKey, undefined);
    }

    private async buildAmendingList(lastCommit: ScmCommit | undefined): Promise<{ commit: ScmCommit, avatar: string }[]> {
        const storageKey = this.getStorageKey();
        const storedState = await this.props.storageService.getData<string | undefined>(storageKey, undefined);

        // Restore list of commits from saved amending head commit up through parents until the
        // current commit.  (If we don't reach the current commit, the repository has been changed in such
        // a way then unamending commits can no longer be done).
        if (storedState) {
            const { amendingHeadCommitSha, latestCommitSha } = JSON.parse(storedState);
            if (!this.commitsAreEqual(lastCommit, latestCommitSha)) {
                // The head commit in the repository has changed.  It is not the same commit that was the
                // head commit after the last 'amend'.
                return [];
            }
            const commits = await this.props.scmAmendSupport.getInitialAmendingCommits(amendingHeadCommitSha, lastCommit ? lastCommit.id : undefined);

            const amendingCommitPromises = commits.map(async commit => {
                const avatar = await this.props.avatarService.getAvatar(commit.authorEmail);
                return { commit, avatar };
            });
            return Promise.all(amendingCommitPromises);
        } else {
            return [];
        }
    }

    private getStorageKey(): string {
        return REPOSITORY_STORAGE_KEY + ':' + this.props.repository.provider.rootUri;
    }

    /**
     * Commits are equal if the ids are equal or if both are undefined.
     * (If a commit is undefined, it represents the initial empty state of a repository,
     * before the initial commit).
     */
    private commitsAreEqual(lastCommit: ScmCommit | undefined, savedLastCommitId: string | undefined): boolean {
        return lastCommit
            ? lastCommit.id === savedLastCommitId
            : savedLastCommitId === undefined;
    }

    /**
     * This function will update the 'model' (lastCommit, amendingCommits) only
     * when the repository sees the last commit change.
     * 'render' can be called at any time, so be sure we don't update any 'model'
     * fields until we actually start the transition.
     */
    protected amend = async (): Promise<void> => {
        if (this.state.transition.state !== 'none' && this.transitionHint !== 'none') {
            return;
        }

        this.transitionHint = 'amend';
        await this.resetAndSetMessage('HEAD~', 'HEAD');
    };

    protected unamend = async (): Promise<void> => {
        if (this.state.transition.state !== 'none' && this.transitionHint !== 'none') {
            return;
        }

        const commitToRestore = (this.state.amendingCommits.length >= 1)
            ? this.state.amendingCommits[this.state.amendingCommits.length - 1]
            : undefined;
        const oldestAmendCommit = (this.state.amendingCommits.length >= 2)
            ? this.state.amendingCommits[this.state.amendingCommits.length - 2]
            : undefined;

        if (commitToRestore) {
            const commitToUseForMessage = oldestAmendCommit
                ? oldestAmendCommit.commit.id
                : undefined;
            this.transitionHint = 'unamend';
            await this.resetAndSetMessage(commitToRestore.commit.id, commitToUseForMessage);
        }
    };

    private async resetAndSetMessage(commitToRestore: string, commitToUseForMessage: string | undefined): Promise<void> {
        const message = commitToUseForMessage
            ? await this.props.scmAmendSupport.getMessage(commitToUseForMessage)
            : '';
        await this.props.scmAmendSupport.reset(commitToRestore);
        this.props.setCommitMessage(message);
    }

    render(): JSX.Element {
        const neverShrink = this.state.amendingCommits.length <= 3;

        const style: React.CSSProperties = neverShrink
            ? {
                ...this.props.style,
                flexShrink: 0,
            }
            : {
                ...this.props.style,
                flexShrink: 1,
                minHeight: 240   // height with three commits
            };

        return (
            <div className={ScmAmendComponent.Styles.COMMIT_CONTAINER + ' no-select'} style={style}>
                {
                    this.state.amendingCommits.length > 0 || (this.state.lastCommit && this.state.transition.state !== 'none' && this.state.transition.direction === 'down')
                        ? this.renderAmendingCommits()
                        : ''
                }
                {
                    this.state.lastCommit ?
                        <div>
                            <div id='lastCommit' className='theia-scm-amend'>
                                <div className='theia-header scm-theia-header'>
                                    HEAD Commit
                                </div>
                                {this.renderLastCommit()}
                            </div>
                        </div>
                        : ''
                }
            </div>
        );
    }

    protected async getLastCommit(): Promise<{ commit: ScmCommit, avatar: string } | undefined> {
        const commit = await this.props.scmAmendSupport.getLastCommit();
        if (commit) {
            const avatar = await this.props.avatarService.getAvatar(commit.authorEmail);
            return { commit, avatar };
        }
        return undefined;
    }

    protected renderAmendingCommits(): React.ReactNode {
        const neverShrink = this.state.amendingCommits.length <= 3;

        const style: React.CSSProperties = neverShrink
            ? {
                flexShrink: 0,
            }
            : {
                flexShrink: 1,
                // parent minHeight controls height, we just need any value smaller than
                // what the height would be when the parent is at its minHeight
                minHeight: 0
            };

        return <div id='amendedCommits' className='theia-scm-amend-outer-container' style={style}>
            <div className='theia-header scm-theia-header'>
                <div className='noWrapInfo'>Commits being Amended</div>
                {this.renderAmendCommitListButtons()}
                {this.renderCommitCount(this.state.amendingCommits.length)}
            </div>
            <div style={this.styleAmendedCommits()}>
                {this.state.amendingCommits.map((commitData, index, array) =>
                    this.renderCommitBeingAmended(commitData, index === array.length - 1)
                )}
                {
                    this.state.lastCommit && this.state.transition.state !== 'none' && this.state.transition.direction === 'down'
                        ? this.renderCommitBeingAmended(this.state.lastCommit, false)
                        : ''
                }
            </div>
        </div>;
    }

    protected renderAmendCommitListButtons(): React.ReactNode {
        return <div className='theia-scm-inline-actions-container'>
            <div className='theia-scm-inline-actions'>
                <div className='theia-scm-inline-action'>
                    <a className='fa fa-minus' title='Unamend All Commits' onClick={this.unamendAll} />
                </div>
                <div className='theia-scm-inline-action' >
                    <a className='fa fa-times' title='Clear Amending Commits' onClick={this.clearAmending} />
                </div>
            </div>
        </div>;
    }

    protected renderLastCommit(): React.ReactNode {
        if (!this.state.lastCommit) {
            return '';
        }

        const canAmend: boolean = true;
        return <div className={ScmAmendComponent.Styles.COMMIT_AND_BUTTON} style={{ flexGrow: 0, flexShrink: 0 }} key={this.state.lastCommit.commit.id}>
            {this.renderLastCommitNoButton(this.state.lastCommit)}
            {
                canAmend
                    ? <div className={ScmAmendComponent.Styles.FLEX_CENTER}>
                        <button className='theia-button' title='Amend last commit' onClick={this.amend}>
                            Amend
                        </button>
                    </div>
                    : ''
            }
        </div>;
    }

    protected renderLastCommitNoButton(lastCommit: { commit: ScmCommit, avatar: string }): React.ReactNode {
        switch (this.state.transition.state) {
            case 'none':
                return <div ref={this.lastCommitScrollRef} className='theia-scm-scrolling-container'>
                    {this.renderCommitAvatarAndDetail(lastCommit)}
                </div>;

            case 'start':
            case 'transitioning':
                switch (this.state.transition.direction) {
                    case 'up':
                        return <div style={this.styleLastCommitMovingUp(this.state.transition.state)}>
                            {this.renderCommitAvatarAndDetail(this.state.transition.previousLastCommit)}
                            {this.renderCommitAvatarAndDetail(lastCommit)}
                        </div>;
                    case 'down':
                        return <div style={this.styleLastCommitMovingDown(this.state.transition.state)}>
                            {this.renderCommitAvatarAndDetail(lastCommit)}
                            {this.renderCommitAvatarAndDetail(this.state.transition.previousLastCommit)}
                        </div>;
                }
        }
    }

    /**
     * See https://stackoverflow.com/questions/26556436/react-after-render-code
     *
     * @param callback
     */
    protected onNextFrame(callback: FrameRequestCallback): void {
        setTimeout(
            () => window.requestAnimationFrame(callback),
            0);
    }

    protected renderCommitAvatarAndDetail(commitData: { commit: ScmCommit, avatar: string }): React.ReactNode {
        const { commit, avatar } = commitData;
        return <div className={ScmAmendComponent.Styles.COMMIT_AVATAR_AND_TEXT} key={commit.id}>
            <div className={ScmAmendComponent.Styles.COMMIT_MESSAGE_AVATAR}>
                <img src={avatar} />
            </div>
            <div className={ScmAmendComponent.Styles.COMMIT_DETAILS}>
                <div className={ScmAmendComponent.Styles.COMMIT_MESSAGE_SUMMARY}>{commit.summary}</div>
                <div className={ScmAmendComponent.Styles.LAST_COMMIT_MESSAGE_TIME}>{`${commit.authorDateRelative} by ${commit.authorName}`}</div>
            </div>
        </div>;
    }

    protected renderCommitCount(commits: number): React.ReactNode {
        return <div className='notification-count-container scm-change-count'>
            <span className='notification-count'>{commits}</span>
        </div>;
    }

    protected renderCommitBeingAmended(commitData: { commit: ScmCommit, avatar: string }, isOldestAmendCommit: boolean): JSX.Element {
        if (isOldestAmendCommit && this.state.transition.state !== 'none' && this.state.transition.direction === 'up') {
            return <div className={ScmAmendComponent.Styles.COMMIT_AVATAR_AND_TEXT} style={{ flexGrow: 0, flexShrink: 0 }} key={commitData.commit.id}>
                <div className='fixed-height-commit-container'>
                    {this.renderCommitAvatarAndDetail(commitData)}
                </div>
            </div>;
        } else {
            return <div className={ScmAmendComponent.Styles.COMMIT_AVATAR_AND_TEXT} style={{ flexGrow: 0, flexShrink: 0 }} key={commitData.commit.id}>
                {this.renderCommitAvatarAndDetail(commitData)}
                {
                    isOldestAmendCommit
                        ? <div className={ScmAmendComponent.Styles.FLEX_CENTER}>
                            <button className='theia-button' title='Unamend commit' onClick={this.unamend}>
                                Unamend
                            </button>
                        </div>
                        : ''
                }
            </div>;
        }
    }

    /*
     * The style for the <div> containing the list of commits being amended.
     * This div is scrollable.
     */
    protected styleAmendedCommits(): React.CSSProperties {
        const base = {
            display: 'flex',
            whitespace: 'nowrap',
            width: '100%',
            minHeight: 0,
            flexShrink: 1,
            paddingTop: '2px',
        };

        switch (this.state.transition.state) {
            case 'none':
                return {
                    ...base,
                    flexDirection: 'column',
                    overflowY: 'auto',
                    marginBottom: '0',
                };
            case 'start':
            case 'transitioning':
                let startingMargin: number = 0;
                let endingMargin: number = 0;
                switch (this.state.transition.direction) {
                    case 'down':
                        startingMargin = 0;
                        endingMargin = -32;
                        break;
                    case 'up':
                        startingMargin = -32;
                        endingMargin = 0;
                        break;
                }

                switch (this.state.transition.state) {
                    case 'start':
                        return {
                            ...base,
                            flexDirection: 'column',
                            overflowY: 'hidden',
                            marginBottom: `${startingMargin}px`,
                        };
                    case 'transitioning':
                        return {
                            ...base,
                            flexDirection: 'column',
                            overflowY: 'hidden',
                            marginBottom: `${endingMargin}px`,
                            transitionProperty: 'margin-bottom',
                            transitionDuration: `${TRANSITION_TIME_MS}ms`,
                            transitionTimingFunction: 'linear'
                        };
                }
        }
    }

    protected styleLastCommitMovingUp(transitionState: 'start' | 'transitioning'): React.CSSProperties {
        return this.styleLastCommit(transitionState, 0, -28);
    }

    protected styleLastCommitMovingDown(transitionState: 'start' | 'transitioning'): React.CSSProperties {
        return this.styleLastCommit(transitionState, -28, 0);
    }

    protected styleLastCommit(transitionState: 'start' | 'transitioning', startingMarginTop: number, startingMarginBottom: number): React.CSSProperties {
        const base = {
            display: 'flex',
            width: '100%',
            overflow: 'hidden',
            paddingTop: 0,
            paddingBottom: 0,
            borderTop: 0,
            borderBottom: 0,
            height: this.lastCommitHeight * 2
        };

        // We end with top and bottom margins switched
        const endingMarginTop = startingMarginBottom;
        const endingMarginBottom = startingMarginTop;

        switch (transitionState) {
            case 'start':
                return {
                    ...base,
                    position: 'relative',
                    flexDirection: 'column',
                    marginTop: startingMarginTop,
                    marginBottom: startingMarginBottom,
                };
            case 'transitioning':
                return {
                    ...base,
                    position: 'relative',
                    flexDirection: 'column',
                    marginTop: endingMarginTop,
                    marginBottom: endingMarginBottom,
                    transitionProperty: 'margin-top margin-bottom',
                    transitionDuration: `${TRANSITION_TIME_MS}ms`,
                    transitionTimingFunction: 'linear'
                };
        }
    }

    readonly unamendAll = () => this.doUnamendAll();
    protected async doUnamendAll(): Promise<void> {
        while (this.state.amendingCommits.length > 0) {
            this.unamend();
            await new Promise(resolve => setTimeout(resolve, TRANSITION_TIME_MS));
        }
    }

    readonly clearAmending = () => this.doClearAmending();
    protected async doClearAmending(): Promise<void> {
        await this.clearAmendingCommits();
        this.setState({ amendingCommits: [] });
    }
}

export namespace ScmAmendComponent {

    export namespace Styles {
        export const COMMIT_CONTAINER = 'theia-scm-commit-container';
        export const COMMIT_AND_BUTTON = 'theia-scm-commit-and-button';
        export const COMMIT_AVATAR_AND_TEXT = 'theia-scm-commit-avatar-and-text';
        export const COMMIT_DETAILS = 'theia-scm-commit-details';
        export const COMMIT_MESSAGE_AVATAR = 'theia-scm-commit-message-avatar';
        export const COMMIT_MESSAGE_SUMMARY = 'theia-scm-commit-message-summary';
        export const LAST_COMMIT_MESSAGE_TIME = 'theia-scm-commit-message-time';

        export const FLEX_CENTER = 'theia-scm-flex-container-center';
    }

}
