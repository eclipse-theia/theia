/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'webdriverio';
import { assert } from 'chai';
import { MainPage } from './pages/main-page';
import { ExtensionManager } from './pages/extension-manager';
import { resetExtensions } from 'showdown';

describe('ExtensionManager', () => {

    const url = '/';
    let mainPage: MainPage;
    let extensionManager: ExtensionManager;

    const testExtensionName = '@theia/cpp';
    let cppWasUninstalled = false;

    before(() => {
        browser.url(url);
        if (browser.getTitle() === 'localhost') {
            browser.waitUntil(function () {
                return browser.getTitle() === '';
            }, 300000);
        }
        mainPage = new MainPage(browser);
        extensionManager = new ExtensionManager(browser);
        mainPage.waitForLoadingPanels();
    });

    describe('Tab', () => {
        it('should be visible', () => {
            assert.isTrue(extensionManager.isExtensionsTabAvailable());
        });

        it('should be active after it is clicked', () => {
            assert.isFalse(extensionManager.isExtensionManagerOpen());
            extensionManager.clickExtensionsTab();
            assert.isTrue(extensionManager.isExtensionManagerOpen());
        });
    });

    describe('Detail view', () => {
        it('should be opened after click on a extension list item.', () => {
            const name = '@theia/navigator';
            extensionManager.clickExtensionItem(name);
            extensionManager.waitForLoadingDetailWidget();
            assert.isTrue(extensionManager.isExtensionItemVisible('.theia-extension-detail', name));
        });
    });


    describe('Search, install and uninstall the cpp extension', () => {
        before(() => {
            if (extensionManager.isExtensionItemVisible('#extensionListContainer', testExtensionName)) {
                if (extensionManager.findExtensionButtonByState(testExtensionName, '#extensionListContainer', 'installed').value !== null) {
                    extensionManager.clickUninstall(testExtensionName);
                    browser.waitUntil(() => extensionManager.findExtensionButtonByState(testExtensionName, '#extensionListContainer', 'working').value === null, 5000);
                }
            }
        });

        it('should be initially uninstalled', () => {
            assert.isTrue(extensionManager.findExtensionButtonByState(testExtensionName, '#extensionListContainer', 'installed').value === null, ' cpp should be not installed');
        });

        describe('Search', () => {
            it('should show cpp extension after type in "cpp"', () => {
                extensionManager.searchFor('cpp');
                assert.equal(extensionManager.countExtensionListElements(), 1);
                assert.isTrue(extensionManager.isExtensionItemVisible('#extensionListContainer', testExtensionName));
            });
        });

        describe('CPP Detail view', () => {
            it('should be opened after click on the cpp extension item.', () => {
                extensionManager.clickExtensionItem(testExtensionName);
                browser.waitUntil(
                    () => {
                        return browser.elements('div.theia-extension-detail > div.extensionHeaderContainer > div.extensionTitleContainer')
                            .element('h2=' + testExtensionName).value !== null;
                    },
                    6000,
                    'cpp detail view should be existent', 1000);
                assert.isTrue(extensionManager.isExtensionItemVisible('.theia-extension-detail', testExtensionName), 'cpp detail should be visible in DOM');
            });

            it('cpp detail view should be visible', () => {
                const cppWidgetVisible =
                    browser.element('.extensionName=@theia/cpp')
                        .element('../../..').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1;
                assert.isTrue(cppWidgetVisible, 'cpp detail should be not hidden');
                const naviWidgetInvisible =
                    browser.element('.extensionName=@theia/navigator')
                        .element('../../..').getAttribute('class').split(' ').indexOf('p-mod-hidden') !== -1;
                assert.isTrue(naviWidgetInvisible, 'navigator detail should be hidden');
            });
        });

        describe('Install', () => {
            it('should install cpp extension', () => {
                extensionManager.clickInstallInDetailView(testExtensionName);
                browser.waitUntil(() => extensionManager.findExtensionButtonByState(
                    testExtensionName, '#extensionListContainer', 'working').value === null, 300000, 'after installing button should not be in working state anymore');
                assert.isTrue(extensionManager.findExtensionButtonByState(testExtensionName, '#extensionListContainer', 'installed').value !== null, 'should be installed');
            });

            it('cpp should be still visible in list after search query was reset', () => {
                extensionManager.resetSearchField();
                assert.isTrue(extensionManager.countExtensionListElements() > 1);
                assert.isTrue(extensionManager.isExtensionItemVisible('#extensionListContainer', testExtensionName));
            });
        });

        describe('Uninstall', () => {
            it('should uninstall cpp extension if it was uninstalled before test', () => {
                if (cppWasUninstalled) {
                    extensionManager.clickUninstall(testExtensionName);
                    browser.waitUntil(() => extensionManager.findExtensionButtonByState(
                        testExtensionName, '#extensionListContainer', 'working').value === null, 300000, 'after uninstalling button should not be in working state anymore');
                    assert.isTrue(extensionManager.findExtensionButtonByState(testExtensionName, '#extensionListContainer', 'installed').value === null, 'should be not installed');
                }
            });
        });
    });
});