/* tslint:disable:no-unused-expression*/
import { MainPage } from "./main-page";
import { expect } from "chai";

let mainPage: MainPage;
let driver: WebdriverIO.Client<void>;

describe('theia main page', () => {

    before(() => {
        const url = '/';
        driver = browser;
        driver.url(url);
        mainPage = new MainPage(driver);
    });

    it('should show the application shell', () => {
        expect(mainPage.applicationShellExists()).to.be.true;
    });

    it('should show the main content panel', () => {
        expect(mainPage.mainContentPanelExists()).to.be.true;
    });

    it('should show the left and right sidebars', () => {
        expect(mainPage.rightSideBarExists() && mainPage.leftSideBarExists()).to.be.true;
    });

    it('should show the status bar', () => {
        expect(mainPage.statusBarExists()).to.be.true;
    });
});
