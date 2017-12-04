import "webdriverio";

export class TheiaLayoutPO {

    protected driver: WebdriverIO.Client<any>;
    constructor() {
        this.driver = browser;
        let url = '/';

        this.driver.url(url);
        if (this.driver.getTitle() == 'localhost') {
            this.driver.waitUntil(function () {
                console.log('browser not loaded yet, trying again ');
                return browser.getTitle() == '';
            }, 300000), 5000;
        }
    }

    mainContentPanelExits() {
        this.driver.waitForExist('#theia-main-content-panel');
    }

    isFileNavigatorClosed() {
        this.mainContentPanelExits();
        if (this.driver.element('#files').getAttribute('class').split(' ').indexOf('p-mod-hidden') !== -1) {
            return true;
        } else {
            return false;
        }
    }

    isFileNavigatorOpenOnClickingFiles() {

        if (this.isFileNavigatorClosed()) {
            this.driver.click('.p-TabBar-tab');
            return (!this.isFileNavigatorClosed());
        }
        else {
            //this.driver.click('.p-TabBar-tab');
            return this.isFileNavigatorClosed();
        }

    }

    leftPanelMenuTabActive(tabNumber: Number) {
        this.driver.element(`ul.p-TabBar-content > .p-TabBar-tab:nth-child(${tabNumber})`);

        if (this.driver.element(`ul.p-TabBar-content > .p-TabBar-tab:nth-child(${tabNumber})`).getAttribute('class')
            .split(' ').indexOf('p-mod-current') !== -1) {
            return true;
        } else {
            return false;
        }
    }

    leftPanelMenuExists(tabNumber: Number) {
        this.driver.click(`ul.p-TabBar-content > .p-TabBar-tab:nth-child(${tabNumber})`);
        return this.leftPanelMenuTabActive(tabNumber);
    }

    workspaceExists() {
        this.isFileNavigatorOpenOnClickingFiles();
        return this.driver.isVisible('#files');
    }

    gitContainerExists() {
        this.driver.click('ul.p-TabBar-content > .p-TabBar-tab:nth-child(2)');
        return this.driver.isVisible('#theia-gitContainer');
    }

    extensionsContainerExists() {
        this.driver.click('ul.p-TabBar-content > .p-TabBar-tab:nth-child(3)');
        return this.driver.isVisible('#extensions');
    }


    /*
    * Top Panel Menu tests
    */
    waitForLoadingMenu() {
        browser.waitForExist('.p-Widget.p-Menu.p-MenuBar-menu');
    }

    topPanelExists() {
        this.driver.waitForExist('#theia-top-panel');
    }

    topPanelMenuExists(tabNumber: Number) {
        this.driver.click(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber})`);
        return this.topPanelMenuTabActive(tabNumber);
    }

    topPanelMenuTabActive(tabNumber: Number) {
        if (this.driver.element(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber})`).getAttribute('class')
            .split(' ').indexOf('p-mod-active') !== -1) {
            return true;
        } else {
            return false;
        }
    }

    getxBarTabPosition(tabNumber: Number) {
        return this.driver.getLocation(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber}`, 'x');
    }

    getxMenuPosition(this: any) {
        return this.driver.getLocation('.p-Widget.p-Menu.p-MenuBar-menu', 'x');
    }

}
