/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
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
import { MonacoEditorZoneWidget } from '@theia/monaco/lib/browser/monaco-editor-zone-widget';
import {
    Comment,
    CommentMode,
    CommentThread,
    CommentThreadCollapsibleState
} from '../../../common/plugin-api-rpc-model';
import { CommentGlyphWidget } from './comment-glyph-widget';
import { BaseWidget, DISABLED_CLASS } from '@theia/core/lib/browser';
import * as ReactDOM from '@theia/core/shared/react-dom';
import * as React from '@theia/core/shared/react';
import { MouseTargetType } from '@theia/editor/lib/browser';
import { CommentsService } from './comments-service';
import {
    ActionMenuNode,
    CommandRegistry,
    CompositeMenuNode,
    MenuModelRegistry,
    MenuPath
} from '@theia/core/lib/common';
import { CommentsContextKeyService } from './comments-context-key-service';
import { RefObject } from '@theia/core/shared/react';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/1.49.3/src/vs/workbench/contrib/comments/browser/commentThreadWidget.ts

export const COMMENT_THREAD_CONTEXT: MenuPath = ['comment_thread-context-menu'];
export const COMMENT_CONTEXT: MenuPath = ['comment-context-menu'];
export const COMMENT_TITLE: MenuPath = ['comment-title-menu'];

export class CommentThreadWidget extends BaseWidget {

    protected readonly zoneWidget: MonacoEditorZoneWidget;
    protected readonly commentGlyphWidget: CommentGlyphWidget;
    protected readonly contextMenu: CompositeMenuNode;
    protected readonly commentFormRef: RefObject<CommentForm> = React.createRef<CommentForm>();

    protected isExpanded?: boolean;

    constructor(
        editor: monaco.editor.IStandaloneCodeEditor,
        private _owner: string,
        private _commentThread: CommentThread,
        private commentService: CommentsService,
        protected readonly menus: MenuModelRegistry,
        protected readonly contextKeyService: CommentsContextKeyService,
        protected readonly commands: CommandRegistry
    ) {
        super();
        this.toDispose.push(this.zoneWidget = new MonacoEditorZoneWidget(editor));
        this.toDispose.push(this.commentGlyphWidget = new CommentGlyphWidget(editor));
        this.toDispose.push(this._commentThread.onDidChangeCollapsibleState(state => {
            if (state === CommentThreadCollapsibleState.Expanded && !this.isExpanded) {
                const lineNumber = this._commentThread.range.startLineNumber;

                this.display({ afterLineNumber: lineNumber, afterColumn: 1, heightInLines: 2 });
                return;
            }

            if (state === CommentThreadCollapsibleState.Collapsed && this.isExpanded) {
                this.hide();
                return;
            }
        }));
        this.contextKeyService.commentIsEmpty.set(true);
        this.toDispose.push(this.zoneWidget.editor.onMouseDown(e => this.onEditorMouseDown(e)));
        this.toDispose.push(this.contextKeyService.onDidChange(() => {
            const commentForm = this.commentFormRef.current;
            if (commentForm) {
                commentForm.update();
            }
        }));
        this.contextMenu = this.menus.getMenu(COMMENT_THREAD_CONTEXT);
        this.contextMenu.children.map(node => node instanceof ActionMenuNode && node.action.when).forEach(exp => {
            if (typeof exp === 'string') {
                this.contextKeyService.setExpression(exp);
            }
        });
    }

    public getGlyphPosition(): number {
        return this.commentGlyphWidget.getPosition();
    }

    public collapse(): void {
        this._commentThread.collapsibleState = CommentThreadCollapsibleState.Collapsed;
        if (this._commentThread.comments && this._commentThread.comments.length === 0) {
            this.deleteCommentThread();
        }

        this.hide();
    }

    private deleteCommentThread(): void {
        this.dispose();
        this.commentService.disposeCommentThread(this.owner, this._commentThread.threadId);
    }

    dispose(): void {
        super.dispose();
        if (this.commentGlyphWidget) {
            this.commentGlyphWidget.dispose();
        }
    }

