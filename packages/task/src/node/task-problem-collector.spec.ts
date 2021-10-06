/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { expect } from 'chai';
import { DiagnosticSeverity } from '@theia/core/shared/vscode-languageserver-protocol';
import { ProblemCollector } from './task-problem-collector';
import { ApplyToKind, FileLocationKind, ProblemLocationKind, ProblemMatch, ProblemMatchData, ProblemMatcher } from '../common/problem-matcher-protocol';
import { Severity } from '@theia/core/lib/common/severity';

const startStopMatcher1: ProblemMatcher = {
    owner: 'test1',
    source: 'test1',
    applyTo: ApplyToKind.allDocuments,
    fileLocation: FileLocationKind.Absolute,
    pattern: {
        regexp: /^([^:]*: )?((.:)?[^:]*):(\d+)(:(\d+))?: (.*)$/.source,
        kind: ProblemLocationKind.Location,
        file: 2,
        line: 4,
        character: 6,
        message: 7
    },
    severity: Severity.Error
};

const startStopMatcher2: ProblemMatcher = {
    owner: 'test2',
    source: 'test2',
    applyTo: ApplyToKind.allDocuments,
    fileLocation: FileLocationKind.Absolute,
    pattern: [
        {
            regexp: /^([^\s].*)$/.source,
            kind: ProblemLocationKind.Location,
            file: 1
        },
        {
            regexp: /^\s+(\d+):(\d+)\s+(error|warning|info)\s+(.+?)(?:\s\s+(.*))?$/.source,
            line: 1,
            character: 2,
            severity: 3,
            message: 4,
            code: 5,
            loop: true
        }
    ],
    severity: Severity.Error
};

const watchMatcher: ProblemMatcher = {
    owner: 'test3',
    applyTo: ApplyToKind.closedDocuments,
    fileLocation: FileLocationKind.Absolute,
    pattern: {
        regexp: /Error: ([^(]+)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\): (.*)$/.source,
        file: 1,
        location: 2,
        message: 3
    },
    watching: {
        activeOnStart: false,
        beginsPattern: { regexp: /Starting compilation/.source },
        endsPattern: { regexp: /Finished compilation/.source }
    }
};

