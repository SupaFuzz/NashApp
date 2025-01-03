/*
    noiceCore.js    version: 2.1      11/13/23
    ../docs/noiceCore.md
*/



/*
    noiceObjectCore
    this class defines a constructor model and a self-serialization accessor.

        * noiceCore.mergeClassDefaults({classDefaults}, {argDefaults})
          this static function is called by constructors of descendant classes
          before calling super(). This collapses defaults sent on the {defaults}
          argument to the constructor into the given {classDefaults}

        * constructor ({args}, {defaults}, callback(self))
            {args}
            is an object reference modelling user-specified arguments to the constructor
            every enumerable attribute will be copied into the resulting object.

            {defaults}
            is an object reference modelling class-default attributes, every enumberable
            attribute eill be copied into the resulting object, however {args} overrides
            attributes found here

            callback()
            if specified, we will call this external function with a copy of {this}
            before instantiated.

            * A NOTE about attributes:
              basically anything that comes in via {args} and {defaults} will become
              an object attribute.

              keys on {defaults} will be set as attributes, only if a corresponding
              key does not exist on {args}

              attributes that are prefixed with the underscore char (_) are created
              as non-enumerable (meaning they are hidden from Object.keys and
              JSON.stringify).

              attributes that are prefixed with a double underscore (__) are also
              non-enumerable, however they ARE exposed via the this.html accessor,
              meaning they are restorable from JSON.

              IF you specify a non-enumerable underscore-prefixed attribute on
              either {args} or {defaults} the default constructor will NOT
              create attributes for the non-underscore prefixed attribute.

              for instance:

                let myObject = new noiceObjectCore({
                    // args
                    {
                        regularAttribute:   "someValue",
                        _hiddenAttribute:   "someOtherValue"
                    },
                    // defaults
                    {
                        hiddenAttribute:    "again, a different value"
                        _regularAttribute:  "defaultValue"
                    }
                })

                in this case, the default constructor will NOT create an attribute
                for either self.hiddenAttribute nore self.regularAttribute.

                The reason is that underscore-prefixed versions of each also exist.
                we presume there are class-defined getter and setter functions for these
                if we define non-underscore-prefixed versions of these attributes, the
                child class getters and setters will be overridden by the constructor.

                So instead the constructor will remove these attributes and put them
                in the hidden self.__getterSetterAttributesFromInstantiation {} key.

                it's then the sub-classes job to initialize these values through their
                own setters after calling super() in the constructor.

            * json (getter)
              returns JSON.stringify(this) with the exception that double underscore (__)
              attrubutes are included in the serialization (they are normally hidden)

            * json (setter)
              take the given JSON string, run JSON.parse() on it, and insert the
              data into the object. Use the similar logic to the default constructor.
              _ and __ get hidden attributes. if both this._blah and this.blah are given
              set this._blah, and send this.blah to the accessor presuming there is one.
*/
class noiceObjectCore {


/*
    noiceObjectCore.mergeClassDefaults({classDefaults}, {argDefaults})
    return an object consisting of every key/value in {argDefaults} and
    every key/value in {classDefaults} that does not exist in {argDefaults}
*/
static mergeClassDefaults(classDefaults, argDefaults){
    let tmp = {};
    if (classDefaults instanceof Object){
        Object.keys(classDefaults).forEach(function(classDefaultKey){
            tmp[classDefaultKey] = classDefaults[classDefaultKey];
        });
    }
    if (argDefaults instanceof Object){
        Object.keys(argDefaults).forEach(function(argDefaultKey){
            tmp[argDefaultKey] = argDefaults[argDefaultKey];
        });
    }
    return(tmp);
}


/*
    constructor (as described above)

    the gist of the constructor:
        _attribute      => hidden
        __attribute     => hidden but self.json can see it, inserted into this._unhideOnSerialize

        (this.attribute && (this._attribute || this.__attribute)){
            // this.attribute is not created, but is set in this._useChildClassSetter
        }

    functions:
        * this.json                     (getter and setter)
        * this.epochTimestamp(bool)     (get epoch, true arg gets high res)
        * this.isNull(value)            (returns truf if value is one of the many kinds of null)
        * this.isNotNull(value)
        * this.hasAttribute(key)

*/
constructor (args, defaults, callback){

    // merge class defaults with constructor defaults
    let _classDefaults = noiceObjectCore.mergeClassDefaults({
        _className:         'noiceObjectCore',
        _version:           2
    }, defaults);

    // helper function to spawn the attributes
    function createAttribute(self, key, val){
        if (/^__/.test(key)){ self._unhideOnSerialize[key] = 1; }
        Object.defineProperty(self, key, {
            value:        val,
            writable:     true,
            enumerable:   (! (/^_/.test(key))),
            configurable: true
        });
    }

    // merge _classDefaults (now containining {defaults}) with {args} into a master key/value list
    let masterKeyList = {};
    [_classDefaults, args].forEach(function(attributeSet){
        if (attributeSet instanceof Object){
            Object.keys(attributeSet).forEach(function(key){
                masterKeyList[key] = attributeSet[key];
            });
        }
    });

    // stash any double underscore attributes in this._unhideOnSerialize
    createAttribute(this, '_unhideOnSerialize', {});

    // stash any non-underscore versions of an underscore key in this._useChildClassSetter
    createAttribute(this, '_useChildClassSetter', {});

    // spawn attribute or stash in _useChildClassSetter
    Object.keys(masterKeyList).forEach(function(key){

        // send non-underscore versions of underscore attributes to _useChildClassSetter
        if ((! /^_/.test(key)) && ((masterKeyList.hasOwnProperty(`_${key}`)) || (masterKeyList.hasOwnProperty(`__${key}`)))){
            this._useChildClassSetter[key] = masterKeyList[key];
        }else{
            createAttribute(this, key, masterKeyList[key]);
        }
    }, this);

    // handle callback if we have one
    if (callback instanceof Function){
        callback(this);
    }

} // end constructor


/*
    getter and setter for json
*/
get json(){
    let tmp = {};
    Object.keys(this).forEach(function(key){ tmp[key] = this[key]; }, this);
    Object.keys(this._unhideOnSerialize).forEach(function(key){ tmp[key] = this[key]; }, this);
    return(JSON.stringify(tmp));
}
set json(json){
    let tmp = JSON.parse(json);

    // blow everything in if the child class has a setter, it'll handle it by here since we're out of the constructor
    Object.keys(tmp).forEach(function(key){ this[key] = tmp[key]; }, this);
}


/*
    isNull(value)
*/
isNull(val){
    return(
       (typeof(val) === 'undefined') ||
       (val === null) ||
       (val === undefined) ||
       (val == "null") ||
       (/^\s*$/.test(val))
    );
}


/*
    isNotNull(value)
    return the inverse of isNull()
*/
isNotNull(val){ return(! (
   (typeof(val) === 'undefined') ||
   (val === null) ||
   (val === undefined) ||
   (val == "null") ||
   (/^\s*$/.test(val))
)); }


/*
    epochTimestamp(hiResBool)
*/
epochTimestamp(bool){
    if (bool === true){
        return(new Date().getTime());
    }else{
        return(Math.round(new Date().getTime() / 1000));
    }
}


/*
    hasAttribute(attributeName)
    return true if this has <attributeName> and
    the value of that attribute is not null
*/
hasAttribute(attributeName){
    return(this.hasOwnProperty(attributeName) && this.isNotNull(this[attributeName]));
}


} // end noiceObjectCore




