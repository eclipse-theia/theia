// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildWorkHubHomeGreeting,
    buildWorkHubHomeRecentItems,
    buildWorkHubHomeSubtitle,
    formatWorkHubRelativeTime,
    selectWorkHubHomePinnedProjectIds,
} from './qaap-work-hub-home';

describe('qaap-work-hub-home', () => {

    it('buildWorkHubHomeRecentItems keeps newest items first', () => {
        const items = buildWorkHubHomeRecentItems([
            {
                id: 'a',
                projectId: 'p1',
                projectName: 'Alpha',
                title: 'Old',
                subtitle: '',
                surface: 'task',
                updatedAt: 10,
            },
            {
                id: 'b',
                projectId: 'p2',
                projectName: 'Beta',
                title: 'New',
                subtitle: '',
                surface: 'chat',
                updatedAt: 99,
            },
        ], 1);
        expect(items).to.deep.equal([{
            id: 'b',
            projectId: 'p2',
            projectName: 'Beta',
            title: 'New',
            subtitle: '',
            surface: 'chat',
            updatedAt: 99,
        }]);
    });

    it('selectWorkHubHomePinnedProjectIds prefers pinned repos', () => {
        const ids = selectWorkHubHomePinnedProjectIds([
            { id: 'a', pinned: false, isCurrent: true, lastActiveAt: '2026-05-30T10:00:00.000Z' },
            { id: 'b', pinned: true, isCurrent: false, lastActiveAt: '2026-05-29T10:00:00.000Z' },
        ], 2);
        expect(ids).to.deep.equal(['b', 'a']);
    });

    it('buildWorkHubHomeSubtitle prioritizes attention over running work', () => {
        expect(buildWorkHubHomeSubtitle({
            projectCount: 2,
            runningTasks: 3,
            needsYou: 2,
            openPullRequests: 1,
            localChatCount: 0,
        })).to.equal('2 items need your attention');
    });

    it('buildWorkHubHomeGreeting uses time of day and user name', () => {
        const morning = new Date('2026-05-30T09:00:00').getTime();
        expect(buildWorkHubHomeGreeting('Alex', morning)).to.equal('Good morning, Alex');
        expect(buildWorkHubHomeGreeting(undefined, morning)).to.equal('Good morning');
    });

    it('formatWorkHubRelativeTime formats recent timestamps', () => {
        const now = Date.parse('2026-05-30T12:00:00.000Z');
        expect(formatWorkHubRelativeTime(Date.parse('2026-05-30T11:58:00.000Z'), now, {
            justNow: 'just now',
            minutesAgo: count => `${count}m ago`,
            hoursAgo: count => `${count}h ago`,
            daysAgo: count => `${count}d ago`,
        })).to.equal('2m ago');
    });

});
