import { noiceObjectCore } from './noice/noiceCore.js';
import { noiceLogMessage, noiceLog, noiceApplicationCore } from './noice/noiceApplicationCore.js';
import { noiceIndexedDB } from './noice/noiceIndexedDB.js';
//import { noiceARSSyncWorkerClient } from './noice/noiceARSSyncWorkerClient.js';
import { noiceMainUI } from './noice/noiceMainUI.js';
import * as CoreUI from './noice/noiceCoreUI.js';

// webComponent imports
import { getLoginUI, getThreadStatusUI } from './UI/components/appComponents.js';
import { wcBalloonDialog } from './noice/webComponents/wcBalloonDialog.js';





/*
    NASH_App.js
    an instance of this object is the application code in the main thread
*/
class NASH_App extends noiceApplicationCore {




/*
    constructor({
        enableServiceWorker:    <bool (default: true)>
        debug:                  <bool (default: false)>
    })
*/
constructor(args, defaults, callback){
    super(args, noiceObjectCore.mergeClassDefaults({
        _version: 1,
        _className: 'NASH_App',
        localStorageKey: 'NASH_APP_1',
        restoreOnInstantiate: true,

        // themes
        _themeStyle: null,
        themes: {
            'light': 'light.css',
            'dark': 'dark.css'
        },

        // handy dev flags
        debug: true,

        enableServiceWorker: true,
        arsSyncWorkerConfig: {},
        _appInfoDialogIsOpen: false,
        threads: {
            arsSyncWorker: './lib/threads/syncWorker.js'
        },
        threadSignalHandlers: {
            syncWorker: {
                statusUpdate: (args, myself) => { myself.receiveSyncWorkerStatusUpdate(args); },
                rowUpdates: (args, myself) => { myself.receiveRowUpdates(args.event.data.data); }
            }
        },
        rowUpdateHandlers: [],
        statusUpdateHandlers: [],

        // random internal stuffs
        _userLookupCache: { auid: {}, fullName: {} },
    },defaults),callback);

}





/*
    startup()
    again refactored -- boot the app
*/
startup(){
    let that = this;
    return(new Promise((toot, boot) => {
        if (that.debug){ that.log(`${that._className} v${that._version} | startup() | called`); }
        that.initUITheme();

        // open the appInfoDialog
        that.openAppInfoDialog(false).then(() => {
            // this exexutes when the appInfoDialog closes
            that.initUI().then(() => { toot(true); }).catch((error) => {
                // should not happen
                that.log(`${that._className} v${that._version} | startup() | initUI() threw unexpectedly: ${error}`);
                boot(error);
            });
        }).catch((error) => {
            // fatal, can't even open the startup dialog?
            that.log(`${that._className} v${that._version} | startup() | fatal | cannot open startupDialog?! ${error}`);
            boot(error);
        });


        // the threadInfoDialog is open, lets repurpose it for startup stuff
        that.threadInfoDialog.title = 'initializing ...';

        // check for install
        that.threadResponse({
            threadName: 'syncWorker',
            postMessage: { type: 'installCheck', data: {
                protocol: window.location.protocol.replace(':', ''),
                server: window.location.hostname,
                clientType: that.identifyClient()
            }},
            awaitResponseType: 'installCheck'
        }).then((r) => {

            // get the login UI with the auth hook
            let loginUI = getLoginUI(
                r.data.userList,                                 // userList
                (u,p) => { return(that.handleUserLogin(u,p)); }, // auth callback
                () => {                                          // auth succeeded callback

                    // swap the threadStatusUI back onto the screen and setup for the rest
                    loginUI.remove();
                    that.threadInfoDialog._dialogContentContainer.appendChild(that.threadInfoDialog.threadStatusUI);
                    that.threadInfoDialog.title = `${that.config.app.appName} (v ${that.config.app.appVersion}) - startup`

                    that.handlePostLoginStartup(that.threadInfoDialog.threadStatusUI).then(() => {
                        that.threadInfoDialog.exit();
                    });
                }
            );

            // swap threadStatusUI for loginUI
            that.threadInfoDialog.threadStatusUI.remove();
            that.threadInfoDialog._dialogContentContainer.appendChild(loginUI);
            that.threadInfoDialog.title = `${that.config.app.appName} (v ${that.config.app.appVersion}) - login`;

            // pre-select user if we already have an appUser
            if (
                (that._appData instanceof Object) &&
                (that._appData.appUser instanceof Object) &&
                that._appData.appUser.hasOwnProperty('Full Name') &&
                that.isNotNull(that._appData.appUser['Full Name'])
            ){
                requestAnimationFrame(() => {
                    loginUI._elements.user_id.value = that._appData.appUser['Full Name'];
                });

            }

        }).catch((e) => {
            that.log(`${that._className} v${that._version} | arsSyncWorker/installCheck() event call threw unexpectedly (this should not happen): ${e}`);
            requestAnimationFrame(() => {
                that.threadInfoDialog.threadStatusUI.update({
                    message: 'fatal error',
                    detail: 'cannot verify app install',
                    additionalDetail: `please contact administrator, an error was encountered communicating with the arsSyncWorker thread: ${e}`,
                    error: true
                });
            });
        });

    }));
}




/*
    receiveSyncWorkerStatusUpdate(threadMsg)
    receive statusUpdate events from syncWorker thread
    note threadMsg is: {
        threadName: "syncWorker",
        event.data: {
            type: <str ("statusUpdate" or we wouldn't be here)>,
            data: {...}
        }
    }
*/
receiveSyncWorkerStatusUpdate(threadMsg){
    let that = this;
    requestAnimationFrame(() => {
        let data = threadMsg.event.data.data;

        /*
            wierd little hook but if threadInfoDialog or startupDialog
            are on screen, and we have the 'title' field in the data
            set the dialog's title attribute to that
        */
        if (
            (data instanceof Object) &&
            data.hasOwnProperty('title') &&
            that.isNotNull(data.title) &&
            (that.threadInfoDialog instanceof Element)
        ){
            that.threadInfoDialog.title = data.title;
        }

        // distribute message to any statusUpdateHandlers we have
        that.statusUpdateHandlers.filter((h) => {return(
            (h instanceof Object) &&
            (h.func instanceof Function)
        )}).forEach((h) => { h.func(data); });

        // light up the status indicator on the mainUI
        if (that.mainUI instanceof noiceMainUI){ that.mainUI.threadMessage(data); }
    });
}




/*
    receiveRowUpdates(threadMsg)
    arsSyncWorker has updated one or more rows from either a post-transmit update, or
    a deltaSynvc on a form which defines a rowUpdateCallback in the syncworker config.
    The rowUpdateCallback has called the 'rowUpdates' event with an array of objects of
    this form:
    [
        { formName: <str>, entryId: <currentEntryId>, old_entryId: <guid if was transmitted create> }
    ]

    we're gonna dispatch these to any callbacks on rowUpdateHandlers, like so:
    this.rowUpdateHandlers = [
        { id: <guid>, formName: <str>, callback: (entryIdList) => { ...} },
        ...
    ]

*/
receiveRowUpdates(threadMsg){
    // actually, just for a sec, let's make sure we're getting this far and the messaging is right
    //console.log(`receiveRowUpdates() with | `, threadMsg);

    let that = this;
    if (threadMsg instanceof Array){
        let chunks = {};

        that.rowUpdateHandlers.forEach((h) => { if (! (chunks.hasOwnProperty(h.formName))){ chunks[h.formName] = []; } });
        threadMsg.filter((a) => {return(chunks.hasOwnProperty(a.formName))}).forEach((a) => { chunks[a.formName].push(a); });

        Object.keys(chunks).forEach((formName) => {
            that.rowUpdateHandlers.filter((h) => {return(
                (h.formName == formName) &&
                (h.callback instanceof Function) &&
                (chunks[formName].length > 0)
            )}).forEach((h) => {
                h.callback(chunks[formName]);
            });
        });
    }

}




/*
    setUITheme(themeName)
    it ain't much but it's honest work
*/
setUITheme(themeName){
    let that = this;
    document.body.style.transition = "all .4s ease-out";

    // load the new one
    that.fetch({
        endpoint: `./themes/${that.themes[themeName]}`,
        method: 'GET',
        expectHtmlStatus: 200
    }).then((xhr) => {

        // remove any existing theme stylesheet
        if (that._themeStyle instanceof Element){
            that._themeStyle.remove();
            that._themeStyle = null;
        }

        // install the new one
        that._themeStyle = document.createElement('style');
        that._themeStyle.textContent = xhr.response;
        document.body.append(that._themeStyle);
        document.body.dataset.theme = themeName;
        this.writeAppData({UITheme: themeName});
        setTimeout(() => { document.body.style.transition = ""; }, 425);
    }).catch((error) => {
        // super duper uncool. log it I guess?
        that.log(`${that._className} v${that._version} | setUITheme(${themeName}) | failed to fetch theme style?!: ${error}`);
        setTimeout(() => { document.body.style.transition = ""; }, 425);
    });
}




/*
    initUITheme()
    get from localStorage the user's last set UI theme and apply that
    OR if not set, pull the value of the OS's prefers-color-scheme and
    use that as the default. Also setup a listener to detech changes to
    prefers-color-scheme
*/
initUITheme(){
    let that = this;
    let userTheme = null;
    try {
        userTheme = that.getAppData('UITheme');
        if (that.isNull(userTheme)){ throw('no set user theme'); }
    }catch(e){

        /*
            either we don't have a user pref yet, or something threw fetching it
            check prefers-color-scheme for a default value
        */
        userTheme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';
    }
    that.setUITheme(userTheme);

    // setup a listener down here to deal with the OS flipping pref (note this only works on chrome and edge as far as I can tell)
    if (window.matchMedia){
        const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
        colorSchemeQuery.addEventListener('change', (evt) => {
            that.setUITheme((window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light');
        })
    }
}




/*
    openAppInfoDialog(allowExitBool)
    this opens the threadInfoDialog
*/
openAppInfoDialog(allowExitBool){
    let that = this;
    return(new Promise((toot, boot) => {

        // new hotness
        that.threadInfoDialog = new wcBalloonDialog({
            arrow_position: 'none',
            modal: (allowExitBool === false),
            lightbox: true,
            title: `${that.config.app.appName} (v ${that.config.app.appVersion}) - sync status`,
            exitCallback: (dilly) => {
                clearInterval(dilly.messageResetTimer);
                dilly.resizeObserver.disconnect();
                that.statusUpdateHandlers = that.statusUpdateHandlers.filter((a) => {return(
                    (a instanceof Object) &&
                    (a.hasOwnProperty('id')) &&
                    that.isNotNull(a.id) &&
                    (! (a.id == dilly.updateHandlerGUID))
                )});
                delete(that.threadInfoDialog);
                that._appInfoDialogIsOpen = false;
                toot(true);
            }
        });
        that.threadInfoDialog.style.fontSize = "1rem";
        that.threadInfoDialog.setStyleVar('body-radius', '.66em', {global: false});

        // setup dialogContent
        let div = document.createElement('div');
        div.setAttribute('slot', "dialogContent");
        that.threadInfoDialog._dialogContentContainer = div;

        // livin' my life like i'm ...
        that.threadInfoDialog.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) { if (entry.contentBoxSize) {

                const phi = (1 + Math.sqrt(5)) / 2;
                let maxGoldenHeight = Math.floor(window.innerHeight * .66);
                if (((window.innerWidth/phi)/phi) >= maxGoldenHeight){
                    div.style.height = `${maxGoldenHeight}px`;
                    div.style.width = `${maxGoldenHeight * phi}px`;
                }else{
                    div.style.width = `${window.innerWidth/phi}px`;
                    div.style.height = `${(window.innerWidth/phi)/phi}px`;
                }

            }}
        });
        that.threadInfoDialog.resizeObserver.observe(document.body);
        that.threadInfoDialog.threadStatusUI = getThreadStatusUI(allowExitBool?() => {
            return(new Promise((_t,_b) => {
                that.threadResponse({
                    threadName: 'syncWorker',
                    postMessage: { type: 'syncAllNow' },
                    awaitResponseType: 'syncAllNow'
                }).catch((error) => {
                    that.log(`${that._className} v${that._version} | openAppInfoDialog(true) | ignored| syncAllNow thread signal handler threw unexpectedly: ${error}`);
                }).then(() => {
                    _t(true);
                })
            }))
        }:false);
        div.appendChild(that.threadInfoDialog.threadStatusUI);
        that._appInfoDialogIsOpen = true;

        // put it all together then onto the screen
        that.threadInfoDialog.relativeElement = document.body;
        that.threadInfoDialog.appendChild(div);
        document.body.appendChild(that.threadInfoDialog);

        // hook to reset to "idle" status message after 20s of inactivity
        that.threadInfoDialog.messageResetTimer = setInterval(() => {

            // new hotness with countdown timer
            if (
                (that.threadInfoDialog instanceof Object) &&
                (that.threadInfoDialog.threadStatusUI instanceof Object)
            ){

                // init idle status if we're not already idle
                if (
                    that.threadInfoDialog.threadStatusUI.hasOwnProperty('_lastUpdate') &&
                    (! isNaN(parseInt(that.threadInfoDialog.threadStatusUI._lastUpdate))) &&
                    ((that.epochTimestamp() - that.threadInfoDialog.threadStatusUI._lastUpdate) >= 10) &&
                    (! (that.threadInfoDialog.threadStatusUI._idle == true))
                ){
                    that.threadInfoDialog.threadStatusUI.update({
                        message: 'Sync Status: idle',
                        idle: true,
                        updatePieCharts: [{name: 'timer', value: 0 }],
                    });
                }

                // if we're already idle, update the counter
                if ((that.threadInfoDialog.threadStatusUI._idle) && (that.arsSyncWorkerClient instanceof Object)){
                    that.threadResponse({
                        threadName: 'syncWorker',
                        postMessage: { type: 'nextSync' },
                        awaitResponseType: 'nextSync'
                    }).then((r) => {
                        if (
                            (r instanceof Object) &&
                            (r.data instanceof Object) &&
                            (! (r.data.hasOwnProperty('error') && (r.data.error === true))) &&
                            (! (r.data.hasOwnProperty('isSyncing') && (r.data.isSyncing === true))) &&
                            r.data.hasOwnProperty('nextSync') &&
                            (! (isNaN(parseInt(r.data.nextSync)))) &&
                            r.data.hasOwnProperty('syncInterval') &&
                            (! (isNaN(parseInt(r.data.syncInterval))))
                        ){

                            let nsa = that.getTimeInterval(parseInt(r.data.nextSync/1000) - that.epochTimestamp());
                            that.threadInfoDialog.threadStatusUI.update({
                                message: 'Sync Status: idle',
                                detail: `next sync in: ${nsa.minutes}m ${nsa.seconds}s`,
                                idle: true,
                                updatePieCharts: [{name: 'timer', value: (((parseInt(r.data.nextSync/1000) -that.epochTimestamp())/parseInt(r.data.syncInterval/1000))*100) }],
                            });
                        }
                    }).catch((error) => {
                        // no idea is this even worth logging?
                        that.log(`${that._className} v${that._version} | appInfoDialog idle message setter, syncWorker/nextSync thread message call threw unexpectedly?! ${error}`);
                    });
                }
            }

        }, (1 * 1000)); // check every 1 second

        // hook to receive the thread updates
        that.threadInfoDialog.updateHandlerGUID = that.getGUID();
        that.statusUpdateHandlers.push({
            id: that.threadInfoDialog.updateHandlerGUID,
            func: (data) => { that.threadInfoDialog.threadStatusUI.update(data); }
        });

        // init to idle, if something's going on it'll overwrite right quick lol
        requestAnimationFrame(() => {
            that.threadInfoDialog.threadStatusUI.update({
                message: 'Sync Status: idle',
                idle: true
            });
        });

    }));
}




