/*
    noiceARSSyncWorkerThread.js
*/
import { noiceObjectCore } from './noiceCore.js';
import { noiceWorkerThread } from './noiceWorkerThread.js';
import { noiceIndexedDB } from './noiceIndexedDB.js';
import { noiceRemedyAPI, noiceRemedyAPIException } from './noiceRemedyAPI.js';


class noiceARSSyncWorkerThread extends noiceWorkerThread {




/*
    constructor({
        config:     {see_docs},
        debug:      <bool>
    })
*/
constructor(args, defaults, callback){
    super(args, noiceObjectCore.mergeClassDefaults({
        _version: 1.32,
        _className: 'noiceARSSyncWorkerThread',
        threadName: 'noiceARSSyncWorkerThread',
        debug: false,
        _config: {},
        _hasConfig: false,
        threadLocks: {},
        mainLoopTimer: null,
        db: null,
        _mainLoopInterval: ((60 * 2) * 1000),   // default 2 minutes
        notificationCallback: null,
        formMappings: {},
        storeMappings: {},
        formIndexMappings: {},
        formIDToIndexMappings: {},
        statusUpdateCallback: null, // if defined, this catches statusUpdate() calls else we send to parent thread with 'statusUpdate' event
        initialized: false, // internal flag so that init can only be called once
        internalDBConfig: {},
        formDefinitions: {},
        apiTimeout: (60 * 30 * 1000), // api connects time out after 30 minutes,
        lastSendMessage: 0, // epoch timestamp of last statusUpdate call
        DBs: {},
        dbStats: {},
        dbStoreToTagMappings: {},
        dbTagMappings: {},
        formDBMappings: {},
        syncing: false
    }, defaults), callback);

    // setup class-global signal handlers
    let that = this;
    this.signalHandlers = {
        init: (data, evt) => { that.initializeThread(data, evt); },
        threadInfo: (data, evt) => { that.getThreadInfoSignalHandler(data, evt); },
        authenticateUser: (data, evt) => { that.authenticateUser(data, evt); },
        nextSync: (data, evt) => { that.getNextSync(data, evt); },
        syncForm: (data, evt) => { that.syncFormSignalHandler(data, evt); },
        syncAllNow: (data, evt) => { that.syncAllNowSignalHandler(data, evt); }
    };

    /*
        internalDBConfig
        this is an indexedDB instance used internally by the thread.

        these are indexedDB dataStores that we need to run the thing regardless
        of what's in the config. You can add your own as args or via subclassing
        but these defs will get merged with what's ever on the config
    */
    Object.assign(this.internalDBConfig, {
        /*
            note: dbVersion has to be an integer else we'd use this._version
            note also: if you change the name of the internalDB it's on you to preserve
            the previous writeQueue. That's why we keep it separate from the sync'd form
            data -- so we can arbitrarily rename those DBs rather than waiting through
            godawful db upgrades when we add an index to a gigantor table ...
            --> you have been warned <--
        */
        dbName: `${this._className}_1`,
        dbVersion: 1,

        storeDefinitions: {
            /*
                formDefinitions be like: {
                    key: `formDefinition_${storeName}`,
                    type: 'formDefinition',
                    schema: `${formName}`
                    fetchDate: <epoch>,
                    value: {formDefinition},
                }

                formMeta be like: {
                    key: `formMeta_${storeName}`,
                    type: 'formMeta',
                    schema: `${formName}`,
                    value: {
                        lastSync: <epoch>,
                        lastPrune: <epoch>
                        lastBulkSyncFileDate: <epoch>
                    }
                }
            */
            meta: {
                createOptions: { keyPath: 'key', unique: true },
                indexes: {
                    type: { keyPath: 'type' },
                    schema: { keyPath: 'schema' }
                }
            },

            /*
                when you write changes to a record, write it to the target table
                however, ALSO create an entry here like this:

                {
                    entryId: <str>
                    schema: <server formName>
                    status: <enum(queued|transmitted)>
                    transactionDate: <epochTimestamp(hiRes)>
                    transactionType: <enum(create|modify)>
                    transmitDate: <epochTimestamp(hiRes)>
                    fields: {
                        <fieldID>:<value ...>
                    }
                }
            */
            writeQueue: {
                createOptions: { keyPath: 'queueID', autoIncrement: true },
                indexes: {
                    entryId: { keyPath: 'entryId' },
                    schema: { keyPath: 'schema' },
                    transactionType: { keyPath: 'transactionType' },
                    status: { keyPath: 'status' },
                    statusSchema: { keyPath: ['status', 'schema'] },
                    schemaEntryId: { keyPath: ['schema', 'entryId'] }
                }
            }
        }
    });

    // init special attributes
    this.dbTagMappings.internalDB = this.internalDBConfig.dbName;
    ['config'].forEach((a) => { that[a] = that[a]; });

}


/*
    signal handlers
    --------------------------------------------------------------------------------
*/


/*
    initializeThread(data, event)
    called by init signal from main thread.
    1) mounts database (descructive with upgrades, etc)
    2) if online, fetches formDefinitions from server and updates meta table
    3) inits first mainLoop
    4) returns formDefinitions to main thread in release event
*/
initializeThread(data, event){
    let that = this;
    let fn = 'initializeThread';
    let awaitReleaseEvent = 'init';
    let outData = { error: false, netFail: false };

    // note init does not await threadLocks but does declare one to lock the thread
    that.threadLocks[fn] = new Promise((toot, boot) => {

        // merge in protocol, server & clientType if we got 'em
        if (data instanceof Object){ Object.assign(that.config, data); }

        // bounce if we're already initialized
        if (that.initialized == true){
            boot('thread already initialized');
        }else{

            // mount the internal indexedDB (meta, writeQueue, etc)
            that.mountInternalDB().then((internalDB) => {

                // mount the indexedDBs defined in the config and all that entails
                that.mountAll().then(() => {

                    // update form definitions
                    that.updateFormDefinitions().then((formDefinitions) => {

                        // manageDBFlags, then invoke main loop
                        that.manageDBFlags().catch((error) => {
                            that.log(`${fn}() | ignored | manageDBFlags() threw unexpectedly: ${error}`)
                        }).then(() => {

                            // await the first mainLoop run then exit
                            that.invokeMainLoop(true).catch((error) => {
                                that.log(`${fn}() | ignored | main loop first run failed: ${error}`);
                            }).then(() => {
                                toot(that.getThreadInfo());
                            });

                        });

                    }).catch((error) => {
                        boot(`updateFormDefinitions() threw unexpectedly: ${error}`)
                    });
                }).catch((error) => {
                    boot(`mountAll() threw unexpectedly: ${error}`);
                });

            }).catch((error) => {
                boot(`mountInternalDB() threw unexpectedly: ${error}`);
            });
        }

    }).catch((error) => {
        that.log(`${fn}() | exit with error | ${error}`);
        outData.error = true;
        outData.errorMessage = (outData.hasOwnProperty('errorMessage') && that.isNotNull(outData.errorMessage))?`${outData.errorMessage} | ${error}`:`${error}`;
    }).then((mergeOutput) => {
        if (that.debug){ that.log(`${fn}() | end`)}
        setTimeout(() =>{ delete(that.threadLocks[fn]); }, 2); // don't delete it for a couple event loops in case there's Promise.all's in queue out there
        that.initialized = (! outData.error);
        that.signalParent({
            type: awaitReleaseEvent,
            data: Object.assign(outData, (mergeOutput instanceof Object)?mergeOutput:{})
        });
    });
}




/*
    getThreadInfoSignalHandler(data, evt)
    just return the output of getThreadInfo() to the caller is all
*/
getThreadInfoSignalHandler(data, evt){
    let out = { error: false };
    try{
        out.threadInfo = this.getThreadInfo();
    }catch(e){
        out.errorMessage = e;
        out.error = true;
    }
    this.signalParent({
        type: 'threadInfo',
        data: out
    });
}




/*
    getNextSync(data, evt)
    just return thread.nextMainLoop
*/
getNextSync(data, evt){
    this.signalParent({
        type: 'nextSync',
        data: {
            error: false,
            nextSync: this.hasOwnProperty('nextMainLoop')?this.nextMainLoop:0,
            syncInterval: this.config.mainLoopInterval,
            isSyncing: this.syncing
        }
    });
}



/*
    authenticateUser(data, evt)
    this signalHadler will attempt to authenticate
    data.user with data.pass against the configured
    arsConnect. Will return true if good false if not
    and will discard the token and logout if successfull
*/
authenticateUser(data, evt){
    let that = this;
    if (
        (data instanceof Object) &&
        data.hasOwnProperty('user') &&
        that.isNotNull(data.user) &&
        data.hasOwnProperty('pass') &&
        that.isNotNull(data.pass)
    ){

        new noiceRemedyAPI({
            protocol:   that.config.protocol,
            server:     that.config.server,
            user:       data.user,
            password:   data.pass,
            proxyPath:  that.config.apiConnect.proxyPath
        }).authenticate().then((api) => {

            new Promise((_t,_b) => {_t(
                (that.authenticateUserCallback instanceof Function)?that.authenticateUserCallback(api, that):false
            )}).then(() => {
                api.logout().then(() => {
                    that.signalParent({
                        type: 'authenticateUser',
                        data: { error: false }
                    });
                });
            }).catch((error) => {
                that.signalParent({
                    type: 'authenticateUser',
                    data: {
                        error: true,
                        errorMessage: `authenticateUserCallback() threw unexpectedly: ${error}`
                    }
                });
            });
        }).catch((error) => {
            that.signalParent({
                type: 'authenticateUser',
                data: {
                    error: true,
                    netFail: ((error instanceof Object) && error.hasOwnProperty('_messageType') && (error._messageType == "non-ars")),
                    errorMessage: ((error instanceof Object) && error.hasOwnProperty('_messageType') && (error._messageType == "non-ars"))?'network problem':'invalid credentials'
                }
            });
        });
    }else{
        that.signalParent({
            type: 'authenticateUser',
            data: {
                error: true,
                errorMessage: 'invalid input'
            }
        });
    }
}



/*
    class infrastructure
    --------------------------------------------------------------------------------
*/




/*
    awaitThreadLocks([arrayIgnoreLocks])
    return a promise that resolves when all the threadLocks resolve
    if arrayIgnoreLocks is specified, exclude thread locks from the listed functionNames
*/
awaitThreadLocks(ignoreLocks){
    let ugh = (ignoreLocks instanceof Array)?ignoreLocks:[];
    return(Promise.all(Object.keys(this.threadLocks).filter((f) => {return(ugh.indexOf(f) < 0)}).map((f)=>{return(this.threadLocks[f])}, this)));
}




/*
    config (managed attribute)
*/
get config(){ return(this._config); }
set config(v){

    // ye verily we should have some kinda input validation here (but later)
    if (v instanceof Object){
        let that = this;
        that._config = v;

        /*
            build indexes
            thread.formMappings[<formName>] = <storeName>
            thread.storeMappings[<storeName>] = <formName>
            thread.formIndexMappings[<formName>] = { <fieldID>:<indexName>, ... }
            thread.formIDToIndexMappings[<formName>] = { <indexName>:<fieldID>., ... }
            thread.dbStoreToTagMappings[<storeName>] = <dbTagName>
            thread.dbTagMappings[<dbTagName>] = <dbName>
            thread.formDBMappings[<formName>] = { dbTagName:<dbTagName>, storeName: <storeName> }
        */
        if (that._config.DBs instanceof Object){
            that.statusUpdate({functionName: 'config attribute setter', message: 'parsing config', _status:'db-read' });

            Object.keys(that._config.DBs).filter((dbTagName) => {return(
                (that._config.DBs[dbTagName] instanceof Object) &&
                (that._config.DBs[dbTagName].storeDefinitions instanceof Object) &&
                (Object.keys(that._config.DBs[dbTagName].storeDefinitions).length > 0)
            )}).forEach((dbTagName) => {
                that.dbTagMappings[dbTagName] = that._config.DBs[dbTagName].dbName;
                Object.keys(that._config.DBs[dbTagName].storeDefinitions).filter((storeName) => {return(
                    (that._config.DBs[dbTagName].storeDefinitions[storeName] instanceof Object) &&
                    (that._config.DBs[dbTagName].storeDefinitions[storeName].indexes instanceof Object)  &&
                    (that._config.DBs[dbTagName].storeDefinitions[storeName]._sync instanceof Object) &&
                    (that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.query instanceof Object) &&
                    that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.query.hasOwnProperty('schema') &&
                    that.isNotNull(that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.query.schema)
                )}, this).forEach((storeName) => {

                    that.formMappings[that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.query.schema] = storeName;
                    that.storeMappings[storeName] = that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.query.schema;
                    that.dbStoreToTagMappings[storeName] = dbTagName;
                    that.formDBMappings[that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.query.schema] = { storeName: storeName, dbTagName: dbTagName };

                    Object.keys(that._config.DBs[dbTagName].storeDefinitions[storeName].indexes).filter((indexName) => {return(
                        (that._config.DBs[dbTagName].storeDefinitions[storeName].indexes[indexName] instanceof Object) &&
                        that._config.DBs[dbTagName].storeDefinitions[storeName].indexes[indexName].hasOwnProperty('_id') &&
                        this.isNotNull(that._config.DBs[dbTagName].storeDefinitions[storeName].indexes[indexName]._id)
                    )}).forEach((indexName) => {
                        if (! (that.formIndexMappings[that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.query.schema] instanceof Object )){ this.formIndexMappings[that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.query.schema] = {}; }
                        if (! (that.formIDToIndexMappings[that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.query.schema] instanceof Object )){ that.formIDToIndexMappings[that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.query.schema] = {}; }

                        that.formIndexMappings[that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.query.schema][that._config.DBs[dbTagName].storeDefinitions[storeName].indexes[indexName]._id] = indexName;
                        that.formIDToIndexMappings[that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.query.schema][indexName] = that._config.DBs[dbTagName].storeDefinitions[storeName].indexes[indexName]._id;
                    });
                });
            });
        }
    }



}
get hasConfig(){ return(Object.keys(this.config).length > 0); }
set hasConfig(v){ this._hasConfig = (v === true); }




/*
    statusUpdate({
        message: <str (required)>
        messageNumber: <int (optional)>
        detail: <str (optional)>
        additionalDetail: <str (optional)>
        error: <bool (default: false)>
        updatePieCharts: [ {name: <str>, value: <float>}, ...]
        runAnimation: <bool (default: false)>
        logMessage: <bool (default: true)>
        functionName: <str (optional)>,
        limitMessageFrequency: <bool (default:false)>
    })
    centralized method for sending status updates to main thread
*/
statusUpdate(data){
    let that = this;
    let sendMessage = Object.assign({

        // statusUpdate data defaults (data input overrides)
        message: 'statusUpdate() called',
        error: false,
        runAnimation: false,
        logMessage: true,
        limitMessageFrequency: false
    }, data);

    // log it unless logMessage set false
    if ((sendMessage.logMessage) && (that.debug)){
        that.log(`[statusUpdate] | ${['functionName', 'messageNumber', 'message', 'detail', 'additionalDetail'].filter((a)=>{return(
            sendMessage.hasOwnProperty(a) &&
            that.isNotNull(sendMessage[a])
        )}).map((a)=>{return(sendMessage[a])}).join(' | ')}`)
    }

    if (that.statusUpdateCallback instanceof Function){
        that.statusUpdateCallback(sendMessage);
    }else{
        if (
            (! (sendMessage.limitMessageFrequency)) || (
                sendMessage.limitMessageFrequency &&
                ((that.epochTimestamp(true) - that.lastSendMessage) > that.config.threadMessageLimit)
            )
        ){

            that.lastSendMessage = that.epochTimestamp(true);
            that.signalParent({
                type: 'statusUpdate',
                data: sendMessage
            });
        }
    }
}




/*
    checkPendingUpgrade(dbTagName)
    resolve boolean true if the config specifies a dbVersion higher than the unmounted db for the specified dbTagName
    else false (obvz)
*/
checkPendingUpgrade(dbTagName){
    let that = this;
    let fn = 'checkPendingUpgrade';
    return(new Promise((toot, boot) => {

        // new hotness
        if (! (that.dbTagMappings.hasOwnProperty(dbTagName))){
            that.log(`${fn}() | specified invalid tbTagName (${dbTagName}) (defaulting false)`);
            toot(false);
        }else{
            that.statusUpdate({ message: 'mounting database', detail: `check pending upgrade ${dbTagName} (${that.dbTagMappings[dbTagName]})`, functionName: fn, _status:'net-read' });

            if (
                (that.config instanceof Object) &&
                (that.config.DBs instanceof Object) &&
                (that.config.DBs[dbTagName] instanceof Object) &&
                (that.config.DBs[dbTagName].hasOwnProperty('dbName')) &&
                (that.isNotNull(that.config.DBs[dbTagName].dbName)) &&
                (that.config.DBs[dbTagName].hasOwnProperty('dbVersion')) &&
                (! isNaN(parseInt(that.config.DBs[dbTagName].dbVersion)))
            ){
                if (that.threadHandle.indexedDB){
                    if (that.threadHandle.indexedDB.databases instanceof Function){
                        that.threadHandle.indexedDB.databases().then((dbList) => {
                            let bs = dbList.filter((a)=>{return(
                                (a instanceof Object) &&
                                a.hasOwnProperty('name') &&
                                (a.name == that.config.DBs[dbTagName].dbName)
                            )});
                            toot(
                                (bs.length > 0) &&
                                bs[0].hasOwnProperty('version') &&
                                (bs[0].version < parseInt(that.config.DBs[dbTagName].dbVersion))
                            );
                        }).catch((error) => {
                            that.log(`${fn}() | indexedDB.databases() threw unexpectedly?! (defaulting false) | ${error}`);
                            toot(false);
                        });
                    }else{
                        that.log(`${fn}() | indexedDB.databases() not supported on this platform (firefox amirite?), defaulting false`);
                        toot(false);
                    }
                }else{
                    that.log(`${fn}() | indexedDB API not available?! defaulting false`);
                    toot(false);
                }
            }else{
                that.log(`${fn}() | config does not contain dbName or dbName for specified dbTagName: ${dbTagName}, defaulting false`);
                toot(false);
            }
        }
    }));
}




/*
    mountInternalDB()
    mount the internal database (meta, writeQueue, etc)
    defined on this.internalDBConfig
*/
mountInternalDB(){
    let that = this;
    let fn = 'mountInternalDB'
    return(new Promise((toot, boot) => {
        that.statusUpdate({ message: 'mounting internal database', functionName: fn, _status:'db-read' });
        new noiceIndexedDB(this.internalDBConfig).open({
            destructiveSetup: true,
            setupCallback: (dbInstance) => {
                that.statusUpdate({
                    message: 'mounting internal database',
                    detail: 'installing database upgrade',
                    additionalDetail: 'DO NOT CLOSE WINDOW (this may take a few minutes)',
                    runAnimation: true,
                    functionName: fn,
                    _status:'db-read'
                });
            }
        }).then((internalDB) => {
            that.internalDB = internalDB;
            toot(internalDB);
        }).catch((error) => {
            that.log(`${fn}() | indexedDB.open() threw unexpectedly: ${error}`);
            that.statusUpdate({
                messageNumber: 1,
                error: true,
                message: 'failed to mount internal database (please contact administrator)',
                detail: `${error}`,
                runAnimation: false,
                functionName: fn
            });
            boot(error);
        });
    }));
}




/*
    mountDB(dbTagName)
    mount the indexedDB, upgrade if necessary
*/
mountDB(dbTagName){
    let that = this;
    let fn = 'mountDB'
    return(new Promise((toot, boot) => {

        if (that.dbTagMappings.hasOwnProperty(dbTagName)){
            that.statusUpdate({ message: `mounting database ${dbTagName} (${that.dbTagMappings[dbTagName]})`, functionName: fn, _status:'db-read' });
            that.checkPendingUpgrade(dbTagName).then((pendingUpgrade) => {

                new Promise((_t, _b) =>{
                    if (pendingUpgrade && (
                        (that.config instanceof Object) &&
                        (that.config.DBs instanceof Object) &&
                        (that.config.DBs[dbTagName] instanceof Object) &&
                        (that.config.DBs[dbTagName].preUpgradeExec instanceof Function)
                    )){
                        that.config.DBs[dbTagName].preUpgradeExec(that).then((preUpgradeExecOutput) => { _t(preUpgradeExecOutput); }).catch((error) => { _b(error); })
                    }else{
                        _t(false);
                    }
                }).catch((error) => {
                    that.log(`${fn}(${dbTagName}) | preUpgradeExec() threw unexpectedly, naively continuing to upgrade: ${error}`);
                }).then((preUpgradeExecOutput) => {

                    /*
                        NOTE: no idea what to do with output of the preUpgradeExec but hey, it's here
                        supose we could define a postUpgradeExec <shrugLadyEmoji>
                    */
                    new noiceIndexedDB({
                        dbName: that.config.DBs[dbTagName].dbName,
                        dbVersion: that.config.DBs[dbTagName].dbVersion,
                        storeDefinitions: that.config.DBs[dbTagName].storeDefinitions,
                    }).open({
                        destructiveSetup: true,
                        setupCallback: (dbInstance) => {
                            that.statusUpdate({
                                message: `mounting database (${dbTagName})`,
                                detail: 'installing database upgrade',
                                additionalDetail: 'DO NOT CLOSE WINDOW (this may take a few minutes)',
                                runAnimation: true,
                                functionName: fn,
                                _status:'db-read'
                            });
                        }
                    }).then((dbInstance) => {
                        that.DBs[dbTagName] = dbInstance;
                        that.dbStats[dbTagName] = {};
                        new Promise((_t,_b) => {
                            that.DBs[dbTagName].getDescription().then((desc) => {
                                desc.forEach(function(tbl){
                                    if (that.debug){ that.log(`${fn}() | ${tbl.name}: ${tbl.count}`); }
                                    that.dbStats[dbTagName][tbl.name] = tbl;
                                });
                                _t(true);
                            }).catch((error) => {
                                // just noting it because we mounted at least so let's keep going
                                that.log(`${fn}(${dbTagName}) | database successfully mounted | getDescription() threw unexpectedly (ignored): ${error}`);
                                _t(true);
                            })
                        }).then(() => {
                            that.statusUpdate({
                                message: `database mounted (${dbTagName})`,
                                runAnimation: false,
                                dbDescription: that.dbStats,
                                functionName: fn
                            });
                            toot(dbInstance);
                        });
                    }).catch((error) => {
                        that.log(`${fn}(${dbTagName}) | indexedDB.open() threw unexpectedly: ${error}`);
                        that.statusUpdate({
                            messageNumber: 1,
                            error: true,
                            message: 'failed to mount database (please contact administrator)',
                            detail: `${error}`,
                            runAnimation: false,
                            functionName: fn
                        });
                        boot(error);
                    });
                });

            }).catch((error) => {

                // checkPendingUpgrade threw?!
                // this actually should not happen, but we trap all exceptions regardless
                that.log(`${fn}(${dbTagName}) | checkPendingUpgrade() threw unexpectedly (this should not happen): ${error}`);
                boot(error);
            });
        }else{
            // error, unknown dbTagName
            that.log(`${fn}() | specified invalid dbTagName (${dbTagName})`);
            that.statusUpdate({
                messageNumber: 8,
                error: true,
                message: 'failed to mount database (please contact administrator)',
                detail: `${error}`,
                runAnimation: false,
                functionName: fn
            });
            boot(error);
        }

    }));
}




/*
    mountAll()
    scrapes the config for all db instances and then mounts each of them
*/
mountAll(){
    let that = this;
    let fn = 'mountAll';
    return(new Promise((toot, boot) => {
        if ((that.config instanceof Object) && (that.config.DBs instanceof Object)){

            let mountQueue = Object.keys(that.config.DBs);

            // side note: it is a tragedy that there's not a Promise.each or something ugh. tired of writing these iterators
            function mountHelper(idx){
                if (idx == mountQueue.length){
                    that.statusUpdate({
                        error: false,
                        message: 'all databases mounted',
                        detail: ``,
                        runAnimation: false,
                        functionName: fn
                    });
                    toot(true);
                }else{
                    that.mountDB(mountQueue[idx]).then((d) => {
                        mountHelper((idx + 1));
                    }).catch((error) => {
                        that.log(`${fn}() | failed to mount database ${mountQueue[idx]} | ${error}`);
                        that.statusUpdate({
                            messageNumber: 21,
                            error: true,
                            message: `failed to mount database ${mountQueue[idx]} (please contact administrator)`,
                            detail: `${error}`,
                            runAnimation: false,
                            functionName: fn
                        });
                        boot(error);
                    });
                }
            }

            // do ieet (or don't if we don't have any)
            if (mountQueue.length > 0){
                mountHelper(0);
            }else{
                let error = 'there do not appear to be any databses defined in the config. exit with error';
                that.log(`${fn}() | ${error}`);
                that.statusUpdate({
                    messageNumber: 22,
                    error: true,
                    message: `failed to mount databases (please contact administrator)`,
                    detail: `${error}`,
                    runAnimation: false,
                    functionName: fn
                });
                boot(error);
            }

        }else{
            let error = 'cannot find DBs in config?';
            that.log(`${fn}() | ${error}`);
            that.statusUpdate({
                messageNumber: 20,
                error: true,
                message: 'failed to mount databases (please contact administrator)',
                detail: `${error}`,
                runAnimation: false,
                functionName: fn
            });
            boot(error);
        }
    }));
}




/*
    updateFormDefinitions()
    1) load all the formDefinitions out of meta
    2) if we're online, fetch refreshed formDefinition for each and update meta table
    3) return formDefinitions, but throw if we're missing any
*/
updateFormDefinitions(){
    let that = this;
    let fn = 'updateFormDefinitions';
    return(new Promise( (toot, boot) => {
        that.statusUpdate({ message: 'updating form definitions', functionName: fn });
        that.internalDB.getAll({
            storeName: 'meta',
            indexName: 'type',
            query: IDBKeyRange.only('formDefinition')
        }).then((rows) => {

            /*
                merge cached form definitions into thread.formDefinitions
                note getAll no-match is just an empty array, so we good
            */
            let _bulkFormDefs = {};
            rows.filter((row)=>{return(
                (row instanceof Object) &&
                row.hasOwnProperty('schema') &&
                that.isNotNull(row.schema) &&
                that.formMappings.hasOwnProperty(row.schema) &&
                row.hasOwnProperty('value') &&
                (row.value instanceof Object)
            )}).forEach((row)=>{
                that.formDefinitions[row.schema] = row.value;
                that.formDefinitions[row.schema]._cached = row.fetchDate;
            });

            // flag must-get forms (forms we do not have a cached definition for)
            let mustGet = Object.keys(that.formMappings).filter((schema) => {return( ! (that.formDefinitions.hasOwnProperty(schema)))});

            // if we can get the api, go fetch 'em
            that.getAPI().then((api) => {

                let fetchQueue = Object.keys(that.formMappings);

                // recursor to linearly fetch the form definition updates
                function recursor(idx){
                    if (idx == fetchQueue.length){
                        // we out
                        that.statusUpdate({
                            message: 'form definitions complete',
                            updatePieCharts: [{name: 'network', value: 0}],
                            runAnimation: false,
                            functionName: fn
                        });
                        toot(that.formDefinitions);
                    }else{
                        that.statusUpdate({
                            message: 'updating form definitions',
                            detail: `${(idx + 1)} of ${fetchQueue.length}`,
                            additionalDetail: fetchQueue[idx],
                            updatePieCharts: [{name: 'network', value: (((idx + 1)/fetchQueue.length)*100)}],
                            runAnimation: false,
                            functionName: fn
                        });
                        api.getFormFields({ schema: fetchQueue[idx] }).then((formDef) => {

                            // handle formDefinitionTransform if we have one
                            if (
                                (that.formDBMappings instanceof Object) &&
                                (that.formDBMappings[fetchQueue[idx]] instanceof Object) &&
                                (that.config.DBs[that.formDBMappings[fetchQueue[idx]].dbTagName] instanceof Object) &&
                                (that.config.DBs[that.formDBMappings[fetchQueue[idx]].dbTagName].storeDefinitions instanceof Object) &&
                                (that.config.DBs[that.formDBMappings[fetchQueue[idx]].dbTagName].storeDefinitions[that.formDBMappings[fetchQueue[idx]].storeName] instanceof Object) &&
                                (that.config.DBs[that.formDBMappings[fetchQueue[idx]].dbTagName].storeDefinitions[that.formDBMappings[fetchQueue[idx]].storeName]._sync instanceof Object) &&
                                (that.config.DBs[that.formDBMappings[fetchQueue[idx]].dbTagName].storeDefinitions[that.formDBMappings[fetchQueue[idx]].storeName]._sync.formDefinitionTransform instanceof Object)
                            ){
                                formDef = that.config.DBs[that.formDBMappings[fetchQueue[idx]].dbTagName].storeDefinitions[that.formDBMappings[fetchQueue[idx]].storeName]._sync.formDefinitionTransform(formDef);
                            }

                            // put it
                            that.internalDB.put({
                                storeName: 'meta',
                                object: {
                                    key: `formDefinition_${that.formMappings[fetchQueue[idx]]}`,
                                    type: 'formDefinition',
                                    schema: fetchQueue[idx],
                                    fetchDate: that.epochTimestamp(),
                                    value: formDef
                                }
                            }).then(() => {
                                that.formDefinitions[fetchQueue[idx]] = formDef;
                                Promise.resolve().then(() => { recursor(idx + 1); });
                            }).catch((error) => {
                                that.log(`updateFormDefinitions(${fetchQueue[idx]}) | meta/put threw unexpectedly?: ${error}`);
                                boot(error);
                            });

                        }).catch((error) => {

                            /*
                                handle api formDef fetch failure here

                                * keep it: we have a copy already in the db
                                    -> that.formDefinitions.hasOwnProperty(fetchQueue[idx])
                                * install from file: we don't have a copy in the db but we do have a staticFormDefinition
                                    -> that.staticFormDefinitions[fetchQueue[idx]]
                                * barf: if none of those things are true
                            */

                            that.log(`updateFormDefinitions(${fetchQueue[idx]}) | api.getFormFields() threw unexpectedly: ${error}`);

                            if (that.formDefinitions.hasOwnProperty(fetchQueue[idx])){

                                // use cached copy and continue
                                that.log(`updateFormDefinitions(${fetchQueue[idx]}) | using cached form definition from: ${(that.formDefinitions[fetchQueue[idx]]._cached == 0)?'staticFormDefinition':that.fromEpoch(that.formDefinitions[fetchQueue[idx]]._cached, 'dateTimeLocale')}`);
                                Promise.resolve().then(() => { recursor(idx + 1); });

                            }else if (
                                (that.staticFormDefinitions instanceof Object) &&
                                (that.staticFormDefinitions[fetchQueue[idx]] instanceof Object)
                            ){

                                // install from staticFormDefinitions
                                let formDef = JSON.parse(JSON.stringify(that.staticFormDefinitions[fetchQueue[idx]]));
                                if (
                                    (that.formDBMappings instanceof Object) &&
                                    (that.formDBMappings[fetchQueue[idx]] instanceof Object) &&
                                    (that.config.DBs[that.formDBMappings[fetchQueue[idx]].dbTagName] instanceof Object) &&
                                    (that.config.DBs[that.formDBMappings[fetchQueue[idx]].dbTagName].storeDefinitions instanceof Object) &&
                                    (that.config.DBs[that.formDBMappings[fetchQueue[idx]].dbTagName].storeDefinitions[that.formDBMappings[fetchQueue[idx]].storeName] instanceof Object) &&
                                    (that.config.DBs[that.formDBMappings[fetchQueue[idx]].dbTagName].storeDefinitions[that.formDBMappings[fetchQueue[idx]].storeName]._sync instanceof Object) &&
                                    (that.config.DBs[that.formDBMappings[fetchQueue[idx]].dbTagName].storeDefinitions[that.formDBMappings[fetchQueue[idx]].storeName]._sync.formDefinitionTransform instanceof Object)
                                ){
                                    formDef = that.config.DBs[that.formDBMappings[fetchQueue[idx]].dbTagName].storeDefinitions[that.formDBMappings[fetchQueue[idx]].storeName]._sync.formDefinitionTransform(formDef);
                                }

                                that.internalDB.put({
                                    storeName: 'meta',
                                    object: {
                                        key: `formDefinition_${that.formMappings[fetchQueue[idx]]}`,
                                        type: 'formDefinition',
                                        schema: fetchQueue[idx],
                                        fetchDate: 0,
                                        value: formDef
                                    }
                                }).then(() => {
                                    that.log(`updateFormDefinitions(${fetchQueue[idx]}) | installing from staticFormDefinitions`);
                                    that.formDefinitions[fetchQueue[idx]] = formDef;
                                    Promise.resolve().then(() => { recursor(idx + 1); });
                                }).catch((error) => {
                                    // barf: can't write staticFormDefinition
                                    that.log(`updateFormDefinitions(${fetchQueue[idx]}) | failed to install staticFormDefinition, meta/put threw unexpectedly: ${error}`);
                                    boot(error);
                                });
                            }else{
                                // barf - can't get formDef from server, no cached copy, no staticFormDefinition
                                that.log(`updateFormDefinitions(${fetchQueue[idx]}) | failed formDef fetch, no cached copy, and no staticFormDefinition, cannot continue (fatal)`);
                                boot(`missing formDefinition: ${fetchQueue[idx]}`);
                            }
                        });
                    }
                }
                recursor(0);

            }).catch((error) => {

                /*
                    ok basically, I don't even really care what the reason is that it failed.
                    for the purposes of formDefinitions, we are ok if the api failed
                    for any reason, as long as we aren't missing any of them
                */
                if (mustGet.length == 0){
                    that.statusUpdate({ message: `api login failed | ${error} | using cached form definitions`, functionName: fn });
                    toot(that.formDefinitions);
                }else{
                    error.netFail = true;
                    that.log(`${fn}() | api login failed and missing formDefinitions: ${mustGet.join(', ')} | cannot proceed. fatal error | ${error}`);
                    that.statusUpdate({
                        messageNumber: 3,
                        error: true,
                        netFail: true,
                        message: 'offline, missing form definitions, cannot proceed (please contact administrator)',
                        detail: `${error}`,
                        runAnimation: false,
                        functionName: fn
                    });
                    boot(error);
                }
            });

        }).catch((error) => {
            that.log(`${fn}() | indexedDB.getAll(meta/formDefinitions) threw unexpectedly: ${error}`);
            that.statusUpdate({
                messageNumber: 2,
                error: true,
                message: 'indexedDB.getAll(meta/formDefinitions) threw unexpectedly (please contact administrator)',
                detail: `${error}`,
                runAnimation: false,
                functionName: fn
            });
            boot(error);
        });
    }));
}




/*
    getAPI()
    if you need the api call this first
    we are here to prevent multiple-token-itis
*/
getAPI(){
    let that = this;
    return (new Promise((toot, boot) => {
        if (navigator.onLine){
            if (
                (that.api instanceof noiceRemedyAPI) &&
                that.api.isAuthenticated &&
                (that.apiTimeout < (that.epochTimestamp() - that.api._authDate))
            ){
                toot(that.api);
            }else{

                // log the old one out if we need to
                new Promise((_t,_b) => {
                    if ((that.api instanceof noiceRemedyAPI) && that.api.isAuthenticated){
                        that.api.logout().then(() => {_t(true); }).catch((e) => { _t(false); });
                    }else{
                        _t(true);
                    }
                }).then(() => {
                    new Promise((_t,_b) => {
                        let cp = {
                            protocol:   ((that.config instanceof Object) && that.config.hasOwnProperty('protocol'))?that.config.protocol:null,
                            server:     ((that.config instanceof Object) && that.config.hasOwnProperty('server'))?that.config.server:null,
                            user:       ((that.config instanceof Object) && (that.config.apiConnect instanceof Object) && that.config.apiConnect.hasOwnProperty('user'))?that.config.apiConnect.user:null,
                            password:   ((that.config instanceof Object) && (that.config.apiConnect instanceof Object) && that.config.apiConnect.hasOwnProperty('password'))?that.config.apiConnect.password:null,
                            proxyPath:  ((that.config instanceof Object) && (that.config.apiConnect instanceof Object) && that.config.apiConnect.hasOwnProperty('proxyPath'))?that.config.apiConnect.proxyPath:null
                        };
                        _t((that.getAPIAuthCallback instanceof Function)?that.getAPIAuthCallback(cp, that):cp);

                    }).then((connectParams) => {

                        // log in!
                        new noiceRemedyAPI(connectParams).authenticate().then((api) => {
                            that.api = api;
                            that.api._authDate = that.epochTimestamp();
                            toot(api);
                        }).catch((error) => {
                            that.log(`getAPI() | cannot establish api connection: ${error}`);
                            boot(error);
                        });

                    }).catch((error) => {
                        that.log(`getAPI() | getAPIAuthCallback threw unexpectedly: ${error}`);
                    });
                });
            }
        }else{
            boot('offline');
        }
    }));
}




/*
    invokeMainLoop(initBool)
    if initBool is true, this is the first run of the main loop
    which is to say we're on a startup screen and the user is waiting
    and hence we should bypass things that take forever like pruning
*/
invokeMainLoop(initBool){
    let fn = 'invokeMainLoop';
    let that = this;
    return (new Promise((toot, boot) => {
        that.awaitThreadLocks(['initializeThread']).catch((error) => {

            // not fatal but a threadLock threw so we oughta log it I supose
            that.log(`${fn}() | awaitThreadLocks() threw unexpectedly (ignored but logging) | ${error}`);

        }).then(() => {

            let syncFail = false;
            that.threadLocks[fn] = new Promise((_t, _b) => {
                if (that.debug){ that.log(`${fn}() | start`); }
                that.syncing = true;
                that.syncAllForms(initBool).then(() => { _t(true); }).catch((error) => { _b(error); });

            }).catch((error) => {
                // don't throw, but log it (we'll try again at the next interval anyhow)
                syncFail = true;
                that.log(`${fn}() | syncAllForms() threw unexpectedly | ignored (will try again on next sync interval) | ${error}`);
            }).then(() => {

                // write meta.appMeta_lastSync
                new Promise((_t) => {_t(
                    (syncFail == true)?true:that.internalDB.put({
                        storeName: 'meta',
                        object: {
                            key: `appMeta_lastSync`,
                            schema: 'no-schema',
                            type: 'date',
                            value: that.epochTimestamp()
                        }
                    })
                )}).catch((error) => {
                    that.log(`${fn}() | internalDB threw writing appMeta_lastSync | ignored | ${error}`);
                }).then(() => {
                    // setup next run
                    that.mainLoopTimer = setTimeout(() => { that.invokeMainLoop(); }, that.config.mainLoopInterval);
                    that.nextMainLoop = (that.epochTimestamp(true) + that.config.mainLoopInterval);
                    if (that.debug){ that.log(`${fn}() | complete | spawning next execution: ${that.nextMainLoop} (${that.fromEpoch(that.nextMainLoop, 'dateTimeLocale')})`); }
                    toot(that.nextMainLoop);

                    // be kind, rewind.
                    setTimeout(() =>{
                        delete(that.threadLocks[fn]);
                        that.syncing = false;
                    }, 2);
                });
            });

        });
    }));
}




/*
    syncAllForms(initBool)
    called either from invokeMainLoop() or from syncAllFormsEventHandler()
    this gets the API then calls syncARSForm() against each form in the config
    one at a time, respecting syncOrder (if specified)
*/
syncAllForms(initBool){
    let that = this;
    let fn = 'syncAllForms';
    return(new Promise((toot, boot) => {
        if (that.debug){ that.log(`${fn}() | start`); }
        that.getAPI().then((api) => {

            // new hotness
            let queue = Object.keys(that.formDBMappings).filter((a) => {return(
                (that.config.DBs[that.formDBMappings[a].dbTagName] instanceof Object) &&
                (that.config.DBs[that.formDBMappings[a].dbTagName].storeDefinitions instanceof Object) &&
                (that.config.DBs[that.formDBMappings[a].dbTagName].storeDefinitions[that.formDBMappings[a].storeName] instanceof Object) &&
                (that.config.DBs[that.formDBMappings[a].dbTagName].storeDefinitions[that.formDBMappings[a].storeName]._sync instanceof Object) && (! (
                    that.config.DBs[that.formDBMappings[a].dbTagName].storeDefinitions[that.formDBMappings[a].storeName]._sync.hasOwnProperty('enableSync') &&
                    (that.config.DBs[that.formDBMappings[a].dbTagName].storeDefinitions[that.formDBMappings[a].storeName]._sync.enableSync == false)
                ))
            )}).sort((a,b) => {return(
                that.config.DBs[that.formDBMappings[a].dbTagName].storeDefinitions[that.formDBMappings[a].storeName]._sync.syncOrder -
                that.config.DBs[that.formDBMappings[b].dbTagName].storeDefinitions[that.formDBMappings[b].storeName]._sync.syncOrder
            )});
            function recursor(idx){
                if (idx == queue.length){
                    if (that.debug){ that.log(`${fn}() | completed`); }
                    toot(true);
                }else{
                    that.syncForm(queue[idx], api, false, false, (initBool === true)).catch((error) => {
                        that.log(`${fn} | ignored | ${queue[idx]} failed sync (${error})`);
                    }).then(() => {
                        recursor(idx + 1);
                    });
                }
            }
            recursor(0);

        }).catch((error) => {
            if (that.debug){ that.log(`${fn}() | aborted | cannot get API | ${error}`); }
            boot(error);
        });
    }));
}




/*
    getFormMeta(schema)
    get all the meta data out of indexedDB for the specified form
*/
getFormMeta(schema){
    let that = this;
    let fn = 'getFormMeta';
    return(new Promise((toot, boot) => {
        if (that.debug){ that.log(`${fn}(${schema}) | start`); }
        that.internalDB.getAll({
            storeName: 'meta',
            indexName: 'schema',
            query: IDBKeyRange.only(schema)
        }).then((rows) => {

            // for convinience of logic, build a key index
            let keys = {};
            rows.forEach((row) => { keys[row.key] = row });

            // return this data structure, add more if ya need it
            if (that.debug){ that.log(`${fn}(${schema}) | complete`); }
            let storeName = that.formMappings.hasOwnProperty(schema)?that.formMappings[schema]:null;
            let dbTagName = that.dbStoreToTagMappings.hasOwnProperty(storeName)? that.dbStoreToTagMappings[storeName]:null;
            toot(Object.assign({
                storeName: storeName,
                dbTagName: dbTagName,
                formName: schema,
                lastSync: 0,
                lastPrune: 0,
                lastBulkSyncFileDate: 0,
                formDef: keys.hasOwnProperty(`formDefinition_${that.formMappings[schema]}`)?keys[`formDefinition_${that.formMappings[schema]}`].value:null
            }, keys.hasOwnProperty(`formMeta_${storeName}`)?keys[`formMeta_${storeName}`]:{}));

        }).catch((error) => {
            that.log(`${fn}(${schema}) | indexedDB.getAll('meta') threw unexpectedly: ${error}`);
            boot(error);
        });
    }));
}




/*
    writeFormMeta(formMeta, {<key>:<value>, ...})
    write specified key(s) to the meta / formMeta_<storeName> record
    for the form specified by the formMeta (output of getFormMeta())
    if none exists make one.
    this is bootless. if we fail we do it in an ignorable way
    because reasons.
*/
writeFormMeta(formMeta, data){
    let that = this;
    let fn = 'writeFormMeta';
    return(new Promise((toot, boot) => {
        let metaUpdate = { key: `formMeta_${formMeta.storeName}`, schema: formMeta.formName };
        that.internalDB.get({
            storeName: 'meta',
            key: metaUpdate.key
        }).catch((error) => {
            if (that.debug){ that.log(`${fn}(${formMeta.formName}) | ignored | get(meta/${metaUpdate.key}) threw getting row | ${error}`); }
        }).then((metaRow) => {
            that.internalDB.put({
                storeName: 'meta',
                object: Object.assign(metaUpdate, (metaRow instanceof Object)?metaRow:{}, data)
            }).catch((error) =>{
                that.log(`${fn}(${formMeta.formName}) | ignored | put(meta) threw unexpectedly updating lastBulkSyncFileDate | ${error}`);
            }).then(() => {
                toot(true)
            });
        });
    }));
}



/*
    syncForm(schema, api, forceSync, forcePrune, initBool)
    sync the specified form to the server
    this may get called from syncAllForms() or from syncFormEventHandler()
        schema:     <str (formName), required>
        api:        <noiceRemedyAPI, required>
        forceSync:  <bool, optional default:false>
        forcePrune: <bool, optional default:false>
        initBool:   <bool, optiona default: false>
    if forceSync is set true, we're gonna ignore ._sync.syncInterval
    if forcePrune is set true, we're gonna ignore ._sync.pruneInterval
    if initBool is set true, we're in the startup dialog so don't do prunes period
*/
syncForm(schema, api, forceSync, forcePrune, initBool){
    let that = this;
    let fn = 'syncForm';
    return(new Promise((toot, boot) => {
        if (that.debug){ that.log(`${fn}(${schema}) | start`); }
        that.statusUpdate({ message: `sync: ${that.getSyncName(schema)}`, detail: 'loading meta data', functionName: fn });
        that.getFormMeta(schema).then((formMeta) => {

            // promise wraps all sync errors before prune
            new Promise((_t,_b) => {

                // handle transmits even if we haven't reached the sync interval
                that.handleTransmits(formMeta, api).then((entryIdIndex) => {

                    /*
                        NOTE: the entryIdIndex is the notificationQueue from handleTransmits() of the form:
                        {
                            formName: formMeta.formName,
                            entryId: <serverEntryId>,
                            old_entryId: <createModeOriginalEntryId(should be deleted by here)
                        }
                    */
                    let handleTransmitExcludeList = {};
                    entryIdIndex.map((r)=>{return(r.entryId)}).forEach((entryId) => { handleTransmitExcludeList[entryId] = true; });


                    if ((that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.rowUpdateCallback instanceof Function) && (entryIdIndex.length > 0)){
                        that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.rowUpdateCallback(that, entryIdIndex);
                    }


                    // do the sync if we're supposed to do
                    if ((forceSync == true) || ((that.epochTimestamp() - formMeta.lastSync) >= that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.hasOwnProperty('syncInterval')?that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.syncInterval:0)){

                        // handle bulkSync
                        let bulkSyncBypassed = false;
                        that.handleBulkSync(formMeta, api, handleTransmitExcludeList).catch((error) => {
                            bulkSyncBypassed = true;
                            if ((error == "no new bulkSync data") || (error == "form does not support bulkSync")){
                                if (that.debug) {that.log(`${fn}(${schema}) | ignored (continuing to deltaSync) | handleBulkSync | ${error}`); }
                            }else{
                                that.log(`${fn}(${schema}) | ignored (continuing to deltaSync) | handleBulkSync threw unexpectedly | ${error}`);
                            }
                        }).then((bulkWriteOutput) => {

                            /*
                                for reference, bulkWriteOutput is:
                                {
                                    maxModifiedDate: parsed.maxModifiedDate,
                                    entryIdIndex: entryIdIndex,
                                    rowUpdates: rowUpdates
                                }
                                where entryIdIndex is the complete list of entryIds in the bulkSync file
                                and rowUpdates is an array of these for each row we actually wrote from the
                                bulkSync file after filtering against maxModifiedDate:
                                {
                                    entryId: row.entryId,
                                    formName: formMeta.formName
                                }
                            */


                            // handle deltaSync, send null on maxModifiedDate if no bulkSync happened
                            that.handleDeltaSync(formMeta, api,
                                ((bulkWriteOutput instanceof Object) && bulkWriteOutput.hasOwnProperty('maxModifiedDate'))?bulkWriteOutput.maxModifiedDate:null
                            ).then((deltaWriteOutput) => {

                                /*
                                    at this point, server sync is complete
                                    now we need to coalesce the entryId indexes
                                    and send them off to the prune stuff

                                     for reference deltaWriteOutput is:
                                     {
                                         entryIdIndex: entryIdIndex
                                     }
                                     where entryIdIndex is an object of the form:
                                     { <entryId>: true, ... }

                                if ((that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.rowUpdateCallback instanceof Function) && (Object.keys(deltaWriteOutput.entryIdIndex).length > 0)){
                                    that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.rowUpdateCallback(that,
                                        Object.keys(deltaWriteOutput.entryIdIndex).map((a)=>{return({ formName: schema, entryId: a })})
                                    );
                                }
                                */

                                _t({
                                    bulkSyncBypassed: bulkSyncBypassed,
                                    entryIdIndex: Object.keys(Object.assign({},
                                        ((bulkWriteOutput instanceof Object) && (bulkWriteOutput.entryIdIndex instanceof Object))?bulkWriteOutput.entryIdIndex:{},
                                        ((deltaWriteOutput instanceof Object) && (deltaWriteOutput.entryIdIndex instanceof Object))?deltaWriteOutput.entryIdIndex:{},
                                        handleTransmitExcludeList
                                    )),
                                    rowUpdates: Object.keys(deltaWriteOutput.entryIdIndex).map((entryId) => { return({
                                        entryId: entryId,
                                        formName: formMeta.formName
                                    })}).concat(
                                        ((bulkWriteOutput instanceof Object) && (bulkWriteOutput.rowUpdates instanceof Array))?bulkWriteOutput.rowUpdates:[]
                                    )
                                });

                            }).catch((error) => {
                                // handle deltaSync error
                                that.statusUpdate({
                                    messageNumber: 10,
                                    error: true,
                                    message: `failed delta data sync for ${schema} (please contact administrator)`,
                                    detail: `${error}`,
                                    runAnimation: false,
                                    functionName: fn
                                });
                                _b(error);
                            });
                        });

                    }else{
                        // not time to sync, continue on to prune logic (maybe log the remaining seconds or something later, i dunno)
                        if (that.debug){ that.log(`${fn}(${schema}) | syncInterval not reached`); }
                        _t(true);
                    }

                }).catch((error) => {
                    that.log(`${fn}(${schema}) | handleTransmits() threw unexpectedly | aborting sync | ${error}`);
                    _b(error);
                });

            }).then((syncOutput) => {

                /*
                    for reference, syncOutput is:
                    {
                        bulkSyncBypassed: <bool>,
                        entryIdIndex: <object: {<entryId>: true}>,
                        rowUpdates: <array: [{entryId: <entryId>, formName: <formName}]>
                    }

                    we are calling rowUpdateCallback again with a list of everything bulkSync and deltaSync actually updated
                */



                if ((that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.rowUpdateCallback instanceof Function) && (syncOutput.rowUpdates.length > 0)){
                    that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.rowUpdateCallback(that, syncOutput.rowUpdates);
                }

                // ok this is supremely wierd but it *totally* breaks if you do it inline in the if statement?
                let timeSinceLastPrune = (that.epochTimestamp() - formMeta.lastPrune);
                let pruneInterval = that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.hasOwnProperty('pruneInterval')?that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.pruneInterval:0;

                new Promise((___t, ___b) => {

                    // do the prune if we're supposed to (the sync subprocess should have resolved to an entryIdIndex)
                    if (
                        (
                            (forcePrune == true) ||
                            (timeSinceLastPrune >= pruneInterval) ||
                            (formMeta.hasOwnProperty('forceDataRefresh') && (formMeta.forceDataRefresh === true))
                        ) &&
                        (! (
                            that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.hasOwnProperty('disablePrune') &&
                            (that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.disablePrune == true)
                        )) && (
                            (! (initBool === true))
                        )
                    ){

                        that.handlePrune(formMeta, syncOutput, api).then(() => {
                            // log some stuff and be out
                            that.statusUpdate({ message: `sync: ${that.getSyncName(schema)}`, detail: 'sync complete', functionName: fn });
                            ___t(true);
                        }).catch((error) => {
                            // log some different stuff and be out
                            // you know ... i'm not gonna croak for a failed prune but I *am* gonna log it
                            that.log(`${fn}(${schema}) | handlePrune() threw unexpectedly (ignored, non-fatal) | ${error}`);
                            ___t(false);
                        });

                    }else{
                        if (that.debug){ that.log(`${fn}(${schema}) | pruneInterval not reached (next prune in ${pruneInterval - timeSinceLastPrune}s)| exit with success`); }
                        that.statusUpdate({ message: `sync: ${that.getSyncName(schema)}`, detail: 'sync complete', functionName: fn });
                        ___t(true);
                    }
                }).then((pruned) => {
                    that.handleWriteQueuePrune(formMeta, api).catch((error) => {
                         that.log(`${fn}(${schema}) | handleWriteQueuePrune() threw unexpectedly (ignored) error was: ${error}`);
                    }).then(() => {
                        if (that.debug){ that.log(`${fn}(${schema}) | complete`); }
                        toot(true);
                    })
                });
            }).catch((error) => {
                // entire bulkSync/deltaSync subprocess failed
                that.statusUpdate({
                    messageNumber: 11,
                    error: true,
                    message: `failed sync for ${schema} (please contact administrator)`,
                    detail: `${error}`,
                    runAnimation: false,
                    functionName: fn
                });
                boot(error);
            });
        }).catch((error) => {
            that.statusUpdate({
                messageNumber: 1,
                error: true,
                message: `failed to get meta data for ${schema} (please contact administrator)`,
                detail: `${error}`,
                runAnimation: false,
                functionName: fn
            });
            boot(error);
        });
    }));
}




/*
    handleBulkSync(formMeta, api, entryIdExcludeList)
    if the form defines _bulkSync in the config, go check if there's a new file
    if there is pull it, blow the stuff in and return the max modified date on the file
    which is what we'll need to pass into deltaSync()

    entryIdExcludeList is an array of entryId values. Do not overwrite these as we just refreshed
    them from the server
*/
handleBulkSync(formMeta, api, entryIdExcludeList){
    let that = this;
    let fn = 'handleBulkSync';
    return(new Promise((toot, boot) => {
        if (that.debug){ that.log(`${fn}(${formMeta.formName}) | start`); }
        if (that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._bulkSync instanceof Object){

            // check metaQuery
            that.statusUpdate({ message: `sync: ${that.getSyncName(formMeta.formName)}`, detail: 'checking for new bulk sync file', runAnimation:true, functionName: fn });
            api.query(that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._bulkSync.metaQuery).then((metaQueryResult) => {
                if (that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._bulkSync.hasNewDataCallback(metaQueryResult, formMeta, that)){

                    /*
                        UPDATE 12/12/23 @ 1125
                        get maxModifiedDate from the table, exclude rows <= to this
                        there's really no need to wait through blowing away and replacing
                        every single row in the table y'know?
                    */
                    that.statusUpdate({ message: `sync: ${that.getSyncName(formMeta.formName)}`, detail: 'fetching max modified date from db', runAnimation:true, functionName: fn });
                    that.getMaxModifiedDate(formMeta).then((mmd) => {
                        that.statusUpdate({ message: `sync: ${that.getSyncName(formMeta.formName)}`, detail: 'downloading bulk sync file', runAnimation:false, functionName: fn });
                        api.getTicket(that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._bulkSync.dataFileQueryCallback(metaQueryResult, formMeta, that)).then((result) => {

                            // parse it and encode the rows for db insertion
                            that.statusUpdate({ message: `sync: ${that.getSyncName(formMeta.formName)}`, detail: 'parsing data ...', functionName: fn });
                            that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._bulkSync.parseDataFile(result, formMeta, that).then((parsed) => {

                                // filter entryIdExcludeList as well as ones < maxModifiedDate from parsed
                                if (! (entryIdExcludeList instanceof Array)){ entryIdExcludeList = []; }
                                let entryIdField = that.formIndexMappings[formMeta.formName].hasOwnProperty('1')?that.formIndexMappings[formMeta.formName]['1']:'1';
                                let mmdField = that.formIndexMappings[formMeta.formName].hasOwnProperty('6')?that.formIndexMappings[formMeta.formName]['6']:'6';

                                let entryIdIndex = {};
                                parsed.writeQueue.forEach((row) => { entryIdIndex[row.entryId] = true; });

                                parsed.writeQueue = parsed.writeQueue.filter((row) => {return(
                                    (entryIdExcludeList.indexOf(row[entryIdField]) < 0) &&
                                    ((row[mmdField] >= mmd) || ((formMeta.hasOwnProperty('forceDataRefresh') && (formMeta.forceDataRefresh === true))))
                                )});

                                // we got our parsed data update ui on the main thread
                                that.statusUpdate({
                                    message: `sync: ${that.getSyncName(formMeta.formName)}`,
                                    detail: `parsed: ${parsed.writeQueue.length} rows`,
                                    additionalDetail: `preparing bulk data from: ${that.fromEpoch(parsed.maxModifiedDate, 'dateTimeLocale')}`,
                                    updatePieCharts: [{name: 'network', value: 0 }, {name: 'database', value: 0}],
                                    runAnimation: true,
                                    functionName: fn
                                });

                                // segment into performance-tuned bulkPut() chunks
                                let chunks = [];
                                let rowUpdates = [];
                                while (parsed.writeQueue.length > 0){ chunks.push(parsed.writeQueue.splice(0, that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.bulkPutLimit)); }
                                Promise.all(chunks.map((chunk, idx) => {return(new Promise((_t,_b) => {
                                    that.DBs[formMeta.dbTagName].bulkPut({
                                        storeName: formMeta.storeName,
                                        objects: chunk
                                    }).then(() => {

                                        // chunk write succeeded. update UI
                                        that.statusUpdate({
                                            message: `sync: ${that.getSyncName(formMeta.formName)}`,
                                            detail: `writing bulk data from: ${that.fromEpoch(parsed.maxModifiedDate, 'dateTimeLocale')}`,
                                            additionalDetail: `chunk ${idx + 1} of ${chunks.length}`,
                                            updatePieCharts: [{name: 'database', value: ((idx + 1)/chunks.length)*100}],
                                            functionName: fn,
                                            logMessage: false,
                                            runAnimation: false
                                        });

                                        // we are depending on 'entryId' always being the pk
                                        rowUpdates = rowUpdates.concat(chunk.map((row) => {return({
                                            entryId: row.entryId,
                                            formName: formMeta.formName
                                        })}));

                                        _t(true);

                                    }).catch((error) => {

                                        // chunk write failed
                                        that.log(`${fn}(${formMeta.formName}) | chunk ${idx + 1} of ${chunks.length} failed write | bulkPut(${formMeta.storeName}) threw unexpectedly | ${error}`);
                                        _b(error);
                                    })
                                }))})).then(() => {

                                    /*
                                        write meta stats
                                    */
                                    that.writeFormMeta(formMeta, {
                                        lastBulkSyncFileDate: that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._bulkSync.getDataFileBuildDate(metaQueryResult, that)
                                    }).then(() =>{
                                        that.statusUpdate({
                                            message: `sync: ${that.getSyncName(formMeta.formName)}`,
                                            detail: `bulk sync complete`,
                                            updatePieCharts: [{name: 'database', value: 0}],
                                            functionName: fn
                                        });
                                        toot({
                                            maxModifiedDate: parsed.maxModifiedDate,
                                            entryIdIndex: entryIdIndex,
                                            rowUpdates: rowUpdates
                                        });
                                    });

                                }).catch((error) => {
                                    that.log(`${fn}(${formMeta.formName}) | at least one bulk data chunk failed to write to indexedDB (see log): ${error}`);
                                    that.statusUpdate({
                                        messageNumber: 6,
                                        error: true,
                                        message: `failed to write bulk data ${formMeta.formName} (please contact administrator)`,
                                        detail: `${error}`,
                                        runAnimation: false,
                                        functionName: fn
                                    });
                                    boot(error)
                                });
                            }).catch((error) => {
                                that.log(`${fn}(${formMeta.formName}) | parseDataFile() threw unexpectedly: ${error}`);
                                boot(error);
                            });

                        }).catch((error) => {
                            that.statusUpdate({
                                messageNumber: 5,
                                error: true,
                                message: `failed to fetch bulk data ${formMeta.formName} (please contact administrator)`,
                                detail: `${error}`,
                                runAnimation: false,
                                functionName: fn
                            });
                            boot(error);
                        });
                    }).catch((error) => {
                        that.statusUpdate({
                            messageNumber: 4,
                            error: true,
                            message: `failed to fetch maxModifiedDate for ${formMeta.formName} (please contact administrator)`,
                            detail: `${error}`,
                            runAnimation: false,
                            functionName: fn
                        });
                        boot(error);
                    });
                }else{
                    that.statusUpdate({ message: `sync: ${that.getSyncName(formMeta.formName)}`, runAnimation:false, functionName: fn });
                    if (that.debug){ that.log(`${fn}(${formMeta.formName}) | no new bulkSync file to fetch`); }
                    boot('no new bulkSync data');
                }

            }).catch((error) => {
                that.statusUpdate({ message: `sync: ${that.getSyncName(formMeta.formName)}`, runAnimation:false, functionName: fn });
                that.log(`${fn}(${formMeta.formName}) | metaQuery threw unexpectedly: ${error}`);
                boot(error);
            });

        }else{
            if (that.debug){ that.log(`${fn}(${formMeta.formName}) | not configured for bulkSync in config`); }
            boot('form does not support bulkSync');
        }
    }));
}




/*
    handleDeltaSync(formMeta, maxModifiedDate, api)
    fetch rows modified >= maxModifiedDate and write them to the table, etc etc
*/
handleDeltaSync(formMeta, api, maxModifiedDate){
    let that = this;
    let fn = 'handleDeltaSync';
    return(new Promise((toot, boot) => {

        if (that.debug){ that.log(`${fn}(${formMeta.formName}, ${maxModifiedDate}) | start`); }

        // get maxModifiedDate
        that.getMaxModifiedDate(formMeta, maxModifiedDate).then((mmd) => {

            that.statusUpdate({
                message: `sync: ${that.getSyncName(formMeta.formName)}`,
                detail: 'fetching delta',
                additionalDetail: that.fromEpoch(mmd, 'dateTimeLocale'),
                updatePieCharts: [{name:'network', value: 0}, {name:'database', value:0}],
                runAnimation: true,
                functionName: fn
            });

            /*
                setup the query
                convert fields on query to ids if they aren't already, and concat them with index-referenced fields for unique list
                append the maxModifiedDate to the sync query and setup the progressCallback
            */
            let q = Object.assign({}, that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.query);
            q.fields = q.fields.map((fName) => {
                return(
                    /^\d+$/.test(fName)?fName:formMeta.formDef.nameIndex.hasOwnProperty(fName)?formMeta.formDef.nameIndex[fName].id:fName
                )
            });
            Object.keys(that.formIndexMappings[formMeta.formName]).forEach((fId) => { if (q.fields.indexOf(fId) < 0){ q.fields.push(fId); } });

            // get everything if we've got the forceDataRefresh flag
            //q.QBE = `${q.QBE} AND ('6' > ${mmd})`;
            let dateFilter = ` AND ('6' > ${mmd})`;
            q.QBE = `${q.QBE} ${(!( formMeta.hasOwnProperty('forceDataRefresh') && (formMeta.forceDataRefresh === true) ))?dateFilter:''}`;

            q.progressCallback = (evt) => {
                that.statusUpdate({
                    message: `sync: ${that.getSyncName(formMeta.formName)}`,
                    detail: `fetching delta from: ${that.fromEpoch(mmd, 'dateTimeLocale')}`,
                    additionalDetail: `${evt.loaded} bytes`,
                    logMessage: false, _status:'net-read'
                });
            };

            // execute the query
            api.query(q).then((result) =>{

                that.statusUpdate({
                    message: `sync: ${that.getSyncName(formMeta.formName)}`,
                    detail: `fetched ${result.entries.length} rows`,
                    additionalDetail: 'preparing data',
                    runAnimation: false,
                    functionName: fn, _status:'net-read'
                });
                let chunks = [];
                let entryIdIndex = {};
                while (result.entries.length > 0){
                    chunks.push(result.entries.splice(0, that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.bulkPutLimit).map((row) => {
                        let out = that.dataStoreFilter(formMeta, row.values);
                        entryIdIndex[out[that.formIndexMappings[formMeta.formName].hasOwnProperty('1')?that.formIndexMappings[formMeta.formName]['1']:'1']] = true;
                        return(out);
                    }));
                }

                // write 'em!
                Promise.all(chunks.map((chunk, idx) => {return(new Promise((_t,_b) => {
                    that.DBs[formMeta.dbTagName].bulkPut({
                        storeName: formMeta.storeName,
                        objects: chunk
                    }).then(() => {

                        // chunk write succeeded. update UI
                        that.statusUpdate({
                            message: `sync: ${that.getSyncName(formMeta.formName)}`,
                            detail: `writing delta data from: ${that.fromEpoch(mmd, 'dateTimeLocale')}`,
                            additionalDetail: `chunk ${idx + 1} of ${chunks.length}`,
                            updatePieCharts: [{name: 'database', value: ((idx + 1)/chunks.length)*100}],
                            functionName: fn,
                            logMessage: false, _status:'db-write',
                            runAnimation: false
                        });
                        _t(true);

                    }).catch((error) => {

                        // chunk write failed
                        that.log(`${fn}(${formMeta.formName}) | chunk ${idx + 1} of ${chunks.length} failed write (delta) | bulkPut(${formMeta.storeName}) threw unexpectedly | ${error}`);
                        _b(error);
                    })
                }))})).then(() => {
                    /*
                        write meta stats
                    */
                    let fmWrite = { lastSync: that.epochTimestamp() };
                    if (formMeta.hasOwnProperty('forceDataRefresh') && (formMeta.forceDataRefresh === true)){ fmWrite.forceDataRefresh = "complete"; }
                    that.writeFormMeta(formMeta, fmWrite).then(() =>{
                        that.statusUpdate({
                            message: `sync: ${that.getSyncName(formMeta.formName)}`,
                            detail: `delta sync complete`,
                            updatePieCharts: [{name: 'database', value: 0}],
                            functionName: fn
                        });
                        toot({
                            entryIdIndex: entryIdIndex
                        });
                    });

                }).catch((error) => {
                    that.log(`${fn}(${formMeta.formName}) | at least one delta data chunk failed to write to indexedDB (see log): ${error}`);
                    that.statusUpdate({
                        messageNumber: 7,
                        error: true,
                        message: `failed to write delta data ${formMeta.formName} (please contact administrator)`,
                        detail: `${error}`,
                        runAnimation: false,
                        functionName: fn
                    });
                    boot(error);
                });

            }).catch((error) => {
                that.log(`${fn}(${formMeta.formName}, ${mmd}) | api.query({schema:${q.schema},QBE:${q.QBE}}) threw unexpectedly: ${error}`)
                boot(error);
            });

        }).catch((error) => {
            that.log(`${fn}(${formMeta.formName}, ${maxModifiedDate}) | getMaxModifiedDate() threw unexpectedly: ${error}`);
            boot(error);
        });
    }));
}




/*
    getMaxModifiedDate(formMeta, maxModifiedDate)
    get the largest value of the last modified date field on the form specified on formMeta
    maxModifiedDate argument is passed in and if it's not null we return it.
    if it is null we open a cursor on the table and get the value, then return it.
    is that silly? well ... yes
    but it seemed a little cleaner than yet another inline primise in handleDeltaSync()
*/
getMaxModifiedDate(formMeta, maxModifiedDate){
    let that = this;
    let fn = 'getMaxModifiedDate';
    return(new Promise((toot, boot) => {
        if (that.debug){ that.log(`${fn}(${formMeta.formName}, ${maxModifiedDate}) | start`); }
        if (that.isNotNull(maxModifiedDate)){
            if (that.debug){ that.log(`${fn}(${formMeta.formName}, ${maxModifiedDate}) | returned input value | end`); }
            toot(maxModifiedDate);
        }else{
            if (that.debug){ that.log(`${fn}(${formMeta.formName}, ${maxModifiedDate}) | opening cursor on ${formMeta.storeName}`); }


            /*
                UPDATE 12/12/23 @ 1057
                we have to exclude records that exist untransmitted in the writeQueue
                we cannnot trust modifiedDates in the target dataStore where there are
                queued writeQueue transactions as the modifiedDate may have been locally
                modified
            */

            new Promise((_t,_b) => {
                that.internalDB.getAll({
                    storeName: 'writeQueue',
                    indexName: 'statusSchema',
                    query: IDBKeyRange.only(['queued', formMeta.formName])
                }).then((writeQueueRaw) => {
                    let a = that.coalesceWriteQueue(formMeta, writeQueueRaw).map((r)=>{return(r.entryId)});
                    _t((a instanceof Array)?a:[]);
                }).catch((error) => {
                    that.log(`${fn}(${formMeta.formName}, ${maxModifiedDate}) | getAll('writeQueue', 'queued', ${formMeta.formName}) threw unexpectedly: ${error}`);
                    _b(error);
                })
            }).then((excludeList) => {
                let mmd = 0;
                let mmdField = that.formIndexMappings[formMeta.formName].hasOwnProperty('6')?that.formIndexMappings[formMeta.formName]['6']:'6';
                let entryIdField = that.formIndexMappings[formMeta.formName].hasOwnProperty('1')?that.formIndexMappings[formMeta.formName]['1']:'1';

                that.DBs[formMeta.dbTagName].openCursor({
                    storeName: formMeta.storeName,
                    callback: (cursor) => { if (that.isNotNull(cursor)){
                        if (
                            cursor.value &&
                            cursor.value[entryIdField] &&
                            (excludeList.indexOf(cursor.value[entryIdField]) < 0) &&
                            cursor.value[mmdField] &&
                            (! isNaN(parseInt(cursor.value[mmdField]))) &&
                            (parseInt(cursor.value[mmdField]) > mmd)
                        ){
                            mmd = cursor.value[mmdField]
                        }
                        cursor.continue();
                    }}
                }).then(() => {
                    if (that.debug){ that.log(`${fn}(${formMeta.formName}, ${maxModifiedDate}) | returning ${mmd}`); }
                    toot(mmd);
                }).catch((error) => {
                    that.log(`${fn}(${formMeta.formName}, ${maxModifiedDate}) | openCursor(${formMeta.storeName}) threw unexpectedly: ${error}`);
                    boot(error);
                });
            }).catch((error) => {
                that.log(`${fn}(${formMeta.formName}, ${maxModifiedDate}) | failed to generate excludeList from writeQueue: ${error}`);
                boot(error);
            });
        }
    }));
}




/*
    ARSDataFilter(formMeta, {<fieldID>:<fieldValue>, ...})
    format the specified object of <fieldID>:<fieldValue> pairs for api compatibility
    based on the given formMeta
*/
ARSDataFilter(formMeta, inputFields){
    let that = this;
    let fields = Object.assign({}, inputFields);

    // convert date fields to that funky iso format
    Object.keys(fields).filter((fieldID) => {return(
        formMeta.formDef.idIndex.hasOwnProperty(fieldID) &&
        formMeta.formDef.idIndex[fieldID].hasOwnProperty('datatype') &&
        (['TIME', 'DATE'].indexOf(formMeta.formDef.idIndex[fieldID].datatype) >= 0) &&
        (/^\d+$/.test(fields[fieldID]))
    )}).forEach((fieldID) => {
        let typ = (
            formMeta.formDef.idIndex[fieldID].hasOwnProperty('_send_as_datatype') &&
            that.isNotNull(formMeta.formDef.idIndex[fieldID]._send_as_datatype)
        )?formMeta.formDef.idIndex[fieldID]._send_as_datatype:formMeta.formDef.idIndex[fieldID].datatype;

        switch(typ){
            case 'TIME':
                fields[fieldID] = that.fromEpoch(fields[fieldID], 'dateTime');
                break;
            case 'DATE':
                fields[fieldID] = that.fromEpoch(fields[fieldID], 'date');
                break;
            case 'TIME_OF_DAY':
                fields[fieldID] = thread.fromEpoch(fields[fieldID], 'time');
                break;
        }
    });

    // weed out null date/time fields from the field set because the ARS REST API is gonna barf on 'em (ya rly)
    Object.keys(fields).filter((a) => {return(
        that.isNull(fields[a]) &&
        formMeta.formDef.idIndex.hasOwnProperty(a) &&
        formMeta.formDef.idIndex[a].hasOwnProperty('datatype') &&
        (['TIME', 'DATE'].indexOf(formMeta.formDef.idIndex[a].datatype) >= 0)
    )}).forEach((a) => { delete(fields[a]); });

    /*
        build currency value objects
        also filter currency fields with no value as this also bonks the REST interface somethin' awful
    */
    Object.keys(fields).filter((fieldID) => { return(
        formMeta.formDef.idIndex.hasOwnProperty(fieldID) &&
        formMeta.formDef.idIndex[fieldID].hasOwnProperty('datatype') &&
        (formMeta.formDef.idIndex[fieldID].datatype == 'CURRENCY')
    )}).forEach((fieldID) => {
        // hackaroooooo!
        if (
            formMeta.formDef.idIndex[fieldID].hasOwnProperty('_send_as_datatype') &&
            (formMeta.formDef.idIndex[fieldID]._send_as_datatype == "FLOAT") &&
            (! isNaN(parseFloat(fields[fieldID])))
        ){
            fields[fieldID] = parseFloat(fields[fieldID]);
        }else if ((! isNaN(parseFloat(fields[fieldID])))){
            fields[fieldID] = {
                decimal: parseFloat(fields[fieldID]),
                currency: 'USD' // this is NASA, 'murica!
            }
        }else{
            delete(fields[fieldID]);
        }
    });

    // system field black list
    ['1', '3', '5', '6'].filter((f) =>{return(fields.hasOwnProperty(f))}).forEach((f)=>{ delete(fields[f]); });

    // ars REST will only take names apparently, not fieldIDs go figure
    let out = {};
    Object.keys(fields).filter((fieldID) => {return(formMeta.formDef.idIndex.hasOwnProperty(fieldID))}).forEach((fieldID) => {
        out[formMeta.formDef.idIndex[fieldID].name] = fields[fieldID];
    });

    return(out);
}




/*
    dataStoreFilter(formMeta, {<api-formatted-row-data})
    take a row as returned from api.query() or api.getTicket() for the
    form identified by formMeta and output a row formatted for
    insertion into formMeta.storeName
*/
dataStoreFilter(formMeta, apiRow){
    let out = {};
    let that = this;

    Object.keys(apiRow).forEach((fieldName) => {
        let fieldID = formMeta.formDef.nameIndex[fieldName].id;
        let colName = that.formIndexMappings[formMeta.formName].hasOwnProperty(fieldID)?that.formIndexMappings[formMeta.formName][fieldID]:fieldID;
        let fieldValue = apiRow[fieldName];

        // fix dates
        if (
            formMeta.formDef.nameIndex[fieldName].hasOwnProperty('datatype') &&
            (['TIME','DATE'].indexOf(formMeta.formDef.nameIndex[fieldName].datatype) >= 0) &&
            that.isNotNull(fieldValue)
        ){
            fieldValue = that.toEpoch(fieldValue)
        }

        // fix currencies
        if (
            (fieldValue instanceof Object)  &&
            fieldValue.hasOwnProperty('decimal') &&
            formMeta.formDef.nameIndex.hasOwnProperty(fieldName) &&
            formMeta.formDef.nameIndex[fieldName].hasOwnProperty('datatype') &&
            (formMeta.formDef.nameIndex[fieldName].datatype == 'CURRENCY')
        ){
            fieldValue = fieldValue.decimal;
        }

        // some day we might need to handle attachments here, jussayin ... but for now ...
        out[colName] = fieldValue;
    });

    // if defined, pass it through dataStoreFilterCallback
    return( (that.dataStoreFilterCallback instanceof Function)?that.dataStoreFilterCallback(out, formMeta):out );
}




/*
    coalesceWriteQueue(formMeta, writeQueueRaw)
    output the minumum number of transactions for the given subset of
    writeQueue rows. Output should be of the form:
    [
        {
            // api transaction
            call: '<api function name>'
            args: {
                // api function call arguments for instance
                schema: <str>,
                fields: <{obj}>,
                etc ..
            },

            // queueIDs to update status:'transmitted'
            writeQueueRows: [<writeQueueRow>, ...]

            // identify the corresponding storeName/entryId (note for creates, we'll be deleting this)
            storeName: <indexedDB storeName containing the target row>
            entryId: <entryId of target row in storeName>
        },
        ...
    ]
*/
coalesceWriteQueue(formMeta, writeQueueRaw){
    let that = this;
    let fn = 'coalesceWriteQueue';
    if (that.debug){ that.log(`${fn}(${formMeta.formName}) | start`); }
    let tmp = {};

    // sort writeQueue by distinct entryId
    writeQueueRaw.forEach((writeQueueRow) => {
        if (! (tmp.hasOwnProperty(writeQueueRow.entryId))){ tmp[writeQueueRow.entryId] = []; }
        tmp[writeQueueRow.entryId].push(writeQueueRow);
    });

    let out = [];
    Object.keys(tmp).forEach((entryId) => {
        let trans = {
            storeName: formMeta.storeName,
            entryId: entryId,
            writeQueueRows: [],
            call: 'modifyTicket',
            args: {
                schema: formMeta.formName,
                ticket: entryId,
                fields: {}
            }
        };

        // coalesce entries within unique entryId
        tmp[entryId].sort((a,b) => {return((a.transactionDate - b.transactionDate))}).forEach((writeQueueRow) => {

            // if any transaction is a create transaction, the whole thing is a create
            if (writeQueueRow.transactionType == "create"){
                trans.call = 'createTicket';
                delete(trans.args.ticket);
            }

            // coalesce fields (note: the sort enforces chronological order)
            Object.assign(trans.args.fields, writeQueueRow.fields);

            // writeQueueRows
            trans.writeQueueRows.push(writeQueueRow);
        });

        // fix fields for api compatibility
        trans.args.fields = that.ARSDataFilter(formMeta, trans.args.fields);

        // put it on the stack
        out.push(trans);
    });

    /*
        if the config has writeTransactionTransform for this form
        run all of the transactions through it before returning
    */
    if (that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.writeTransactionTransform instanceof Function){
        out = out.map((trans) => {return(
            that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.writeTransactionTransform(formMeta, trans, that)
        )});
    }

    return(out);
}




/*
    handleAPIWrite(formMeta, api, trans)
    takes a transaction object as returned in the array from
    coalesceWriteQueue() and calls the specified api function
    with the specified arguments. Then will fetch the modified
    (or created) row from the server, format it for insertion
    into formMeta.storeName, and return that db row
*/
handleAPIWrite(formMeta, api, trans){
    let that = this;
    let fn = 'handleAPIWrite';
    return(new Promise((toot, boot) => {
        if (that.debug){ that.log(`${fn}(${formMeta.formName}, ${trans.call}) | start`); }

        // an ounce of prevention ...
        if (['createTicket', 'modifyTicket'].indexOf(trans.call) < 0){
            that.log(`${fn}(${formMeta.formName}, ${trans.call}) | invalid api call on stack: ${trans.call} | abort`);
            boot('invalid api call');
        }else{

            // write it ...
            api[trans.call](trans.args).then((response) => {
                if (that.debug){ that.log(`${fn}(${formMeta.formName}, ${trans.call}) | success ${(trans.call == "createTicket")?' | ' + response.entryId:''}`); }

                // gotta merge the field id linked indexes and merge 'em into the get fields list
                let fields = that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.query.fields.map((fName) => {
                    return(
                        /^\d+$/.test(fName)?fName:formMeta.formDef.nameIndex.hasOwnProperty(fName)?formMeta.formDef.nameIndex[fName].id:fName
                    )
                });
                Object.keys(that.formIndexMappings[formMeta.formName]).forEach((fId) => { if (fields.indexOf(fId) < 0){ fields.push(fId); } });

                // handle postWriteSyncTransform
                new Promise((_t, _b) => {
                    let fetchTransaction = {
                        schema: trans.args.schema,
                        ticket: (trans.call == "createTicket")?response.entryId:trans.args.ticket,
                        fields: fields
                    };
                    if (that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.postWriteSyncTransform instanceof Function){
                            that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.postWriteSyncTransform(formMeta, fetchTransaction, api, that).then((trn) => {
                                _t(trn);
                            }).catch((error) => {
                                that.log(`${fn}(${formMeta.formName}, ${trans.call}) | api call succeeded (${fetchTransaction.schema}/${fetchTransaction.ticket}) | postWriteSyncTransform() threw unexpectedly: ${error}`);
                                _b(error);
                            });
                    }else{
                        _t(fetchTransaction)
                    }
                }).then((fetchTransaction) => {

                    // fetch it
                    api.getTicket(fetchTransaction).then((ticketResponse) => {
                        toot(that.dataStoreFilter(formMeta, ticketResponse.values));
                    }).catch((error) => {

                        // something went kinda wrong yo
                        that.log(`${fn}(${formMeta.formName}, ${trans.call}) | write transaction successfull, but could not retrieve updated row from server!: ${(trans.call == "createTicket")?response.entryId:trans.args.ticket}`);
                        if (error instanceof Object){ error._failureToRefresh = (trans.call == "createTicket")?response.entryId:trans.args.ticket; } // special flag for "successfully failed" condition
                        boot(error);

                    });

                }).catch((error) => {
                    that.log(`${fn}(${formMeta.formName}, ${trans.call}) | api call succeeded but config defines postWriteSyncTransform which threw unexpectedly | ${error}`);
                    boot(error);
                });
            }).catch((error) => {
                that.log(`${fn}(${formMeta.formName}, ${trans.call}) | api call failed: ${error}`);
                boot(error);
            });
        }
    }));
}




/*
    writeCompletedTransaction(formMeta, dbRow, api, trans)
    handles writing the output of handleAPIWrite to the indexedDB instance.

        1) dump the new row (dbRow) into formMeta.storeName
        2) if it was a create, delete the original row with the guid-for-entryId
           this should be on trans.entryId
        3) mark the writeQueue transactions status:'transmitted'
*/
writeCompletedTransaction(formMeta, dbRow, api, trans){
    let that = this;
    let fn = 'writeCompletedTransaction';

    let targetEntyryId = dbRow[that.formIndexMappings[formMeta.formName].hasOwnProperty('1')?that.formIndexMappings[formMeta.formName]['1']:'1'];
    return(new Promise((toot, boot) => {
        if (that.debug){ that.log(`${fn}(${formMeta.formName}, ${targetEntyryId}) | start`); }
        let writeFail = false;

        // little sub-promise to encapsulate update/swap on target datastore
        new Promise((__t, __b) => {

            // delete FIRST or you shall taste the wrath of unique index violations!
            that.DBs[formMeta.dbTagName].deleteObject({
                storeName: formMeta.storeName,
                indexName: 'entryId',
                key: trans.entryId
            }).then(() => {

                // now do the write!
                that.DBs[formMeta.dbTagName].put({
                    storeName: formMeta.storeName,
                    object: dbRow
                }).then(() => {
                    __t(true);
                }).catch((error) => {
                    writeFail = true;
                    __b(`failed to write updated/created row: ${error}`);
                });
            }).catch((error) => {
                // delete original failed? super shouldn't happen
                writeFail = true;
                __b(`failed to delete original (${trans.entryId}) ${error}`);
            });

        }).catch((error) => {
            /*
                should be super rare, but update/swap failed?
                meh, if we're here than the transmit at least was successful
                we're gonna basically ignore it and head on to marking the
                writeQueue transactions done
            */
            writeFail = true;
            that.log(`${fn}(${formMeta.formName}) | original entry id: ${trans.entryId} | server entry id: ${targetEntyryId} | failed update/swap on ${formMeta.storeName} | ignored | ${error}`);
        }).then(() => {

            // done with update/swap, mark the writeQueue rows transmitted
            trans.writeQueueRows.forEach((wq) => {
                wq.status = 'transmitted';
                wq.transmitDate = that.epochTimestamp(true)
            });
            that.internalDB.bulkPut({
                storeName: 'writeQueue',
                objects: trans.writeQueueRows
            }).catch((error) => {
                writeFail = true;
                that.log(`${fn}(${formMeta.formName}) | ignored | failed to write status:'transmitted' to writeQueue rows: ${trans.writeQueueRows.map((a)=>{return(a.queueID)}).join(', ')}`);
            }).then(() => {
                toot(writeFail);
            });
        });
    }));
}




/*
    handleTransmits(formMeta, api)
    called from syncForm regardless of syncInterval etc. This fires every time
    the algorithm should be
        1) transmit queued create/modify
        2) retrieve entryId returned by create call (or modify entryId)
        3) write new row to target dataStore (necessarily blowing away _changes)
        4) delete queued create (skip if modify)
        5) return entryId index of written rows (we can exclude these from any subsequent sync)

    OK so design decisions we have to make to enable the above:

        * writes go into the actual column on the row in the targetForm
        * writes *also* go into the writeQueue table like this:
            {
                entryId: <str>
                schema: <server formName>
                transactionDate: <epochTimestamp(hiRes)>
                transactionType: <enum(create|modify)>
                fields: {
                    <fieldID>:<value ...>
                }
                status: <enum(queued | transmitted )>
            }
        * the target form row is the "current state" of the record
          (it may be blown away and refreshed from the server at any time)
          however we will *try* to dequeue all transactions first. If we miss one
          we'll catch it on the next go around, but we won't delete the

        * writeQueue holds transactions for a specific row on a specific schema and that is what
          we dequeue here. We will coalesce transactions though (for instance, modify-after-create, etc)

        * we update status to transmitted after tramsmit, but don't delete until a threshold is met
          (config defined) we'll weld this into handlePrune() -- actually one better, let's make a
          writeQueuePruneCallback or something we can define in the queue. It might not actually be
          a threshold but a status for instance we want to catch to handle the writeQueue expire.
*/
handleTransmits(formMeta, api){
    let that = this;
    let fn = 'handleTransmits';
    return(new Promise((toot, boot) => {
        if (that.debug){ that.log(`${fn}(${formMeta.formName}) | start`); }
        that.statusUpdate({ message: `sync: ${that.getSyncName(formMeta.formName)}`, detail: 'transmit', additionalDetail: 'fetching writeQueue', functionName: fn, _status:'net-write' });

        // get the transmitQueue
        that.internalDB.getAll({
            storeName: 'writeQueue',
            indexName: 'statusSchema',
            query: IDBKeyRange.only(['queued', formMeta.formName])
        }).then((writeQueueRaw) => {

            // get list of transactions
            let writeQueue = that.coalesceWriteQueue(formMeta, writeQueueRaw);

            // let 'um know
            that.statusUpdate({
                message: `sync: ${that.getSyncName(formMeta.formName)}`,
                detail: `transmit (0/${writeQueue.length})`,
                additionalDetail: '',
                updatePieCharts: [{name: 'network', value: 0}, {name: 'error', value: 0} ],
                runAnimation: false,
                functionName: fn, _status:'net-write'
            });

            // gitrdun
            let numWritesComplete = 0;
            let numFails = 0;
            let apiErrorCounter = 0;
            let rowUpdateNotificationQueue = [];
            Promise.all(
                writeQueue.map((trans) => { return(new Promise((_t,_b) => {
                    that.statusUpdate({
                        message: `sync: ${that.getSyncName(formMeta.formName)}`,
                        detail: `transmit (${numWritesComplete}/${writeQueue.length})`,
                        functionName: fn,
                        logMessage: false, _status:'net-write'
                    });
                    that.handleAPIWrite(formMeta, api, trans).then((dbRow) => {
                        numWritesComplete ++;
                        that.statusUpdate({
                            message: `sync: ${that.getSyncName(formMeta.formName)}`,
                            detail: `write (${numWritesComplete}/${writeQueue.length})`,
                            additionalDetail: dbRow[that.formIndexMappings[formMeta.formName].hasOwnProperty('1')?that.formIndexMappings[formMeta.formName]['1']:'1'],
                            updatePieCharts: [{name: 'network', value: ((numWritesComplete/writeQueue.length)*100) }],
                            functionName: fn,
                            logMessage: false, _status:'net-write'
                        });

                        that.writeCompletedTransaction(formMeta, dbRow, api, trans).then((writeFail) => {

                            /*
                                writeCompletedTransaction() does not boot. we fail safe
                                however, if there was any failure at all that was ignored
                                writeFail will be true

                                note it in the pieChart or what have you but keep on movin
                            */
                            if (writeFail){
                                numFails ++;
                                that.statusUpdate({
                                    message: `sync: ${that.getSyncName(formMeta.formName)}`,
                                    detail: `write (${numWritesComplete}/${writeQueue.length})`,
                                    updatePieCharts: [
                                        {name: 'error', value: ((numFails/writeQueue.length)*100) }
                                    ],
                                    functionName: fn,
                                    logMessage: false, _status:'db-write'
                                });
                            }

                            /*
                                queue rowUpdate notifies to main thread and send them in a group
                                (lesson learned about smurfing the main thread event loop with row-specific update event messages)
                            */
                            rowUpdateNotificationQueue.push({
                                formName: formMeta.formName,
                                entryId: dbRow[that.formIndexMappings[formMeta.formName].hasOwnProperty('1')?that.formIndexMappings[formMeta.formName]['1']:'1'],
                                old_entryId: trans.hasOwnProperty('entryId')?trans.entryId:null
                            });
                            _t(true);

                        }).catch((error) => {
                            /*
                                apart from actual code errors it should not be possible to get here
                                writeCompletedTransaction() does not know how to boot
                            */
                            that.log(`${fn}(${formMeta.formName}) | ignored | it is highly unlikely this code has fired | writeCompletedTransaction() threw unexpectedly: ${error}`);
                        });

                    }).catch((error) => {

                        // update progress but set error accumulator on pie chart as well
                        numWritesComplete ++;

                        /*
                            handleAPIWrite() may have failed successfully
                            meaning the write transaction succeeded but the record refresh did not
                            in that scenario, we mark all the writeQueue transactions complete

                            if we boot in here the Promise.all().catch() will fire *immediately*
                            which will fire the failure logic potentially before remaining, potentially successful
                            transactions complete.

                            for that reason the error block still toots, but we increment numFails
                            do with that what ye will

                            TO-DO: status update on error condition to drive pieChart and such
                        */
                        numFails++;
                        if (
                            (error instanceof Object) &&
                            error.hasOwnProperty('_failureToRefresh') &&
                            that.isNotNull(error.__failureToRefresh)
                        ){
                            // this is not a failure exactly, update the writeQueue entries status:transmitted so we don't do 'em again
                            trans.writeQueueRows.forEach((wq) => {
                                wq.status = 'transmitted';
                                wq.transmitDate = that.epochTimestamp(true)
                            });
                            that.internalDB.bulkPut({
                                storeName: 'writeQueue',
                                objects: trans.writeQueueRows
                            }).catch((error) => {
                                that.log(`${fn}(${formMeta.formName}) | ignored | failed to write status:'transmitted' to writeQueue rows: ${trans.writeQueueRows.map((a)=>{return(a.queueID)}).join(', ')}`);
                            }).then(() => {
                                that.statusUpdate({
                                    message: `sync: ${that.getSyncName(formMeta.formName)}`,
                                    detail: `write (${numWritesComplete}/${writeQueue.length})`,
                                    additionalDetail: '',
                                    updatePieCharts: [
                                        {name: 'network', value: ((numWritesComplete/writeQueue.length)*100) }
                                    ],
                                    functionName: fn,
                                    logMessage: false, _status:'net-write'
                                });
                                _t(false);
                            });
                        }else{
                            // this is a legit failure, leave writeQueue untouched, will try again next syncInterval
                            apiErrorCounter ++;
                            that.statusUpdate({
                                message: `sync: ${that.getSyncName(formMeta.formName)}`,
                                detail: `write (${numWritesComplete}/${writeQueue.length})`,
                                additionalDetail: '',
                                updatePieCharts: [
                                    {name: 'network', value: ((numWritesComplete/writeQueue.length)*100) },
                                    {name: 'error', value: ((apiErrorCounter/writeQueue.length)*100) }
                                ],
                                functionName: fn,
                                logMessage: false, _status:'net-write'
                            });
                            _t(false);
                        }
                    })
                })); })
            ).then(() => {

                // if literally every write transaction failed, fail the whole thing
                if (
                    (apiErrorCounter > 0) &&
                    (writeQueue.length > 0) &&
                    (apiErrorCounter == writeQueue.length)
                ){
                    that.statusUpdate({
                        messageNumber: 13,
                        error: true,
                        message: `${fn}(${formMeta.formName}) | ${apiErrorCounter} of ${writeQueue.length} api write transactions failed, abort`,
                        detail: `${error}`,
                        runAnimation: false,
                        error: true,
                        functionName: fn
                    });
                    boot(`all api write transactions failed (see log)`);

                // otherwise send back the noticicationQueue
                }else{
                    // done with sending transactions
                    that.statusUpdate({
                        message: `sync: ${that.getSyncName(formMeta.formName)}`,
                        detail: `transmit complete`,
                        additionalDetail: '',
                        updatePieCharts: [{name: 'network', value: 0}, {name: 'error', value: 0} ],
                        runAnimation: false,
                        functionName: fn, _status:'net-write'
                    });
                    toot(rowUpdateNotificationQueue);
                }

            }).catch((error) => {
                // something extraordinary failed because none of the promises know how to boot
                // done with sending transactions
                that.statusUpdate({
                    message: `sync: ${that.getSyncName(formMeta.formName)}`,
                    detail: error,
                    additionalDetail: '',
                    updatePieCharts: [{name: 'network', value: 0}, {name: 'error', value: 0} ],
                    runAnimation: false,
                    error: true,
                    functionName: fn,
                });
                that.log(`${fn}(${formMeta.formName}) | an extraordinary error occured, aborting transmit queue (this should not be possible): ${error}`);
                boot(error);
            })

        }).catch((error) => {
            that.statusUpdate({
                messageNumber: 12,
                error: true,
                message: `failed to fetch queued writeQueue for ${formMeta.formName} (please contact administrator)`,
                detail: `${error}`,
                runAnimation: false,
                functionName: fn
            });
            boot(error);
        });
    }));
}




/*
    handlePrune(formMeta, syncOutput, api)
    handle pruning records from the indexedDB table for the form specified by formMeta
    that no longer exist on the server
*/
handlePrune(formMeta, syncOutput, api){
    let that = this;
    let fn = 'handlePrune';
    return(new Promise((toot, boot) => {
        if (that.debug){ that.log(`${fn}(${formMeta.formName}) | start`); }

        // set it up
        let rowNum = 0;
        let rowCount = 0;
        let delcount = 0;
        let writeQueueExcludeDelete = {};
        let entryIdColumn = that.formIndexMappings[formMeta.formName].hasOwnProperty('1')?that.formIndexMappings[formMeta.formName]['1']:'1';

        that.statusUpdate({
            message: `sync: ${that.getSyncName(formMeta.formName)}`,
            detail: `pruning expired rows`,
            additionalDetail: `fetching meta ...`,
            updatePieCharts: [{name: 'network', value: 0}, {name: 'database', value: 0 }, {name: 'error', value: 0}],
            runAnimation: false,
            functionName: fn, _status:'db-read'
        });

        // get total num rows to iterate
        that.DBs[formMeta.dbTagName].getDescription(formMeta.storeName).then((d) => {
            rowCount = d[0].count;

            that.statusUpdate({
                message: `sync: ${that.getSyncName(formMeta.formName)}`,
                detail: `pruning expired rows`,
                additionalDetail: `fetching writeQueue ...`, _status:'db-read'
            });

            // fetch anything in the writeQueue for this schema that's not sent yet (exclude list)
            that.internalDB.getAll({
                storeName: 'writeQueue',
                indexName: 'statusSchema',
                query: IDBKeyRange.only(['queued', formMeta.formName])
            }).then((writeQueueRows) => {
                writeQueueRows.map((row)=>{return(row.entryId)}).forEach((entryId)=>{writeQueueExcludeDelete[entryId] = true; });
                if ((syncOutput.bulkSyncBypassed == true) && (
                    (! (
                        (that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._bulkSync instanceof Object) &&
                        that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._bulkSync.hasOwnProperty('disableSlowPrune') &&
                        (that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._bulkSync.disableSlowPrune == true)
                    ))
                )){

                    /*
                        slow prune
                        since we haven't had a bulkSync, syncOutput.entryIdIndex only contains the rows we know exist from
                        the deltaSync that should have immediately preceeded the call to this function.
                        So, excluding syncOutput.entryIdIndex we get a list of all entryids on the datastore, then we
                        chunk out queries that go something like `(${_sync.query.QBE}) AND ('1' = "<entryId>" OR '1' = "<" ...)`
                        then we execute all those queries, and anything we didn't find on the server and that doesn't exist
                        in writeQueueExcludeDelete, we drop from the table.

                        This is expensive to say the least.

                        it is advisable to NOT execute this against a table with a bajillion rows or you're gonna smurf your
                        server for one thing. For truly massive tables put some logic in where this never gets called without
                        an immediately preceeding bulkSync. You have been warned
                    */

                    let checkQueue = [];
                    that.DBs[formMeta.dbTagName].openCursor({
                        storeName: formMeta.storeName,
                        callback: (cursor) => { if (that.isNotNull(cursor)){
                            rowNum ++;
                            that.statusUpdate({
                                message: `sync: ${that.getSyncName(formMeta.formName)}`,
                                detail: `pruning expired rows`,
                                additionalDetail: `fetching record list ...`,
                                updatePieCharts: [ {name: 'database', value: ((rowNum/rowCount)*100) }],
                                logMessage: false,
                                limitMessageFrequency: true,
                                functionName: fn, _status:'db-read'
                            });

                            if (
                                cursor.value &&
                                cursor.value[entryIdColumn] &&
                                that.isNotNull(cursor.value[entryIdColumn]) &&
                                (! (syncOutput.entryIdIndex.hasOwnProperty(cursor.value[entryIdColumn]))) &&
                                (! (writeQueueExcludeDelete.hasOwnProperty(cursor.value[entryIdColumn])))
                            ){
                                checkQueue.push(cursor.value[entryIdColumn]);
                            }
                            cursor.continue();
                        }}
                    }).then(() => {
                        that.statusUpdate({
                            message: `sync: ${that.getSyncName(formMeta.formName)}`,
                            detail: `pruning expired rows`,
                            additionalDetail: `preparing query ...`,
                            updatePieCharts: [ {name: 'database', value: 0 }],
                            logMessage: false,
                            functionName: fn, _status:'net-read',
                            runAnimation: true
                        });
                        // chunk dem queries yo
                        let queryChunks = [[]];
                        let queryPrefix = `(${that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.query.QBE}) AND (`;
                        checkQueue.forEach((entryId) => {
                            let currentChunk = queryChunks[(queryChunks.length -1)];
                            if (`${queryPrefix}'1'="${currentChunk.concat([entryId]).join(`" OR '1'="`)}")`.length < that._config.queryListByteLimit){
                                currentChunk.push(entryId)
                            }else{
                                queryChunks.push([]);
                                queryChunks[(queryChunks.length -1)].push(entryId);
                            }
                        });

                        // execute the query chunks
                        let chunksComplete = 0;
                        let whiteList = {};
                        Promise.all(queryChunks.map((chunk, idx) =>{return(new Promise((_t,_b) => {

                            api.query({
                                schema: formMeta.formName,
                                fields: ['1'],
                                QBE: `${queryPrefix}'1'="${chunk.join(`" OR '1'="`)}")`
                            }).then((result) => {

                                chunksComplete ++;
                                that.statusUpdate({
                                    message: `sync: ${that.getSyncName(formMeta.formName)}`,
                                    detail: `pruning expired rows`,
                                    additionalDetail: `query chunk ${idx + 1} of ${queryChunks.length}`,
                                    updatePieCharts: [ {name: 'network', value: ((chunksComplete/queryChunks.length)*100) }],
                                    logMessage: false,
                                    functionName: fn, _status:'net-read',
                                    runAnimation: false
                                });

                                result.entries.filter((row) => {return(
                                    row.hasOwnProperty('values') &&
                                    (row.values instanceof Object) &&
                                    row.values.hasOwnProperty(formMeta.formDef.idIndex['1'].name) &&
                                    that.isNotNull(row.values[formMeta.formDef.idIndex['1'].name])
                                )}).map((row) => {return(
                                    row.values[formMeta.formDef.idIndex['1'].name]
                                )}).forEach((entryId) => {
                                    whiteList[entryId] = true;
                                });

                                _t(true);
                            }).catch((error) => {

                                // query chunk failed
                                that.log(`${fn}(${formMeta.formName}) | slow prune failed query chunk ${idx + 1} of ${queryChunks.length} | ${error}`);
                                _b(error);
                            });

                        }))})).then(() =>{

                            // all done with query chunks, go dump anything not in the whiteList or writeQueueExcludeDelete
                            let deleted = 0;
                            let deleteQueue = checkQueue.filter((entryId)=>{return(
                                (! (whiteList.hasOwnProperty(entryId))) &&
                                (! (writeQueueExcludeDelete.hasOwnProperty(entryId)))
                            )});
                            Promise.all(deleteQueue.map((entryId, idx)=>{return(new Promise((_t,_b) => {
                                that.DBs[formMeta.dbTagName].deleteObject({
                                    storeName: formMeta.storeName,
                                    indexName: that.formIndexMappings[formMeta.formName]['1'],
                                    key: entryId
                                }).then(() => {
                                    deleted ++;
                                    that.statusUpdate({
                                        message: `sync: ${that.getSyncName(formMeta.formName)}`,
                                        detail: `pruning expired rows`,
                                        additionalDetail: `delete ${idx + 1} of ${deleteQueue.length}`,
                                        updatePieCharts: [ {name: 'error', value: ((deleted/deleteQueue.length)*100) }],
                                        logMessage: false,
                                        functionName: fn, _status:'db-write'
                                    });
                                    _t(true);
                                }).catch((error) => {
                                    // expired row delete failed
                                    that.log(`${fn}(${formMeta.formName}) | failed delete entryId: ${entryId} | ${error}`);
                                    _b(error);
                                });
                            }))})).then(() => {

                                // done pruning / write lastPrune in the meta record
                                that.writeFormMeta(formMeta, {lastPrune: that.epochTimestamp() }).then(() => {
                                    that.statusUpdate({
                                        message: `sync: ${that.getSyncName(formMeta.formName)}`,
                                        detail: `pruning expired rows`,
                                        additionalDetail: `complete: deleted ${deleteQueue.length} rows`,
                                        updatePieCharts: [{name: 'network', value: 0}, {name: 'database', value: 0 }, {name: 'error', value: 0}],
                                        runAnimation: false,
                                        functionName: fn, _status:'db-write'
                                    });
                                    toot(true);
                                });

                            }).catch((error) => {
                                // one or more deletes failed
                                that.statusUpdate({
                                    messageNumber: 18,
                                    error: true,
                                    message: `failed prune (slow) for ${formMeta.formName} (please contact administrator)`,
                                    detail: `one or more deletes failed | ${error}`,
                                    runAnimation: false,
                                    updatePieCharts: [{name: 'network', value: 0 }, {name: 'database', value: 0}, {name: 'error', value: 0}],
                                    functionName: fn
                                });
                                boot(error);
                            });

                        }).catch((error) => {
                            // query chunk(s) failed, abort the whole thing
                            that.statusUpdate({
                                messageNumber: 17,
                                error: true,
                                message: `failed prune (slow) for ${formMeta.formName} (please contact administrator)`,
                                detail: `one or more query chunks failed | ${error}`,
                                runAnimation: false,
                                updatePieCharts: [{name: 'network', value: 0 }, {name: 'database', value: 0}],
                                functionName: fn
                            });
                            boot(error);
                        });

                    }).catch((error) => {
                        // failed to open cursor on target table to aggregate entryId list?
                        that.statusUpdate({
                            messageNumber: 16,
                            error: true,
                            message: `failed prune (slow) for ${formMeta.formName} (please contact administrator)`,
                            detail: `openCursor(${formMeta.storeName}) threw unexpectedly | ${error}`,
                            runAnimation: false,
                            updatePieCharts: [{name: 'network', value: 0 }, {name: 'database', value: 0}],
                            functionName: fn
                        });
                        boot(error);
                    });

                // "slow prune" is disabled but we didn't have a bulkSync for a quick prune ...
                }else if (
                    (syncOutput.bulkSyncBypassed == true) && (
                        (that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._bulkSync instanceof Object) &&
                        that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._bulkSync.hasOwnProperty('disableSlowPrune') &&
                        (that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._bulkSync.disableSlowPrune == true)
                    )
                ){

                    // log that and be out
                    if (that.debug){ that.log(`${fn}(${formMeta.formName}) | slow prune disabled for this form and no bulkSync for quick prune exit with success, prune bypassed `); }
                    toot(false);


                // end slow prune stuffs
                }else{

                    /*
                        quick prune
                        this function should have been immediately preceeded by a bulkSync, then a deltaSync meaning that
                        syncOutput.entryIdIndex contains a list of every entryId existing on the server. So super easy
                        we iterate the table and we dump any entryId not in syncOutput.entryIdIndex or writeQueueExcludeDelete
                    */
                    that.DBs[formMeta.dbTagName].openCursor({
                        storeName: formMeta.storeName,
                        callback: (cursor) => {if (that.isNotNull(cursor)){
                            that.statusUpdate({
                                message: `sync: ${that.getSyncName(formMeta.formName)}`,
                                detail: `finding expired rows (${rowNum} of ${rowCount}) | deleted: ${delcount}`,
                                additionalDetail: ``,
                                updatePieCharts: [{name: 'database', value:  ((rowNum/rowCount)*100)}, {name: 'error', value: ((delcount/rowCount)*100)}],
                                logMessage: false,
                                limitMessageFrequency: true,
                                functionName: fn, _status:'db-read'
                            });
                            rowNum++;
                            if (
                                cursor.value &&
                                cursor.value[entryIdColumn] &&
                                that.isNotNull(cursor.value[entryIdColumn]) &&
                                (syncOutput.entryIdIndex.indexOf(cursor.value[entryIdColumn]) < 0) &&
                                (! (writeQueueExcludeDelete.hasOwnProperty(cursor.value[entryIdColumn])))
                            ){
                                that.statusUpdate({
                                    message: `sync: ${that.getSyncName(formMeta.formName)}`,
                                    detail: `pruning expired rows (${rowNum} of ${rowCount}) | deleted: ${delcount}`,
                                    additionalDetail: `delete ${cursor.value[entryIdColumn]}`,
                                    logMessage: false, _status:'db-write'
                                });
                                let req = cursor.delete();
                                req.onsuccess = () => { delcount ++; cursor.continue(); }
                                req.onerror = (error) => {
                                    that.log(`${fn}(${formMeta.formName}) | failed to delete ${cursor.value[entryIdColumn]} | ${error}`);
                                    cursor.continue();
                                }
                            }else{
                                cursor.continue();
                            }
                        }}
                    }).then(() => {

                        // write lastPrune meta flag and be out!
                        that.writeFormMeta(formMeta, {lastPrune: that.epochTimestamp() }).then(() => {

                            // all done, wrap it up
                            that.statusUpdate({
                                message: `sync: ${that.getSyncName(formMeta.formName)}`,
                                detail: `pruning expired rows`,
                                additionalDetail: `complete: deleted ${delcount} rows`,
                                updatePieCharts: [{name: 'network', value: 0}, {name: 'database', value: 0 }, {name: 'error', value: 0}],
                                runAnimation: false,
                                functionName: fn, _status:'db-write'
                            });
                            toot(true);
                        });

                    }).catch((error) => {
                        that.statusUpdate({
                            messageNumber: 14,
                            error: true,
                            message: `failed prune (fast) for ${formMeta.formName} (please contact administrator)`,
                            detail: `failed to open cursor on ${formMeta.storeName} | ${error}`,
                            runAnimation: false,
                            updatePieCharts: [{name: 'network', value: 0 }, {name: 'database', value: 0}],
                            functionName: fn
                        });
                        boot(error);
                    });
                } // end "quick prune"

            }).catch((error) => {
                // failed to query exclude list from writeQueue (note 'no match' case is an empty array with success so something really went wrong)
                that.statusUpdate({
                    messageNumber: 15,
                    error: true,
                    message: `failed prune for ${formMeta.formName} (please contact administrator)`,
                    detail: `getAll('writeQueue',['queued',${formMeta.formName}]) threw unexpectedly | ${error}`,
                    runAnimation: false,
                    updatePieCharts: [{name: 'network', value: 0 }, {name: 'database', value: 0}],
                    functionName: fn
                });
                boot(error);
            });
        }).catch((error) => {
            // failed to get db description of target table to get rowcount, etc
            that.statusUpdate({
                messageNumber: 14,
                error: true,
                message: `failed to pull db description for ${formMeta.storeName} (please contact administrator)`,
                detail: `${error}`,
                runAnimation: false,
                updatePieCharts: [{name: 'network', value: 0 }, {name: 'database', value: 0}],
                functionName: fn
            });
            boot(error);
        });
    }));
} // end handlePrune()




/*
    handleWriteQueuePrune(formMeta, api)
    prune transmitted records from the writeQueue for the specified form
    NOTE: config must define the following for the specified form:

    that.config.dbConfig.storeDefinitions[formMeta.storeName]._sync
        .writeQueueRowIsPrunable <async(formMeta, writeQueueRow, threadHandle)
         this resolves to a bool (true = delete it)
*/
handleWriteQueuePrune(formMeta,  api){
    let that = this;
    let fn = 'handleWriteQueuePrune';
    return(new Promise((toot, boot) => {
        if (that.debug){ that.log(`${fn}(${formMeta.formName}) | start`); }
        that.statusUpdate({ message: `sync: ${that.getSyncName(formMeta.formName)}`, detail: 'prune writeQueue', additionalDetail: 'get writeQueue', functionName: fn, _status:'db-read' });
        that.internalDB.getAll({
            storeName: 'writeQueue',
            indexName: 'statusSchema',
            query: IDBKeyRange.only(['transmitted', formMeta.formName])
        }).then((pruneQueueRaw) => {
            that.statusUpdate({ message: `sync: ${that.getSyncName(formMeta.formName)}`, detail: 'prune writeQueue', additionalDetail: `sort writeQueue (${pruneQueueRaw.length})`, functionName: fn, _status:'db-write' });
            Promise.all(pruneQueueRaw.map((writeQueueRow) =>{return(new Promise((_t,_b)=>{

                new Promise((__t, __b) =>{
                    if (that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.writeQueueRowIsPrunable instanceof Function){
                        __t(that.config.DBs[formMeta.dbTagName].storeDefinitions[formMeta.storeName]._sync.writeQueueRowIsPrunable(formMeta, writeQueueRow, api, that))
                    }else{
                        __t(true); // if you didnt define writeQueueRowIsPrunable, default action is delete it
                    }
                }).catch((error) =>{
                    that.log(`${fn}(${formMeta.formName}) | writeQueueRowIsPrunable() threw unexpectedly on writeQueue/${writeQueueRow.queueID} (ignored, defaulting false)| ${error}`);
                }).then((deleteMe) =>{
                    if (deleteMe === true){
                        // delete em
                        that.statusUpdate({ message: `sync: ${that.getSyncName(formMeta.formName)}`, detail: 'prune writeQueue', additionalDetail: `${writeQueueRow.entryId}`, functionName: fn, _status:'db-write' });
                        that.internalDB.deleteObject({
                            storeName: 'writeQueue',
                            indexName: 'queueID',
                            key: writeQueueRow.queueID
                        }).then(() => {
                            _t(true);
                        }).catch((error) => {
                            // failed writeQueue row delete?!
                            that.log(`${fn}(${formMeta.formName}) | indexedDB threw unexpectedly on deleteObject(writeQueue/${writeQueueRow.queueID}) | ${error}`);
                            boot(error);
                        });
                    }else{
                        // bypass delete
                        _t(true);
                    }
                });
            }))})).then(() => {
                that.statusUpdate({ message: `sync: ${that.getSyncName(formMeta.formName)}`, detail: 'prune writeQueue', additionalDetail: 'complete', functionName: fn });
                toot(true);
            }).catch((error) => {
                that.log(`${fn}(${formMeta.formName}) | one or more failures deleting writeQueue rows (see log) | exit with error | ${error}`);
                boot(error);
            });
        }).catch((error) => {

            // this really shouldn't happen. we should get an empty array for no-match, meaning if this happened indexedDB is down and that ain't good
            that.statusUpdate({
                messageNumber: 19,
                error: true,
                message: `failed to fetch transmitted writeQueue for ${formMeta.formName} (please contact administrator)`,
                detail: `${error}`,
                runAnimation: false,
                functionName: fn
            });
            boot(error);
        });
    }));
}




/*
    getThreadInfo()
    return this datastructure to the caller
    {
       DBs: { <dbDefinitionsForEachDB> },
       internalDBConfig: that.internalDBConfig,
       formMappings: that.formMappings,
       storeMappings: that.storeMappings,
       formIndexMappings: that.formIndexMappings,
       formIDToIndexMappings: that.formIDToIndexMappings
   }
*/
getThreadInfo(){
    let that =  this;
    let mergeOut = {
        DBs: {},
        internalDBConfig: that.internalDBConfig,
        formMappings: that.formMappings,
        formDBMappings: that.formDBMappings,
        storeMappings: that.storeMappings,
        formIndexMappings: that.formIndexMappings,
        formIDToIndexMappings: that.formIDToIndexMappings,
        formDefinitions: that.formDefinitions,
        dbTagMappings: that.dbTagMappings
    };
    // merge just the minimum to mount the db from an external thread into the output
    Object.keys(that.DBs).forEach((dbTagName) => {
        mergeOut.DBs[dbTagName] = {
            dbName: that.config.DBs[dbTagName].dbName,
            dbVersion: that.config.DBs[dbTagName].dbVersion,
            storeDefinitions: {}
        };

        Object.keys(that.DBs[dbTagName].storeDefinitions).forEach((storeName) => {
            mergeOut.DBs[dbTagName].storeDefinitions[storeName] = {
                createOptions: that.DBs[dbTagName].storeDefinitions[storeName].createOptions,
                indexes: that.DBs[dbTagName].storeDefinitions[storeName].indexes
            };
        });
    });
    return(mergeOut);
}




/*
    manageDBFlags()
    this is called from initialize(), BEFORE the first invokeMainLoop() is executed
    as of this writing, it only manages the forceDataRefresh flag
*/
manageDBFlags(){
    let that = this;
    return(new Promise((toot, boot) => {


            // k start by snagging all the forms with a forceDataRefresh node in their config
            let flagsToCheck = {};
            Object.keys(that._config.DBs).filter((dbTagName) => {return(
                (that._config.DBs[dbTagName] instanceof Object) &&
                (that._config.DBs[dbTagName].storeDefinitions instanceof Object) &&
                (Object.keys(that._config.DBs[dbTagName].storeDefinitions).length > 0)
            )}).forEach((dbTagName) => {
                Object.keys(that._config.DBs[dbTagName].storeDefinitions).filter((storeName) => {return(
                    (that._config.DBs[dbTagName].storeDefinitions[storeName] instanceof Object) &&
                    (that._config.DBs[dbTagName].storeDefinitions[storeName]._sync instanceof Object) &&
                    (that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.forceDataRefresh instanceof Object) &&
                    (that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.query instanceof Object) &&
                    that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.query.hasOwnProperty('schema') &&
                    that.isNotNull(that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.query.schema)
                )}).map((storeName) =>{return(
                    {
                        schema: that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.query.schema,
                        forceDataRefresh: that._config.DBs[dbTagName].storeDefinitions[storeName]._sync.forceDataRefresh
                    }
                )}).forEach((o) => { flagsToCheck[o.schema] = o.forceDataRefresh; });
            });

            // get all the meta
            that.internalDB.getAll({storeName: 'meta'}).then((meta) => {
                let metaWrite = [];
                meta.filter((metaRow) => {return(/^formMeta_/.test(metaRow.key))}).forEach((metaRow) => {

                    if (
                        metaRow.hasOwnProperty('forceDataRefresh') &&
                        (metaRow.forceDataRefresh == "complete") &&
                        metaRow.hasOwnProperty('schema') &&
                        (! flagsToCheck.hasOwnProperty(metaRow.schema))
                    ){

                        // remove forceDataRefresh if it's completed and no longer present in the config
                        delete(metaRow.forceDataRefresh);
                        metaWrite.push(metaRow);

                    }else if (
                        metaRow.hasOwnProperty('schema') &&

                        // metaRow.forceDataRefresh == "complete" and metaRow.lastSync > config.forceDataRefresh.date
                        (
                            metaRow.hasOwnProperty('forceDataRefresh') &&
                            (metaRow.forceDataRefresh == "complete") &&
                            metaRow.hasOwnProperty('lastSync') &&
                            (! isNaN(parseInt(metaRow.lastSync))) &&
                            (flagsToCheck[metaRow.schema] instanceof Object) &&
                            flagsToCheck[metaRow.schema].hasOwnProperty('date') &&
                            (! isNaN(parseInt(flagsToCheck[metaRow.schema].date))) &&
                            ( parseInt(flagsToCheck[metaRow.schema].date) > parseInt(metaRow.lastSync)) &&
                            flagsToCheck.hasOwnProperty(metaRow.schema) &&
                            flagsToCheck[metaRow.schema]
                        ) || (

                            (flagsToCheck[metaRow.schema] instanceof Object) &&
                            flagsToCheck[metaRow.schema].hasOwnProperty('flag') &&
                            (flagsToCheck[metaRow.schema].flag === true) &&
                            (! metaRow.hasOwnProperty('forceDataRefresh'))
                        )
                    ){
                        // set forceDataRefresh if in config but not in db, or if config set date > than last refresh
                        metaRow.forceDataRefresh = true;
                        metaWrite.push(metaRow);
                    }
                });
                toot(
                    (metaWrite.length > 0)?that.internalDB.bulkPut({storeName: 'meta', objects: metaWrite}):true
                );
            }).catch((error) => {
                that.log(`${that._className} v${that._version} | manageDBFlags() | indexedDB threw unexpectedly on getAll('meta') | ${error}`);
                boot(error);
            });
    }));
}




/*
    syncFormSignalHandler(data, signalEvent)
*/
syncFormSignalHandler(data, signalEvent){
    let that = this;
    let fn = 'syncFormSignalHandler';
    let awaitReleaseEvent = 'syncForm';
    let outData = { error: false, netFail: false };
    let lockName = `${fn}(${((data instanceof Object) && data.hasOwnProperty('schema'))?data.schema:''})`;
    if (that.debug){ that.log(`${lockName} | start`); }

    that.awaitThreadLocks([lockName]).catch((error) => {

        // not fatal but a threadLock threw so we oughta log it I supose
        that.log(`${fn}() | awaitThreadLocks() threw unexpectedly (ignored but logging) | ${error}`);

    }).then(() => {
        that.threadLocks[fn] = new Promise((toot, boot) => {
            if ((data instanceof Object) && data.hasOwnProperty('schema') && that.isNotNull(data.schema)){

                // make sure we know the schema specified
                that.internalDB.getAll({
                    storeName: 'meta',
                    indexName: 'schema',
                    query: IDBKeyRange.only(data.schema)
                }).then((rows) => {
                    if (rows.length > 0){

                        // make sure we gotta api handle
                        that.getAPI().then((api) => {

                            // honesltly, the threadLock should handle waiting for other sync's to complete
                            // let's just blind fire it and hope for the best <ladyShrugEmoji>
                            clearTimeout(that.mainLoopTimer);
                            that.mainLoopTimer = null;
                            that.syncing = true;
                            that.nextMainLoop = that.epochTimestamp(true);
                            that.syncForm(data.schema, api, true, false, false).then(() => {
                                toot({status: 'complete'});
                            }).catch((error) => {
                                if (that.debug){ that.log(`${lockName} | syncForm(${data.schema}) threw unexpectedly: ${error}`); }
                                boot(error);
                            });

                        }).catch((error) => {
                            if (that.debug){ that.log(`${lockName} | aborted | cannot get API | ${error}`); }
                            outData.netFail = true;
                            boot(error);
                        });

                    }else{
                        boot('unknown schema');
                    }
                }).catch((error) => {
                    if (that.debug){ that.log(`${lockName} | indexedDB(meta) threw unexpectedly checking schema registration: ${error}`); }
                    boot(error);
                });

            }else{
                boot(`no specified schema`);
            }
        }).catch((error) => {

            // hannle that mess
            outData.error = true;
            outData.errorMessage = error;
            that.log(`${lockName} | syncFormSignalHandler(${data.schema}) threw unexpectedly: ${error}`);

        }).then((dta) => {

            // reset the mainloop timer if we clobbered it above
            if (that.isNull(that.mainLoopTimer)){
                that.mainLoopTimer = setTimeout(() => { that.invokeMainLoop(); }, that.config.mainLoopInterval);
                that.nextMainLoop = (that.epochTimestamp(true) + that.config.mainLoopInterval);
                that.syncing = false;
            }

            // signal parent we out
            that.signalParent({
                type: 'syncForm',
                data: (dta instanceof Object)?Object.assign(outData, dta):outData
            });

            // be kind, rewind.
            setTimeout(() =>{
                delete(that.threadLocks[lockName]);
            }, 2);
        });
    });
}




/*
    getSyncName(schema)
    if the config defines a syncName in the specified schema's _sync object
    return that. else return the input (schema)
*/
getSyncName(schema){
    if (this.isNotNull(schema) && (this.formMappings instanceof Object) && (this.dbStoreToTagMappings instanceof Object)){
        let storeName = this.formMappings.hasOwnProperty(schema)?this.formMappings[schema]:null;
        let dbTagName = this.dbStoreToTagMappings.hasOwnProperty(storeName)? this.dbStoreToTagMappings[storeName]:null;
        if (
            this.isNotNull(dbTagName) &&
            (this.config instanceof Object) &&
            (this.config.DBs instanceof Object) &&
            (this.config.DBs[dbTagName] instanceof Object) &&
            (this.config.DBs[dbTagName].storeDefinitions instanceof Object) &&
            (this.config.DBs[dbTagName].storeDefinitions[storeName] instanceof Object) &&
            (this.config.DBs[dbTagName].storeDefinitions[storeName]._sync instanceof Object) &&
            this.config.DBs[dbTagName].storeDefinitions[storeName]._sync.hasOwnProperty('syncName') &&
            this.isNotNull(this.config.DBs[dbTagName].storeDefinitions[storeName]._sync.syncName)
        ){
            return(this.config.DBs[dbTagName].storeDefinitions[storeName]._sync.syncName);
        }else{
            return(schema);
        }
    }else{
        return(schema);
    }
}




/*
    syncAllNowSignalHandler(data, signalEvent)
*/
syncAllNowSignalHandler(data, signalEvent){
    let that = this;
    let fn = 'syncAllNowSignalHandler';
    let awaitReleaseEvent = 'syncAllNow';
    let outData = { error: false, netFail: false };

    // reset the existing loop timer
    clearTimeout(that.mainLoopTimer);
    that.mainLoopTimer = null;
    that.syncing = true;
    that.nextMainLoop = that.epochTimestamp(true);

    that.invokeMainLoop(false).catch((error) => {

        // hannle that mess
        outData.error = true;
        outData.errorMessage = error;
        that.log(`${fn}() threw unexpectedly: ${error}`);

    }).then((dta) => {

        // reset the mainloop timer if we clobbered it above
        if (that.isNull(that.mainLoopTimer)){
            that.mainLoopTimer = setTimeout(() => { that.invokeMainLoop(); }, that.config.mainLoopInterval);
            that.nextMainLoop = (that.epochTimestamp(true) + that.config.mainLoopInterval);
            that.syncing = false;
        }

        // signal parent we out
        that.signalParent({
            type: awaitReleaseEvent,
            data: (dta instanceof Object)?Object.assign(outData, dta):outData
        });
    });
}






} // end class

export { noiceARSSyncWorkerThread };
