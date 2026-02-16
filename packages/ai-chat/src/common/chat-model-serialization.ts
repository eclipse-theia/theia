// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { ChatAgentLocation } from './chat-agents';

export interface SerializableChangeSetElement {
    kind?: string;
    uri: string;
    name?: string;
    icon?: string;
    additionalInfo?: string;
    state?: 'pending' | 'applied' | 'stale';
    type?: 'add' | 'modify' | 'delete';
    data?: { [key: string]: unknown };
}

export interface SerializableChangeSetFileElementData {
    targetState?: string;
    originalState?: string;
    replacements?: Array<{
        oldContent: string;
        newContent: string;
        multiple?: boolean;
    }>;
}

export interface SerializableParsedRequestPartBase {
    range: { start: number; endExclusive: number };
}

export interface SerializableTextPart extends SerializableParsedRequestPartBase {
    kind: 'text';
    text: string;
}

export interface SerializableVariablePart extends SerializableParsedRequestPartBase {
    kind: 'var';
    variableId: string;
    variableName: string;
    variableDescription: string;
    variableArg?: string;
    variableValue?: string;
}

export interface SerializableFunctionPart extends SerializableParsedRequestPartBase {
    kind: 'function';
    toolRequestId: string;
}

export interface SerializableAgentPart extends SerializableParsedRequestPartBase {
    kind: 'agent';
    agentId: string;
    agentName: string;
}

export type SerializableParsedRequestPart =
    | SerializableTextPart
    | SerializableVariablePart
    | SerializableFunctionPart
    | SerializableAgentPart;

export interface SerializableToolRequest {
    id: string;
}

export interface SerializableResolvedVariable {
    variableId: string;
    variableName: string;
    variableDescription: string;
    arg?: string;
    value: string;
}

export interface SerializableParsedRequest {
    parts: SerializableParsedRequestPart[];
    toolRequests: SerializableToolRequest[];
    variables: SerializableResolvedVariable[];
}

export interface SerializableChatRequestData {
    id: string;
    text: string;
    agentId?: string;
    changeSet?: {
        title: string;
        elements: SerializableChangeSetElement[];
    };
    parsedRequest?: SerializableParsedRequest;
    /**
     * Capability overrides for this request.
     * Maps capability fragment IDs to enabled/disabled state.
     */
    capabilityOverrides?: Record<string, boolean>;
}

export interface SerializableChatResponseContentData<T = unknown> {
    kind: string;
    /**
     * Fallback message used when the deserializer for this content type is not available.
     */
    fallbackMessage?: string;
    data: T; // Content-specific serialization
}

export interface SerializableChatResponseData {
    id: string;
    requestId: string;
    isComplete: boolean;
    isError: boolean;
    errorMessage?: string;
    promptVariantId?: string;
    isPromptVariantEdited?: boolean;
    content: SerializableChatResponseContentData[];
}

/**
 * Serialized representation of an item in a hierarchy branch.
 * Each item represents a request and optionally links to the next branch.
 */
export interface SerializableHierarchyBranchItem {
    requestId: string;
    nextBranchId?: string;
}

/**
 * Serialized representation of a branch in the chat request hierarchy.
 * A branch contains alternative requests (created by editing messages).
 */
export interface SerializableHierarchyBranch {
    /** Unique identifier for this branch */
    id: string;
    /** All items (alternative requests) in this branch */
    items: SerializableHierarchyBranchItem[];
    /** Index of the currently active item in this branch */
    activeBranchIndex: number;
}

/**
 * Serialized representation of the complete chat request hierarchy.
 * The hierarchy is stored as a flat map of branches.
 */
export interface SerializableHierarchy {
    /** ID of the root branch where the hierarchy starts */
    rootBranchId: string;
    /** Map of branch ID to branch data for all branches in the hierarchy */
    branches: { [branchId: string]: SerializableHierarchyBranch };
}

/**
 * Serialized representation of ChatModel.
 */
export interface SerializedChatModel {
    sessionId: string;
    location: ChatAgentLocation;
    /**
     * The complete hierarchy of requests including all alternatives (branches).
     */
    hierarchy: SerializableHierarchy;
    /** All requests referenced by the hierarchy */
    requests: SerializableChatRequestData[];
    /** All responses for the requests */
    responses: SerializableChatResponseData[];
}

/**
 * Wrapper for persisted chat model data.
 * Includes metadata (version, pinned agent, title) along with the chat model.
 */
export interface SerializedChatData {
    version: number;
    pinnedAgentId?: string;
    title?: string;
    model: SerializedChatModel;
    saveDate: number;
}

export interface SerializableChatsData {
    [sessionId: string]: SerializedChatData;
}

export const CHAT_DATA_VERSION = 1;