/*
    noiceCoreChildClass
    this tacks onto the default noiceObjectCore constructor
    to handle calling setters in a child class context
*/
class noiceCoreChildClass extends noiceObjectCore {

/*
    constructor
    if you write your child class extensions from here
    you can use this slick child class default constructor
    which will handle passthrough defaults as well as
    post-super() attribute initialization that knows how to
    call local attribute setters
*/
constructor(args, defaults, callback){

    let _classDefaults = noiceObjectCore.mergeClassDefaults({
        _className:     'noiceCoreChildClass',
        _version:       1
    }, defaults);
    super(args, _classDefaults, callback);

    // handle invoking child-class setters ...
    if ((this.hasAttribute('_useChildClassSetter')) && (this._useChildClassSetter instanceof Object)){
        Object.keys(this._useChildClassSetter).forEach(function(key){
            this[key] = this._useChildClassSetter[key];
        }, this)
    }
}


} // end noiceCoreChildClass




/*
    noiceException({})
    this is an exception class to handle exceptions thrown by our own code.
    with these object attributes
        * errorNumber
        * message
        * thrownBy
        * fatal (default false)
        * sendExceptionEvent    (bool default true)
        * exceptionEventName    (default: _noiceException)
    if you sentExceptionEvent is set true, we'll send a copy of the exception object
    to the document event defined by exceptionEventName. External things that might
    care about exception throws (for instance loggers) can subscribe to that event
*/
class noiceException extends noiceCoreChildClass {

constructor(args, defaults, callback){
    let _classDefaults = noiceObjectCore.mergeClassDefaults({
        _version:            2,
        _className:          'noiceException',
        fatal:               false,
        sendExceptionEvent:  false,
        exceptionEventName:  '_noiceException',
        message:             'no message specified',
        messageNumber:       0,
        thrownBy:            '(unknown)'
    }, defaults);

    // set it up
    super(args, _classDefaults, callback);

    // capture high res timestamp
    this.time = this.epochTimestamp(true);

    /*
        if sendExceptionEvent is turned on, we're going to send a copy of
        the entire exception object to the document event named by exceptionEventName
        things that care about it (such as loggers) can subscribe to this event
    */
    if (this.sendExceptionEvent){
        document.dispatchEvent(new CustomEvent(this.exceptionEventName, {'detail':this}));
    }
}

toString(){
    return(`[fatal: ${this.fatal}] [messageNumber ${this.messageNumber}] [thrownBy: ${this.thrownBy}] ${this.message}`);
}

} // end noiceException




