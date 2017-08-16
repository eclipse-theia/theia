import { Client } from "webdriverio"

export class MainPage {

    private driver: Client<any>;
    public constructor(driver: Client<any>) {
        this.driver = driver;
    }

    public clickMenuTab(tabNumber: Number): void {
        this.driver.click(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber})`);
    }

    public hoverMenuTab(tabNumber: Number): void {
        this.driver.moveToObject(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber})`);
    }

    public clickFilesSideTab(): void {
        this.driver.click('.p-TabBar-tab')
    }

    public isFileNavigatorOpen(): Boolean {
        if (this.driver.element('#files').getAttribute('class').split(' ').indexOf('p-mod-hidden') !== -1) {
            return false;
        } else {
            return true;
        }
    }

    public isTabActive(tabNumber: Number) {
        if (this.driver.element(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber})`).getAttribute('class')
            .split(' ').indexOf('p-mod-active') !== -1) {
            return true;
        } else {
            return false;
        }
    }

    public isSidebarTabCurrentlyOpen(tabNumber: Number) {
        return this.driver.element(`ul.p-TabBar-content > .p-TabBar-tab:nth-child(${tabNumber})`).getAttribute('class')
                .split(' ').indexOf('p-mod-current') !== -1;
    }

    public waitForLoadingPanels(): void {
        this.driver.waitForExist('#theia-top-panel');
        this.driver.waitForExist('#theia-main-content-panel');
    }

    public isMainContentPanelLoaded(): Boolean {
        if (this.driver.element('#theia-main-content-panel').state === 'success') {
            return true;
        } else {
            return false;
        }
    }

    public isSubMenuShowing(): Boolean {
        if (this.driver.element('p-Widget.p-Menu.p-MenuBar-menu').state === 'failure') {
            return false;
        } else {
            return true;
        }
    }

    public waitForLoadingMenu(): void {
        browser.waitForExist('.p-Widget.p-Menu.p-MenuBar-menu');
    }

    public getxBarTabPosition(tabNumber: Number): Number {
        return browser.getLocation(`ul.p-MenuBar-content > .p-MenuBar-item:nth-child(${tabNumber}`, 'x')
    }

    public getxMenuPosition(): Number {
        return this.driver.getLocation('.p-Widget.p-Menu.p-MenuBar-menu', 'x')
    }
}