    toggleExpand(lineNumber: number): void {
        if (this.isExpanded) {
            this._commentThread.collapsibleState = CommentThreadCollapsibleState.Collapsed;
            this.hide();
            if (!this._commentThread.comments || !this._commentThread.comments.length) {
                this.deleteCommentThread();
            }
        } else {
            this._commentThread.collapsibleState = CommentThreadCollapsibleState.Expanded;
            this.display({ afterLineNumber: lineNumber, afterColumn: 1, heightInLines: 2 });
        }
    }

    hide(): void {
        this.zoneWidget.hide();
        this.isExpanded = false;
        super.hide();
    }

    display(options: MonacoEditorZoneWidget.Options): void {
        this.isExpanded = true;
        if (this._commentThread.collapsibleState && this._commentThread.collapsibleState !== CommentThreadCollapsibleState.Expanded) {
            return;
        }
        this.commentGlyphWidget.setLineNumber(options.afterLineNumber);
        this._commentThread.collapsibleState = CommentThreadCollapsibleState.Expanded;
        this.zoneWidget.show(options);
        this.update();
    }

    private onEditorMouseDown(e: monaco.editor.IEditorMouseEvent): void {
        const range = e.target.range;

        if (!range) {
            return;
        }

        if (!e.event.leftButton) {
            return;
        }

        if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
            return;
        }

        const data = e.target.detail;
        const gutterOffsetX = data.offsetX - data.glyphMarginWidth - data.lineNumbersWidth - data.glyphMarginLeft;

        // don't collide with folding and git decorations
        if (gutterOffsetX > 14) {
            return;
        }

        const mouseDownInfo = { lineNumber: range.startLineNumber };

        const { lineNumber } = mouseDownInfo;

        if (!range || range.startLineNumber !== lineNumber) {
            return;
        }

        if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
            return;
        }

        if (!e.target.element) {
            return;
        }

        if (this.commentGlyphWidget && this.commentGlyphWidget.getPosition() !== lineNumber) {
            return;
        }

        if (e.target.element.className.indexOf('comment-thread') >= 0) {
            this.toggleExpand(lineNumber);
            return;
        }

        if (this._commentThread.collapsibleState === CommentThreadCollapsibleState.Collapsed) {
            this.display({ afterLineNumber: mouseDownInfo.lineNumber, heightInLines: 2 });
        } else {
            this.hide();
        }
    }

    public get owner(): string {
        return this._owner;
    }

    public get commentThread(): CommentThread {
        return this._commentThread;
    }

    private getThreadLabel(): string {
        let label: string | undefined;
        label = this._commentThread.label;

        if (label === undefined) {
            if (this._commentThread.comments && this._commentThread.comments.length) {
                const onlyUnique = (value: Comment, index: number, self: Comment[]) => self.indexOf(value) === index;
                const participantsList = this._commentThread.comments.filter(onlyUnique).map(comment => `@${comment.userName}`).join(', ');
                label = `Participants: ${participantsList}`;
            } else {
                label = 'Start discussion';
            }
        }

        return label;
    }

    update(): void {
        if (!this.isExpanded) {
            return;
        }
        this.render();
        const headHeight = Math.ceil(this.zoneWidget.editor.getOption(monaco.editor.EditorOption.lineHeight) * 1.2);
        const lineHeight = this.zoneWidget.editor.getOption(monaco.editor.EditorOption.lineHeight);
        const arrowHeight = Math.round(lineHeight / 3);
        const frameThickness = Math.round(lineHeight / 9) * 2;
        const body = this.zoneWidget.containerNode.getElementsByClassName('body')[0];

        const computedLinesNumber = Math.ceil((headHeight + body.clientHeight + arrowHeight + frameThickness + 8 /** margin bottom to avoid margin collapse */) / lineHeight);
        this.zoneWidget.show({ afterLineNumber: this._commentThread.range.startLineNumber, heightInLines: computedLinesNumber });
    }

    protected render(): void {
        const headHeight = Math.ceil(this.zoneWidget.editor.getOption(monaco.editor.EditorOption.lineHeight) * 1.2);
        ReactDOM.render(<div className={'review-widget'}>
            <div className={'head'} style={{ height: headHeight, lineHeight: `${headHeight}px` }}>
                <div className={'review-title'}>
                    <span className={'filename'}>{this.getThreadLabel()}</span>
                </div>
                <div className={'review-actions'}>
                    <div className={'monaco-action-bar animated'}>
                        <ul className={'actions-container'} role={'toolbar'}>
                            <li className={'action-item'} role={'presentation'}>
                                <a className={'action-label codicon expand-review-action codicon-chevron-up'}
                                    role={'button'}
                                    tabIndex={0}
                                    title={'Collapse'}
                                    onClick={() => this.collapse()}
                                />
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
            <div className={'body'}>
                <div className={'comments-container'} role={'presentation'} tabIndex={0}>
                    {this._commentThread.comments?.map((comment, index) => <ReviewComment
                        key={index}
                        contextKeyService={this.contextKeyService}
                        menus={this.menus}
                        comment={comment}
                        commentForm={this.commentFormRef}
                        commands={this.commands}
                        commentThread={this._commentThread}
                    />)}
                </div>
                <CommentForm contextKeyService={this.contextKeyService}
                    commands={this.commands}
                    commentThread={this._commentThread}
                    menus={this.menus}
                    widget={this}
                    ref={this.commentFormRef}
                />
            </div>
        </div>, this.zoneWidget.containerNode);
    }
}

