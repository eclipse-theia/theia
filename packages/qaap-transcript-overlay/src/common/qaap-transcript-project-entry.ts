// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import URI from '@theia/core/lib/common/uri';

export type MobileProjectStatus = 'working' | 'review' | 'idle' | 'sleeping';

export interface MobileProjectAgent {
    role: string;
    color: string;
}

export interface MobileProjectEntry {
    id: string;
    name: string;
    color: string;
    branch: string;
    status: MobileProjectStatus;
    task: string;
    progress: number;
    agents: MobileProjectAgent[];
    lastActive: string;
    lastActiveAt?: string;
    tokens: string;
    cost: string;
    pinned: boolean;
    uri?: URI;
    github?: {
        owner: string;
        name: string;
        fullName: string;
        htmlUrl: string;
        private: boolean;
    };
    isCurrent: boolean;
    previewUrl?: string;
}