describe('ProblemCollector', () => {
    let collector: ProblemCollector;
    const allMatches: ProblemMatch[] = [];

    const collectMatches = (lines: string[]) => {
        lines.forEach(line => {
            const matches = collector.processLine(line);
            if (matches.length > 0) {
                allMatches.push(...matches);
            }
        });
    };

    beforeEach(() => {
        allMatches.length = 0;
    });

    it('should find problems from start-stop task when problem matcher is associated with one problem pattern', () => {
        collector = new ProblemCollector([startStopMatcher1]);
        collectMatches([
            'npm WARN lifecycle The node binary used for scripts is /tmp/yarn--1557403301319-0.5645247996849125/node but npm is using /usr/local/bin/node itself.',
            'Use the `--scripts-prepend-node-path` option to include the path for the node binary npm was executed with.',
            '',
            '# command-line-arguments',
            '/home/test/hello.go:9:2: undefined: fmt.Pntln',
            '/home/test/hello.go:10:6: undefined: numb',
            '/home/test/hello.go:15:9: undefined: stri'
        ]);

        expect(allMatches.length).to.eq(3);

        expect((allMatches[0] as ProblemMatchData).resource!.path).eq('/home/test/hello.go');
        expect((allMatches[0] as ProblemMatchData).marker).deep.equal({
            range: { start: { line: 8, character: 1 }, end: { line: 8, character: 1 } },
            severity: DiagnosticSeverity.Error,
            source: 'test1',
            message: 'undefined: fmt.Pntln'
        });

        expect((allMatches[1] as ProblemMatchData).resource!.path).eq('/home/test/hello.go');
        expect((allMatches[1] as ProblemMatchData).marker).deep.equal({
            range: { start: { line: 9, character: 5 }, end: { line: 9, character: 5 } },
            severity: DiagnosticSeverity.Error,
            source: 'test1',
            message: 'undefined: numb'
        });

        expect((allMatches[2] as ProblemMatchData).resource!.path).eq('/home/test/hello.go');
        expect((allMatches[2] as ProblemMatchData).marker).deep.equal({
            range: { start: { line: 14, character: 8 }, end: { line: 14, character: 8 } },
            severity: DiagnosticSeverity.Error,
            source: 'test1',
            message: 'undefined: stri'
        });
    });

    it('should find problems from start-stop task when problem matcher is associated with more than one problem pattern', () => {
        collector = new ProblemCollector([startStopMatcher2]);
        collectMatches([
            '> test@0.1.0 lint /home/test',
            '> eslint .',
            '',
            '',
            '/home/test/test-dir.js',
            '  14:21  warning  Missing semicolon  semi',
            '  15:23  warning  Missing semicolon  semi',
            '  103:9  error  Parsing error: Unexpected token inte',
            '',
            '/home/test/more-test.js',
            '  13:9  error  Parsing error: Unexpected token 1000',
            '',
            '✖ 3 problems (1 error, 2 warnings)',
            '  0 errors and 2 warnings potentially fixable with the `--fix` option.'
        ]);

        expect(allMatches.length).to.eq(4);

        expect((allMatches[0] as ProblemMatchData).resource!.path).eq('/home/test/test-dir.js');
        expect((allMatches[0] as ProblemMatchData).marker).deep.equal({
            range: { start: { line: 13, character: 20 }, end: { line: 13, character: 20 } },
            severity: DiagnosticSeverity.Warning,
            source: 'test2',
            message: 'Missing semicolon',
            code: 'semi'
        });

        expect((allMatches[1] as ProblemMatchData).resource!.path).eq('/home/test/test-dir.js');
        expect((allMatches[1] as ProblemMatchData).marker).deep.equal({
            range: { start: { line: 14, character: 22 }, end: { line: 14, character: 22 } },
            severity: DiagnosticSeverity.Warning,
            source: 'test2',
            message: 'Missing semicolon',
            code: 'semi'
        });

        expect((allMatches[2] as ProblemMatchData).resource!.path).eq('/home/test/test-dir.js');
        expect((allMatches[2] as ProblemMatchData).marker).deep.equal({
            range: { start: { line: 102, character: 8 }, end: { line: 102, character: 8 } },
            severity: DiagnosticSeverity.Error,
            source: 'test2',
            message: 'Parsing error: Unexpected token inte'
        });

        expect((allMatches[3] as ProblemMatchData).resource!.path).eq('/home/test/more-test.js');
        expect((allMatches[3] as ProblemMatchData).marker).deep.equal({
            range: { start: { line: 12, character: 8 }, end: { line: 12, character: 8 } },
            severity: DiagnosticSeverity.Error,
            source: 'test2',
            message: 'Parsing error: Unexpected token 1000'
        });
    });

    it('should search and find defined problems from watch task\'s output', () => {
        collector = new ProblemCollector([watchMatcher]);

        collectMatches([
            '> code-oss-dev@1.33.1 watch /home/test/vscode',
            '> gulp watch --max_old_space_size=4095',
            '',
            '[09:15:37] Node flags detected: --max_old_space_size=4095',
            '[09:15:37] Respawned to PID: 14560',
            '[09:15:40] Using gulpfile ~/dev/vscode/gulpfile.js',
            "[09:15:40] Starting 'watch'...",
            '[09:15:40] Starting clean-out ...',
            '[09:15:41] Starting clean-extension-configuration-editing ...',
            '[09:15:41] Starting clean-extension-css-language-features-client ...',
            '[09:15:41] Starting clean-extension-css-language-features-server ...',
            '[09:15:41] Starting clean-extension-debug-auto-launch ...',
            '[09:15:41] Starting watch-extension:markdown-language-features-preview-src ...',
            '[09:15:41] Starting compilation...', // begin pattern 1
            '[09:15:41] Finished clean-extension-typescript-basics-test-colorize-fixtures after 49 ms',
            '[09:15:41] Starting watch-extension:typescript-basics-test-colorize-fixtures ...',
            '[09:15:41] Finished compilation with 0 errors after 30 ms',
            '[09:15:41] Finished clean-extension-css-language-features-client after 119 ms',
            '[09:15:41] Starting watch-extension:css-language-features-client ...',
            '[09:15:41] Starting compilation...', // begin pattern 2
            '[09:15:41] Finished clean-extension-configuration-editing after 128 ms',
            '[09:15:41] Starting watch-extension:configuration-editing ...',
            '[09:15:41] Finished clean-extension-debug-auto-launch after 133 ms',
            '[09:15:41] Starting watch-extension:debug-auto-launch ...',
            '[09:15:41] Finished clean-extension-debug-server-ready after 138 ms',
            '[09:15:52] Starting watch-extension:html-language-features-server ...',
            '[09:15:58] Finished clean-out after 17196 ms',
            '[09:15:58] Starting watch-client ...',
            '[09:17:25] Finished compilation with 0 errors after 104209 ms',
            '[09:19:22] Starting compilation...', // begin pattern 3
            "[09:19:23] Error: /home/test/src/vs/workbench/contrib/tasks/common/taskConfiguration.ts(517,19): ')' expected.", // problem 1
            "[09:19:23] Error: /home/test/src/vs/workbench/contrib/tasks/common/taskConfiguration.ts(517,57): ';' expected.", // problem 2
            '[09:19:23] Finished compilation with 2 errors after 1051 ms',
            '[09:20:21] Starting compilation...', // begin pattern 4
            "[09:20:24] Error: /home/test/src/vs/workbench/contrib/tasks/common/problemCollectors.ts(15,30): Cannot find module 'n/uuid'.", // problem 3
            "[09:20:24] Error: /home/test/src/vs/workbench/contrib/tasks/common/taskConfiguration.ts(517,19): ')' expected.", // problem 4
            "[09:20:24] Error: /home/test/src/vs/workbench/contrib/tasks/common/taskConfiguration.ts(517,57): ';' expected.", // problem 5
            '[09:20:24] Finished compilation with 3 errors after 2586 ms',
            '[09:20:24] Starting compilation...', // begin pattern 5
            '[09:20:25] Error: /home/test/src/vs/workbench/contrib/tasks/common/taskTemplates.ts(12,14): Type expected.', // problem 6
            "[09:20:25] Error: /home/test/src/vs/workbench/contrib/tasks/common/problemCollectors.ts(15,30): Cannot find module 'n/uuid'.", // problem 7
            "[09:20:25] Error: /home/test/src/vs/workbench/contrib/tasks/common/taskConfiguration.ts(517,19): ')' expected.", // problem 8
            "[09:20:25] Error: /home/test/src/vs/workbench/contrib/tasks/common/taskConfiguration.ts(517,57): ';' expected.", // problem 9
            '[09:20:25] Finished compilation with 4 errors after 441 ms'
        ]);

        expect(allMatches.length).to.eq(14); // 9 events for problems + 5 events for beginner pattern
    });

    it('should return an empty array if no problems are found', () => {
        collector = new ProblemCollector([startStopMatcher2]);

        collectMatches([]);
        expect(allMatches.length).to.eq(0);

        collectMatches([
            '> test@0.1.0 lint /home/test',
            '> eslint .',
            '',
            '',
            '0 problems (0 error, 0 warnings)',
        ]);
        expect(allMatches.length).to.eq(0);
    });
});