namespace CommentForm {
    export interface Props {
        menus: MenuModelRegistry,
        commentThread: CommentThread;
        commands: CommandRegistry;
        contextKeyService: CommentsContextKeyService;
        widget: CommentThreadWidget;
    }

    export interface State {
        expanded: boolean
    }
}

export class CommentForm<P extends CommentForm.Props = CommentForm.Props> extends React.Component<P, CommentForm.State> {
    private readonly menu: CompositeMenuNode;
    private inputRef: RefObject<HTMLTextAreaElement> = React.createRef<HTMLTextAreaElement>();
    private inputValue: string = '';
    private readonly getInput = () => this.inputValue;
    private readonly clearInput: () => void = () => {
        const input = this.inputRef.current;
        if (input) {
            this.inputValue = '';
            input.value = this.inputValue;
            this.props.contextKeyService.commentIsEmpty.set(true);
        }
    };

    update(): void {
        this.setState(this.state);
    }

    protected expand = () => {
        this.setState({ expanded: true });
        // Wait for the widget to be rendered.
        setTimeout(() => {
            // Update the widget's height.
            this.props.widget.update();
            this.inputRef.current?.focus();
        }, 100);
    };
    protected collapse = () => {
        this.setState({ expanded: false });
        // Wait for the widget to be rendered.
        setTimeout(() => {
            // Update the widget's height.
            this.props.widget.update();
        }, 100);
    };

    componentDidMount(): void {
        // Wait for the widget to be rendered.
        setTimeout(() => {
            this.inputRef.current?.focus();
        }, 100);
    }

    private readonly onInput: (event: React.FormEvent) => void = (event: React.FormEvent) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const value = (event.target as any).value;
        if (this.inputValue.length === 0 || value.length === 0) {
            this.props.contextKeyService.commentIsEmpty.set(value.length === 0);
        }
        this.inputValue = value;
    };

    constructor(props: P) {
        super(props);
        this.state = {
            expanded: false
        };

        const setState = this.setState.bind(this);
        this.setState = newState => {
            setState(newState);
        };

        this.menu = this.props.menus.getMenu(COMMENT_THREAD_CONTEXT);
        this.menu.children.map(node => node instanceof ActionMenuNode && node.action.when).forEach(exp => {
            if (typeof exp === 'string') {
                this.props.contextKeyService.setExpression(exp);
            }
        });
    }

    render(): React.ReactNode {
        const { commands, commentThread, contextKeyService } = this.props;
        const hasExistingComments = commentThread.comments && commentThread.comments.length > 0;
        return <div className={'comment-form' + (this.state.expanded || commentThread.comments && commentThread.comments.length === 0 ? ' expand' : '')}>
            <div className={'theia-comments-input-message-container'}>
                <textarea className={'theia-comments-input-message theia-input'}
                    placeholder={hasExistingComments ? 'Reply...' : 'Type a new comment'}
                    onInput={this.onInput}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onBlur={(event: any) => {
                        if (event.target.value.length > 0) {
                            return;
                        }
                        if (event.relatedTarget && event.relatedTarget.className === 'comments-button comments-text-button theia-button') {
                            this.state = { expanded: false };
                            return;
                        }
                        this.collapse();
                    }}
                    ref={this.inputRef}>
                </textarea>
            </div>
            <CommentActions menu={this.menu}
                contextKeyService={contextKeyService}
                commands={commands}
                commentThread={commentThread}
                getInput={this.getInput}
                clearInput={this.clearInput}
            />
            <button className={'review-thread-reply-button'} title={'Reply...'} onClick={this.expand}>Reply...</button>
        </div>;
    }
}

