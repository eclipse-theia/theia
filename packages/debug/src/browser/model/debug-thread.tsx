/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import * as React from '@theia/core/shared/react';
import { CancellationTokenSource, Emitter, Event } from '@theia/core';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { TreeElement } from '@theia/core/lib/browser/source-tree';
import { DebugStackFrame } from './debug-stack-frame';
import { DebugSession } from '../debug-session';

export type StoppedDetails = DebugProtocol.StoppedEvent['body'] & {
    framesErrorMessage?: string
    totalFrames?: number
};

export class DebugThreadData {
    readonly raw: DebugProtocol.Thread;
    readonly stoppedDetails: StoppedDetails | undefined;
}

export interface DebugExceptionInfo {
    id?: string
    description?: string
    details?: DebugProtocol.ExceptionDetails
}

export class DebugThread extends DebugThreadData implements TreeElement {

    protected readonly onDidChangedEmitter = new Emitter<void>();
    readonly onDidChanged: Event<void> = this.onDidChangedEmitter.event;

    constructor(
        readonly session: DebugSession
    ) {
        super();
    }

    get id(): string {
        return this.session.id + ':' + this.raw.id;
    }

    protected _currentFrame: DebugStackFrame | undefined;
    get currentFrame(): DebugStackFrame | undefined {
        return this._currentFrame;
    }
    set currentFrame(frame: DebugStackFrame | undefined) {
        this._currentFrame = frame;
        this.onDidChangedEmitter.fire(undefined);
    }

    get stopped(): boolean {
        return !!this.stoppedDetails;
    }

    update(data: Partial<DebugThreadData>): void {
        Object.assign(this, data);
        if ('stoppedDetails' in data) {
            this.clearFrames();
        }
    }

    clear(): void {
        this.update({
            raw: this.raw,
            stoppedDetails: undefined
        });
    }

    continue(): Promise<DebugProtocol.ContinueResponse> {
        return this.session.sendRequest('continue', this.toArgs());
    }

    stepOver(): Promise<DebugProtocol.NextResponse> {
        return this.session.sendRequest('next', this.toArgs());
    }

    stepIn(): Promise<DebugProtocol.StepInResponse> {
        return this.session.sendRequest('stepIn', this.toArgs());
    }

    stepOut(): Promise<DebugProtocol.StepOutResponse> {
        return this.session.sendRequest('stepOut', this.toArgs());
    }

    pause(): Promise<DebugProtocol.PauseResponse> {
        return this.session.sendRequest('pause', this.toArgs());
    }

    async getExceptionInfo(): Promise<DebugExceptionInfo | undefined> {
        if (this.stoppedDetails && this.stoppedDetails.reason === 'exception') {
            if (this.session.capabilities.supportsExceptionInfoRequest) {
                const response = await this.session.sendRequest('exceptionInfo', this.toArgs());
                return {
                    id: response.body.exceptionId,
                    description: response.body.description,
                    details: response.body.details
                };
            }
            return {
                description: this.stoppedDetails.text
            };
        }
        return undefined;
    }

    get supportsTerminate(): boolean {
        return !!this.session.capabilities.supportsTerminateThreadsRequest;
    }

    async terminate(): Promise<void> {
        if (this.supportsTerminate) {
            await this.session.sendRequest('terminateThreads', {
                threadIds: [this.raw.id]
            });
        }
    }

    protected readonly _frames = new Map<number, DebugStackFrame>();
    get frames(): IterableIterator<DebugStackFrame> {
        return this._frames.values();
    }
    get topFrame(): DebugStackFrame | undefined {
        return this.frames.next().value;
    }
    get frameCount(): number {
        return this._frames.size;
    }

    protected pendingFetch = Promise.resolve<DebugStackFrame[]>([]);
    protected _pendingFetchCount: number = 0;
    protected pendingFetchCancel = new CancellationTokenSource();
    async fetchFrames(levels: number = 20): Promise<DebugStackFrame[]> {
        const cancel = this.pendingFetchCancel.token;
        this._pendingFetchCount += 1;

        return this.pendingFetch = this.pendingFetch.then(async () => {
            try {
                const start = this.frameCount;
                const frames = await this.doFetchFrames(start, levels);
                if (cancel.isCancellationRequested) {
                    return [];
                }
                return this.doUpdateFrames(frames);
            } catch (e) {
                console.error(e);
                return [];
            } finally {
                if (!cancel.isCancellationRequested) {
                    this._pendingFetchCount -= 1;
                }
            }
        });
    }
    get pendingFrameCount(): number {
        return this._pendingFetchCount;
    }
    protected async doFetchFrames(startFrame: number, levels: number): Promise<DebugProtocol.StackFrame[]> {
        try {
            const response = await this.session.sendRequest('stackTrace',
                this.toArgs<Partial<DebugProtocol.StackTraceArguments>>({ startFrame, levels })
            );
            if (this.stoppedDetails) {
                this.stoppedDetails.totalFrames = response.body.totalFrames;
            }
            return response.body.stackFrames;
        } catch (e) {
            if (this.stoppedDetails) {
                this.stoppedDetails.framesErrorMessage = e.message;
            }
            return [];
        }
    }
    protected doUpdateFrames(frames: DebugProtocol.StackFrame[]): DebugStackFrame[] {
        const result = new Set<DebugStackFrame>();
        for (const raw of frames) {
            const id = raw.id;
            const frame = this._frames.get(id) || new DebugStackFrame(this, this.session);
            this._frames.set(id, frame);
            frame.update({ raw });
            result.add(frame);
        }
        this.updateCurrentFrame();
        return [...result.values()];
    }
    protected clearFrames(): void {
        // Clear all frames
        this._frames.clear();

        // Cancel all request promises
        this.pendingFetchCancel.cancel();
        this.pendingFetchCancel = new CancellationTokenSource();

        // Empty all current requests
        this.pendingFetch = Promise.resolve([]);
        this._pendingFetchCount = 0;

        this.updateCurrentFrame();
    }
    protected updateCurrentFrame(): void {
        const { currentFrame } = this;
        const frameId = currentFrame && currentFrame.raw.id;
        this.currentFrame = typeof frameId === 'number' &&
            this._frames.get(frameId) ||
            this._frames.values().next().value;
    }

    protected toArgs<T extends object>(arg?: T): { threadId: number } & T {
        return Object.assign({}, arg, {
            threadId: this.raw.id
        });
    }

    render(): React.ReactNode {
        const reason = this.stoppedDetails && this.stoppedDetails.reason;
        const status = this.stoppedDetails ? reason ? `Paused on ${reason}` : 'Paused' : 'Running';
        return <div className='theia-debug-thread' title='Thread'>
            <span className='label'>{this.raw.name}</span>
            <span className='status'>{status}</span>
        </div>;
    }

}