/*
    yesNoDialog({
        heading:        'Are You Sure?',
        message:        'This will discard unsaved changes. Do you wish to save them first?',
        yesButtonTxt:   'save',
        noButtonTxt:    'discard',
    })
    this is a generic modal yes/no dialog

    this returns a promise that resolves true if the user clicks the yes
    button and false if the user clicks the no button.

    args listed above are defaults. args are a passthrough to
    the noiceCoreUIYNDialog constructor

*/
yesNoDialog(args){
    let that = this;

    return(new Promise((toot,boot) => {
        let options = Object.assign(
            {
                heading:        'Yes/No Dialog',
                message:        'are you a robot?',
                yesButtonTxt:   'Yes',
                noButtonTxt:    'No',
                hideCallback:   function(self){
                    delete(that._YesNoPrompt);
                    toot(self.zTmpDialogResult);
                }
            },
            (args instanceof Object)?args:{}
        );

        try {
            that._YesNoPrompt = new CoreUI.noiceCoreUIYNDialog(options).show(that.DOMElement);
        }catch(e){
            boot(e);
        }
    }));
}




/*
    initUI()
    sets up the uiHolder and instantiates the various screen
*/
initUI(){
    let that = this;
    return(new Promise((toot, boot) => {
        if (that.debug){ that.log(`${that._className} v${that._version} | initUI() | called`); }
        that.mainUI = new noiceMainUI({
            _app: that,
            title: `${that.config.app.appName} v${that.config.app.appVersion}`,
            burgerMenuTitle: 'main menu',
            useDefaultBurgerMenu: true,
            closeBurgerMenuAfterSelect: true,
            UIs: {
            },
            menuItems: {
                appUpdate: { sortOrder: 8, title: "check for updates", clickHandler: (evt, mui) => { that.handleAppUpdate(evt, mui); }},
                uiMode: { sortOrder: 9, title: ` mode`, clickHandler: (evt, mui) => { that.setUITheme(`${(document.body.dataset.theme == "dark")?'light':'dark'}`); }}
            },
            btnIndicatorCallback: (selfRef) => {
                that.openAppInfoDialog(true);
            }
        }).append(document.body);

        that.mainUI.btnBurger.disabled = false;
        toot(true);
    }));
}




