/*
    noiceApplicationCore.js
    classes for creating PWA applications
    requires: noiceCore.js
*/

import { noiceObjectCore, noiceCoreChildClass, noiceException, noiceCoreUtility, noiceCoreNetworkUtility } from './noiceCore.js';

/*
    noiceLogMessage
    attributes:
        * message
          either a string or an object that supports toString()

        * time
          high resolution epoch

        * fatal
          bool
      functions:
        * toString()
*/
class noiceLogMessage extends noiceCoreChildClass {

// minimal constructor
constructor(args, defaults, callback){
    let _classDefaults = noiceObjectCore.mergeClassDefaults({
        _version:           2.1,
        _className:         'noiceLogMessage',
        message:            'null message',
        fatal:              false
    }, defaults);

    // this one will just take a string as the only arg if that's how you call it ...
    let useArgs = ((args instanceof Object)?args:{});
    if (! (args instanceof Object)){ useArgs.message = args; }

    // set it up
    super(useArgs, _classDefaults, callback);

    // tag it with a timestamp if it doesn't have one
    if (! this.hasOwnProperty('time')){ this.time = this.epochTimestamp(true); }
}


/*
    toString()
*/
toString(){
    let message = this.message;
    if (typeof(this.message) === 'object'){ message = this.message.toString(); }
    return(`[${this.time}${(this.fatal)?' fatal':''}] ${this.message}`);
}


} // end noiceLogMessage




/*
    noiceLog
    this defines a basic log message queue with these properties:

        * maxLength     <int> default: 0
          keep no more than this many entries in the log. delete the oldest
          log entry when the log has reached this length. 0 = unlimited length.

        * autoFlush     <bool> default: false
          if true, asynchronously send the json serialized log to the flushCallback
          each time an entry is added to the log

        * flushCallback <function(logJSON)>
          this function is called asynchronously with the entire log serialized to
          JSON when the flush() method is called (or when autoFlush is enabled)

        * messageQueue []
          the array containing the log entries

    noiceLog objects have these functions:

        * log(message, fatal, flushImmediate)
          this creates a new log entry.

                * message           <string | object (that supports toString())>
                  this is the thing to log. could be a string. could be an object
                  whatever it is, it should support the toString() method.

                * fatal             <bool> default: false
                  if fatal is set true, we will write the log, call flush() and throw a noiceException

                * flushImmediate    <bool> default: false
                  if true, add the message to the log, then call flush() immediately

        * flush()
          return a promise to call the specified flushCallback with a JSON serialization
          of the messageQueue
*/
class noiceLog extends noiceCoreChildClass {


// minimal constructor
constructor(args, defaults, callback){
    let _classDefaults = noiceObjectCore.mergeClassDefaults({
        _version:       2,
        _className:     'noiceLog',
        _maxLength:     0,
        autoFlush:      false,
        messageQueue:   []
    }, defaults);

    // set it up
    super(args, _classDefaults, callback);
}


/*
    pruneQueue()
    this truncates this.messageQueue to this.maxLength
*/
pruneQueue(){
    if ((this.maxLength > 0) && (this.messageQueue.length > this.maxLength)){
        this.messageQueue.splice(0, (this.messageQueue.length - this.maxLength));
    }
}


/*
    getter and setter for maxLength
    as changing it will necessarily resize the queue which
    could in turn trigger a flush
*/
get maxLength(){ return(this._maxLength); }
set maxLength(int){
    this._maxLength = int;
    this.pruneQueue();
    if (this.autoFlush){ this.flush(); }

}


/*
    flush()
*/
flush() {
    let self = this;
    return (new Promise(function(resolve, reject){
        if (self.hasOwnProperty('flushCallback') && (self.flushCallback instanceof Function)){
                let log;
                let abort = false;
            try {
                log = JSON.stringify(self.messageQueue);
            }catch(e){
                abort = true;
                reject(new noiceException({
                    message:        `failed to serialize log to JSON: ${e}`,
                    messageNumber:   16,
                    thrownBy:       'noiceLog/flush'
                }));
            }
            if (! abort){
                resolve(self.flushCallback(log));
            }
        }else{
            reject(new noiceException({
                message:        'flushCallback is not defined',
                messageNumber:   15,
                thrownBy:       'noiceLog/flush'
            }));
        }
    }));
}


/*
    log (message, fatal, flushImmediate)
*/
log(message, fatal, flushImmediate) {

    let _message = ((this.isNotNull(message))?message:'log called with no message');
    let _fatal = (fatal === true);
    let _flushImmediate = (flushImmediate === true);
    if (_fatal){ _flushImmediate = true; }

    this.messageQueue.push(new noiceLogMessage({
        time:       this.epochTimestamp(true),
        message:    message,
        fatal:      _fatal
    }));

    if (_flushImmediate){ this.flush(); }
    if (_fatal){
        throw(new noiceException({
            message:        `noiceLog received a fatal log message: ${_message}`,
            messageNumber:   17,
            thrownBy:       'noiceLog/log'
        }));
    }

    this.pruneQueue();
    if (this.autoFlush){ this.flush(); }

    // return the logMessage object we made, why not?
    return(this.messageQueue[(this.messageQueue.length -1)]);
}


} // end noiceLog




