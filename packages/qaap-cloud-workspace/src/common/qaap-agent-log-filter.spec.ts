// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { filterAgentProcessLogChunk } from './qaap-agent-log-filter';

describe('filterAgentProcessLogChunk', () => {

    it('returns empty string for empty input', () => {
        expect(filterAgentProcessLogChunk('')).to.equal('');
    });

    it('passes through normal log lines unchanged', () => {
        const line = 'Running bash: ls -la';
        expect(filterAgentProcessLogChunk(line)).to.equal(line);
    });

    it('strips context model metadata warning lines', () => {
        const input = [
            'Starting task',
            '[context] Warning: model claude-sonnet-4-5 not in integration model metadata',
            'Task output here',
        ].join('\n');
        const result = filterAgentProcessLogChunk(input);
        expect(result).not.to.include('[context] Warning: model');
        expect(result).to.include('Starting task');
        expect(result).to.include('Task output here');
    });

    it('strips no-stdin-data warnings', () => {
        const input = [
            'Output line 1',
            'Warning: no stdin data received in 10s',
            'Output line 2',
        ].join('\n');
        const result = filterAgentProcessLogChunk(input);
        expect(result).not.to.include('no stdin data received');
        expect(result).to.include('Output line 1');
        expect(result).to.include('Output line 2');
    });

    it('preserves newline structure after filtering', () => {
        const input = 'line1\nline2\nline3';
        expect(filterAgentProcessLogChunk(input)).to.equal('line1\nline2\nline3');
    });

    it('returns empty string when all lines are filtered', () => {
        const input = [
            '[context] Warning: model gpt-4o not in integration model metadata',
            'Warning: no stdin data received in 5s',
        ].join('\n');
        expect(filterAgentProcessLogChunk(input)).to.equal('');
    });

    it('strips QAIQ stream-json system init lines', () => {
        const input = [
            '{"type":"system","subtype":"init","cwd":"/tmp","model":"moonshotai/kimi-k2.6:free"}',
            '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hola"}}}',
            'Task output here',
        ].join('\n');
        const result = filterAgentProcessLogChunk(input);
        expect(result).not.to.include('"type":"system"');
        expect(result).to.include('"type":"stream_event"');
        expect(result).to.include('Task output here');
    });
});
