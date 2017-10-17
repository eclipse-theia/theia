import "webdriverio";

export class BasePage {

    protected driver: WebdriverIO.Client<any>;
    public constructor() {
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

    public topPanelExists() {
        this.driver.waitForExist('#theia-top-panel');
    }

    public mainContentPanelExits = function (this: any) {
        this.driver.waitForExist('#theia-main-content-panel');
    }

    public isFileNavigatorClosed(): Boolean {
        this.topPanelExists();
        this.mainContentPanelExits();
        if (this.driver.element('#files').getAttribute('class').split(' ').indexOf('p-mod-hidden') !== -1) {
            return false;
        } else {
            return true;
        }
    }

    public isFileNavigatorOpenOnClickingFiles(): Boolean {
        this.driver.click('.p-TabBar-tab');
        return this.isFileNavigatorClosed();
    }

    public subMenuExists = function (this: any) {
        if (this.driver.element('p-Widget.p-Menu.p-MenuBar-menu').state === 'failure') {
            return false;
        } else {
            return true;
        }
    }

}
