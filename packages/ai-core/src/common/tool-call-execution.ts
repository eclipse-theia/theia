// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { CancellationToken } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import {
    ToolRequest,
    ToolCallResult,
    ToolInvocationContext,
    createToolCallError
} from './language-model';

/**
 * A single tool call collected from one model response/turn, in a provider-neutral shape.
 * Each language model normalizes its own representation into this shape before execution.
 */
export interface ToolInvocation {
    /** The tool call ID assigned by the model; forwarded into the {@link ToolInvocationContext}. */
    readonly id: string;
    /** The name used to match against {@link ToolRequest.name}. */
    readonly name: string;
    /** The raw JSON argument string passed verbatim to {@link ToolRequest.handler}. */
    readonly arguments: string;
}

/**
 * The normalized outcome of executing one tool call. Returned in the same order as the
 * input array, regardless of the order in which the calls actually completed.
 */
export interface ToolCallOutcome {
    readonly id: string;
    readonly name: string;
    readonly arguments: string;
    /**
     * The handler result, or a {@link createToolCallError} value if the tool was not found
     * or the handler threw. A thrown handler yields an error result here, never a rejection.
     */
    readonly result: ToolCallResult;
    /** The original error if the handler threw; `undefined` for success and for tool-not-found. */
    readonly error?: Error;
    /** `true` when no {@link ToolRequest} matched {@link ToolInvocation.name}. */
    readonly notFound: boolean;
}

export interface ToolCallExecutionOptions {
    /**
     * Optional per-call hook invoked exactly once per tool call as soon as that call settles
     * (success, throw, or not-found). Use it for per-call side effects such as streaming a UI
     * event or appending a provider message.
     *
     * **Note:** because calls run concurrently, this hook fires in completion order, not input
     * order. Side effects that must be ordered should instead be performed by the caller over
     * the returned (input-ordered) array of execution results.
     */
    readonly onResult?: (result: ToolCallOutcome) => void;
    /** Optional cancellation token forwarded into each {@link ToolInvocationContext}. */
    readonly cancellationToken?: CancellationToken;
}

/**
 * Executes the tool calls of a single language model response/turn.
 *
 * Concurrency contract: tool calls emitted within a single model response/turn are executed
 * concurrently. All matched handlers are started before any of them is awaited.
 * A tool handler must therefore not assume that it runs in isolation or in array
 * order, and must be safe to overlap with sibling calls from the same turn. Models serialize
 * dependent calls across turns (by withholding a dependent call until it has seen the prior
 * result), so "issued together in one turn" is the model's signal that the calls are independent.
 *
 * Error handling is uniform across all language model providers:
 *  - If no {@link ToolRequest} matches a call's name, its result is a
 *    {@link createToolCallError} with kind `'tool-not-available'` and `notFound` is `true`.
 *  - If a handler throws/rejects, the rejection is caught, logged, and converted to a
 *    {@link createToolCallError}; the original error is exposed on `error`.
 *  - The overall tool execution promise never rejects but returns a result that may
 *    include errors from failed tool calls
 */
export interface ToolCallExecutor {
    /**
     * Executes all `toolCalls` concurrently and returns their outcomes in input order.
     *
     * @param toolCalls the tool calls collected for this turn (id + name + raw args)
     * @param tools the tools available for this request (typically `request.tools`)
     * @param options optional per-call hook and cancellation token
     */
    executeToolCalls(
        toolCalls: readonly ToolInvocation[],
        tools: readonly ToolRequest[] | undefined,
        options?: ToolCallExecutionOptions
    ): Promise<ToolCallOutcome[]>;
}

export const ToolCallExecutor = Symbol('ToolCallExecutor');

@injectable()
export class ToolCallExecutorImpl implements ToolCallExecutor {

    async executeToolCalls(
        toolCalls: readonly ToolInvocation[],
        tools: readonly ToolRequest[] | undefined,
        options: ToolCallExecutionOptions = {}
    ): Promise<ToolCallOutcome[]> {
        return Promise.all(toolCalls.map(toolCall => this.executeToolCall(toolCall, tools, options)));
    }

    protected async executeToolCall(
        toolCall: ToolInvocation,
        tools: readonly ToolRequest[] | undefined,
        options: ToolCallExecutionOptions
    ): Promise<ToolCallOutcome> {
        const { id, name, arguments: args } = toolCall;
        const tool = tools?.find(candidate => candidate.name === name);
        let outcome: ToolCallOutcome;
        if (!tool) {
            outcome = {
                id, name, arguments: args, notFound: true,
                result: createToolCallError(`Tool '${name}' not found in the available tools for this request.`, 'tool-not-available')
            };
        } else {
            try {
                const result = await tool.handler(args, ToolInvocationContext.create(id, options.cancellationToken));
                outcome = { id, name, arguments: args, result, notFound: false };
            } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                console.error(`Error executing tool ${name}:`, e);
                outcome = { id, name, arguments: args, notFound: false, error, result: createToolCallError(error.message || 'Tool execution failed') };
            }
        }
        try {
            options.onResult?.(outcome);
        } catch (error) {
            console.error('Uncaught error in tool-call onResult call-back.', error);
        }
        return outcome;
    }
}