namespace ReviewComment {
    export interface Props {
        menus: MenuModelRegistry,
        comment: Comment;
        commentThread: CommentThread;
        contextKeyService: CommentsContextKeyService;
        commands: CommandRegistry;
        commentForm: RefObject<CommentForm>;
    }

    export interface State {
        hover: boolean
    }
}

export class ReviewComment<P extends ReviewComment.Props = ReviewComment.Props> extends React.Component<P, ReviewComment.State> {

    constructor(props: P) {
        super(props);
        this.state = {
            hover: false
        };

        const setState = this.setState.bind(this);
        this.setState = newState => {
            setState(newState);
        };
    }

    protected detectHover = (element: HTMLElement | null) => {
        if (element) {
            window.requestAnimationFrame(() => {
                const hover = element.matches(':hover');
                this.setState({ hover });
            });
        }
    };

    protected showHover = () => this.setState({ hover: true });
    protected hideHover = () => this.setState({ hover: false });

    render(): React.ReactNode {
        const { comment, commentForm, contextKeyService, menus, commands, commentThread } = this.props;
        const commentUniqueId = comment.uniqueIdInThread;
        const { hover } = this.state;
        contextKeyService.comment.set(comment.contextValue);
        return <div className={'review-comment'}
            tabIndex={-1}
            aria-label={`${comment.userName}, ${comment.body.value}`}
            ref={this.detectHover}
            onMouseEnter={this.showHover}
            onMouseLeave={this.hideHover}>
            <div className={'avatar-container'}>
                <img className={'avatar'} src={comment.userIconPath} />
            </div>
            <div className={'review-comment-contents'}>
                <div className={'comment-title monaco-mouse-cursor-text'}>
                    <strong className={'author'}>{comment.userName}</strong>
                    <span className={'isPending'}>{comment.label}</span>
                    <div className={'theia-comments-inline-actions-container'}>
                        <div className={'theia-comments-inline-actions'} role={'toolbar'}>
                            {hover && menus.getMenu(COMMENT_TITLE).children.map((node, index) => node instanceof ActionMenuNode &&
                                <CommentsInlineAction key={index} {...{ node, commands, commentThread, commentUniqueId, contextKeyService }} />)}
                        </div>
                    </div>
                </div>
                <CommentBody value={comment.body.value}
                    isVisible={comment.mode === undefined || comment.mode === CommentMode.Preview} />
                <CommentEditContainer contextKeyService={contextKeyService}
                    menus={menus}
                    comment={comment}
                    commentThread={commentThread}
                    commentForm={commentForm}
                    commands={commands} />
            </div>
        </div>;
    }
}

namespace CommentBody {
    export interface Props {
        value: string
        isVisible: boolean
    }
}

export class CommentBody extends React.Component<CommentBody.Props> {
    render(): React.ReactNode {
        const { value, isVisible } = this.props;
        if (!isVisible) {
            return false;
        }
        return <div className={'comment-body monaco-mouse-cursor-text'}>
            <div>
                <p>{value}</p>
            </div>
        </div>;
    }
}

namespace CommentEditContainer {
    export interface Props {
        contextKeyService: CommentsContextKeyService
        menus: MenuModelRegistry,
        comment: Comment;
        commentThread: CommentThread;
        commentForm: RefObject<CommentForm>;
        commands: CommandRegistry;
    }
}

export class CommentEditContainer extends React.Component<CommentEditContainer.Props> {
    private readonly inputRef: RefObject<HTMLTextAreaElement> = React.createRef<HTMLTextAreaElement>();
    private dirtyCommentMode: CommentMode | undefined;
    private dirtyCommentFormState: boolean | undefined;

