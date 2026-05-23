// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { qaapAuthenticatedFetchInit } from '@theia/qaap-adapters/lib/browser/qaap-github-auth-client';
import {
    QAAP_CLOUD_API_PATH,
    type QaapCdpStatusResponse,
    type QaapCloudWorkspaceEnsureRequest,
    type QaapCloudWorkspaceSummary,
    type QaapCloudWorkspacesResponse,
    type QaapDeployEnvResponse,
    type QaapDeployEnvVar,
    type QaapPreviewShareCreateRequest,
    type QaapPreviewShareSummary,
    type QaapTerminalSessionsResponse,
    type QaapDeployRunRequest,
    type QaapDeployRunResponse,
    type QaapPushNotifyRequest,
    type QaapPushSubscribeRequest,
    type QaapPushVapidResponse,
    type QaapTerminalSessionsUpsertRequest,
} from '../common/qaap-cloud-api-types';

export async function fetchQaapCloudWorkspaces(): Promise<QaapCloudWorkspacesResponse> {
    const response = await fetch(`${QAAP_CLOUD_API_PATH}/workspaces`, qaapAuthenticatedFetchInit());
    if (!response.ok) {
        return { workspaces: [] };
    }
    const body = await response.json() as Partial<QaapCloudWorkspacesResponse>;
    return { workspaces: Array.isArray(body.workspaces) ? body.workspaces : [] };
}

export async function ensureQaapCloudWorkspace(
    request: QaapCloudWorkspaceEnsureRequest,
): Promise<QaapCloudWorkspaceSummary | undefined> {
    const response = await fetch(`${QAAP_CLOUD_API_PATH}/workspaces/ensure`, qaapAuthenticatedFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    }));
    if (!response.ok) {
        return undefined;
    }
    const body = await response.json() as { workspace?: QaapCloudWorkspaceSummary };
    return body.workspace;
}

export async function createQaapPreviewShare(
    request: QaapPreviewShareCreateRequest,
): Promise<QaapPreviewShareSummary | undefined> {
    const response = await fetch(`${QAAP_CLOUD_API_PATH}/preview/share`, qaapAuthenticatedFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    }));
    if (!response.ok) {
        return undefined;
    }
    const body = await response.json() as { share?: QaapPreviewShareSummary };
    return body.share;
}

export async function fetchQaapTerminalSessions(workspaceKey: string): Promise<QaapTerminalSessionsResponse> {
    const response = await fetch(
        `${QAAP_CLOUD_API_PATH}/terminal-sessions?workspaceKey=${encodeURIComponent(workspaceKey)}`,
        qaapAuthenticatedFetchInit(),
    );
    if (!response.ok) {
        return { workspaceKey, terminals: [] };
    }
    return response.json() as Promise<QaapTerminalSessionsResponse>;
}

export async function upsertQaapTerminalSessions(request: QaapTerminalSessionsUpsertRequest): Promise<void> {
    await fetch(`${QAAP_CLOUD_API_PATH}/terminal-sessions`, qaapAuthenticatedFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    }));
}

export async function fetchQaapDeployEnv(workspaceKey: string): Promise<QaapDeployEnvVar[]> {
    const response = await fetch(
        `${QAAP_CLOUD_API_PATH}/deploy/env?workspaceKey=${encodeURIComponent(workspaceKey)}`,
        qaapAuthenticatedFetchInit(),
    );
    if (!response.ok) {
        return [];
    }
    const body = await response.json() as QaapDeployEnvResponse;
    return Array.isArray(body.vars) ? body.vars : [];
}

export async function saveQaapDeployEnv(workspaceKey: string, vars: QaapDeployEnvVar[]): Promise<QaapDeployEnvVar[]> {
    const response = await fetch(`${QAAP_CLOUD_API_PATH}/deploy/env`, qaapAuthenticatedFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceKey, vars }),
    }));
    if (!response.ok) {
        return vars;
    }
    const body = await response.json() as QaapDeployEnvResponse;
    return Array.isArray(body.vars) ? body.vars : vars;
}

export async function runQaapDeploy(request: QaapDeployRunRequest): Promise<QaapDeployRunResponse | undefined> {
    const response = await fetch(`${QAAP_CLOUD_API_PATH}/deploy/run`, qaapAuthenticatedFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    }));
    if (!response.ok) {
        return undefined;
    }
    return response.json() as Promise<QaapDeployRunResponse>;
}

export async function fetchQaapPushVapid(): Promise<QaapPushVapidResponse> {
    const response = await fetch(`${QAAP_CLOUD_API_PATH}/push/vapid`, qaapAuthenticatedFetchInit());
    if (!response.ok) {
        return { publicKey: '', enabled: false };
    }
    return response.json() as Promise<QaapPushVapidResponse>;
}

export async function subscribeQaapWebPush(request: QaapPushSubscribeRequest): Promise<void> {
    await fetch(`${QAAP_CLOUD_API_PATH}/push/subscribe`, qaapAuthenticatedFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    }));
}

export async function sendQaapPushNotify(request: QaapPushNotifyRequest): Promise<void> {
    await fetch(`${QAAP_CLOUD_API_PATH}/push/notify`, qaapAuthenticatedFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    }));
}

/**
 * Probes whether AppTester's CDP target is reachable from the backend. Returns `{ reachable: false }`
 * on any failure so callers can short-circuit instead of waiting on a hanging MCP startup.
 */
export async function fetchQaapCdpStatus(): Promise<QaapCdpStatusResponse> {
    try {
        const response = await fetch(`${QAAP_CLOUD_API_PATH}/cdp-status`, qaapAuthenticatedFetchInit());
        if (!response.ok) {
            return { reachable: false, endpoint: '' };
        }
        const body = await response.json() as Partial<QaapCdpStatusResponse>;
        return { reachable: !!body.reachable, endpoint: typeof body.endpoint === 'string' ? body.endpoint : '' };
    } catch {
        return { reachable: false, endpoint: '' };
    }
}
