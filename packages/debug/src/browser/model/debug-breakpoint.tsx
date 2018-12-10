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

import * as React from 'react';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { RecursivePartial } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { EditorManager, Range } from '@theia/editor/lib/browser';
import { LabelProvider, DISABLED_CLASS, WidgetOpenerOptions } from '@theia/core/lib/browser';
import { TreeElement } from '@theia/core/lib/browser/source-tree';
import { DebugSession } from '../debug-session';
import { SourceBreakpoint } from '../breakpoint/breakpoint-marker';
import { DebugSource } from './debug-source';
import { BreakpointManager } from '../breakpoint/breakpoint-manager';

export class DebugBreakpointData {
    readonly raw?: DebugProtocol.Breakpoint;
    readonly origins: SourceBreakpoint[];
}

export class DebugBreakpointDecoration {
    readonly className: string;
    readonly message: string[];
}

export class DebugBreakpoint extends DebugBreakpointData implements TreeElement {

    readonly uri: URI;

    constructor(
        origin: SourceBreakpoint,
        protected readonly labelProvider: LabelProvider,
        protected readonly breakpoints: BreakpointManager,
        protected readonly editorManager: EditorManager,
        protected readonly session?: DebugSession
    ) {
        super();
        Object.assign(this, { origins: [origin] });
        this.uri = new URI(this.origins[0].uri);
    }
    update(data: Partial<DebugBreakpointData>): void {
        Object.assign(this, data);
    }

    get origin(): SourceBreakpoint {
        return this.origins[0];
    }

    get id(): string {
        return this.origin.id;
    }

    get idFromAdapter(): number | undefined {
        return this.raw && this.raw.id;
    }

    get enabled(): boolean {
        return this.breakpoints.breakpointsEnabled && this.origin.enabled;
    }
    setEnabled(enabled: boolean): void {
        const { uri, raw } = this;
        let shouldUpdate = false;
        let breakpoints = raw && this.doRemove(this.origins.filter(origin => origin.raw.line !== raw.line));
        if (breakpoints) {
            shouldUpdate = true;
        } else {
            breakpoints = this.breakpoints.getBreakpoints(uri);
        }
        for (const breakpoint of breakpoints) {
            if (breakpoint.raw.line === this.origin.raw.line && breakpoint.enabled !== enabled) {
                breakpoint.enabled = enabled;
                shouldUpdate = true;
            }
        }
        if (shouldUpdate) {
            this.breakpoints.setBreakpoints(this.uri, breakpoints);
        }
    }

    updateOrigins(data: Partial<DebugProtocol.SourceBreakpoint>): void {
        const breakpoints = this.breakpoints.getBreakpoints(this.uri);
        let shouldUpdate = false;
        const originLines = new Set();
        this.origins.forEach(origin => originLines.add(origin.raw.line));
        for (const breakpoint of breakpoints) {
            if (originLines.has(breakpoint.raw.line)) {
                Object.assign(breakpoint.raw, data);
                shouldUpdate = true;
            }
        }
        if (shouldUpdate) {
            this.breakpoints.setBreakpoints(this.uri, breakpoints);
        }
    }

    get installed(): boolean {
        return !!this.raw;
    }

    get verified(): boolean {
        return !!this.raw ? this.raw.verified : true;
    }
    get message(): string {
        return this.raw && this.raw.message || '';
    }

    /** 1-based */
    get line(): number {
        return this.raw && this.raw.line || this.origins[0].raw.line;
    }
    get column(): number | undefined {
        return this.raw && this.raw.column || this.origins[0].raw.column;
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

    get source(): DebugSource | undefined {
        return this.raw && this.raw.source && this.session && this.session.getSource(this.raw.source);
    }

    async open(options: WidgetOpenerOptions = {
        mode: 'reveal'
    }): Promise<void> {
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
        if (this.source) {
            await this.source.open({
                ...options,
                selection
            });
        } else {
            await this.editorManager.open(this.uri, {
                ...options,
                selection
            });
        }
    }

    protected readonly setBreakpointEnabled = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.setEnabled(event.target.checked);
    }

