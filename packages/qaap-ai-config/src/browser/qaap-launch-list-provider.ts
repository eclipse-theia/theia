// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { LaunchListProvider } from '@theia/ai-ide/lib/browser/workspace-launch-provider';
import { parseListLaunchConfigurationArgs } from '../common/qaap-launch-list-args';

@injectable()
export class QaapLaunchListProvider extends LaunchListProvider {

    protected override parseListLaunchConfigurationArgs(argString: string): { filter?: string } {
        return parseListLaunchConfigurationArgs(argString);
    }
}
