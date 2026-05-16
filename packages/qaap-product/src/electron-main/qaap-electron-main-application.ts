// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { existsSync } from 'fs-extra';
import { app } from 'electron';
import * as path from 'path';
import { injectable } from '@theia/core/shared/inversify';
import { ElectronMainApplication } from '@theia/core/lib/electron-main/electron-main-application';

@injectable()
export class QaapElectronMainApplication extends ElectronMainApplication {

    protected override resolveApplicationIconPath(): string | undefined {
        const ref = this.config.applicationIcon?.trim();
        if (!ref || ref.startsWith('http://') || ref.startsWith('https://')) {
            return undefined;
        }
        const candidate = path.isAbsolute(ref) ? ref : path.join(app.getAppPath(), ref.replace(/^\.\//, ''));
        return existsSync(candidate) ? candidate : undefined;
    }
}