/*
    noiceCoreUtility
    this adds some utility functions to the noiceCoreChildClass
*/
class noiceCoreUtility extends noiceCoreChildClass {

// minimal constructor
constructor(args, defaults, callback){
    let _classDefaults = noiceObjectCore.mergeClassDefaults({
        _version:            2.1,
        _className:          'noiceCoreUtility',
        _usedGUIDs:         [],
        usedGUIDMaxCache:   1000
    }, defaults);

    // set it up
    super(args, _classDefaults, callback);
}


/*
    toEpoch(string, bool)
    <string> contains the string to attempt to convert into an epoch integer
    <bool> (default true), if false returns course value (seconds), if true fine (milliseconds)
*/
toEpoch(date, fine){

    /*
        7/2/2020 @ 1426
        Safari refuses to parse legit ISO8601 dates with a 4 digit timezone
        offset specified, unless the timezone offset includes a colon.
        I could literally slap the hell out of some pedantic asshole at Apple right now.
    */
    //if (isNaN(Date.parse(date)) && /[+|-]\d{4}$/.test(date)){
    if (/[+|-]\d{4}$/.test(date)){
        date = `${date.substr(0,(date.length -2))}:${date.substr(-2)}`;
    }


    try {
        return((fine === true)?Date.parse(date):(Math.floor(Date.parse(date)/1000)));
    }catch(e){
        throw(new noiceException({
            message:        `failed to parse timestamp: ${e}`,
            messageNumber:   1,
            thrownBy:       'noiceCoreUtility/toEpoch',
            thrownByArgs:   [date, fine],
        }));
    }
}


/*
    fromEpoch(integer, type)
    <integer> is the epoch timestamp (course values will be backfilled to fine)
    <type> is an enum: date | time | dateTime | dateTimeLocale
    returns an ARS/REST compatible ISO 8601 date / time / dateTime string
    except dateTimeLocale which returns human readable dateTime string in client timezone
*/

fromEpoch(epoch, type){

    // ya rly
    function pad(number) {
      if (number < 10) {
        return '0' + number;
      }
      return number;
    }

    // sort out the epoch format
    if (this.isNull(epoch)){
        throw(new noiceException({
            message:        'specified null epoch value',
            messageNumber:   2,
            thrownBy:       'noiceCoreUtility/fromEpoch',
            thrownByArgs:   [epoch, type],
        }));
    }
    try {
        epoch = parseInt(epoch.toString(), 10);
        //
        if (epoch <= 9999999999){ epoch = (epoch * 1000);}
    }catch(e){
        throw(new noiceException({
            message:        `failed integer conversion of given epoch time: ${e}`,
            messageNumber:   3,
            thrownBy:       'noiceCoreUtility/fromEpoch',
            thrownByArgs:   [epoch, type],
        }));
    }

    // convert it
    switch(type){
        case 'date':
            try {
                let myDate = new Date(epoch);
                return(`${myDate.getUTCFullYear()}-${pad(myDate.getUTCMonth() + 1)}-${pad(myDate.getUTCDate())}`)
            }catch(e){
                throw(new noiceException({
                    message:        `failed conversion (date): ${e}`,
                    messageNumber:   4,
                    thrownBy:       'noiceCoreUtility/fromEpoch',
                    thrownByArgs:   [epoch, type],
                }));
            }
        break;
        case 'time':
            try {
                let myDate = new Date(epoch);
                return(`${pad(myDate.getUTCHours())}:${pad(myDate.getUTCMinutes())}:${pad(myDate.getUTCSeconds())}`)
            }catch(e){
                throw(new noiceException({
                    message:        `failed conversion (time): ${e}`,
                    messageNumber:   5,
                    thrownBy:       'noiceCoreUtility/fromEpoch',
                    thrownByArgs:   [epoch, type],
                }));
            }
        break;
        case 'dateTime':
            try {
                return(new Date(epoch).toISOString());
            }catch(e){
                throw(new noiceException({
                    message:        `failed conversion (dateTime): ${e}`,
                    messageNumber:   6,
                    thrownBy:       'noiceCoreUtility/fromEpoch',
                    thrownByArgs:   [epoch, type],
                }));
            }
        break;
        case 'datetime-local':
            try {
                return(new Date(epoch).toISOString().replace(/\.\d+Z$/, ''));
            }catch(e){
                throw(new noiceException({
                    message:        `failed conversion (dateTime): ${e}`,
                    messageNumber:   6,
                    thrownBy:       'noiceCoreUtility/fromEpoch',
                    thrownByArgs:   [epoch, type],
                }));
            }
        case 'dateTimeLocale':

            /*
                9/15/21 @ 1351 -- one could pass some optional args through
                and specify format of the return string. Just it's a side-quest
                I don't have time for at the moment:

                https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleTimeString
            */

            try {
                return(new Date(epoch).toLocaleString());
            }catch(e){
                try {
                    return(new Date(epoch).toISOString());
                }catch(e){
                    throw(new noiceException({
                        message:        `failed conversion (dateTimeLocale): ${e}`,
                        messageNumber:   6.5,
                        thrownBy:       'noiceCoreUtility/fromEpoch',
                        thrownByArgs:   [epoch, type],
                    }));
                }
            }
            break;
        default:
            throw(new noiceException({
                message:        'invalid date type specified',
                messageNumber:   7,
                thrownBy:       'noiceCoreUtility/fromEpoch',
                thrownByArgs:   [epoch, type],
            }));
    }
}




/*
    getTimeInterval(seconds, asStringBool)
    given a number of seconds, return an object of the form:
    {
        days: <int>
        hours: <int>,
        minutes: <int>,
        seconds: <int>
    }
    if asStringBool set true return:
    `${days}:${hours}:${minutes}:${seconds}`
    with hours, minutes, seconds zero padded HH:MM:SS style
*/
getTimeInterval(seconds, asStringBool){

    const intervals = {
      days: ((60*60)*24),
      hours: (60 * 60),
      minutes: 60,
      seconds: 1
    };

  	let out = {days: 0, hours: 0, minutes: 0, seconds: 0};
    let sec = parseInt(seconds);
    ['days','hours','minutes','seconds'].forEach((s) => {
      if (sec >= intervals[s]){
        out[s] = Math.floor(sec / intervals[s]);
        sec = (sec - (out[s] * intervals[s]));
      }
    });

    if (asStringBool === true){
        return(['days','hours','minutes','seconds'].map((a)=>{return(
            (a == "days")?out[a]:String(out[a]).padStart(2,0)
        )}).join(':'));

    }else{
        return(out);
    }
}




/*
    getGUID(altCache)
    return a GUID. These are just random, but we do at least keep
    track of the ones we've issued and won't issue the same one
    twice within the same run instance
*/
getGUID(altCache){
    let guid;
    let guidCache = (altCache instanceof Array)?altCache:((this instanceof Object) && (this._usedGUIDs instanceof Array))?this._usedGUIDs:[];
    do {
        // thank you stackoverflow!
        guid = 'ncxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            let r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
        });
    } while (guidCache.indexOf(guid) >= 0);
    guidCache.push(guid);
    if ((this instanceof Object) && (this._usedGUIDs instanceof Array) && (this._usedGUIDs.length > this.usedGUIDMaxCache)){ this._usedGUIDs.shift(); }
    return(guid);
}