    render(): React.ReactNode {
        const classNames = ['theia-source-breakpoint'];
        if (!this.breakpoints.breakpointsEnabled || !this.verified) {
            classNames.push(DISABLED_CLASS);
        }
        const decoration = this.getDecoration();
        return <div title={decoration.message.join('\n')} className={classNames.join(' ')}>
            <span className={'theia-debug-breakpoint-icon ' + decoration.className} />
            <input type='checkbox' checked={this.origins[0].enabled} onChange={this.setBreakpointEnabled} />
            <span className='name'>{this.labelProvider.getName(this.uri)} </span>
            <span className='path'>{this.labelProvider.getLongName(this.uri.parent)} </span>
            <span className='line'>{this.line}</span>
        </div>;
    }

    getDecoration(): DebugBreakpointDecoration {
        if (!this.enabled) {
            return this.getDisabledBreakpointDecoration();
        }
        if (this.installed && !this.verified) {
            return this.getUnverifiedBreakpointDecoration();
        }
        const messages: string[] = [];
        if (this.logMessage || this.condition || this.hitCondition) {
            const { session } = this;
            if (this.logMessage) {
                if (session && !session.capabilities.supportsLogPoints) {
                    return this.getUnsupportedBreakpointDecoration('Logpoints not supported by this debug type');
                }
                messages.push('Log Message: ' + this.logMessage);
            }
            if (this.condition) {
                if (session && !session.capabilities.supportsConditionalBreakpoints) {
                    return this.getUnsupportedBreakpointDecoration('Conditional breakpoints not supported by this debug type');
                }
                messages.push('Expression: ' + this.condition);
            }
            if (this.hitCondition) {
                if (session && !session.capabilities.supportsHitConditionalBreakpoints) {
                    return this.getUnsupportedBreakpointDecoration('Hit conditional breakpoints not supported by this debug type');
                }
                messages.push('Hit Count: ' + this.hitCondition);
            }
        }
        if (this.message) {
            if (messages.length) {
                messages[messages.length - 1].concat(', ' + this.message);
            } else {
                messages.push(this.message);
            }
        }
        return this.getBreakpointDecoration(messages);
    }
    protected getUnverifiedBreakpointDecoration(): DebugBreakpointDecoration {
        const decoration = this.getBreakpointDecoration();
        return {
            className: decoration.className + '-unverified',
            message: [this.message || 'Unverified ' + decoration.message[0]]
        };
    }
    protected getDisabledBreakpointDecoration(): DebugBreakpointDecoration {
        const decoration = this.getBreakpointDecoration();
        return {
            className: decoration.className + '-disabled',
            message: ['Disabled ' + decoration.message[0]]
        };
    }

    protected getBreakpointDecoration(message?: string[]): DebugBreakpointDecoration {
        if (this.logMessage) {
            return {
                className: 'theia-debug-logpoint',
                message: message || ['Logpoint']
            };
        }
        if (this.condition || this.hitCondition) {
            return {
                className: 'theia-debug-conditional-breakpoint',
                message: message || ['Conditional Breakpoint']
            };
        }
        return {
            className: 'theia-debug-breakpoint',
            message: message || ['Breakpoint']
        };
    }
    protected getUnsupportedBreakpointDecoration(message: string): DebugBreakpointDecoration {
        return {
            className: 'theia-debug-breakpoint-unsupported',
            message: [message]
        };
    }

    remove(): void {
        const breakpoints = this.doRemove(this.origins);
        if (breakpoints) {
            this.breakpoints.setBreakpoints(this.uri, breakpoints);
        }
    }
    protected doRemove(origins: SourceBreakpoint[]): SourceBreakpoint[] | undefined {
        if (!origins.length) {
            return undefined;
        }
        const { uri } = this;
        const toRemove = new Set();
        origins.forEach(origin => toRemove.add(origin.raw.line));
        let shouldUpdate = false;
        const breakpoints = this.breakpoints.findMarkers({
            uri,
            dataFilter: data => {
                const result = !toRemove.has(data.raw.line);
                shouldUpdate = shouldUpdate || !result;
                return result;
            }
        }).map(({ data }) => data);
        return shouldUpdate && breakpoints || undefined;
    }

}
