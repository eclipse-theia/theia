// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ChatChangeEvent, ChatModel, ChatRequestModel } from '@theia/ai-chat/lib/common';
import { DisposableCollection, Emitter, Event } from '@theia/core';
import { codicon, ReactWidget } from '@theia/core/lib/browser';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import '../../../src/browser/style/chat-find.css';
import { ChatFindMatch, ChatFindMatcher, ChatFindOptions } from './chat-find-matcher';

export interface ChatFindState {
    regexp: RegExp | undefined;
    matches: ChatFindMatch[];
    current: ChatFindMatch | undefined;
}

/**
 * The find bar of a chat view: owns query, options, matches and the current match, and tracks the
 * chat model so matches follow streamed responses. Reveal and highlighting are done by the host
 * (the chat tree widget) via {@link onDidRequestReveal} and {@link onDidChangeState}.
 */
@injectable()
export class ChatFindWidget extends ReactWidget {

    static readonly ID = 'chat-find-widget';
    protected static readonly RECOMPUTE_DELAY_MS = 100;

    @inject(ChatFindMatcher)
    protected matcher: ChatFindMatcher;

    @inject(ContextKeyService)
    protected contextKeyService: ContextKeyService;

    protected readonly onDidChangeStateEmitter = new Emitter<ChatFindState>();
    readonly onDidChangeState: Event<ChatFindState> = this.onDidChangeStateEmitter.event;

    protected readonly onDidRequestRevealEmitter = new Emitter<ChatFindMatch>();
    readonly onDidRequestReveal: Event<ChatFindMatch> = this.onDidRequestRevealEmitter.event;

    /** Focused when the bar closes and the previously focused element is gone. */
    fallbackFocusTarget: HTMLElement | undefined;

    protected visibleKey: ContextKey<boolean>;
    protected query = '';
    protected options: ChatFindOptions = { matchCase: false, wholeWord: false, useRegex: false };
    protected regexp: RegExp | undefined;
    protected matches: ChatFindMatch[] = [];
    protected currentIndex = -1;
    protected chatModel: ChatModel | undefined;
    protected nodeOrder = new Map<string, number>();
    protected readonly toDisposeOnModelChange = new DisposableCollection();
    protected recomputeTimeout: ReturnType<typeof setTimeout> | undefined;
    protected previouslyFocused: HTMLElement | undefined;
    protected input: HTMLInputElement | undefined;
    protected pendingFocus = false;

    @postConstruct()
    protected init(): void {
        this.id = ChatFindWidget.ID;
        this.addClass('theia-chat-find-widget');
        this.visibleKey = this.contextKeyService.createKey<boolean>('chatFindVisible', false);
        // No perfect-scrollbar: its `.ps { overflow: hidden }` would clip the bar, which overflows this zero-height host.
        this.scrollOptions = undefined;
        this.toDispose.pushAll([this.onDidChangeStateEmitter, this.onDidRequestRevealEmitter, this.toDisposeOnModelChange]);
        this.hide();
        this.update();
    }

    override dispose(): void {
        if (this.recomputeTimeout !== undefined) {
            clearTimeout(this.recomputeTimeout);
            this.recomputeTimeout = undefined;
        }
        super.dispose();
    }

    get isOpen(): boolean {
        return !this.isHidden;
    }

    get state(): ChatFindState {
        return { regexp: this.regexp, matches: this.matches, current: this.currentMatch };
    }

    get currentMatch(): ChatFindMatch | undefined {
        return this.matches[this.currentIndex];
    }

    /**
     * Whether there is anything to search. A session without requests renders the welcome screen (which hosts
     * the session list), so the find bar has nothing to search and stays closed there.
     */
    get canFind(): boolean {
        return this.chatModel !== undefined && !this.chatModel.isEmpty();
    }

    /** Track a chat model; query and options are kept, the position resets. */
    setChatModel(model: ChatModel | undefined): void {
        this.toDisposeOnModelChange.dispose();
        this.chatModel = model;
        this.currentIndex = -1;
        if (model) {
            this.toDisposeOnModelChange.push(model.onDidChange(event => this.handleModelChange(event)));
            model.getRequests().forEach(request => this.trackResponse(request));
        }
        this.recompute(false);
        this.closeWhenNothingToFind();
    }

