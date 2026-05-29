// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    QAAP_WORK_HUB_ROUTINE_API_PATH,
    type QaapCreateWorkHubRoutineBody,
    type QaapUpdateWorkHubRoutineBody,
    type QaapWorkHubRoutine,
    type QaapWorkHubRoutineListResponse,
} from './qaap-work-hub-routine';

export async function fetchWorkHubRoutines(): Promise<QaapWorkHubRoutineListResponse> {
    const response = await fetch(QAAP_WORK_HUB_ROUTINE_API_PATH, { credentials: 'include' });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
    return response.json() as Promise<QaapWorkHubRoutineListResponse>;
}

export async function createWorkHubRoutine(body: QaapCreateWorkHubRoutineBody): Promise<QaapWorkHubRoutine> {
    const response = await fetch(QAAP_WORK_HUB_ROUTINE_API_PATH, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
    }
    return response.json() as Promise<QaapWorkHubRoutine>;
}

export async function updateWorkHubRoutine(id: string, body: QaapUpdateWorkHubRoutineBody): Promise<QaapWorkHubRoutine> {
    const response = await fetch(`${QAAP_WORK_HUB_ROUTINE_API_PATH}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
    }
    return response.json() as Promise<QaapWorkHubRoutine>;
}

export async function deleteWorkHubRoutine(id: string): Promise<void> {
    const response = await fetch(`${QAAP_WORK_HUB_ROUTINE_API_PATH}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
    }
}

export async function runWorkHubRoutineNow(id: string): Promise<QaapWorkHubRoutine> {
    const response = await fetch(`${QAAP_WORK_HUB_ROUTINE_API_PATH}/${encodeURIComponent(id)}/run`, {
        method: 'POST',
        credentials: 'include',
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
    }
    return response.json() as Promise<QaapWorkHubRoutine>;
}
