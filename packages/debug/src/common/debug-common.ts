/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Some entities copied and modified from https://github.com/Microsoft/vscode/blob/master/src/vs/vscode.d.ts
// Some entities copied and modified from https://github.com/Microsoft/vscode/blob/master/src/vs/workbench/parts/debug/common/debug.ts

import { Disposable } from '@theia/core';
import { DebugProtocol } from 'vscode-debugprotocol';

/**
 * The WS endpoint path to the Debug service.
 */
export const DebugPath = '/services/debug';

/**
 * DebugService symbol for DI.
 */
export const DebugService = Symbol('DebugService');

/**
 * This service provides functionality to configure and to start a new debug adapter session.
 * The workflow is the following. If user wants to debug an application and
 * there is no debug configuration associated with the application then
 * the list of available providers is requested to create suitable debug configuration.
 * When configuration is chosen it is possible to alter the configuration
 * by filling in missing values or by adding/changing/removing attributes. For this purpose the
 * #resolveDebugConfiguration method is invoked. After that the debug adapter session will be started.
 */
export interface DebugService extends Disposable {
    /**
     * Finds and returns an array of registered debug types.
     * @returns An array of registered debug types
     */
    debugTypes(): Promise<string[]>;

    /**
     * Provides initial [debug configuration](#DebugConfiguration).
     * @param debugType The registered debug type
     * @returns An array of [debug configurations](#DebugConfiguration)
     */
    provideDebugConfigurations(debugType: string): Promise<DebugConfiguration[]>;

    /**
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values
     * or by adding/changing/removing attributes.
     * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
     * @returns The resolved debug configuration.
     */
    resolveDebugConfiguration(config: DebugConfiguration): Promise<DebugConfiguration>;

    /**
     * Starts a new [debug adapter session](#DebugAdapterSession).
     * Returning the value 'undefined' means the debug adapter session can't be started.
     * @param config The resolved [debug configuration](#DebugConfiguration).
     * @returns The identifier of the created [debug adapter session](#DebugAdapterSession).
     */
    start(config: DebugConfiguration): Promise<string>;
}

/**
 * Configuration for a debug adapter session.
 */
export interface DebugConfiguration {
    /**
     * The type of the debug adapter session.
     */
    type: string;

    /**
     * The name of the debug adapter session.
     */
    name: string;

    /**
     * Additional debug type specific properties.
     */
    [key: string]: any;
}

/**
 * The endpoint path to the debug adapter session.
 */
export const DebugAdapterPath = '/services/debug-adapter';

/**
 * The debug session state.
 */
export interface DebugSessionState {
    /**
     * Indicates if debug session is connected to the debug adapter.
     */
    readonly isConnected: boolean;

    /**
     * The debug session breakpoints.
     */
    readonly breakpoints: DebugProtocol.Breakpoint[];

    /**
     * Indicates if all threads are continued.
     */
    readonly allThreadsContinued: boolean | undefined;

    /**
     * Indicates if all threads are stopped.
     */
    readonly allThreadsStopped: boolean | undefined;

    /**
     * Stopped threads Ids.
     */
    readonly stoppedThreadIds: number[];
}

/**
 * Extension to the vscode debug protocol.
 */
export namespace ExtDebugProtocol {

    export interface ExtVariable extends DebugProtocol.Variable {
        /** Parent variables reference. */
        parentVariablesReference: number;
    }

    /**
     * Event message for 'connected' event type.
     */
    export interface ExtConnectedEvent extends DebugProtocol.Event { }

    /**
     * Event message for 'variableUpdated' event type.
     */
    export interface ExtVariableUpdatedEvent extends DebugProtocol.Event {
        body: {
            /** The variable's name. */
            name: string;
            /** The new value of the variable. */
            value: string;
            /** The type of the new value. Typically shown in the UI when hovering over the value. */
            type?: string;
            /** If variablesReference is > 0, the new value is structured and its children can be retrieved by passing variablesReference to the VariablesRequest. */
            variablesReference?: number;
            /** The number of named child variables. The client can use this optional information to present the variables in a paged UI and fetch them in chunks. */
            namedVariables?: number;
            /** The number of indexed child variables. The client can use this optional information to present the variables in a paged UI and fetch them in chunks. */
            indexedVariables?: number;
            /** Parent variables reference. */
            parentVariablesReference: number;
        }
    }
}