/*
    handleAppUpdate(clickEvent, mainUIReference)
*/
handleAppUpdate(evt, mui){
    let that = this;
    if (that.debug){ that.log(`${that._className} v${that._version} | handleAppUpdate() | called`); }

    /*
        LOH 1924 @ 1646 COB
        next up -- let's implement the check for updates
        that means we need to implement a serviceWorker
        woohah!
    */

}




/*
    ---- utility functions ----
    common stuff the various components might need in one handy place
*/




/*
    handleUserLogin(user, pass)
    handle authenticating the given user with the given password and setting
    that user as the appUser.

    the arsSyncWorker.js thread will handle offline authentication if we
    can't reach the server etc.
*/
handleUserLogin(user, pass){
    let that = this;
    return(new Promise((_t, _b) => {

        that.threadResponse({
            threadName: 'syncWorker',
            postMessage: { type: 'authenticateUser', data:{ user: user.user_id, pass: pass } },
            awaitResponseType: 'authenticateUser'
        }).then((authResp) => {
            if (
                (authResp instanceof Object) &&
                (authResp.data instanceof Object) &&
                authResp.data.hasOwnProperty('error') &&
                (authResp.data.error === false)
            ){
                // set the user as the appUser
                that.writeAppData({ appUser: {
                    ID: user.user_id,
                    Location: user.location,
                    'Full Name': user.fullName
                }});

                // return control to the authUI
                _t(true);

            }else{

                /*
                    offline auth hotness
                    if we got the netFail flag, try offlineAuth
                */
                if (
                    (authResp instanceof Object) &&
                    (authResp.data instanceof Object) &&
                    (authResp.data.hasOwnProperty('netFail')) &&
                    (authResp.data.netFail == true)
                ){

                    if (that.debug){ that.log(`${that._className} v${that._version} | handleUserLogin(${user}) | server unavailable, trying offline auth`); }
                    that.threadResponse({
                        threadName: 'syncWorker',
                        postMessage: { type: 'offlineAuth', data:{ pass: pass } },
                        awaitResponseType: 'offlineAuth'
                    }).then((oAResp) => {
                        if (
                            (oAResp instanceof Object) &&
                            (oAResp.data instanceof Object) &&
                            (oAResp.data.hasOwnProperty('error')) &&
                            (oAResp.data.error == true)
                        ){
                            // there was an issue
                            if (that.debug){ that.log(`${that._className} v${that._version} | handleUserLogin(${user.auid}) | offline auth failed: ${oAResp.data.hasOwnProperty('errorMessage'?oAResp.data.errorMessage:'')}`); }
                            _b(`offline auth failed`);
                        }else{
                            // we good, we out
                            _t(true);
                        }
                    }).catch((error) => {
                        that.log(`${that._className} v${that._version} | offlineAuth(${user.auid}) | threadSignel threw (this should not happen): ${error}`);
                        _b(error);
                    });

                }else{
                    // as you were
                    const error = (
                        (authResp instanceof Object) &&
                        (authResp.data instanceof Object) &&
                        authResp.data.hasOwnProperty('errorMessage') &&
                        that.isNotNull(authResp.data.errorMessage)
                    )?authResp.data.errorMessage:'invalid auth';
                    if (that.debug){ that.log(`${that._className} v${that._version} | checkUserAuth(${user.auid}) | auth failed: ${error}`); }
                    _b(error);
                }
            }
        }).catch((error) => {
            that.log(`${that._className} v${that._version} | checkUserAuth(${user.auid}) | threadResponse threw unexpectedly (should not happen): ${error}`);
            _b(`please contact administrator.`);
        });
    }));
}




