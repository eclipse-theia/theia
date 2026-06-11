// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentConversationDTO, QaapAgentMessageSegmentDTO } from './qaap-agent-conversation-client';
import { buildQaapDevPreviewUrl, parseQaapDevPreviewPort } from './qaap-dev-preview';

const DEV_SERVER_COMMAND_RE = /\b(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve|preview)\b|\b(?:vite|next\s+dev|nuxt\s+dev|astro\s+dev|remix\s+dev)\b|\bnpx\s+vite\b|\bnpx\s+next\b/i;
const DEV_URL_IN_TEXT_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?):(\d{2,5})(?:\/[^\s`*)\]]*)?/i;
const PORT_HINT_RE = /\b(?:port(?:o|)?|puerto)\s+(\d{2,5})\b/i;
/** Common Vite/Next dev ports. Static bootstrap (8080) is probed only when explicitly hinted. */
const DEFAULT_VITE_PROBE_PORTS = [5173, 5174, 5175, 5176, 3000, 3001, 4173];

const DEV_PREVIEW_INTENT_RE = /\b(?:dev\s+server|live\s+preview|in-ide\s+preview|run\s+(?:the\s+)?(?:app|project)|build\s+and\s+run|run\s+locally|start\s+(?:the\s+)?(?:dev|app|server)|launch\s+(?:the\s+)?(?:app|project|server)|preview\s+(?:the\s+)?(?:app|project)|show\s+(?:me\s+)?(?:the\s+)?app|boot(?:s|ed)\s+cleanly|figure\s+out\s+how\s+to\s+build|levanta(?:r)?\s+(?:la\s+)?(?:app|aplicaci[oó]n|servidor|proyecto)|inicia(?:r)?\s+(?:la\s+)?(?:app|aplicaci[oó]n|servidor|proyecto)|arranca(?:r)?\s+(?:la\s+)?(?:app|aplicaci[oó]n|servidor|proyecto)|ejecuta(?:r)?\s+(?:la\s+)?(?:app|aplicaci[oó]n|proyecto)|corre(?:r)?\s+(?:la\s+)?(?:app|aplicaci[oó]n|proyecto)|muestra(?:r)?\s+(?:la\s+)?(?:app|aplicaci[oó]n|preview|vista\s+previa)|vista\s+previa|servidor\s+de\s+desarrollo|abre(?:r)?\s+(?:la\s+)?(?:app|aplicaci[oó]n|preview))\b/i;

/** True when user text asks to run or preview the app locally. */
export function messageRequestsDevPreview(text: string | undefined): boolean {
    return !!text?.trim() && DEV_PREVIEW_INTENT_RE.test(text);
}

function findLastUserMessageContent(conv: QaapAgentConversationDTO): string | undefined {
    for (let index = conv.messages.length - 1; index >= 0; index -= 1) {
        const message = conv.messages[index];
        if (message.role === 'user') {
            return message.content;
        }
    }
    return undefined;
}

/** Whether the active conversation turn asked Qaap to run or preview the app. */
export function conversationRequestsDevPreview(conv: QaapAgentConversationDTO): boolean {
    return messageRequestsDevPreview(findLastUserMessageContent(conv));
}

/** Parses localhost URLs or explicit port hints from agent / tool text. */
export function extractDevPreviewUrlFromAgentText(text: string | undefined, origin?: string): string | undefined {
    if (!text?.trim()) {
        return undefined;
    }
    const direct = text.match(DEV_URL_IN_TEXT_RE);
    const portRaw = direct?.[1] ?? text.match(PORT_HINT_RE)?.[1];
    if (!portRaw) {
        return undefined;
    }
    const port = parseQaapDevPreviewPort(portRaw);
    if (port === undefined) {
        return undefined;
    }
    const base = origin?.trim() || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return buildQaapDevPreviewUrl(base, port);
}

function segmentText(segment: QaapAgentMessageSegmentDTO): string {
    if (segment.type === 'tool') {
        return `${segment.args}\n${segment.result ?? ''}`;
    }
    return segment.content;
}

/** Scans the conversation for a dev preview URL or port hint from the agent. */
export function findTranscriptPreviewUrlFromConversation(
    conv: QaapAgentConversationDTO,
    origin?: string,
): string | undefined {
    for (const message of [...conv.messages].reverse()) {
        const fromContent = extractDevPreviewUrlFromAgentText(message.content, origin);
        if (fromContent) {
            return fromContent;
        }
        for (const segment of [...(message.segments ?? [])].reverse()) {
            const fromSegment = extractDevPreviewUrlFromAgentText(segmentText(segment), origin);
            if (fromSegment) {
                return fromSegment;
            }
        }
    }
    return undefined;
}

export function findTranscriptPreviewPortHint(conv: QaapAgentConversationDTO): number | undefined {
    const fromUrl = findTranscriptPreviewUrlFromConversation(conv);
    if (fromUrl) {
        const match = /\/qaap-dev\/(\d+)\//.exec(fromUrl);
        const port = parseQaapDevPreviewPort(match?.[1]);
        if (port !== undefined) {
            return port;
        }
    }
    for (const message of [...conv.messages].reverse()) {
        const texts = [message.content, ...(message.segments ?? []).map(segmentText)];
        for (const text of texts) {
            const direct = text?.match(DEV_URL_IN_TEXT_RE);
            const portRaw = direct?.[1] ?? text?.match(PORT_HINT_RE)?.[1];
            const port = parseQaapDevPreviewPort(portRaw);
            if (port !== undefined) {
                return port;
            }
        }
    }
    return undefined;
}

export function isLikelyDevServerShellCommand(command: string | undefined): boolean {
    return !!command?.trim() && DEV_SERVER_COMMAND_RE.test(command);
}

export function isShellToolName(name: string | undefined): boolean {
    const normalized = name?.trim().toLowerCase() ?? '';
    if (!normalized) {
        return false;
    }
    return normalized.includes('bash')
        || normalized.includes('shell')
        || normalized.includes('terminal')
        || normalized.startsWith('run_');
}

function extractBashCommand(args: string | undefined): string | undefined {
    if (!args?.trim()) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(args) as { command?: unknown };
        return typeof parsed.command === 'string' ? parsed.command : undefined;
    } catch {
        return undefined;
    }
}

/** True when the latest agent turn is running a long-lived dev-server shell command. */
export function conversationHasActiveDevServerRun(conv: QaapAgentConversationDTO): boolean {
    if (conv.status !== 'streaming') {
        return false;
    }
    const agentMessage = [...conv.messages].reverse().find(message => message.role === 'agent');
    if (!agentMessage?.segments?.length) {
        return false;
    }
    for (const segment of [...agentMessage.segments].reverse()) {
        if (segment.type !== 'tool' || segment.finished) {
            continue;
        }
        if (!isShellToolName(segment.name)) {
            continue;
        }
        const command = extractBashCommand(segment.args);
        if (isLikelyDevServerShellCommand(command)) {
            return true;
        }
        const combined = segmentText(segment);
        if (isLikelyDevServerShellCommand(combined) || DEV_URL_IN_TEXT_RE.test(combined)) {
            return true;
        }
    }
    return false;
}

/** True when the latest agent turn still has an unfinished shell / terminal tool. */
export function conversationHasActiveShellRun(conv: QaapAgentConversationDTO): boolean {
    if (conv.status !== 'streaming') {
        return false;
    }
    const agentMessage = [...conv.messages].reverse().find(message => message.role === 'agent');
    if (!agentMessage?.segments?.length) {
        return false;
    }
    return agentMessage.segments.some(segment =>
        segment.type === 'tool'
        && !segment.finished
        && isShellToolName(segment.name),
    );
}

/** Whether we should keep polling the dev-preview probe for this conversation. */
export function conversationAwaitingDevPreview(conv: QaapAgentConversationDTO): boolean {
    if (conv.status !== 'streaming') {
        return false;
    }
    return conversationHasActiveDevServerRun(conv)
        || conversationHasActiveShellRun(conv)
        || findTranscriptPreviewPortHint(conv) !== undefined;
}

/** Whether the transcript UI should probe ports and/or open Preview for this conversation. */
export function conversationShouldWatchDevPreview(
    conv: QaapAgentConversationDTO,
    origin?: string,
): boolean {
    return conversationAwaitingDevPreview(conv)
        || conversationRequestsDevPreview(conv)
        || findTranscriptPreviewUrlFromConversation(conv, origin) !== undefined;
}

export interface TranscriptPreviewPortProbeResult {
    readonly ready: boolean;
    readonly previewUrl: string;
}

/** Probes candidate ports until one responds as a live dev preview. */
export async function resolveReadyTranscriptPreviewUrlFromProbe(
    conv: QaapAgentConversationDTO,
    probePort: (port: number) => Promise<TranscriptPreviewPortProbeResult>,
    origin?: string,
): Promise<string | undefined> {
    if (!conversationShouldWatchDevPreview(conv, origin)) {
        return undefined;
    }
    for (const port of transcriptPreviewProbePorts(conv)) {
        const probe = await probePort(port);
        if (probe.ready) {
            return probe.previewUrl;
        }
    }
    return undefined;
}

function conversationAgentFinishedTool(conv: QaapAgentConversationDTO): boolean {
    const agentMessage = [...conv.messages].reverse().find(message => message.role === 'agent');
    return !!agentMessage?.segments?.some(segment => segment.type === 'tool' && segment.finished);
}

/** True when default dev ports may be probed (avoids opening a stale server mid-turn). */
export function conversationShouldProbeDefaultDevPreviewPorts(conv: QaapAgentConversationDTO): boolean {
    if (findTranscriptPreviewPortHint(conv) !== undefined) {
        return true;
    }
    if (conv.status !== 'streaming') {
        return true;
    }
    if (conversationHasActiveDevServerRun(conv) || conversationHasActiveShellRun(conv)) {
        return true;
    }
    return conversationAgentFinishedTool(conv);
}

/** True when bootstrap may start install/dev for this conversation turn. */
export function conversationShouldKickoffDevPreviewBootstrap(conv: QaapAgentConversationDTO): boolean {
    return conversationShouldProbeDefaultDevPreviewPorts(conv);
}

/**
 * True when the UI may auto-switch to Preview and mount the iframe.
 *
 * Never auto-open mid-turn: the agent may still be installing dependencies or fixing the
 * build, and pending approval prompts must stay visible in the transcript. While streaming,
 * the ready URL is staged ("Preview ready" offer) and the preview opens automatically once
 * the turn settles (see `finalizeTranscriptDevPreviewAfterSettle`).
 */
export function conversationMayAutoOpenTranscriptPreview(conv: QaapAgentConversationDTO | undefined): boolean {
    if (!conv) {
        return false;
    }
    return conv.status !== 'streaming';
}

/** Ports to probe while waiting for a dev server to bind. */
export function transcriptPreviewProbePorts(conv: QaapAgentConversationDTO): readonly number[] {
    const hinted = findTranscriptPreviewPortHint(conv);
    const ports: number[] = [];
    if (hinted !== undefined) {
        ports.push(hinted);
    }
    if (conversationShouldProbeDefaultDevPreviewPorts(conv)) {
        for (const port of DEFAULT_VITE_PROBE_PORTS) {
            if (!ports.includes(port)) {
                ports.push(port);
            }
        }
    }
    return ports;
}