/*
    noiceApplicationCore
    objects of this type provide logging facilities and can store/restore themselves
    from localStorage.

    extensions of this class can create watched attributes which transparently invoke
    a store to localStorage when changed.

    attributes:
        * localStorageKey       <string> default: noiceApplicationCore
          stash instances of self under this key in localStorage

        * isCrashed             <bool>   default: false
          things can check this to see if the app is in a crashed state. setting this true
          will invoke a store() call, and the crashCallback (if specified)

        * crashCallback         <function>
          call this function when isCrashed is set true. this may, for instance, pop a modal
          dialog in the UI blocking further user interaction and displaying a message, etc.

        * logLimit              <int>    default: 0
          pass this through to the noiceLog constructor (max number of lines to keep in a logInstance)
          if set to 0, unlimited length

        * logInstanceLimit      <int>    default: 0
          keep this many old log instances

        * logToConsole          <bool>   default: true
          if true, echo log entries to console.log

        * name                  <string> default: noiceApplicationCore
          the name of the application

        * version               <int>    default: whatever version of noiceCore this is
          the version of the application

        * restoreOnInstantiate  <bool>   default: false
          if true we will immediately call restore() on object instantiation

        * threads               <obj>   default: {}
          a list of scripts to initiate in threads. Datastructure is { <threadName>: './script.js' }
          it's presumed that the threads will use the noiceWorkerThread infrastructure

    functions:
        * log(message, fatal, flushImmediate)
          passthrough to noiceLog instance

        * save()
          serialize the object to JSON and stash it in localStorage beneath localStorageKey

        * restore()
          opposite of save. load previous self from localStorageKey

        * writeAppData({key:value, ...})
          write the given key/value pairs to ._appData and call save();

        * getAppData(key)
          if key is not null, return the corresponding value from ._appData[key],
          else return all of ._appData

        * deleteAppKey(key)
          if the given key exists in ._appData, delete it then save(). if no key is given,
          dump all of ._appData and save().


*/
class noiceApplicationCore extends noiceCoreNetworkUtility {

// minimal constructor
constructor(args, defaults, callback){
    let _classDefaults = noiceObjectCore.mergeClassDefaults({
        _version:             2,
        _className:           'noiceApplicationCore',
        _isCrashed:           false,
        _logLimit:            0,
        _logInstanceLimit:    0,
        _threadHandles:       {},
        _threadWaits:         {},
        _broadcastChannels:   {},
        _appData:             {},       // <-- saved attributes
        logHistory:           {},       // <-- {time:<noiceLogInstance>}
        logToConsole:         true,
        restoreOnInstantiate: false,
        cantSave:             false,
        lastSave:             0,        // <-- time that the object was last saved
        threads:              {},
        threadSignalHandlers: {},
        debug:                false
    }, defaults);

    // set it up
    super(args, _classDefaults, callback);

    // set default name to _className
    if (! this.hasAttribute('name')){ this.name = this._className; }

    // set default version to _version
    if (! this.hasAttribute('version')){ this.version = this._version; }

    // set localStorageKey default value
    if (! this.hasAttribute('localStorageKey')){
        this.localStorageKey = `${this.name}-v${this.version}-${this.getGUID()}`
    }

    // set up noiceLog instance
    let that = this;
    this.startTime = this.epochTimestamp(true);
    this.logHistory[this.startTime] = new noiceLog({
        maxLength:      self.logLimit,
        flushCallback:  function(logJSON){ that.save(logJSON); },
        autoFlush:      false
    });

    if (this.restoreOnInstantiate){ this.restore(); }

    // handle threads if we've got 'em (but not serviceWorker, that's a special one)
    Object.keys(that.threads).forEach(function(threadName){
        if (threadName == 'serviceWorker'){ return(false); }
        try {
            that._threadHandles[threadName] = new Worker(that.threads[threadName], {type:"module"});
            that._threadHandles[threadName].onerror = function(evt){ that.handleThreadError({threadName: threadName, event: evt}); };
            that._threadHandles[threadName].onmessageerror = function(evt){ that.handleThreadError({threadName: threadName, event: evt}); };
            that._threadHandles[threadName].onmessage = function(evt){ that.handleThreadMessage({threadName: threadName, event: evt}); };
            try {
                that._broadcastChannels[threadName] = new BroadcastChannel(threadName);
                that._broadcastChannels[threadName].onmessage = function(evt){ that.handleThreadMessage({threadName: threadName, event: evt}); };
            }catch(e){
                that.log(`${threadName}: BroadcastChannel API is not supported on this client, disabling fallback thread messaging mechanism`);
            }
            that._threadWaits[threadName] = {};
        }catch(e){
            // die
            that.log(`failed to instantiate thread: ${threadName}: ${e}`, true);
        }
    });


    // setup the serviceWorker if we have one
    if ((that.threads.hasOwnProperty('serviceWorker')) && (that.enableServiceworker === true) && ('serviceWorker' in navigator)){
        navigator.serviceWorker.register(that.threads.serviceWorker).then(function(registration){
            that._serviceWorkerRegistration = registration;
            that._threadHandles.serviceWorker = navigator.serviceWorker;
            that._threadWaits.serviceWorker = {};
            that.log(`[service worker]: registration succeeded`);
        }).catch(function(error){
            // die
            that.log(`[service worker]: registration failed: ${error}`, true);
        });

        navigator.serviceWorker.addEventListener('message', function(evt){
            that.handleThreadMessage({threadName: 'serviceWorker', event: evt});
        });
        navigator.serviceWorker.onerror   = function(evt){ that.handleThreadError({threadName: 'serviceWorker', event: evt}); };
        try {
            that._broadcastChannels.serviceWorker = new BroadcastChannel('serviceWorker');
            that._broadcastChannels.serviceWorker.onmessage = function(evt){ that.handleThreadMessage({threadName: 'serviceWorker', event: evt}); };
        }catch(e){
            that.log('serviceWorker: BroadcastChannel API is not supported on this client, disabling fallback thread messaging mechanism');
        }
    }
}

/*
    appMode getter
    this bool will be true if we're in an instance of a PWA installed on the iOS desktop
    or windows desktop via chrome, and false if we aren't
*/
get appMode(){
    return(
        (('standalone' in window.navigator) && (window.navigator.standalone)) ||
        (window.matchMedia('(display-mode: standalone)').matches)
    );
}


// thread stuff

/*
    threadResponse({
        threadName:         <threadName>
        postMessage:        { type: <messageType>, data: <arbitrary}
        awaitResponseType:  <messageType>
        timeout:            <miliseconds>
        isServiceWorker:    <bool>
    })
*/
threadResponse(args){
    let that = this;
    return(new Promise(function(toot, boot){
        if (
            (args instanceof Object) &&
            (args.hasOwnProperty('threadName')) **
            (that.isNotNull(args.threadName)) &&
            (args.hasOwnProperty('postMessage')) &&
            (args.postMessage instanceof Object) &&
            (args.postMessage.hasOwnProperty('type')) &&
            (that.isNotNull(args.postMessage.type))
        ){

            // if it's the serviceWorker, we have to await waking it up .. ya rly
            if (args.isServiceWorker){
                if ((that.enableServiceworker === true) && ('serviceWorker' in navigator)){
                    navigator.serviceWorker.ready.catch(function(error){
                        // die
                        that.log(`threadResponse | serviceWorker.ready threw unexpectedly: ${error}`, true);
                    }).then(function(reg){
                        reg.active.postMessage(args.postMessage);
                    });
                }
            }else{
                that._threadHandles[args.threadName].postMessage(args.postMessage);
            }
            that._threadWaits[args.threadName][args.awaitResponseType] = {resolve: toot, reject: boot};

            /* this idea is a rat's nest of issues and i'll get back to it one day
            if ((args.hasOwnProperty('timeout')) && (! Math.isNaN(Math.parseInt(args.timeout)))){
                setTimeout(function(){
                    if ()
                }, args.timeout)
            }
            */
        }else{
            boot('threadResponse called with invalid arguments');
        }
    }))
}


/*
    handleThreadMessage({
        threadName: <threadName>,
        event:      <evt>
    })
*/
handleThreadMessage(args){
    if (
        (args instanceof Object) &&
        args.hasOwnProperty('threadName') &&
        args.hasOwnProperty('event') &&
        (args.event.data instanceof Object) &&
        (args.event.data.hasOwnProperty('type'))
    ){
        // handle built-in event types, everything else should be using await threadResponse
        switch(args.event.data.type){

            // dispatch log event (we presume you did send message and fatal attributes)
            case 'log':
                this.log(
                    `thread: ${args.event.data.data.message}`,
                    (args.event.data.data.fatal === true)
                );
                break;

            // if it's not a handled above, look for a registered signalHanlers
            default:
                if (
                    (this.threadSignalHandlers.hasOwnProperty(args.threadName)) &&
                    (this.threadSignalHandlers[args.threadName] instanceof Object) &&
                    (this.threadSignalHandlers[args.threadName].hasOwnProperty(args.event.data.type)) &&
                    (this.threadSignalHandlers[args.threadName][args.event.data.type] instanceof Function)
                ){
                    try {
                        this.threadSignalHandlers[args.threadName][args.event.data.type](args, this);
                    }catch(e){
                        this.log(`handleThreadMessage [${args.threadName}] [${args.event.data.type}] | threadSignalHandler threw unexpectedly: ${e}`, true);
                    }
                }
        }

        // release any thread waits that might be out there for it
        if (this._threadWaits.hasOwnProperty(args.threadName) && this._threadWaits[args.threadName].hasOwnProperty(args.event.data.type)){
            if ((args.event.data.hasOwnProperty('error') && (args.event.data.error === true))){
                this._threadWaits[args.threadName][args.event.data.type].reject(args.event.data);
            }else{
                this._threadWaits[args.threadName][args.event.data.type].resolve(args.event.data);
            }
            delete(this._threadWaits[args.threadName][args.event.data.type]);
        }

    }else{
        this.log(`handleThreadMessage called with invalid args`);
    }
}


/*
    handleThreadError({
        threadName: <threadName>,
        event:      <errorEvent>
    })
*/
handleThreadError(args){
    if ((args instanceof Object) && args.hasOwnProperty('threadName') && (args.hasOwnProperty('event'))){

        /*
            TO-DO this could use some spiff
        */
        this.log(`handleThreadError (${args.threadName}): ${args.event}`, true);
    }else{
        this.log(`handleThreadError called with invalid args`);
    }
}



/*
    log(message, fatal, flushImmediate)
*/
log(message, fatal, flushImmediate){
    if (fatal){ this.isCrashed = true; }
    let msg = this.logHistory[this.startTime].log(message, fatal, flushImmediate);
    if (this.logToConsole){ console.log(msg.toString()); }
    if ((this.hasOwnProperty('logCallback') && (this.logCallback instanceof Function))){
        try {
            this.logCallback(this.logHistory[this.startTime].messageQueue[(this.logHistory[this.startTime].messageQueue.length -1)]);
        }catch(e){
            console.log(e)
            // like whatever yo
        }
    }
}


/*
    get / set isCrashed
*/
get isCrashed(){ return(this._isCrashed); }
set isCrashed(bool){
    if (bool === true){
        this._isCrashed = true;
        this.save();
        if (this.hasAttribute('crashCallback')){ this.crashCallback(this); }
    }else{
        this._isCrashed = false;
    }
}



/*
    get / set logLimit
*/
get logLimit(){ return(this._logLimit); }
set logLimit(int){
    this._logLimit = int;
    this.logHistory[this.startTime].maxLength = this._logLimit;
}


/*
    get / set logInstanceLimit
*/
get logInstanceLimit(){ return(this._logInstanceLimit); }
set logInstanceLimit(int){
    this._logInstanceLimit = int;
    if (this.logInstanceLimit > 0){
        while (Object.keys(this.logHistory).length > this.logInstanceLimit){
            delete(this.logHistory[Object.keys(this.logHistory).sort(function(a,b){ return(a-b); })[0]]);
        }
    }
}

/*
    override the json getter, because we're not stashing the
    entire object, just the logs and the appData
*/
get json(){
    let tmp = {};
    //Object.keys(this).forEach(function(key){ tmp[key] = this[key]; }, this);
    //Object.keys(this._unhideOnSerialize).forEach(function(key){ tmp[key] = this[key]; }, this);
    if (this.hasOwnProperty("_appData")){ tmp._appData = this._appData; }
    if (this.hasOwnProperty("logHistory")){ tmp.logHistory = this.logHistory; }
    return(JSON.stringify(tmp));
}


/*
    save()
*/
save(){
    if (! this.cantSave){
        try {
            this._appData.lastSave = this.epochTimestamp(true);
            localStorage.setItem(this.localStorageKey, this.json);
            if (this.debug){ console.log(`[${this.name} (v${this.version})]: saved`); }
        } catch (e){
            this.isCrashed = true;
            this.cantSave = true;
            throw(new noiceException({
                message:       `[${this.name} (v${this.version})]: crashed attempting to save object ${e}`,
                messageNumber: 0,
                thrownBy:      'noiceApplicationCore/save',
                fatal:         true
            }));
        }
    }
}


/*
    restore()
    returns true if successfully restored, returns false if there was nothing to restore
    throws an error if there's a problem
*/
restore(){
    if (localStorage.hasOwnProperty(this.localStorageKey)){
        //let previousSelf = {};
        let self = this;
        try {

            let previousSelf = JSON.parse(localStorage.getItem(this.localStorageKey));

            // re-bless the logs
            Object.keys(previousSelf.logHistory).forEach(function(runInstanceTime){

                // LOOSE END: technically there could be a key conflict here.
                self.logHistory[runInstanceTime] = new noiceLog({
                    messageQueue: previousSelf.logHistory[runInstanceTime].messageQueue
                });
            });

            // restore _appData (note getAppData should re-bless into classes if they've been dropped from serialization)
            if (previousSelf.hasOwnProperty('_appData')){
                self._appData = previousSelf._appData;
            }

            // enforce the logInstanceLimit
            this.logInstanceLimit = this.logInstanceLimit;

            /*
                LOOSE END: 11/28/18 @ 1603
                seems like we should be able to leverage self.json = <whatever> here
            */

            // log it and we out
            let lastSaveLogMsg = '';
            if ((previousSelf.hasOwnProperty('_appData') && (previousSelf._appData.hasOwnProperty('lastSave')))){
                try {
                    lastSaveLogMsg = `from ${this.fromEpoch(previousSelf._appData.lastSave, 'dateTimeLocale')}`;
                }catch(e){
                    console.log(`restore can't parse lastSave? ${e}`);
                }
            }


            this.log(`[${this.name} (v${this.version})] restored ${lastSaveLogMsg}`);

        }catch(e){
            throw(new noiceException({
                message:       `[${this.name} (v${this.version})]: can't parse previous self from localStorage ${e}`,
                messageNumber: 18,
                thrownBy:      'noiceApplicationCore/restore',
                fatal:         false
            }));
            return(false);
        }
    }else{
        this.log(`[${this.name} (v${this.version}) / restore()]: nothing in localStorage to restore`);
        return(false);
    }
    this.save();
    this.logHistory[this.startTime].autoFlush = true;
    return(true);
}


/*
    writeAppData({key:value, ...})
*/
writeAppData(keyValuePairs){
    if (! (keyValuePairs instanceof Object)){
        throw(new noiceException({
            message:       `[${this.name} (v${this.version})]: argument is not an object`,
            messageNumber: 19,
            thrownBy:      `${this._className}/writeAppData`,
            fatal:         false
        }));
        return(false);
    }
    Object.keys(keyValuePairs).forEach(function(key){
        this._appData[key] = keyValuePairs[key];
    }, this);

    this.save();
    return(true);
}


/*
    getAppData(key)
    if key is null, we return all of _appData
*/
getAppData(key){
    if (this.isNull(key)){
        return(this._appData);
    }else if (this._appData.hasOwnProperty(key)){
        return(this._appData[key]);

        /*
            LOOSE END:
            what would be right cool would be to have some shit right
            here that would check if:
                A) _appData[key] is an oject that defines _className
                B) if _appData[Key] is an instance of the class defined by _className
                C) if A & (! B), return _appData[key] as am oject of _className
            what would be even cooler would be some kind of recursive blesser that
            could descend an entire onbject and bless things into classes.

            that would allow us to directly restore application state from localStorage
            or a network store really anything that can feed us json. Which might be
            interesting to extend in other ways in terms of serving pre-configured app
            state directly from server logic.

            which would be quite badass.

            something like an "object factory" pattern?
            someting like a parent class or perhaps a class-global function that can
            take an object that defines _className and spit out an object of that
            class.
        */

    }else{
        throw(new noiceException({
            message:       `[${this.name} (v${this.version})]: specified key does not exist in appData`,
            messageNumber: 20,
            thrownBy:      `${this._className}/getAppData`,
            fatal:         false
        }));
    }
}


/*
    deleteAppData(key)
    if key is null, we delete ALL of _appData
*/
deleteAppData(key){
    if (this.isNull(key)){
        // nuke it from orbit
        this._appData = {};
        if (this.debug){ this.log(`deleteAppData called with null key: deleting all appData for ${this.name}`); }
        return(this.save());
    }else{
        if (this._appData.hasOwnProperty(key)){
            delete(this._appData[key]);
            return(true);
        }else{
            throw(new noiceException({
                message:       `[${this.name} (v${this.version})]: specified key does not exist in appData`,
                messageNumber: 20,
                thrownBy:      `${this._className}/getAppData`,
                fatal:         false
            }));
            return(false);
        }
    }
}




/*
    identifyClient() -- try to figure out what platform we're on
    no, it shouldn't matter. yes, sometimes it actually does.
    messy code. don't care.
*/
identifyClient(){

    if (navigator){

        // detect iOS
        if (
            ('vendor' in navigator) &&
            (/Apple/.test(navigator.vendor)) &&
            ('maxTouchPoints' in navigator) &&
            (parseInt(navigator.maxTouchPoints) > 0)
        ){
            return('Safari Mobile');

        // detect desktop safari
        } else if (
            ('vendor' in navigator) &&
            (/Apple/.test(navigator.vendor)) &&
            ('maxTouchPoints' in navigator) &&
            (parseInt(navigator.maxTouchPoints) == 0)
        ){
            return('Safari');

        // detect edge mobile
        }else if (
            ((/Edg\//.test(navigator.userAgent)) ||
                (/Edge\//.test(navigator.userAgent))) &&
                    ('maxTouchPoints' in navigator) &&
                    (parseInt(navigator.maxTouchPoints) > 0)
            ){
                return('Edge Mobile');

        // detect edge
        }else if (
            (/Edg\//.test(navigator.userAgent)) ||
            (/Edge\//.test(navigator.userAgent))
        ){
            return('Edge');

        // detect chrome mobile
        } else if (
            ('vendor' in navigator) &&
            (/Google/.test(navigator.vendor)) &&
            (/Chrome\//.test(navigator.userAgent)) &&
                ('maxTouchPoints' in navigator) &&
                (parseInt(navigator.maxTouchPoints) > 0)
        ){
            return('Chrome Mobile');

        // detect chrome
        } else if (
            ('vendor' in navigator) &&
            (/Google/.test(navigator.vendor)) &&
            (/Chrome\//.test(navigator.userAgent))
        ){
            return('Chrome');

        // detect firefox
        }else if (
            (/Firefox\//.test(navigator.userAgent))
        ){
            return('Firefox');

        // no idea
        }else{
            return(null);
        }
    }else{
        return(null);
    }
}




/*
    decodeHTMLEntities(string)
    my google-fu tells me this is the most legit way to decode HTML entities in a string
*/
decodeHTMLEntities(str){
    return(new DOMParser().parseFromString(str, "text/html").documentElement.textContent);
}




/*
    encodeCSVRow(array)
    convert the given array to a CSV-encoded string properly escaped and joined with ","
    and return the string. You might wanna use this in an array.map or something eh?
*/
encodeCSVRow(inp){
    let that = this;
    if (inp instanceof Array){

        // better performance?!
        return(that.decodeHTMLEntities(inp.map((col) => {
            col = `${col}`.replace(/\n/g, '').replace(/\r/g, '').replace(/\t/g, '    ').replace(/\"/g, '""').replace(/\“/g, '""').replace(/\”/g, '""');
            if ((/\"/.test(col)) || (/,/.test(col))){
                col = `"${col}"`;
            }else if (/^\d+$/.test(col)){
                col = `="${col}"`;
            }else if (that.isNull(col)){
                col = '';
            }
            return(col);
        }).join(",")));

    }else{
        if (that.debug){ this.log(`${that._className} v${that._version} | encodeCSVRow() | input is not instance of Array | returning null`); }
        return('');
    }
}




} // end noiceApplicationCore class

export { noiceLogMessage, noiceLog, noiceApplicationCore }
