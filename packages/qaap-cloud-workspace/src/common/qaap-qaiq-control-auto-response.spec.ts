// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { resolveQaiqControlRequestAutoAction } from './qaap-qaiq-control-auto-response';

describe('qaap-qaiq-control-auto-response', () => {
    const approveForMeCommand = 'qaiq --permission-mode default --allowed-tools Read,Grep,Glob,LS,Edit,Write,NotebookEdit';

    it('queues manual approvals when auto-approve is off', () => {
        expect(resolveQaiqControlRequestAutoAction(approveForMeCommand, false, {
            requestId: 'req-1',
            toolName: 'Read',
        })).to.equal('queue');
    });

    it('queues WebSearch under approve-for-me allowed-tools so the user can grant it', () => {
        expect(resolveQaiqControlRequestAutoAction(approveForMeCommand, true, {
            requestId: 'req-1',
            toolName: 'WebSearch',
        })).to.equal('queue');
    });

    it('queues Bash under approve-for-me allowed-tools so the user can grant it', () => {
        expect(resolveQaiqControlRequestAutoAction(approveForMeCommand, true, {
            requestId: 'req-1',
            toolName: 'Bash',
        })).to.equal('queue');
    });

    it('queues shell/network tools when no allowed-tools list is present', () => {
        expect(resolveQaiqControlRequestAutoAction('qaiq --permission-mode default', true, {
            requestId: 'req-1',
            toolName: 'WebFetch',
        })).to.equal('queue');
    });

    it('allows Read under approve-for-me allowed-tools', () => {
        expect(resolveQaiqControlRequestAutoAction(approveForMeCommand, true, {
            requestId: 'req-1',
            toolName: 'Read',
        })).to.equal('allow');
    });

    it('allows everything in bypassPermissions mode', () => {
        expect(resolveQaiqControlRequestAutoAction('qaiq --permission-mode bypassPermissions', true, {
            requestId: 'req-1',
            toolName: 'WebSearch',
        })).to.equal('allow');
    });

    it('denies Agent subagents — they cannot be approved interactively', () => {
        expect(resolveQaiqControlRequestAutoAction(approveForMeCommand, true, {
            requestId: 'req-1',
            toolName: 'Agent',
        })).to.equal('deny');
        expect(resolveQaiqControlRequestAutoAction('qaiq --permission-mode default', true, {
            requestId: 'req-2',
            toolName: 'Task',
        })).to.equal('deny');
    });

    it('denies long-lived dev-server shell commands even with auto-approve', () => {
        expect(resolveQaiqControlRequestAutoAction('qaiq --permission-mode bypassPermissions', true, {
            requestId: 'req-1',
            toolName: 'Bash',
            toolInput: { command: 'pnpm dev' },
        })).to.equal('deny');
    });
});
