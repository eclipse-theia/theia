// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { ChatChangeEvent } from '@theia/ai-chat/lib/common/chat-model';

/** Chat model events that add/remove/reorder request or response tree nodes. */
export function isChatModelTreeStructureChange(event: ChatChangeEvent): boolean {
    switch (event.kind) {
        case 'addRequest':
        case 'removeRequest':
        case 'changeHierarchyBranch':
        case 'submitEdit':
        case 'addResponse':
            return true;
        default:
            return false;
    }
}

/**
 * Returns true when the existing chat tree node ids still match active branches.
 * Used to skip {@link ChatViewTreeWidget.recreateModelTree} during streaming ticks.
 */
export function chatModelTreeNodeIdsMatch(
    childIds: readonly string[] | undefined,
    branchRequestIds: readonly string[],
    branchResponseIds: readonly string[],
): boolean {
    const expectedLength = branchRequestIds.length * 2;
    if (!childIds || childIds.length !== expectedLength || expectedLength === 0) {
        return false;
    }
    for (let index = 0; index < branchRequestIds.length; index++) {
        if (childIds[index * 2] !== branchRequestIds[index]) {
            return false;
        }
        if (childIds[index * 2 + 1] !== branchResponseIds[index]) {
            return false;
        }
    }
    return true;
}

export function shouldSkipChatModelTreeRecreate(
    event: ChatChangeEvent,
    childIds: readonly string[] | undefined,
    branchRequestIds: readonly string[],
    branchResponseIds: readonly string[],
): boolean {
    if (isChatModelTreeStructureChange(event)) {
        return false;
    }
    return chatModelTreeNodeIdsMatch(childIds, branchRequestIds, branchResponseIds);
}

/**
 * Content-only model changes still need a React paint when tree recreation is skipped.
 * `responseChanged` is excluded because {@link ChatViewTreeWidget.trackLiveResponse} already paints.
 */
export function needsCoalescedTreePaintWithoutRecreate(event: ChatChangeEvent): boolean {
    return event.kind !== 'responseChanged';
}