/**
 * Accumulates session states since some data are available only through events
 * and are needed in different components.
 */
export class DebugSessionStateAccumulator implements DebugSessionState {
    private _isConnected: boolean;
    private _allThreadsContinued: boolean | undefined;
    private _allThreadsStopped: boolean | undefined;
    private _stoppedThreads = new Set<number>();
    private _breakpoints = new Map<string, DebugProtocol.Breakpoint>();

    constructor(eventEmitter: NodeJS.EventEmitter, currentState?: DebugSessionState) {
        if (currentState) {
            this._isConnected = currentState.isConnected;
            this._allThreadsContinued = currentState.allThreadsContinued;
            this._allThreadsStopped = currentState.allThreadsStopped;
            currentState.stoppedThreadIds.forEach(threadId => this._stoppedThreads.add(threadId));
            currentState.breakpoints.forEach(breakpoint => this._breakpoints.set(this.createId(breakpoint), breakpoint));
        }

        eventEmitter.on("connected", event => this.onConnectedEvent(event));
        eventEmitter.on("terminated", event => this.onTerminatedEvent(event));
        eventEmitter.on('stopped', event => this.onStoppedEvent(event));
        eventEmitter.on('continued', event => this.onContinuedEvent(event));
        eventEmitter.on('thread', event => this.onThreadEvent(event));
        eventEmitter.on('breakpoint', event => this.onBreakpointEvent(event));
    }

    get allThreadsContinued(): boolean | undefined {
        return this._allThreadsContinued;
    }

    get allThreadsStopped(): boolean | undefined {
        return this._allThreadsStopped;
    }

    get isConnected(): boolean {
        return this._isConnected;
    }

    get stoppedThreadIds(): number[] {
        return Array.from(this._stoppedThreads);
    }

    get breakpoints(): DebugProtocol.Breakpoint[] {
        return Array.from(this._breakpoints.values());
    }

    private onConnectedEvent(event: ExtDebugProtocol.ExtConnectedEvent): void {
        this._isConnected = true;
    }

    private onTerminatedEvent(event: DebugProtocol.TerminatedEvent): void {
        this._isConnected = false;
    }

    private onContinuedEvent(event: DebugProtocol.ContinuedEvent): void {
        const body = event.body;

        this._allThreadsContinued = body.allThreadsContinued;
        if (this._allThreadsContinued) {
            this._stoppedThreads.clear();
        } else {
            this._stoppedThreads.delete(body.threadId);
        }
    }

    private onStoppedEvent(event: DebugProtocol.StoppedEvent): void {
        const body = event.body;

        this._allThreadsStopped = body.allThreadsStopped;
        if (body.threadId) {
            this._stoppedThreads.add(body.threadId);
        }
    }

    private onThreadEvent(event: DebugProtocol.ThreadEvent): void {
        switch (event.body.reason) {
            case 'exited': {
                this._stoppedThreads.delete(event.body.threadId);
                break;
            }
        }
    }

    private onBreakpointEvent(event: DebugProtocol.BreakpointEvent): void {
        const breakpoint = event.body.breakpoint;
        switch (event.body.reason) {
            case 'new': {
                this._breakpoints.set(this.createId(breakpoint), breakpoint);
                break;
            }
            case 'removed': {
                this._breakpoints.delete(this.createId(breakpoint));
                break;
            }
            case 'changed': {
                this._breakpoints.set(this.createId(breakpoint), breakpoint);
                break;
            }
        }
    }

    private createId(breakpoint: DebugProtocol.Breakpoint): string {
        return breakpoint.id
            ? breakpoint.id.toString()
            : (breakpoint.source ? `${breakpoint.source.path}-` : '')
            + (`${breakpoint.line}: ${breakpoint.column} `);
    }
}
