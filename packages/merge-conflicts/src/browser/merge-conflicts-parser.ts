/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { MergeConflict } from "./merge-conflict";
import { Range } from "@theia/editor/lib/browser";

@injectable()
export class MergeConflictsParser {
    private parser: MergeConflictsParser.StateMachine<MergeConflictsParser.Context>;

    constructor() {
        this.init();
    }

    parse(text: string): MergeConflict[] {
        const context = new MergeConflictsParser.Context();
        this.parser.reset(context);
        const lines = text.split(/\r?\n|\r/);
        for (let line = 0; line < lines.length; line++) {
            this.parser.read({ line, text: lines[line] });
        }
        return context.all;
    }

    private init(): void {
        const parser = this.parser = new MergeConflictsParser.StateMachine(new MergeConflictsParser.Context());
        // states
        const start = parser.addState('start');
        const currentMarker = parser.addState('current-marker');
        const currentContent = parser.addState('current-content');
        const baseMarker = parser.addState('base-marker');
        const baseContent = parser.addState('base-content');
        const separator = parser.addState('separator');
        const incomingContent = parser.addState('incoming-content');
        const incomingMarker = parser.addState('incoming-marker');
        const push = parser.addState('push');

        // conditions / triggers
        const startsWithLt = (input: MergeConflictsParser.Input) => input.text.startsWith('<<<<<<<');
        const startsWithEq = (input: MergeConflictsParser.Input) => input.text.startsWith('=======');
        const startsWithGt = (input: MergeConflictsParser.Input) => input.text.startsWith('>>>>>>>');
        const startsWithPp = (input: MergeConflictsParser.Input) => input.text.startsWith('|||||||');
        const any = () => true;

        // transitions
        start.to(currentMarker, startsWithLt);
        start.to(start, any);
        currentMarker.to(currentMarker, startsWithLt);
        currentMarker.to(separator, startsWithEq);
        currentMarker.to(currentContent, any);
        currentContent.to(currentMarker, startsWithLt);
        currentContent.to(separator, startsWithEq);
        currentContent.to(baseMarker, startsWithPp);
        currentContent.to(start, startsWithGt);
        currentContent.to(currentContent, any);
        baseMarker.to(currentMarker, startsWithLt);
        baseMarker.to(baseMarker, startsWithPp);
        baseMarker.to(separator, startsWithEq);
        baseMarker.to(baseContent, any);
        baseContent.to(currentMarker, startsWithLt);
        baseContent.to(separator, startsWithEq);
        baseContent.to(baseMarker, startsWithPp);
        baseContent.to(baseContent, any);
        separator.to(currentMarker, startsWithLt);
        separator.to(start, startsWithEq);
        separator.to(incomingContent, any);
        incomingContent.to(start, startsWithEq);
        incomingContent.to(currentMarker, startsWithLt);
        incomingContent.to(incomingMarker, startsWithGt);
        incomingContent.to(incomingContent, any);
        incomingMarker.to(push);
        push.to(start);

        // actions
        currentMarker.onEnter = (input, ctx) => {
            ctx.new = new MergeConflictsParser.Context().new;
            ctx.new.current.marker = this.lineToRange(input);
        };
        currentContent.onEnter = (input, ctx) => {
            const current = ctx.new.current;
            current.content = this.addLineToRange(input, current.content);
        };
        baseMarker.onEnter = (input, ctx) => {
            ctx.new.bases.push({ marker: this.lineToRange(input) });
        };
        baseContent.onEnter = (input, ctx) => {
            const base = ctx.new.bases.slice(-1)[0];
            base.content = this.addLineToRange(input, base.content);
        };
        incomingContent.onEnter = (input, ctx) => {
            const incoming = ctx.new.incoming;
            incoming.content = this.addLineToRange(input, incoming.content);
        };
        incomingMarker.onEnter = (input, ctx) => {
            const markerRange = this.lineToRange(input);
            ctx.new.incoming.marker = markerRange;
            ctx.new.total = {
                start: ctx.new.current.marker!.start,
                end: markerRange.end
            };
        };
        push.onEnter = (input, ctx) => {
            ctx.all.push(ctx.new);
        };
    }

    private lineToRange(input: MergeConflictsParser.Input): Range {
        return {
            start: { line: input.line, character: 0 },
            end: { line: input.line, character: input.text.length },
        };
    }

    private addLineToRange(input: MergeConflictsParser.Input, range: Range | undefined): Range {
        if (!range) {
            return this.lineToRange(input);
        }
        range.end = { line: input.line, character: input.text.length };
        return range;
    }
}

export namespace MergeConflictsParser {
    export class Context {
        new: MergeConflict = {
            current: {},
            incoming: {},
            bases: []
        };
        all: MergeConflict[] = [];
    }

    export interface Input {
        line: number;
        text: string;
    }

    export class StateMachine<C extends object> {
        current: State<C>;
        readonly states: State<C>[] = [];

        constructor(protected context: C) { }

        reset(context: C): void {
            this.current = this.states[0];
            this.context = context;
        }

        read(input: Input): void {
            let next = this.current.findNext(input, this.context);
            while (next) {
                if (next.onEnter) {
                    next.onEnter(input, this.context);
                }
                if (next.immediateNext) {
                    this.current = next;
                    next = next.immediateNext;
                } else {
                    break;
                }
            }
            if (!next) {
                throw new Error(`Missing transition from (${this.current.id}) for input: L.${input.line} > ${input.text}`);
            }
            this.current = next;
        }

        addState(id: string): State<C> {
            const state = new State<C>(id);
            this.states.push(state);
            if (!this.current) {
                this.current = state;
            }
            return state;
        }
    }

    export class State<C> {
        onEnter?: (input: Input, context: C) => void;
        readonly conditionalNext: { to: State<C>, condition: (input: Input, context: C) => boolean }[] = [];
        immediateNext: State<C> | undefined;

        constructor(readonly id: string) { }

        findNext(input: Input, context: C): State<C> | undefined {
            const match = this.conditionalNext.find(transition => transition.condition(input, context));
            return match ? match.to : undefined;
        }

        to(next: State<C>, condition?: (input: Input, context: C) => boolean): void {
            if (condition) {
                this.immediateNext = undefined;
                this.conditionalNext.push({ to: next, condition });
            } else {
                this.immediateNext = next;
            }
        }
    }
}