    open(): void {
        if (!this.canFind) {
            return;
        }
        const active = document.activeElement;
        if (!this.isOpen && active instanceof HTMLElement && !this.node.contains(active)) {
            this.previouslyFocused = active;
        }
        this.show();
        this.visibleKey.set(true);
        this.recompute(false);
        this.focusInput();
    }

    dismiss(): void {
        if (!this.isOpen) {
            return;
        }
        this.hide();
        this.visibleKey.set(false);
        this.onDidChangeStateEmitter.fire({ regexp: undefined, matches: [], current: undefined });
        const target = this.previouslyFocused?.isConnected ? this.previouslyFocused : this.fallbackFocusTarget;
        this.previouslyFocused = undefined;
        target?.focus();
    }

    setQuery(query: string): void {
        if (query === this.query) {
            return;
        }
        this.query = query;
        this.recompute(true);
        this.revealCurrent();
    }

    toggleOption(option: keyof ChatFindOptions): void {
        this.options = { ...this.options, [option]: !this.options[option] };
        this.recompute(true);
        this.revealCurrent();
    }

    next(): void {
        this.step(1);
    }

    previous(): void {
        this.step(-1);
    }

    protected step(delta: number): void {
        if (this.matches.length === 0) {
            return;
        }
        this.currentIndex = (this.currentIndex + delta + this.matches.length) % this.matches.length;
        this.update();
        this.fireStateIfOpen();
        this.revealCurrent();
    }

    protected revealCurrent(): void {
        const current = this.currentMatch;
        if (current) {
            this.onDidRequestRevealEmitter.fire(current);
        }
    }

    protected handleModelChange(event: ChatChangeEvent): void {
        if (event.kind === 'addRequest') {
            this.trackResponse(event.request);
        }
        this.scheduleRecompute();
    }

    protected trackResponse(request: ChatRequestModel): void {
        if (!request.response.isComplete) {
            this.toDisposeOnModelChange.push(request.response.onDidChange(() => this.scheduleRecompute()));
        }
    }

    protected scheduleRecompute(): void {
        if (this.recomputeTimeout !== undefined) {
            return;
        }
        this.recomputeTimeout = setTimeout(() => {
            this.recomputeTimeout = undefined;
            this.recompute(false);
        }, ChatFindWidget.RECOMPUTE_DELAY_MS);
    }

    /**
     * Recompute matches. The current match is kept by identity when it still exists; otherwise (or when
     * `moveToNearest` is set after a query change) the first match at or after the previous position becomes current.
     */
    protected recompute(moveToNearest: boolean): void {
        const previous = this.currentMatch;
        this.regexp = this.matcher.createRegExp(this.query, this.options);
        this.nodeOrder = this.computeNodeOrder();
        this.matches = this.chatModel && this.regexp ? this.matcher.findMatches(this.chatModel, this.regexp) : [];
        this.currentIndex = this.pickCurrentIndex(previous, moveToNearest);
        this.update();
        this.fireStateIfOpen();
        this.closeWhenNothingToFind();
    }

    /** Closes the bar once the tracked session has no requests left to search. */
    protected closeWhenNothingToFind(): void {
        if (this.isOpen && !this.canFind) {
            this.dismiss();
        }
    }

    protected fireStateIfOpen(): void {
        if (this.isOpen) {
            this.onDidChangeStateEmitter.fire(this.state);
        }
    }

    protected computeNodeOrder(): Map<string, number> {
        const order = new Map<string, number>();
        this.chatModel?.getRequests().forEach((request, index) => {
            order.set(request.id, 2 * index);
            order.set(request.response.id, 2 * index + 1);
        });
        return order;
    }

    protected pickCurrentIndex(previous: ChatFindMatch | undefined, moveToNearest: boolean): number {
        if (this.matches.length === 0) {
            return -1;
        }
        if (!previous) {
            return 0;
        }
        if (!moveToNearest) {
            const key = ChatFindMatch.key(previous);
            const same = this.matches.findIndex(match => ChatFindMatch.key(match) === key);
            if (same >= 0) {
                return same;
            }
        }
        const nearest = this.matches.findIndex(match => this.compare(match, previous) >= 0);
        return nearest >= 0 ? nearest : 0;
    }

