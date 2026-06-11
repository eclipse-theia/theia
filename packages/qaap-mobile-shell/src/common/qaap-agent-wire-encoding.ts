// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** UTF-8 text compressed with raw DEFLATE and base64-encoded for JSON/SSE payloads. */
export type QaapAgentWireCompressionEncoding = 'deflate-base64';

/** Minimum UTF-16 length before attempting payload compression (tool results, stdout). */
export const QAAP_AGENT_WIRE_COMPRESS_THRESHOLD = 4096;
