// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Parses optional `filter` args for listLaunchConfigurations without throwing on empty input. */
export function parseListLaunchConfigurationArgs(argString: string): { filter?: string } {
    return argString && argString.trim() ? JSON.parse(argString) : {};
}