    /** Document order of two matches: row order, then content index, then offset. */
    protected compare(a: ChatFindMatch, b: ChatFindMatch): number {
        const rowA = this.nodeOrder.get(a.nodeId) ?? -1;
        const rowB = this.nodeOrder.get(b.nodeId) ?? -1;
        if (rowA !== rowB) {
            return rowA - rowB;
        }
        const contentA = a.contentIndex ?? -1;
        const contentB = b.contentIndex ?? -1;
        if (contentA !== contentB) {
            return contentA - contentB;
        }
        return a.start - b.start;
    }

    protected focusInput(): void {
        if (this.input) {
            this.input.focus();
            this.input.select();
        } else {
            this.pendingFocus = true;
        }
    }

    protected setInput = (input: HTMLInputElement | null): void => {
        this.input = input ?? undefined;
        if (input && this.pendingFocus) {
            this.pendingFocus = false;
            input.focus();
            input.select();
        }
    };

    protected handleInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        this.setQuery(event.target.value);
    };

    protected handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            if (event.shiftKey) {
                this.previous();
            } else {
                this.next();
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.dismiss();
        }
    };

    protected handleToggleClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
        const option = event.currentTarget.dataset.option as keyof ChatFindOptions | undefined;
        if (option) {
            this.toggleOption(option);
            this.input?.focus();
        }
    };

    protected handlePreviousClick = (): void => {
        this.previous();
        this.input?.focus();
    };

    protected handleNextClick = (): void => {
        this.next();
        this.input?.focus();
    };

    protected handleCloseClick = (): void => {
        this.dismiss();
    };

    protected render(): React.ReactNode {
        const hasQuery = this.query.length > 0;
        const count = this.matches.length;
        const noResults = hasQuery && count === 0;
        const label = !hasQuery ? '' : noResults
            ? nls.localizeByDefault('No results')
            : nls.localizeByDefault('{0} of {1}', this.currentIndex + 1, count);
        return <div className='theia-chat-find-bar' role='search'>
            <div className={`theia-chat-find-input-box${noResults ? ' no-results' : ''}`}>
                <input
                    ref={this.setInput}
                    type='text'
                    spellCheck={false}
                    defaultValue={this.query}
                    placeholder={nls.localizeByDefault('Find')}
                    title={nls.localizeByDefault('Find')}
                    aria-label={nls.localizeByDefault('Find')}
                    onChange={this.handleInputChange}
                    onKeyDown={this.handleInputKeyDown}
                />
                {this.renderToggle('matchCase', 'case-sensitive', nls.localizeByDefault('Match Case'))}
                {this.renderToggle('wholeWord', 'whole-word', nls.localizeByDefault('Match Whole Word'))}
                {this.renderToggle('useRegex', 'regex', nls.localizeByDefault('Use Regular Expression'))}
            </div>
            <span className={`theia-chat-find-count${noResults ? ' no-results' : ''}`} aria-live='polite'>{label}</span>
            <button
                className={'theia-chat-find-button ' + codicon('arrow-up')}
                title={nls.localizeByDefault('Previous Match')}
                aria-label={nls.localizeByDefault('Previous Match')}
                disabled={count === 0}
                onClick={this.handlePreviousClick}
            />
            <button
                className={'theia-chat-find-button ' + codicon('arrow-down')}
                title={nls.localizeByDefault('Next Match')}
                aria-label={nls.localizeByDefault('Next Match')}
                disabled={count === 0}
                onClick={this.handleNextClick}
            />
            <button
                className={'theia-chat-find-button ' + codicon('close')}
                title={nls.localizeByDefault('Close')}
                aria-label={nls.localizeByDefault('Close')}
                onClick={this.handleCloseClick}
            />
        </div>;
    }

    protected renderToggle(option: keyof ChatFindOptions, icon: string, title: string): React.ReactNode {
        const enabled = this.options[option];
        return <button
            key={option}
            data-option={option}
            className={`theia-chat-find-toggle ${codicon(icon)}${enabled ? ' enabled' : ''}`}
            title={title}
            aria-label={title}
            aria-pressed={enabled}
            onClick={this.handleToggleClick}
        />;
    }
}
