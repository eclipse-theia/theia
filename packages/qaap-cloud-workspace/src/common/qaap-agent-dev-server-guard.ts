// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { isShellToolName } from '@theia/qaap-mobile-shell/lib/common/qaap-transcript-preview-offer';
import type { QaapQaiqPendingControlRequest } from './qaap-qaiq-stdio-approvals';

/**
 * Guard against agents launching long-lived dev servers through shell tools.
 *
 * Shell tool calls time out after ~30s, so a `pnpm dev` started there dies and breaks
 * the live preview. Qaap runs dev servers in a dedicated persistent terminal instead
 * (see `QaapProjectBootstrapService`); the agent only needs to report the expected port.
 */

/** `pnpm dev`, `npm start`, `yarn serve`, `bun run preview`, … */
const PACKAGE_MANAGER_DEV_RE = /\b(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve|preview)\b/i;
/** Framework binaries at command position: `vite`, `npx next dev`, `nohup astro dev`, … */
const FRAMEWORK_BIN_RE = /(?:^|&&|\|\||;|\(\s*|\b(?:nohup|exec)\s+)\s*(?:npx\s+|bunx\s+)?(?:vite|next|nuxt|astro|remix|webpack-dev-server|react-scripts)\b/i;
/** One-shot subcommands that look like dev tooling but exit on their own. */
const ONE_SHOT_RE = /(?:\b(?:build|export|test|lint|typecheck|info|telemetry)\b|--version|--help)/i;

/** True for shell commands that start a long-lived dev server (background variants included). */
export function isLongLivedDevServerShellCommand(command: string | undefined): boolean {
    const text = command?.trim();
    if (!text) {
        return false;
    }
    if (ONE_SHOT_RE.test(text)) {
        return false;
    }
    return PACKAGE_MANAGER_DEV_RE.test(text) || FRAMEWORK_BIN_RE.test(text);
}

/** Deny guidance sent back to the agent so it self-corrects instead of retrying. */
export function buildDevServerShellDenyMessage(): string {
    return 'Blocked by Qaap: do not start dev servers from shell tools — they time out after ~30s and kill the live preview. '
        + 'Qaap runs the dev server in a dedicated terminal with hot reload. '
        + 'Run only one-shot commands (install, build, typecheck, test). '
        + 'When the app is ready to preview, reply stating the expected local port (e.g. 5173) and confirm dependencies are installed; '
        + 'Qaap will start the server and open the preview automatically.';
}

/**
 * Returns the deny message when a pending QAIQ `can_use_tool` request is a shell tool
 * launching a long-lived dev server; `undefined` means the request should proceed
 * through the normal approval flow.
 */
export function findQaiqDevServerGuardDenial(request: QaapQaiqPendingControlRequest): string | undefined {
    if (!isShellToolName(request.toolName)) {
        return undefined;
    }
    const command = typeof request.toolInput?.command === 'string' ? request.toolInput.command : undefined;
    return isLongLivedDevServerShellCommand(command) ? buildDevServerShellDenyMessage() : undefined;
}
