// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { resolveQaapCodexTemplate } from './qaap-builtin-agents';

describe('qaap-builtin-agents', () => {

    it('uses codex exec --json for newer Codex CLI help output', () => {
        expect(resolveQaapCodexTemplate('Usage: codex [OPTIONS] [COMMAND]\n\nCommands:\n  exec  Run non-interactively'))
            .to.equal('codex exec --json {model_flags} {prompt}');
    });

    it('uses quiet top-level mode with --json for old Codex CLI help output', () => {
        expect(resolveQaapCodexTemplate('Usage\n  $ codex [options] <prompt>\n\nOptions\n  -q, --quiet'))
            .to.equal('codex -q --json {model_flags} {prompt}');
    });
});