    componentDidUpdate(prevProps: Readonly<CommentEditContainer.Props>, prevState: Readonly<{}>): void {
        const commentFormState = this.props.commentForm.current?.state;
        const mode = this.props.comment.mode;
        if (this.dirtyCommentMode !== mode || (this.dirtyCommentFormState !== commentFormState?.expanded && !commentFormState?.expanded)) {
            const currentInput = this.inputRef.current;
            if (currentInput) {
                // Wait for the widget to be rendered.
                setTimeout(() => {
                    currentInput.focus();
                    currentInput.setSelectionRange(currentInput.value.length, currentInput.value.length);
                }, 50);
            }
        }
        this.dirtyCommentMode = mode;
        this.dirtyCommentFormState = commentFormState?.expanded;
    }

    render(): React.ReactNode {
        const { menus, comment, commands, commentThread, contextKeyService } = this.props;
        if (!(comment.mode === CommentMode.Editing)) {
            return false;
        }
        return <div className={'edit-container'}>
            <div className={'edit-textarea'}>
                <div className={'theia-comments-input-message-container'}>
                    <textarea className={'theia-comments-input-message theia-input'}
                        defaultValue={comment.body.value}
                        ref={this.inputRef} />
                </div>
            </div>
            <div className={'form-actions'}>
                {menus.getMenu(COMMENT_CONTEXT).children.map((node, index) => {
                    const onClick = () => {
                        commands.executeCommand(node.id, {
                            thread: commentThread,
                            commentUniqueId: comment.uniqueIdInThread,
                            text: this.inputRef.current ? this.inputRef.current.value : ''
                        });
                    };
                    return node instanceof ActionMenuNode &&
                        <CommentAction key={index} {...{ node, commands, onClick, contextKeyService }} />;
                }
                )}
            </div>
        </div>;
    }
}

namespace CommentsInlineAction {
    export interface Props {
        node: ActionMenuNode;
        commentThread: CommentThread;
        commentUniqueId: number;
        commands: CommandRegistry;
        contextKeyService: CommentsContextKeyService;
    }
}

export class CommentsInlineAction extends React.Component<CommentsInlineAction.Props> {
    render(): React.ReactNode {
        const { node, commands, contextKeyService, commentThread, commentUniqueId } = this.props;
        if (node.action.when && !contextKeyService.match(node.action.when)) {
            return false;
        }
        return <div className='theia-comments-inline-action'>
            <a className={node.icon}
                title={node.label}
                onClick={() => {
                    commands.executeCommand(node.id, {
                        thread: commentThread,
                        commentUniqueId
                    });
                }} />
        </div>;
    }
}

namespace CommentActions {
    export interface Props {
        contextKeyService: CommentsContextKeyService;
        commands: CommandRegistry;
        menu: CompositeMenuNode;
        commentThread: CommentThread;
        getInput: () => string;
        clearInput: () => void;
    }
}

export class CommentActions extends React.Component<CommentActions.Props> {
    render(): React.ReactNode {
        const { contextKeyService, commands, menu, commentThread, getInput, clearInput } = this.props;
        return <div className={'form-actions'}>
            {menu.children.map((node, index) => node instanceof ActionMenuNode &&
                <CommentAction key={index}
                    commands={commands}
                    node={node}
                    onClick={() => {
                        commands.executeCommand(node.id, {
                            thread: commentThread,
                            text: getInput()
                        });
                        clearInput();
                    }}
                    contextKeyService={contextKeyService}
                />)}
        </div>;
    }
}
namespace CommentAction {
    export interface Props {
        contextKeyService: CommentsContextKeyService;
        commands: CommandRegistry;
        node: ActionMenuNode;
        onClick: () => void;
    }
}

export class CommentAction extends React.Component<CommentAction.Props> {
    render(): React.ReactNode {
        const classNames = ['comments-button', 'comments-text-button', 'theia-button'];
        const { node, commands, contextKeyService, onClick } = this.props;
        if (node.action.when && !contextKeyService.match(node.action.when)) {
            return false;
        }
        const isEnabled = commands.isEnabled(node.action.commandId);
        if (!isEnabled) {
            classNames.push(DISABLED_CLASS);
        }
        return <button
            className={classNames.join(' ')}
            tabIndex={0}
            role={'button'}
            onClick={() => {
                if (isEnabled) {
                    onClick();
                }
            }}>{node.label}
        </button>;
    }
}
