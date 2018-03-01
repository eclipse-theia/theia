/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { SplitPanel, SplitLayout, Widget } from '@phosphor/widgets';

interface MoveEntry {
    referenceWidget?: Widget;
    layout: SplitLayout;
    index: number;
    position: number;
    duration: number;
    started: boolean;
    ended: boolean;
    startPos?: number;
    startTime?: number
    resolve(): void;
}

export interface SplitPositionOptions {
    referenceWidget?: Widget;
    duration?: number;
    immediate?: boolean;
}

@injectable()
export class SplitPositionHandler {

    private readonly splitMoves: MoveEntry[] = [];
    private currentMoveIndex: number = 0;

    /**
     * Move a handle of a split panel to the given position asynchronously. Unless the option `immediate`
     * is set to `true`, this function makes sure that such movements are performed one after another in
     * order to prevent the movements from overriding each other.
     */
    moveSplitPos(parent: SplitPanel, index: number, position: number, options: SplitPositionOptions = {}): Promise<void> {
        return new Promise<void>(resolve => {
            const move: MoveEntry = {
                index, position, resolve,
                referenceWidget: options.referenceWidget,
                layout: parent.layout as SplitLayout,
                duration: options.duration || 0,
                started: false,
                ended: false
            };
            if (options.immediate) {
                this.endMove(move);
            } else {
                if (this.splitMoves.length === 0) {
                    window.requestAnimationFrame(this.animationFrame.bind(this));
                }
                this.splitMoves.push(move);
            }
        });
    }

    protected animationFrame(time: number): void {
        const move = this.splitMoves[this.currentMoveIndex];
        if (move.ended || move.referenceWidget && move.referenceWidget.isHidden) {
            this.splitMoves.splice(this.currentMoveIndex, 1);
            move.resolve();
        } else if (move.duration <= 0) {
            this.endMove(move);
        } else if (!move.started) {
            move.startPos = this.getCurrentPosition(move);
            move.startTime = time;
            move.started = true;
            if (move.startPos === undefined || move.startPos === move.position) {
                this.endMove(move);
            }
        } else if (move.startTime !== undefined && move.startPos !== undefined) {
            const elapsedTime = time - move.startTime;
            if (elapsedTime >= move.duration) {
                this.endMove(move);
            } else {
                const t = elapsedTime / move.duration;
                const pos = move.startPos + (move.position - move.startPos) * t;
                move.layout.moveHandle(move.index, pos);
            }
        }
        if (!move.ended) {
            if (this.currentMoveIndex < this.splitMoves.length - 1) {
                this.currentMoveIndex++;
            } else {
                this.currentMoveIndex = 0;
            }
        }
        if (this.splitMoves.length > 0) {
            window.requestAnimationFrame(this.animationFrame.bind(this));
        }
    }

    private getCurrentPosition(move: MoveEntry): number | undefined {
        const layout = move.layout;
        let pos: number | null;
        if (layout.orientation === 'horizontal') {
            pos = layout.handles[move.index].offsetLeft;
        } else {
            pos = layout.handles[move.index].offsetTop;
        }
        if (pos !== null) {
            return pos;
        } else {
            return undefined;
        }
    }

    private endMove(move: MoveEntry): void {
        move.layout.moveHandle(move.index, move.position);
        move.ended = true;
    }

}
