/*
    noiceIndexedDB.js
    a noice interface to indexedDB
*/
'use strict';
import { noiceCoreUtility, noiceException } from './noiceCore.js';


/*
    NOTE: we might want to make a custom noiceException subclass?
    I dunno.
*/
class noiceIndexedDB extends noiceCoreUtility {


/*
    constructor({
        dbName:             <name of database>
        dbVersion:          <unsigned integer>
        storeDefinitions:   <object of store definitions (see below)>
    })

    objectStore definition JSON structure:
        <storeName>: {
            createOptions: {
                // https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/createObjectStore
                keyPath: <keyPath>,
                autoIncrement: <bool>
            },
            indexes: {
                // https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/createIndex
                <indexName>: {
                    keyPath:    <keyPath>
                    unique:     <bool>
                    multiEntry: <bool> (note keyPath needs to be an array if true)
                }
                ...
            }
        },
        ...
*/
constructor (args, defaults, callback){
    super(args, {
        _version:           1.2,
        _className:         'noiceIndexedDB',
        debug:              false,
        dbName:             'noiceDB',
        dbVersion:          1,
        storeDefinitions:   {
            noiceDBDefault: {
                createOptions: { keyPath:'id', autoIncrement: true },
                indexes:    {
                    default: { keyPath: 'key', unique: 'true' }
                }
            }
        }
    });

    // figure out our context
    if ((typeof window == 'object') && (window.indexedDB)){
        this.indexedDB = window.indexedDB;
    }else if ((typeof self == 'object') && (self.indexedDB)){
        this.indexedDB = self.indexedDB;
    }

    // throw if indexedDB isn't supported
    if (! this.indexedDB){
        throw(new noiceException({
            message:        "indexedDB is not supported",
            messageNumber:  0,
            thrownBy:       `${this._ClassName} (v ${this._version})/constructor`
        }));
    }
}




/*
    open({
        destructiveSetup:   <default false>
        setupCallback:      async function(self){ return(self); }
    })
    returns a promise that resolves to self so one can engage in shenanigans such as these:
    let someDB = await new noiceIndexedDB( ... ).open()
*/
open (args){
    let self = this;
    let writeProtectDisable = ((args instanceof Object) && (args.hasOwnProperty('destructiveSetup')) && args.destructiveSetup === true);

    return(new Promise(function(resolve, reject){
        let openRequest = self.indexedDB.open(self.dbName, self.dbVersion);
        if (self.debug){ console.log(`(${self._className} v.${self._version}): inside open()`); }

        // setup
        openRequest.onupgradeneeded = function(evt){
            if (self.debug){ console.log(`(${self._className} v.${self._version}): inside onupgradeneeded`); }
            let db = evt.target.result;

            /*
                setupCallback
                if a function ref is set on this arg, we are going to send that function a copy of self.
            */
            if ((args instanceof Object) && (args.hasOwnProperty('setupCallback')) && (args.setupCallback instanceof Function)){
                if (self.debug){ console.log(`(${self._className} v.${self._version}| open()): invoking setupCallback() ...`); }
                args.setupCallback(self);
            }

            // 1. remove existing stores not in storeDefinitions if destructive is set
            Array.from(db.objectStoreNames).forEach(function(existingStoreName){
                if (writeProtectDisable && (! self.storeDefinitions.hasOwnProperty(existingStoreName))){
                    db.deleteObjectStore(existingStoreName);
                    if (self.debug){ console.log(`(${self._className} v.${self._version}| open()): deleted store: ${existingStoreName}`); }
                }
            });

            // 2. dump storeDefinitions in
            if (self.debug){ console.log(`(${self._className} v.${self._version}| open()): writing store definitions`); }
            Object.keys(self.storeDefinitions).forEach(function(storeName){
                if (Array.from(db.objectStoreNames).indexOf(storeName) >= 0){

                    /*
                        store exists, sync up the indexes to whatever is in storeDefinitions
                    */
                    if (self.debug){ console.log(`(${self._className} v.${self._version}| open()): objectStore ${storeName} exists ...`); }
                    if (self.storeDefinitions[storeName].hasOwnProperty('indexes')){

                        // drop all of the existing indices
                        if (writeProtectDisable){
                            Array.from(openRequest.transaction.objectStore(storeName).indexNames).forEach(function(existingIndexName){
                                try {
                                    openRequest.transaction.objectStore(storeName).deleteIndex(existingIndexName);
                                    if (self.debug){ console.log(`(${self._className} v.${self._version}| open()): deleted index: ${existingIndexName} on objectStore ${storeName}`); }
                                }catch(e){
                                    reject(`failed to drop index: ${existingIndexName} on dataStore: ${storeName} / ${e}`);
                                }
                            });
                        }

                        // add any new ones
                        Object.keys(self.storeDefinitions[storeName].indexes).forEach(function(indexName){
                            let shawwty = self.storeDefinitions[storeName].indexes[indexName];

                            // if we're not in destructiveSetup, we need to drop the index here too (because it might've changed)
                            if ((! writeProtectDisable) && (Array.from(openRequest.transaction.objectStore(storeName).indexNames).indexOf(indexName) >= 0)){
                                openRequest.transaction.objectStore(storeName).deleteIndex(indexName);
                            }

                            // make it
                            try {
                                openRequest.transaction.objectStore(storeName).createIndex(
                                    indexName,
                                    shawwty.keyPath, {
                                        unique:     (shawwty.hasOwnProperty('unique'))?(shawwty.unique === true):false,
                                        multiEntry: (shawwty.hasOwnProperty('multiEntry'))?shawwty.multiEntry:null,
                                        locale:     (shawwty.hasOwnProperty('locale'))?shawwty.locale:null
                                    }
                                );
                                if (self.debug){ console.log(`(${self._className} v.${self._version}| open()): created index: ${indexName} on objectStore ${storeName}`); }
                            }catch(e){
                                reject(`failed to create index: ${indexName} on objectStore: ${storeName} / ${e}`);
                            }
                        });
                    }
                }else{
                    /*
                        store does not exist, create it, then make the indexes if any
                    */
                    let tmpObjectStore;
                    try {
                        tmpObjectStore = db.createObjectStore(storeName, self.storeDefinitions[storeName].createOptions);
                        if (self.debug){ console.log(`(${self._className} v.${self._version}| open()): created objectStore ${storeName}`); }
                    }catch(e){
                        reject(`failed to create objectStore: ${storeName} / ${e}`);
                    }
                    if (self.storeDefinitions[storeName].hasOwnProperty('indexes')){

                        // add 'em
                        Object.keys(self.storeDefinitions[storeName].indexes).forEach(function(indexName){
                            let shawwty = self.storeDefinitions[storeName].indexes[indexName];

                            // make it
                            try {
                                tmpObjectStore.createIndex(
                                    indexName,
                                    shawwty.keyPath, {
                                        unique:     (shawwty.hasOwnProperty('unique'))?(shawwty.unique === true):false,
                                        multiEntry: (shawwty.hasOwnProperty('multiEntry'))?shawwty.multiEntry:null,
                                        locale:     (shawwty.hasOwnProperty('locale'))?shawwty.locale:null
                                    }
                                );
                                if (self.debug){ console.log(`(${self._className} v.${self._version}| open()): created index: ${indexName} on objectStore ${storeName}`); }
                            }catch(e){
                                reject(`failed to create index: ${indexName} on objectStore; ${storeName}`);
                            }
                        });
                    }
                }
            });

        } // end onupgradeneeded


        // success
        openRequest.onsuccess = function(e){
            self.db = e.target.result;
            resolve(self);
        }

        // errpr
        openRequest.onerror = function(e){
            reject(e);
        }

    }));
} // end open




/*
    getDescription(storeName)
    return an object describing the specified storeName:
    {
        name:           <name>
        keyPath:        <keyPath>
        autoIncrement:  <autoIncrement>
        count:          <numberOfRecords>
        indices:        <arrayOfIndexNames>
    }
    if no storeName is given, returns an array of the above
    for all stores in the DB
*/
getDescription(storeName){
    let self = this;

    // helper function, gets count for one table and returns a promise
    function getCount(name){
        return(new Promise(function(res, rej){
            let req = self.db.transaction(name, "readonly").objectStore(name).count();
            req.onsuccess = function(e){ res(e.target.result); }
            req.onerror = function(e){ rej(`failed to get count: ${e}`); }
        }));
    }

    // go get 'em
    return(new Promise(function(resolve, reject){

        function getInfo(name){
            let tmp = {};
            try {
                let objectStore = self.db.transaction(name, "readonly").objectStore(name);
                tmp.indices       = Array.from(objectStore.indexNames);
                tmp.keyPath       = objectStore.keyPath;
                tmp.autoIncrement = objectStore.autoIncrement;
                tmp.name          = objectStore.name;
            }catch(e){
                reject(`failed to fetch description for objectStore: ${name} / ${e}`);
            }
            return(tmp);
        }

        if (self.isNotNull(storeName)){
            let tmp = getInfo(storeName);
            getCount(storeName).then(function(cnt){
                tmp.count = cnt;
                resolve([tmp]);
            });
        }else{
            let tmp = [];
            try {
                Array.from(self.db.objectStoreNames).forEach(function(sn){ tmp.push(getInfo(sn)); });
            }catch(e){
                reject(`failed to get objectStore list from DB ${e}`)
            }
            let pk = [];
            tmp.forEach(function(store){
                pk.push(getCount(store.name).then(function(count){ store.count = count; }));
            });
            Promise.all(pk).then(function(){ resolve(tmp); });
        }
    }));
}




/*
    12/6/19 @ 1705 design decision
    the complicated part of indexedDB is the setup, and how you define your indexes, etc.
    the rest is cake made complicated by asynchrony. As such, I'm just gonna mirror the
    dataStore native operations wrapped in promises, and using named parameters (single
    object args).

    here they are:

        https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore

        * add()             for inserts. throws an error on key colissions
        + get()             return record(s) from a table
        + put()             blast it in
        + clear()           truncate table
        + count()           returns unsigned integer
        - getKey()          [I don't understand what this does]
        * getAll()          get() with no key and an optional query -- by default gets
        - openCursor()      execute a callback on all matching rows or all rows
        - openKeyCursor()   execute a callback on all matching keys or all keys

*/


/*
    add({
        storeName:  <storeName>,
        object:     <someObject>,
        key:        <someKey>
    })
    inserts an object into the dataStore specified by storeName
    throws errors on key collisions
    this is a passthrough with a promise wrapper
    https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/add
*/
add (args){
    let self = this;

    return(new Promise(function(toot, boot){
        /*
            input validation goes here
        */
        if (! (args instanceof Object)){ boot(`args is not an Object`); }
        if (! (args.hasOwnProperty('object') && (args.object instanceof Object) ) ){ boot(`args.object is not an Object`); }
        if (! (args.hasOwnProperty('storeName') && (self.isNotNull(args.storeName)))){ boot(`a value for storeName is required`); }

        let trans = self.db.transaction(args.storeName, "readwrite");
        trans.oncomplete = function(evt){ toot(evt.target.result); }
        trans.onerror    = function(e){ boot(e); }

        // back to ridiculousness then ...
        if (args.hasOwnProperty('key')){
            trans.objectStore(args.storeName).add(args.object, args.key).onerror = function(e){ boot(e); };
        }else{
            trans.objectStore(args.storeName).add(args.object).onerror = function(e){ boot(e); };
        }
    }));
}


/*
    put({
        storeName:  <storeName>,
        object:     <someObject>,
        key:        <someKey>
    })
    creates an object in the dataStore specified by storeName
    key collisions are ignored
    https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/put
*/
put (args){
    let self = this;

    return(new Promise(function(toot, boot){
        /*
            input validation goes here
        */
        if (! (args instanceof Object)){ boot(`args is not an Object`); }
        if (! (args.hasOwnProperty('object') && (args.object instanceof Object) ) ){ boot(`args.object is not an Object`); }
        if (! (args.hasOwnProperty('storeName') && (self.isNotNull(args.storeName)))){ boot(`a value for storeName is required`); }

        let trans = self.db.transaction(args.storeName, "readwrite");
        trans.oncomplete = function(evt){ transactionRunning = false; toot(evt.target.result); }
        trans.onerror    = function(e){ transactionRunning = false; boot(e); }
        trans.onabort    = function(e){ transactionRunning = false; boot(e); }

        let transactionStart = self.epochTimestamp(true);
        let transactionRunning = true;

        // implement timeout watcher
        let timeout = 1000 * 30; // should be 30 seconds
        let timer = setTimeout(function(){
            if (transactionRunning){
                /*
                7/30/20 @ 1224
                as soon as I laid this trap it stopped happening, and it only happens on ios
                ideally, if I actually CAN trap this shit, then I guess, I dunno. try again?
                tell the user to just reload? dump the entire db and rebuild it again?
                really I don't know. FRUSTRATING
                */
                console.log(`${self._className} v${self._version} | put(${args.storeName}) | caught put timeout (30s)`);
            }
        }, timeout)

        if (args.hasOwnProperty('key')){
            let req = trans.objectStore(args.storeName).put(args.object, args.key).onerror = function(e){  boot(e); };
            req.onsuccess = function(e){ transactionRunning = false; toot(e.target.result); }
        }else{
            let req = trans.objectStore(args.storeName).put(args.object).onerror = function(e){ boot(e); };
            req.onsuccess = function(e){ transactionRunning = false; toot(e.target.result); }
        }


    }));
}




/*
    bulkPut({
        storeName:  <storeName>
        objects:    [<array>, <of>, <objects>]
    })

    do a bunch of them at once inside the same transaction and don't bother
    listening for the success message except on the last one
    stackoverflow says this is faster. worth a shot I guess ...

    objects must define an attribute matching the keyPath of storeName, obviously
*/
bulkPut (args){
    let self = this;

    return(new Promise(function(toot, boot){
        /*
            input validation goes here
        */
        if (! (args instanceof Object)){ boot(`args is not an Object`); }
        if (! (args.hasOwnProperty('objects') && (args.objects instanceof Array) ) ){ boot(`args.objects is not an Array`); }
        if (! (args.hasOwnProperty('storeName') && (self.isNotNull(args.storeName)))){ boot(`a value for storeName is required`); }

        let trans = self.db.transaction(args.storeName, "readwrite");
        trans.oncomplete = function(evt){ toot(evt.target.result); }
        trans.onerror    = function(e){ boot(e); }
        trans.onabort    = function(e){ boot(e); }

        // shotgun 'em in and only listen for success on the last one
        for (let rownum = 0; rownum < args.objects.length; rownum++){
            let req = trans.objectStore(args.storeName).put(args.objects[rownum]).onerror = function(e){
                boot({
                    message:        `bulkPut error on row ${rownum + 1} of ${args.objects.length}: ${e}`,
                    indexedDBError: e
                });
            };
            if (rownum == (args.objects.length - 1)){
                req.onsuccess = function(e){ toot(e.target.result); }
            }
        }
    }));
}




/*
    get({
        storeName:  <storeName>,
        indexName:  <optional>,
        key:        <someKey>
    })

    gets a specific record from a dataStore. if an index is specified, use that,
    otherwise presume 'key' is the dataStore's keyPath

    https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/get
    https://developer.mozilla.org/en-US/docs/Web/API/IDBIndex/get

    NOTE: unlike most of the other stuff here, this throws a no-match error
*/
get (args){
    let self = this;

    return(new Promise(function(toot, boot){
        // input validation goes here
        if (! (args instanceof Object)){ boot(`args is not an Object`); }
        if (! (args.hasOwnProperty('storeName') && (self.isNotNull(args.storeName)))){ boot(`a value for storeName is required`); }
        if (! (args.hasOwnProperty('key') && (self.isNotNull(args.key)))){ boot(`a value for key is required`); }

        // open read transcation on the datastore
        let trans = self.db.transaction(args.storeName, "readonly");
        trans.onerror = function(e){ boot(e); }
        trans.onabort = function(e){ boot(e); }

        // query the index if we got one, or the datastore if we don't
        let req;
        if (args.hasOwnProperty('indexName')){
            if (! (trans.objectStore(args.storeName).indexNames.contains(args.indexName))){
                boot('indexName does not exist on specified storeName');
            }
            req = trans.objectStore(args.storeName).index(args.indexName).get(args.key);
        }else{
            req = trans.objectStore(args.storeName).get(args.key);
        }

        req.onerror = function(e){ boot(e); };
        req.onabort = function(e){ boot(e); };
        req.onsuccess = function(e){

            if (self.isNotNull(e.target.result)){
                toot(e.target.result);
            }else{
                boot(new noiceException({
                    message:        'no match',
                    messageNumber:  404,
                    thrownBy:       `${self._className} (v${self._version})/get()`,
                    thrownByArgs:   args
                }));
            }
        }
    }));
}




/*
    getKey({
        storeName:  <storeName>,
        key:        <someKey>
    })
    I have no clear understanding of what this is but I can sure as shit wrap it in a promise for ya
    https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getKey
*/
getKey (args){
    let self = this;

    return(new Promise(function(toot, boot){
        /*
            input validation goes here
        */
        if (! (args instanceof Object)){ boot(`args is not an Object`); }
        if (! (args.hasOwnProperty('storeName') && (self.isNotNull(args.storeName)))){ boot(`a value for storeName is required`); }
        if (! (args.hasOwnProperty('key') && (self.isNotNull(args.key)))){ boot(`a value for key is required`); }

        let trans = self.db.transaction(args.storeName, "readonly");
        trans.onerror    = function(e){ boot(e); }

        // query the index if we got one, or the datastore if we don't
        let req;
        if (args.hasOwnProperty('indexName')){
            if (! (trans.objectStore(args.storeName).indexNames.contains(args.indexName))){
                boot('indexName does not exist on specified storeName');
            }
            req = trans.objectStore(args.storeName).index(args.indexName).getKey(args.key);
        }else{
            req = trans.objectStore(args.storeName).getKey(args.key);
        }
        req.onerror = function(e){ boot(e); }
        req.onsuccess = function(e){ toot(e.target.result); }
    }));
}




/*
    getAllKeys({
        storeName:  <storeName>,
        indexName:  <optional>,
        query:      <query>
        count:      <maxResults>
    });
    https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getAllKeys

    this returns all of the keys for the keyPath on the table matching the
    query, count and index options.

*/
getAllKeys (args){
    let self = this;

    return(new Promise(function(toot, boot){

        // input validation goes here
        if (! (args instanceof Object)){ boot(`args is not an Object`); }
        if (! (args.hasOwnProperty('storeName') && (self.isNotNull(args.storeName)))){ boot(`a value for storeName is required`); }

        // setup the transaction
        let trans = self.db.transaction(args.storeName, "readonly");
        trans.onerror = function(e){ boot(e); }
        trans.onabort = function(e){ boot(e); }

        // setup the request
        let req;
        if (args.hasOwnProperty('indexName')){
            if (! (trans.objectStore(args.storeName).indexNames.contains(args.indexName))){
                boot('indexName does not exist on specified storeName');
            }
            if (args.hasOwnProperty('count')){
                req = trans.objectStore(args.storeName).index(args.indexName).getAllKeys(args.query, args.count);
            }else{
                req = trans.objectStore(args.storeName).index(args.indexName).getAllKeys(args.query);
            }
        }else{
            if (args.hasOwnProperty('query')){
                if (args.hasOwnProperty('count')){
                    req = trans.objectStore(args.storeName).getAllKeys(args.query, args.count);
                }else{
                    req = trans.objectStore(args.storeName).getAllKeys(args.query);
                }
            }else{
                req = trans.objectStore(args.storeName).getAllKeys();
            }
        }
        req.onerror = function(e){ boot(e); }
        req.onabort = function(e){ boot(e); }
        req.onsuccess = function(e){ toot(e.target.result); }

    }));
}




/*
    getAll({
        storeName:  <storeName>,
        indexName:  <optional>,
        query:      <query>
        count:      <maxResults>
    })
    This appears to be get() with no key and an optional query
    in other words ... query ...
    https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getAll

    12/10/19 @ 2049 NOTE THIS ESPECIALLY FROM THE DOCUMENTATION:
        From version 44: this feature is behind the
        dom.indexedDB.experimental preference. To change
        preferences in Firefox, visit about:config.

    I mean it's not exactly a loss of functionality I suppose. You can just as easily
    abstract this to open a cursor ...
*/
getAll (args){
    let self = this;

    return(new Promise(function(toot, boot){

        // input validation goes here
        if (! (args instanceof Object)){ boot(`args is not an Object`); }
        if (! (args.hasOwnProperty('storeName') && (self.isNotNull(args.storeName)))){ boot(`a value for storeName is required`); }

        // setup the transaction
        let trans = self.db.transaction(args.storeName, "readonly");
        trans.onerror = function(e){ boot(e); }
        trans.onabort = function(e){ boot(e); }

        // setup the request
        let req;
        if (args.hasOwnProperty('indexName')){
            if (! (trans.objectStore(args.storeName).indexNames.contains(args.indexName))){
                boot('indexName does not exist on specified storeName');
            }
            if (args.hasOwnProperty('count')){
                req = trans.objectStore(args.storeName).index(args.indexName).getAll(args.query, args.count);
            }else{
                req = trans.objectStore(args.storeName).index(args.indexName).getAll(args.query);
            }
        }else{
            if (args.hasOwnProperty('query')){
                if (args.hasOwnProperty('count')){
                    req = trans.objectStore(args.storeName).getAll(args.query, args.count);
                }else{
                    req = trans.objectStore(args.storeName).getAll(args.query);
                }
            }else{
                req = trans.objectStore(args.storeName).getAll();
            }
        }
        req.onerror = function(e){ boot(e); }
        req.onabort = function(e){ boot(e); }
        req.onsuccess = function(e){ toot(e.target.result); }

    }));
}


/*
    clear({
        storeName:  <storeName>
    })
    deletes all objects in the dataStore specified by storeName
    https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/clear
*/
clear (args){
    let self = this;

    return(new Promise(function(toot, boot){
        /*
            input validation goes here
        */
        if (! (args instanceof Object)){ boot(`args is not an Object`); }
        if (! (args.hasOwnProperty('storeName') && (self.isNotNull(args.storeName)))){ boot(`a value for storeName is required`); }

        let trans = self.db.transaction(args.storeName, "readwrite");
        let req = trans.objectStore(args.storeName).clear();
        req.onerror = function(e){ boot(e); };
        req.onsuccess = function(e){ toot(true); }
    }));
}


/*
    count({
        storeName:  <storeName>
        query:      <query>
    })
    counts all objects in the dataStore specified by storeName
    https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/count
*/
count (args){
    let self = this;

    return(new Promise(function(toot, boot){
        /*
            input validation goes here
        */
        if (! (args instanceof Object)){ boot(`args is not an Object`); }
        if (! (args.hasOwnProperty('storeName') && (self.isNotNull(args.storeName)))){ boot(`a value for storeName is required`); }

        let trans = self.db.transaction(args.storeName, "readonly");
        trans.onerror = function(e){ boot(e); }


        // setup the request
        let req;
        if (args.hasOwnProperty('indexName')){
            if (! (trans.objectStore(args.storeName).indexNames.contains(args.indexName))){
                boot('indexName does not exist on specified storeName');
            }else{
                if (args.hasOwnProperty('query')){
                    req = trans.objectStore(args.storeName).index(args.indexName).count(args.query);
                }else{
                    req = trans.objectStore(args.storeName).index(args.indexName).count();
                }
            }
        }else{
            if (args.hasOwnProperty('query')){
                req = trans.objectStore(args.storeName).count(args.query);
            }else{
                req = trans.objectStore(args.storeName).count();
            }
        }
        req.onerror = function(e){ boot(e); }
        req.onabort = function(e){ boot(e); }
        req.onsuccess = function(e){ toot(e.target.result); }
    } ));
}


/*
    openCursor({
        storeName:  <storeName>
        query:      <query, optional. null returns all rows in dataStore>,
        direction:  <next|nextunique|prev|prevunique> default:next
        callback:   <external function>
    })

    ok, here's what a "cursor" is
    it is a loop, that executes within the DB engine itself, and for which
    on each itteration of the loop, will execute the 'onsuccess' function of
    the request resulting from creation of the cursor.

    so it lets you have access to all the matching objects in a squence
    (defined by the direction arg) -- best part is you don't have to get
    data on promises for each row, etc.

    you create a cursor on a dataStore. If you create the cursor with a query
    which matches one or more rows, those rows will be iterated over as
    described above. If you create the cursor without the query, the resulting
    cursor iterates all objects in the dataStore.

    neat:
        https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/openCursor

    so obviously the main thing we're doing here is accepting object args with
    named parameters and returning a promise.

    args.callback(<cursorObject>)
    this is what gets executed on each matching row. we'll send it the IDBCursor object
    This is the object you're getting.
        https://developer.mozilla.org/en-US/docs/Web/API/IDBCursor
    there's a lot it can do. cursor.value has the iterated object

    NOTE: the iteration doesn't happen on it's own.
    your callback has to call cursor.advance() or cursor.continue()
    note also that if you want to delete or write to the iterated object
    you need to call a separate request against cursor.update() or cursor.delete()
    and yassss ma-ma ... that asyc request shit.

    this function returns when transaction completes, which is analagous
    to all of the callbacks returning
*/
openCursor(args){
    let self = this;

    return(new Promise(function(toot, boot){

        // input validation
        if (! (args instanceof Object)){ boot(`args is not an Object`); }
        if (! (args.hasOwnProperty('storeName') && (self.isNotNull(args.storeName)))){
            boot(`a value for storeName is required`);
        }
        if (! (args.hasOwnProperty('callback') && (args.callback instanceof Function))){
            boot(`a function is required on 'callback'`);
        }
        let trans = self.db.transaction(args.storeName, "readwrite");
        trans.onerror = function(e){ boot(e); }
        trans.oncomplete = function(e){ toot(e); }
        trans.onabort = function(e){ boot(e); }

        let req;

        // new hotness
        if (args.hasOwnProperty('indexName')){
            if (! (trans.objectStore(args.storeName).indexNames.contains(args.indexName))){
                boot('indexName does not exist on specified storeName');
            }
            if (args.hasOwnProperty('query')){
                if (args.hasOwnProperty('direction')){
                    req = trans.objectStore(args.storeName).index(args.indexName).openCursor(args.query,args.direction);
                }else{
                    req = trans.objectStore(args.storeName).index(args.indexName).openCursor(args.query);
                }
            }else{
                req = trans.objectStore(args.storeName).index(args.indexName).openCursor();
            }
        }else{
            if (args.hasOwnProperty('query')){
                if (args.hasOwnProperty('direction')){
                    req = trans.objectStore(args.storeName).openCursor(args.query,args.direction);
                }else{
                    req = trans.objectStore(args.storeName).openCursor(args.query);
                }
            }else{
                req = trans.objectStore(args.storeName).openCursor();
            }
        }
        req.onerror = function(e){ boot(e); }
        req.onabort = function(e){ boot(e); }
        req.onsuccess = function(e){ args.callback(e.target.result); }
    }));
}



/*
    openKeyCursor{
        storeName:  <storeName>
        query:      <query, optional. null returns all rows in dataStore>,
        direction:  <next|nextunique|prev|prevunique> default:next
        callback:   <external function that better return a promise>
    })
    this is literally the exact same thing as openCursor, with one tiny
    exception. The callback gets a IDBCursor object where cursor.value is
    undefined. However we still get cursor.key, which of course is the key
    value corresponding to the iterated object.

    My guess is this is the most efficient way to write customized search
    routines that only operate on the key
    https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/openKeyCursor
*/
openKeyCursor(args){
    let self = this;

    return(new Promise(function(toot, boot){

        // input validation
        if (! (args instanceof Object)){ boot(`args is not an Object`); }
        if (! (args.hasOwnProperty('storeName') && (self.isNotNull(args.storeName)))){
            boot(`a value for storeName is required`);
        }
        if (! (args.hasOwnProperty('callback') && (args.callback instanceof Function))){
            boot(`a function is required on 'callback'`);
        }
        let trans = self.db.transaction(args.storeName, "readwrite");
        trans.onerror = function(e){ boot(e); }
        trans.onabort = function(e){ boot(e); }
        trans.oncomplete = function(e){ toot(e); }

        let req;
        if (args.hasOwnProperty('query')){
            if(args.hasOwnProperty('direction')){
                req = trans.objectStore(args.storeName).openKeyCursor(args.query, args.direction);
            }else{
                req = trans.objectStore(args.storeName).openKeyCursor(args.query);
            }
        }else{
            req = trans.objectStore(args.storeName).openKeyCursor();
        }

        // this is the callback
        req.onerror = function(e){ boot(e); }
        req.onsuccess = function(e){ args.callback(e.target.result); }
    }));
}




/*
    deleteObject({
        storeName:  <storeName>,
        key:        <keyOfObjectToDelete>
    })
    deletes the object identified by key in storeName
    https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/delete
*/
deleteObject(args){
    let self = this;
    return(new Promise(function(toot, boot){
        if (! (args instanceof Object)){ boot(`args is not an Object`); }
        if (! (args.hasOwnProperty('storeName') && (self.isNotNull(args.storeName)))){ boot(`a value for storeName is required`); }
        if (! (args.hasOwnProperty('key') && (self.isNotNull(args.key)))){ boot(`a value for key is required`); }

        let trans = self.db.transaction(args.storeName, "readwrite");
        trans.onerror = function(e){ boot(e); }
        let req = trans.objectStore(args.storeName).delete(args.key);
        req.onerror = function(e){ boot(e); }
        req.onsuccess = function(){ toot(true); }
    }));
}




/*
    mergeObjects({
        storeName:  <storeName>
        objects:    objects:    [<object>, ...]
        merge:      update (default) | overwrite | skip | <Function reference>
    })

    if merge is a function, it's called with three arguments and needs to return a promise:
        let mergedObject = await args.merge(self, new, old); ...

    this returns a promise which resolves to an array, corresponding to the merge result
    for each item in args.objects
        [{
          key:            <key>,
          disposition:    created | updated | overwritten | skipped | error
          errorObject:    <errorObject> (if disposition = 'error')
        }, ...]

    row-level errors don't throw, but are included in the output so they still get tooted
    function-level errors get booted

    this allows you to send one or more objects to the same dataStore, and execute logic
    upon ket collisions
*/

mergeObjects(args){
    let self = this;
    let output = [];

    return (new Promise(function(toot, boot){

        /*
            input validation
        */
        if (! (
            args.hasOwnProperty('storeName') &&
            self.isNotNull(args.storeName) &&
            self.storeDefinitions.hasOwnProperty(args.storeName)
        )){
            boot( new noiceException({
                message:        'args.storeName does not contain a valid value',
                messageNumber:  100,
                thrownBy:        `${self._className} (v${self._version})/mergeObjects`
            }));
        }

        // bounce if the merge mode is unknown
        if (!(args.hasOwnProperty('merge') && ((['update', 'overwrite', 'skip'].indexof(args.merge) >= 0) || (args.merge instanceof Function)))){
            boot( new noiceException({
                message:        'args.merge does not contain a valid mode or callback reference',
                messageNumber:  101,
                thrownBy:        `${self._className} (v${self._version})/mergeObjects`
            }));
        }

        // bounce if we didn't get at least one object
        if (! (args.hasOwnProperty('objects') && (args.objects instanceof Array))){
            boot( new noiceException({
                message:        'args.objects is not an array of objects',
                messageNumber:  102,
                thrownBy:        `${self._className} (v${self._version})/mergeObjects`
            }));
        }

        /*
            merge 'em ...
        */
        let pk = [];
        let shawty = self.storeDefinitions[args.storeName];
        args.objects.forEach(function(row, idx){
            /*
                no merge: when the object doesn't define primaryKey and autoIncrement is set
            */
            if (! row.hasOwnProperty(shawty.createOptions.keyPath)){
                if ((shawty.createOptions.hasOwnProperty('autoIncrement') && shawty.createOptions.autoIncrement === true)){
                    // blindly db.add()
                    pk.push(self.db.add({storeName: args.storeName, object: row}).catch(function(e){
                        output.push({
                            key:            null,
                            disposition:    'error',
                            errorObject:    new noiceException({
                                message:        `error on put() for record with no key and autoIncrement enabled: ${e.target.error}`,
                                messageNumber:  107,
                                objectAtIndex:  idx,
                                thrownBy:       `${self._className} (v${self._version})/mergeObjects`,
                                nestedError:    e
                            })
                        });
                    }).then(function(newKey){
                        output.push({
                            key:            newKey,
                            disposition:    'create',
                            objectAtIndex:  idx
                        });
                    }));
                }else{
                    // push skip to output
                    output.push({
                        key:            null,
                        disposition:    'skip',
                        detail:         'object does not define primary key and autoIncrement is not set on specified dataStore',
                        objectAtIndex:  idx
                    });
                }

            /*
                merge 'em
            */
            }else{
                let primaryKey = shawty.createOptions.keyPath;
                self.db.get({
                    dataStore:      storeName,
                    key:            row[primaryKey]
                }).catch(function(e){
                    if ((e instanceof noiceException) && (e.messageNumber == 404)){
                        // nothing to merge, it's not there already
                        pk.push(self.db.add({storeName: args.storeName, object: row}).catch(function(e){
                            output.push({
                                key:            row[primaryKey],
                                disposition:    'error',
                                errorObject:    new noiceException({
                                    message:        `error executing add (create): ${e} [key]: ${row[primaryKey]} [dataStore]: ${args.storeName}`,
                                    messageNumber:  108,
                                    objectAtIndex:  idx,
                                    thrownBy:       `${self._className} (v${self._version})/mergeObjects`,
                                    nestedError:    e
                                })
                            });
                        }).then(function(key){
                            output.push({
                                key:            key,
                                disposition:    'create',
                                objectAtIndex:  idx
                            });
                        }));
                    }else{
                        // legit error, push it onto the output as such
                        output.push({
                            key:                row[primaryKey],
                            disposition:        'error',
                            errorObject:    new noiceException({
                                message:        `error retieving existing copy of object from db: ${e.target.error} [key]: ${row[primaryKey]} [dataStore]: ${args.storeName}`,
                                messageNumber:  109,
                                objectAtIndex:  idx,
                                thrownBy:       `${self._className} (v${self._version})/mergeObjects`,
                                nestedError:    e
                            })
                        });
                    }
                }).then(function(old){
                    /*
                        execute merge
                    */
                    if (! args.hasOwnProperty(merge)){ args.merge = "update"; }
                    switch(args.merge) {
                        case   'update':
                            Object.keys(row).forEach(function(fieldName){ old[fieldName] = row[fieldName]; })
                            pk.push(self.db.put({storeName: args.storeName, object: old}).catch(function(e){
                                output.push({
                                    key:            old[primaryKey],
                                    disposition:    'error',
                                    errorObject:    new noiceException({
                                        message:        `error executing put (update): ${e} [key]: ${old[primaryKey]} [dataStore]: ${args.storeName}`,
                                        messageNumber:  103,
                                        objectAtIndex:  idx,
                                        thrownBy:       `${self._className} (v${self._version})/mergeObjects`,
                                        nestedError:    e
                                    })
                                });
                            }).then(function(key){
                                output.push({
                                    key:            old[primaryKey],
                                    disposition:    'update',
                                    objectAtIndex:  idx
                                })
                            }));
                            break;
                        case   'overwrite':
                            pk.push(self.db.put({storeName: args.storeName, object: row}).catch(function(e){
                                output.push({
                                    key:            old[primaryKey],
                                    disposition:    'error',
                                    errorObject:    new noiceException({
                                        message:        `error executing put (overwrite): ${e} [key]: ${row[primaryKey]} [dataStore]: ${args.storeName}`,
                                        messageNumber:  104,
                                        objectAtIndex:  idx,
                                        thrownBy:       `${self._className} (v${self._version})/mergeObjects`,
                                        nestedError:    e
                                    })
                                });
                            }).then(function(key){
                                output.push({
                                    key:            row[primaryKey],
                                    disposition:    'overwrite',
                                    objectAtIndex:  idx
                                });
                            }));
                            break;
                        case   'skip':
                            output.push({
                                key:            row[primaryKey],
                                disposition:    'skip',
                                detail:         'skip merge mode enabled and object is pre-existing in dataStore',
                                objectAtIndex:  idx
                            });
                            break;
                        default:
                            // use the external merge function to flatten it ...
                            args.merge(self, old, row).catch(function(e){
                                output.push({
                                    key:            row[primaryKey],
                                    disposition:    'error',
                                    errorObject:    new noiceException({
                                        message:        `error executing merge callback: ${e}`,
                                        messageNumber:  105,
                                        objectAtIndex:  idx,
                                        thrownBy:       `${self._className} (v${self._version})/mergeObjects`,
                                        nestedError:    e
                                    })
                                });
                            }).then(function(merged){
                                pk.push(self.db.put({storeName: args.storeName, object: merged}).catch(function(e){
                                    output.push({
                                        key:            merged[primaryKey],
                                        disposition:    'error',
                                        errorObject:    new noiceException({
                                            message:        `error executing put (merge callback): ${e} [key]: ${merged[primaryKey]} [dataStore]: ${args.storeName}`,
                                            messageNumber:  106,
                                            objectAtIndex:  idx,
                                            thrownBy:       `${self._className} (v${self._version})/mergeObjects`,
                                            nestedError:    e
                                        })
                                    });
                                }).then(function(key){
                                    output.push({
                                        key:            merged[primaryKey],
                                        disposition:    'update',
                                        objectAtIndex:  idx
                                    });
                                }));
                            });
                        } // end switch on merge method
                });
            }
        });
        Promise.all(pk).then(function(){ toot(output); });
    }));
} // end mergeObjects()




/*
    getMatching({
        storeName: <str>,
        match: {indexedField1: <val>, indexedField1: <val>, ...}
    })

    returns all rows on the specified 'dataStore' exactly matching the 'match' object
    each attribute on the 'match' object must correspond to an indexed columnName on
    'dataStore'. If more than one attribute is specified, we will search for an index
    containing *all* of the object attributes. If we do not find a matching index,
    we resolve an error. This only searches exact indexes.

    some tight improvements here would be:

        * finds the index with the maximum number of matching fields, queries by it
          then filters the result set to exclude non-matching rows

        * implement other match modes than IDBKeyRange.only()
          https://developer.mozilla.org/en-US/docs/Web/API/IDBKeyRange

        * actually some sql-esque optimization.
          like -- figure out exact index matches, then pull out "OR's" and
          other of those sorts of matches into an openCursor on the GCD index.

*/
getMatching(args){
    const that = this;
    return(new Promise((toot, boot) => {
        if (
            (args instanceof Object) &&
            args.hasOwnProperty('storeName') &&
            that.isNotNull(args.storeName) &&
            (that.storeDefinitions instanceof Object) &&
            (that.storeDefinitions[args.storeName] instanceof Object) &&
            (that.storeDefinitions[args.storeName].indexes instanceof Object) &&
            (Object.keys(that.storeDefinitions[args.storeName].indexes).length > 0) &&
            (args.match instanceof Object) &&
            (Object.keys(args.match).length > 0)
        ){

            // find matching index
            const indexes = that.storeDefinitions[args.storeName].indexes;
            const queryIndex = Object.keys(indexes).filter((indexName) => {return(

                // ooh chile ...
                ((Object.keys(args.match).length == 1) && (! (indexes[indexName].keyPath instanceof Array)) && (indexes[indexName].keyPath == Object.keys(args.match)[0])) || (
                    (Object.keys(args.match).length > 1) &&
                    (indexes[indexName].keyPath instanceof Array) &&
                    (Object.keys(args.match).length == indexes[indexName].keyPath.length) &&
                    (indexes[indexName].keyPath.filter((fieldName) => {return(args.match.hasOwnProperty(fieldName))}).length == indexes[indexName].keyPath.length)
                )
            )});
            if ((queryIndex instanceof Array) && (queryIndex.length > 0)){
                toot(
                    that.getAll({
                        storeName: args.storeName,
                        indexName: queryIndex[0],
                        query: IDBKeyRange.only(
                            (indexes[queryIndex[0]].keyPath instanceof Array)?indexes[queryIndex[0]].keyPath.map((a)=>{return(args.match[a])}):args.match[queryIndex[0]]
                        )
                    })
                );
            }else{
                boot(`${that._className} v${that._version} | getMatching() | invalid input (no matching index)`);
            }
        }else{
            boot(`${that._className} v${that._version} | getMatching() | invalid input`);
        }
    }));
}



} // end noiceIndexedDB
export { noiceIndexedDB };
