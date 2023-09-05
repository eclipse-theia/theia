// *****************************************************************************
// Copyright (C) 2023 Mathieu Bussieres and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// Based on https://github.com/microsoft/vscode/blob/1.72.2/src/vs/workbench/contrib/testing/common/constants.ts

/* eslint-disable import/no-extraneous-dependencies */
export const enum Testing {
    // marked as "extension" so that any existing test extensions are assigned to it.
    ViewletId = 'workbench.view.extension.test',
    ExplorerViewId = 'workbench.view.testing',
    OutputPeekContributionId = 'editor.contrib.testingOutputPeek',
    DecorationsContributionId = 'editor.contrib.testingDecorations',
}

export const enum TestCommandId {
    CancelTestRefreshAction = 'testing.cancelTestRefresh',
    CancelTestRunAction = 'testing.cancelRun',
    ClearTestResultsAction = 'testing.clearTestResults',
    CollapseAllAction = 'testing.collapseAll',
    ConfigureTestProfilesAction = 'testing.configureProfile',
    DebugAction = 'testing.debug',
    DebugAllAction = 'testing.debugAll',
    DebugAtCursor = 'testing.debugAtCursor',
    DebugCurrentFile = 'testing.debugCurrentFile',
    DebugFailedTests = 'testing.debugFailTests',
    DebugLastRun = 'testing.debugLastRun',
    DebugSelectedAction = 'testing.debugSelected',
    FilterAction = 'workbench.actions.treeView.testExplorer.filter',
    GoToTest = 'testing.editFocusedTest',
    HideTestAction = 'testing.hideTest',
    OpenOutputPeek = 'testing.openOutputPeek',
    RefreshTestsAction = 'testing.refreshTests',
    ReRunFailedTests = 'testing.reRunFailTests',
    ReRunLastRun = 'testing.reRunLastRun',
    RunAction = 'testing.run',
    RunAllAction = 'testing.runAll',
    RunAtCursor = 'testing.runAtCursor',
    RunCurrentFile = 'testing.runCurrentFile',
    RunSelectedAction = 'testing.runSelected',
    RunUsingProfileAction = 'testing.runUsing',
    SearchForTestExtension = 'testing.searchForTestExtension',
    SelectDefaultTestProfiles = 'testing.selectDefaultTestProfiles',
    ShowMostRecentOutputAction = 'testing.showMostRecentOutput',
    TestingSortByDurationAction = 'testing.sortByDuration',
    TestingSortByLocationAction = 'testing.sortByLocation',
    TestingSortByStatusAction = 'testing.sortByStatus',
    TestingViewAsListAction = 'testing.viewAsList',
    TestingViewAsTreeAction = 'testing.viewAsTree',
    ToggleAutoRun = 'testing.toggleautoRun',
    ToggleInlineTestOutput = 'testing.toggleInlineTestOutput',
    UnhideTestAction = 'testing.unhideTest',
    UnhideAllTestsAction = 'testing.unhideAllTests',
}
