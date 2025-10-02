// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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
import { DebugProtocol } from '@vscode/debugprotocol/lib/debugProtocol';
import URI from '@theia/core/lib/common/uri';
import { LabelProvider, DISABLED_CLASS, OpenerService } from '@theia/core/lib/browser';
import { TreeElement } from '@theia/core/lib/browser/source-tree';
import { BaseBreakpoint } from '../breakpoint/breakpoint-marker';
import { BreakpointManager } from '../breakpoint/breakpoint-manager';
import { nls } from '@theia/core';

export class DebugBreakpointData {
    readonly raw?: DebugProtocol.Breakpoint;
}

export class DebugBreakpointOptions {
    readonly labelProvider: LabelProvider;
    readonly breakpoints: BreakpointManager;
    readonly openerService: OpenerService;
}

export class DebugBreakpointDecoration {
    readonly className: string;
    readonly message: string[];
}

export type BPCapabilities = Required<Pick<
    DebugProtocol.Capabilities,
    | 'supportsConditionalBreakpoints'
    | 'supportsHitConditionalBreakpoints'
    | 'supportsLogPoints'
    | 'supportsFunctionBreakpoints'
    | 'supportsDataBreakpoints'
    | 'supportsInstructionBreakpoints'
>>;

export interface BPSessionData extends BPCapabilities, DebugProtocol.Breakpoint {
    sessionId: string;
}

export abstract class DebugBreakpoint<T extends BaseBreakpoint = BaseBreakpoint> extends DebugBreakpointOptions implements TreeElement {

    protected _raw?: BPSessionData;
    protected readonly sessionData = new Map<string, BPSessionData>();

    constructor(
        readonly uri: URI,
        options: DebugBreakpointOptions
    ) {
        super();
        Object.assign(this, options);
    }

    abstract get origin(): T;

    get raw(): BPSessionData | undefined {
        return this._raw;
    }

    update(sessionId: string, data?: Omit<BPSessionData, 'sessionId'>): void {
        if (!data) {
            this.sessionData.delete(sessionId);
        } else {
            const toSet = { ...data, sessionId };
            this.sessionData.set(sessionId, toSet);
        }
        const verifiedLocations = new Map<string, DebugProtocol.Breakpoint>();
        this.sessionData.forEach(bp => bp.verified && verifiedLocations.set(`${bp.line}:${bp.column}:${bp.instructionReference}`, bp));
        if (verifiedLocations.size === 1) {
            this._raw = verifiedLocations.values().next().value;
        } else if (verifiedLocations.size) {
            this._raw = undefined;
        } else {
            this._raw = this.sessionData.values().next().value;
        }
    }

    getIdForSession(sessionId: string): number | undefined {
        return this.sessionData.get(sessionId)?.id;
    }

    /** Copied from https://github.com/microsoft/vscode/blob/8934b59d4aa696b6f51ac9bf2eeae8bbac5dac03/src/vs/workbench/contrib/debug/common/debugModel.ts#L953-L971 */
    getDebugProtocolBreakpoint(
        sessionId: string,
    ): DebugProtocol.Breakpoint | undefined {
        const data = this.sessionData.get(sessionId);
        if (data) {
            const bp: DebugProtocol.Breakpoint = {
                id: data.id,
                verified: data.verified,
                message: data.message,
                source: data.source,
                line: data.line,
                column: data.column,
                endLine: data.endLine,
                endColumn: data.endColumn,
                instructionReference: data.instructionReference,
                offset: data.offset,
            };
            return bp;
        }
        return undefined;
    }

    get id(): string {
        return this.origin.id;
    }

    get enabled(): boolean {
        return this.breakpoints.breakpointsEnabled && this.origin.enabled;
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

    abstract setEnabled(enabled: boolean): void;

    abstract remove(): void;

    protected readonly setBreakpointEnabled = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.setEnabled(event.target.checked);
    };

    render(): React.ReactNode {
        const classNames = ['theia-source-breakpoint'];
        if (!this.isEnabled()) {
            classNames.push(DISABLED_CLASS);
        }
        const decoration = this.getDecoration();
        return <div title={decoration.message.join('\n')} className={classNames.join(' ')}>
            <span className={'theia-debug-breakpoint-icon codicon ' + decoration.className} />
            <input className='theia-input' type='checkbox' checked={this.origin.enabled} onChange={this.setBreakpointEnabled} />
            {this.doRender()}
        </div>;
    }

    protected isEnabled(): boolean {
        return this.breakpoints.breakpointsEnabled && this.verified;
    }

    protected abstract doRender(): React.ReactNode;

    getDecoration(): DebugBreakpointDecoration {
        if (!this.enabled) {
            return this.getDisabledBreakpointDecoration();
        }
        if (this.installed && !this.verified) {
            return this.getUnverifiedBreakpointDecoration();
        }
        return this.doGetDecoration();
    }

    protected getUnverifiedBreakpointDecoration(): DebugBreakpointDecoration {
        const decoration = this.getBreakpointDecoration();
        return {
            className: decoration.className + '-unverified',
            message: [this.message || nls.localize('theia/debug/unverifiedBreakpoint', 'Unverified {0}', decoration.message[0])]
        };
    }

    protected getDisabledBreakpointDecoration(message?: string): DebugBreakpointDecoration {
        const decoration = this.getBreakpointDecoration();
        return {
            className: decoration.className + '-disabled',
            message: [message || nls.localize('theia/debug/disabledBreakpoint', 'Disabled {0}', decoration.message[0])]
        };
    }

    protected doGetDecoration(messages: string[] = []): DebugBreakpointDecoration {
        if (this.message) {
            if (messages.length) {
                messages[messages.length - 1].concat(', ' + this.message);
            } else {
                messages.push(this.message);
            }
        }
        return this.getBreakpointDecoration(messages);
    }

    protected abstract getBreakpointDecoration(message?: string[]): DebugBreakpointDecoration;

}