/*
    distinctCombinations(array)
    returns an array of arrays containing the list of distinct
    combinations of the input array. for instance:
    [a,b,c] => [ [a], [b], [c], [a,b], [a,c], [b,c] ]

    RIP stackoverflow, you were the GOAT. These AIs can never hold a flame ...
*/
distinctCombinations(array) {
	const results = [[]];
	for (const value of array) {
		const copy = [...results];
		for (const prefix of copy) { results.push(prefix.concat(value)); }
	}
	return (results);
}




/*
    segmentArray(array, chunkSize)
    destructively segment the given array into an array of arrays of
    chunkSize, and return it (NOTE: array will be length 0 after this call)
*/
segmentArray(array, chunkSize){
    let chunks = [];
    while (array.length > 0){ chunks.push(array.splice(0, chunkSize)); }
    return(chunks);
}




} // end noiceCoreUtility




/*
    noiceCoreNetworkUtility
    this adds a network request dispatcher to noiceCoreUtility
*/
class noiceCoreNetworkUtility extends noiceCoreUtility {


/*
    default constructor to merge defaults
*/
constructor(args, defaults, callback){
    let _classDefaults = noiceObjectCore.mergeClassDefaults({
        _version:            2,
        _className:          'noiceCoreNetworkUtility'
    }, defaults);
    super(args, _classDefaults, callback);
}


/*
    fetch({
        endpoint:           <url>
        method:             GET | POST | PUT | DELETE
        headers:            { header:value ...},
        content:            { object will be JSON.strigified before transmit }
        expectHtmlStatus:   <integer> (receiving this = reolve, else reject promise)
        timeout:            default 0, milli seconds after which to timeout the socket
        encodeContent:      <bool> default true
        responseType:       ??, but we're passing it through to the xhr
        progressCallback:   function(evt)
    })

    this creates an XHR of the specified method, pointing to the specified endpoint
    with specified headers and content, and returns a rejected or resolved
    promise. Rejected promises are noiceExceptions, and are triggered either from
    timeout being exceeded or from not recieving an HTTP status response matching
    expectHtmlStatus. Resolved promises return the xhr object and the caller can
    work out what to do with that.
*/
fetch (args) {
    let self = this;
    let abort = false;
    return(new Promise(function(resolve, reject){

        /*
            input validations
        */
        ['endpoint', 'method', 'expectHtmlStatus'].forEach(function(k){
            if ((! typeof(args) == 'object') || (! args.hasOwnProperty(k)) || (self.isNull(args[k]))){
                abort = true;
                reject(new noiceException({
                    message:        `required argument missing ${k}`,
                    messageNumber:   8,
                    thrownBy:       'noiceCoreUtility/fetch',
                    thrownByArgs:   args,
                }));
            }
        });

        // handle multiple expectHtmlStatus values
        let myOKStatuses = [];
        if ((typeof(args.expectHtmlStatus) == 'number') || (typeof(args.expectHtmlStatus) == 'string')) {
            myOKStatuses.push(args.expectHtmlStatus);
        }else{
            myOKStatuses = args.expectHtmlStatus;
        }

        // set up default timeout
        if (! args.hasOwnProperty('timeout')){ args.timeout = 0; }

        // set up the xhr
        let xhr = new XMLHttpRequest();
        if (args.timeout > 0){ xhr.timeout = args.timeout; }
        if (args.hasOwnProperty('responseType')){ xhr.responseType = args.responseType; }

        // success callback
        xhr.addEventListener("load", function(){
            if (myOKStatuses.indexOf(this.status) >= 0){
                resolve(this);
            }else{
                abort = true;
                reject(new noiceException({
                    message:        `received unexpected HTTP status ${this.status}, expected ${myOKStatuses.join(", OR ")}`,
                    messageNumber:   10,
                    thrownBy:       'noiceCoreUtility/fetch',
                    thrownByArgs:   args,
                    'xhr':          this,
                    'event':        'load'
                }));
            }
        });

        // error callback
        xhr.addEventListener("error", function(evt){
            abort = true;
            reject(new noiceException({
                message:        'received "error" event (probably a timeout)',
                messageNumber:   11,
                thrownBy:       'noiceCoreUtility/fetch',
                thrownByArgs:   args,
                'xhr':          this,
                'event':        'error'
            }));
        });

        // abort callback
        xhr.addEventListener("abort", function(){
            abort = true;
            reject(new noiceException({
                message:        'received "abort" event (probably user cancel or network issue)',
                messageNumber:   12,
                thrownBy:       'noiceCoreUtility/fetch',
                thrownByArgs:   args,
                'xhr':          this,
                'event':        'abort'
            }));
        });

        // asynchronously call progress callback if we have one (evt.loaded / evt.total have progress data)
        if (args.hasOwnProperty('progressCallback') && (args.progressCallback instanceof Function)){
            xhr.addEventListener("progress", function(evt){ setTimeout(args.progressCallback(evt), 0); })
        }

        // open it up
        if (! abort){ xhr.open(args.method, args.endpoint); }

        // set request headers
        if ((! abort) && (args.hasOwnProperty('headers')) && (typeof(args.headers) === 'object')){
            try {
                Object.keys(args.headers).forEach(function(k){
                    xhr.setRequestHeader(k, args.headers[k]);
                });
            }catch(e){
                abort = true;
                reject(new noiceException({
                    message:        `failed to set request headers: ${e}`,
                    messageNumber:   13,
                    thrownBy:       'noiceCoreUtility/fetch',
                    thrownByArgs:   args,
                    'xhr':          xhr
                }));
            }
        }

        // encode the content if we have it
        if ((! abort) && (args.hasOwnProperty('content'))){
            let encoded = '';
            if (args.encodeContent){
                try {
                    encoded = JSON.stringify(args.content);
                }catch(e){
                    abort = true;
                    reject(new noiceException({
                        message:        `failed to encode content with JSON.stringify: ${e}`,
                        messageNumber:   14,
                        thrownBy:       'noiceCoreUtility/fetch',
                        thrownByArgs:   args,
                        'xhr':          xhr
                    }));
                }
            }else{
                encoded = args.content;
            }
            if (! abort){
                xhr.send(encoded);
            }
        }else if (! abort){
            xhr.send();
        }
    }));
}

} // end noiceCoreNetworkUtility

// export classes
export { noiceObjectCore, noiceCoreChildClass, noiceException, noiceCoreUtility, noiceCoreNetworkUtility };

// export some functions
const isNull = noiceObjectCore.prototype.isNull;
const isNotNull = noiceObjectCore.prototype.isNotNull;
const epochTimestamp = noiceObjectCore.prototype.epochTimestamp;
const toEpoch = noiceCoreUtility.prototype.toEpoch;
const fromEpoch = noiceCoreUtility.prototype.fromEpoch;
const getGUID = noiceCoreUtility.prototype.getGUID;
const distinctCombinations = noiceCoreUtility.distinctCombinations;
const segmentArray = noiceCoreUtility.segmentArray;
export { isNull, isNotNull, epochTimestamp, toEpoch, fromEpoch, getGUID, distinctCombinations, segmentArray };