/*
    handlePostLoginStartup()
    we have an authenticated user, and we're clear to finish startup
*/
handlePostLoginStartup(threadStatusUI){
    let that = this;
    return(new Promise((toot, boot) => {
        if (that.debug){ that.log(`${that._className} v${that._version} | handlePostLoginStartup() | called`); }

        threadStatusUI.update({
            message: `Starting ${that.config.app.appName} (v ${that.config.app.appVersion})`,
            detail:  'sync data',
            updatePieCharts: [
                { name: 'network', value: 0 },
                { name: 'database', value: 0 },
                { name: 'error', value: 0 }
            ]
        });

        that.threadResponse({
            threadName: 'arsSyncWorker',
            postMessage: { type: 'postLoginInit' },
            awaitResponseType: 'postLoginInit'
        }).then((response) => {

            // stash the syncWorkerConfig we'll need it later, then be out
            that.arsSyncWorkerConfig = response.data;

            /*
            new noiceARSSyncWorkerClient({
                _app: that,
                threadName: 'arsSyncWorker',
                threadInfo: that.arsSyncWorkerConfig,
                messageHandler: (data) => {that.receiveSyncWorkerStatusUpdate({event: {data: {data: data}}})},
                dbInputFilterCallback: async (schema, dbRow, client) => { return(that.dbInputFilter(schema, dbRow, client)); },
                dbOutputFilterCallback: async (schema, dbRow, client) => { return(that.dbOutputFilter(schema, dbRow, client)); }
            }).mountAll().then((client) => {
                that.arsSyncWorkerClient = client;
                toot(true);
            }).catch((error) => {
                // failed to mount db from main thread
                that.log(`${that._className} v${that._version} | failed to mount db from main thread?!: ${error}`);
                boot(error);
            });

        }).catch((error) => {
            threadStatusUI.update({
                message: 'Fatal Error',
                detail:  'please contact administrator',
                additionalDetail: `arsSyncWorker thread threw unexpectedly on 'postLoginInit' event: ${error}`,
                error: true
            });
            boot(error);
        });
        */
        toot(true);
    }));
}




} // end class
export { NASH_App }
