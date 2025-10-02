// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import * as React from '@theia/core/shared/react';
import { DebugProtocol } from '@vscode/debugprotocol';
import { nls, RecursivePartial } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { EditorWidget, Range } from '@theia/editor/lib/browser';
import { TREE_NODE_INFO_CLASS, WidgetOpenerOptions, open } from '@theia/core/lib/browser';
import { TreeElement } from '@theia/core/lib/browser/source-tree';
import { DEBUG_BREAKPOINT_SCHEME, SourceBreakpoint } from '../breakpoint/breakpoint-marker';
import { DebugBreakpoint, DebugBreakpointOptions, DebugBreakpointDecoration } from './debug-breakpoint';

export class DebugSourceBreakpoint extends DebugBreakpoint<SourceBreakpoint> implements TreeElement {

    static create(origin: SourceBreakpoint, options: DebugBreakpointOptions): DebugSourceBreakpoint {
        return new this(origin, options);
    }

    private constructor(readonly origin: SourceBreakpoint, options: DebugBreakpointOptions) {
        super(new URI(origin.uri), options);
    }

    setEnabled(enabled: boolean): void {
        this.breakpoints.enableBreakpoint(this, enabled);
    }

    /** 1-based */
    get line(): number {
        return this.raw && this.raw.line || this.origin.raw.line;
    }
    get column(): number | undefined {
        return this.raw && this.raw.column || this.origin.raw.column;
    }
    get endLine(): number | undefined {
        return this.raw && this.raw.endLine;
    }
    get endColumn(): number | undefined {
        return this.raw && this.raw.endColumn;
    }

    get condition(): string | undefined {
        return this.origin.raw.condition;
    }
    get hitCondition(): string | undefined {
        return this.origin.raw.hitCondition;
    }
    get logMessage(): string | undefined {
        return this.origin.raw.logMessage;
    }

    get source(): DebugProtocol.Source | undefined {
        return this.raw?.source;
    }

    async open(options: WidgetOpenerOptions = {
        mode: 'reveal'
    }): Promise<EditorWidget> {
        const { line, column, endLine, endColumn } = this;
        const selection: RecursivePartial<Range> = {
            start: {
                line: line - 1,
                character: typeof column === 'number' ? column - 1 : undefined
            }
        };
        if (typeof endLine === 'number') {
            selection.end = {
                line: endLine - 1,
                character: typeof endColumn === 'number' ? endColumn - 1 : undefined
            };
        }
        return open(
            this.openerService,
            URI.fromComponents({ authority: this.id, scheme: DEBUG_BREAKPOINT_SCHEME, path: '', fragment: '', query: '' }),
            { ...options, selection }
        ) as Promise<EditorWidget>;
    }

    protected override setBreakpointEnabled = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.setEnabled(event.target.checked);
    };

    protected doRender(): React.ReactNode {
        return <React.Fragment>
            <span className='line-info' title={this.labelProvider.getLongName(this.uri)}>
                <span className='name'>{this.labelProvider.getName(this.uri)} </span>
                <span className={'path ' + TREE_NODE_INFO_CLASS}>{this.labelProvider.getLongName(this.uri.parent)} </span>
            </span>
            <span className='line'>{this.renderPosition()}</span>
        </React.Fragment>;
    }

    renderPosition(): string {
        return this.line + (typeof this.column === 'number' ? ':' + this.column : '');
    }

    override doGetDecoration(messages: string[] = []): DebugBreakpointDecoration {
        if (this.logMessage || this.condition || this.hitCondition) {
            if (this.logMessage) {
                if (this.raw && !this.raw.supportsLogPoints) {
                    return this.getUnsupportedBreakpointDecoration(nls.localize('theia/debug/logpointsNotSupported',
                        'Logpoints not supported by this debug type'));
                }
                messages.push(nls.localizeByDefault('Log Message: {0}', this.logMessage));
            }
            if (this.condition) {
                if (this.raw && !this.raw.supportsConditionalBreakpoints) {
                    return this.getUnsupportedBreakpointDecoration(nls.localize('theia/debug/conditionalBreakpointsNotSupported',
                        'Conditional breakpoints not supported by this debug type'));
                }
                messages.push(nls.localizeByDefault('Condition: {0}', this.condition));
            }
            if (this.hitCondition) {
                if (this.raw && !this.raw.supportsHitConditionalBreakpoints) {
                    return this.getUnsupportedBreakpointDecoration(nls.localize('theia/debug/htiConditionalBreakpointsNotSupported',
                        'Hit conditional breakpoints not supported by this debug type'));
                }
                messages.push(nls.localizeByDefault('Hit Count: {0}', this.hitCondition));
            }
        }
        return super.doGetDecoration(messages);
    }

    protected getUnsupportedBreakpointDecoration(message: string): DebugBreakpointDecoration {
        return {
            className: 'codicon-debug-breakpoint-unsupported',
            message: [message]
        };
    }

    protected getBreakpointDecoration(message?: string[]): DebugBreakpointDecoration {
        if (this.logMessage) {
            return {
                className: 'codicon-debug-breakpoint-log',
                message: message || [nls.localizeByDefault('Logpoint')]
            };
        }
        if (this.condition || this.hitCondition) {
            return {
                className: 'codicon-debug-breakpoint-conditional',
                message: message || [nls.localize('theia/debug/conditionalBreakpoint', 'Conditional Breakpoint')]
            };
        }
        return {
            className: 'codicon-debug-breakpoint',
            message: message || [nls.localizeByDefault('Breakpoint')]
        };
    }

    remove(): void {
        this.breakpoints.removeBreakpoint(this);
    }
}
