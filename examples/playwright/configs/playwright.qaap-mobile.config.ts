// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { PlaywrightTestConfig } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Qaap mobile E2E: generous timeouts for install + dev + preview (KPI &lt;120s in CI).
 */
const qaapMobileConfig: PlaywrightTestConfig = {
    ...baseConfig,
    timeout: 180_000,
    expect: {
        timeout: 120_000,
    },
    retries: process.env.CI ? 1 : 0,
};

export default qaapMobileConfig;
