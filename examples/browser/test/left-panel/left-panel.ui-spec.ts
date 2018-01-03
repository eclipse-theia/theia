/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

/* tslint:disable:no-unused-expression*/
import { expect } from "chai";
import { LeftPanel } from "./left-panel";
import { MainPage } from '../main-page/main-page';
let leftPanel: LeftPanel;
let mainPage: MainPage;

before(() => {
    const driver = browser;
    const url = '/';

    driver.url(url);
    leftPanel = new LeftPanel(driver);
    mainPage = new MainPage(driver);
    /* Make sure that the application shell is loaded */
    expect(mainPage.applicationShellExists()).to.be.true;
});

describe('theia left panel', () => {
    it(`should show 'Files', 'Git' and 'Extensions`, () => {
        expect(leftPanel.doesTabExist('Files')).to.be.true;
        expect(leftPanel.doesTabExist('Git')).to.be.true;
        expect(leftPanel.doesTabExist('Extensions')).to.be.true;
    });

    describe('files tab', () => {
        it(`should open/close the files tab`, () => {
            leftPanel.openCloseTab('Files');
            expect(leftPanel.isFileTreeVisible()).to.be.true;
            expect(leftPanel.isTabActive('Files')).to.be.true;

            leftPanel.openCloseTab('Files');
            expect(leftPanel.isFileTreeVisible()).to.be.false;
            expect(leftPanel.isTabActive('Files')).to.be.false;
        });
    });

    describe('git tab', () => {
        it(`should open/close the git tab`, () => {
            leftPanel.openCloseTab('Git');
            expect(leftPanel.isGitContainerVisible()).to.be.true;
            expect(leftPanel.isTabActive('Git')).to.be.true;

            leftPanel.openCloseTab('Git');
            expect(leftPanel.isGitContainerVisible()).to.be.false;
            expect(leftPanel.isTabActive('Git')).to.be.false;
        });
    });

    describe('extensions tab', () => {
        it(`should open/close the extensions tab`, () => {
            leftPanel.openCloseTab('Extensions');
            expect(leftPanel.isExtensionTabVisible()).to.be.true;
            expect(leftPanel.isTabActive('Extensions')).to.be.true;

            leftPanel.openCloseTab('Extensions');
            expect(leftPanel.isExtensionTabVisible()).to.be.false;
            expect(leftPanel.isTabActive('Extensions')).to.be.false;
        });
    });
});
