// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { filterQaiqStreamMetadataLines } from '@theia/qaap-mobile-shell/lib/common/qaap-qaiq-stream';

export function filterAgentProcessLogChunk(chunk: string): string {
    if (!chunk) {
        return '';
    }
    const withoutMetadata = filterQaiqStreamMetadataLines(chunk);
    const lines = withoutMetadata.split('\n');
    const kept = lines.filter(line =>
        !/^\[context\] Warning: model .+ not in integration model metadata/.test(line)
        && !/^Warning: no stdin data received in \d+s/.test(line)
    );
    return kept.join('\n');
}
