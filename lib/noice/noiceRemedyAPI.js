/*
    noiceRemedyAPI.js               "dude, noice!"

    this handles everything except sending attachments
    I just typically don't need to do that, and it looks like a huge headache
    to work out. Also associations.


*/

'use strict';
import { noiceCoreNetworkUtility, noiceException } from './noiceCore.js';



/*
    noiceRemedyAPIException({})
    custom error class descending from noiceException
*/
class noiceRemedyAPIException extends noiceException {


/*
    constructor ({
        xhr:                    (optional) if specfied, extract arsErrorList, httpStatus and httpResponseHeaders
        message:                (optional) if specified, return this on *.message rather than the first entry in arsErrorList
        messageType:            (optional) if specified, return this on *.messageType rather than the first entry in arsErrorList
        thrownByFunction:       (optional) name of function that threw the error
        thrownByFunctionArgs:   (optional) copy of args sent to function that threw the error
    })
*/
constructor(args){

    // set it up
    super(args, {
        _version:       2.5,
        _className:     'noiceRemedyAPIException',
        _lastResort:    [],
        _message:       '',
        _messageType:   '',
        httpResponseHeaders: {},
        arsErrorList:        []
    });

    // set the timestamp
    this.time = this.epochTimestamp(true);

    // pull ars error messages from the xhr if we have one
    this.parseXHR();

} // end constructor


/*
    getter and setter for 'message'
    return this.message if it's set otherwise the first
    messageText from arsErrorList, or an error stating why not
*/
set message(v){ this._message = v; }
get message(){
    if (this.hasAttribute('_message')){
        return(this._message);
    }else {
        try {
            return(this.arsErrorList[0].messageText);
        }catch (e){
            return('no error messsage available (not set, cannot be parsed from xhr)');
        }
    }
}


/*
    getter and setter for 'messageType'
    return this.message if it's set otherwise the first
    messageText from arsErrorList, or an error stating why not
*/
set messageType(v){ this._messageType = v; }
get messageType(){
    if (this.hasAttribute('_messageType')){
        return(this._messageType);
    }else {
        try {
            return(this.arsErrorList[0].messageType);
        }catch (e){
            return('no messageType available (not set, cannot be parsed from xhr)');
        }
    }
}


/*
    getters for arsErrorList properties
    all default to the first entry in arsErrorList or false
*/
get messageText(){
    try {
        return(this.arsErrorList[0].messageText);
    }catch (e){
        return(false);
    }
}

get messageAppendedText(){
    try {
        return(this.arsErrorList[0].messageAppendedText);
    }catch (e){
        return(false);
    }
}

get messageNumber(){
    try {
        return(this.arsErrorList[0].messageNumber);
    }catch (e){
        return(false);
    }
}


/*
    return a legit Error object
*/
get error(){
    return(new Error(this.message));
}


/*
    return a nice string
*/
toString(){
    return(`[http/${this.httpStatus} ${this.messageType} (${this.messageNumber})]: ${this.message} / ${this.messageAppendedText}`);
}


/*
    parseXHR()
    if we have an *.xhr attribute, parse it looking for ARS Error Messages
*/
parseXHR(){
    let slf = this;

    if (slf.hasAttribute('xhr')){
        // try to get the httpStatus
        try {
            slf.httpStatus = slf.xhr.status;
        }catch (e){
            slf.httpStatus = 0;
            slf._lastResort.push(`[httpStatus]: cannot find ${e}`);
        }

        // try to get the httpResponseHeaders
        try {
            slf.xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach(function(line){
                line = line.replace(/[\r\n]+/, '');
                let tmp = line.split(/:\s+/,2);
                slf.httpResponseHeaders[tmp[0]] = tmp[1];
            });
        }catch (e){
            slf._lastResort.push(`[httpResponseHeaders]: failed to parse ${e}`);
        }

        // try to parse out ars errors
        if (
            (slf.isNull(slf.xhr.responseType) || (slf.xhr.responseType == 'text')) &&
            (slf.isNotNull(slf.xhr.responseText) || slf.isNotNull(slf.xhr.response) )
        ){
            try {
                slf.arsErrorList = JSON.parse(this.isNotNull(slf.xhr.responseText)?slf.xhr.responseText:slf.xhr.response);
            }catch (e){
                slf._lastResort.push(`[arsErrorList]: failed to parse ${e}`);
                slf.messageType = 'non-ars';
            }
        }else{
            slf.messageType = 'non-ars';
            slf._message += '(error object not returned from ARServer)';
        }
    }
} // end parseXHR


} // end noiceRemedyAPIException class




/*
    noiceRemedyAPI({})
    it's da big one ...
        * proxypath ... need to explain that shit to the chil
*/
class noiceRemedyAPI extends noiceCoreNetworkUtility {


/*
    constructor({
        protocol:   http | https (default https)
        server:     <hostname>
        port:       <portNumber> (optionally specify a nonstandard port number)
        user:       <userId>
        password:   <password>
    })

    everything is optional, but if you wanna call *.authenticate, you've got
    to set at least server, user & pass either here, before you call *.authenticate
    or on the args to *.authenticate
*/
constructor (args){
    super(args, {
        _version:   2,
        _className: 'noiceRemedyAPI',
        debug:      false,
        protocol:   'https',
        timeout:    (60 * 1000 * 2)     // <-- 2 minute default timeout
    });

    // sort out the protocol and default ports
    switch (this.protocol){
        case 'https':
            if (! this.hasAttribute('port')){ this.port = 443; }
        break;
        case 'http':
            if (! this.hasAttribute('port')){ this.port = 80; }
        break;
        default:
            throw(new noiceRemedyAPIException({
                messageType:    'non-ars',
                message:        `unsupported protocol: ${this.protocol}`
            }));
    }

} // end constructor




/*
    isAuthenticated
    return true if we have an api session token, else false
*/
get isAuthenticated(){
    return(this.hasAttribute('token'));
}




/*
    authenticate({args})
        protocol:           http || https (default https -- should already be set on object, but overridable here)
        server:             <hostname> (str)
        port:               <portNumber> int (overridable here)
        user:               <userId>
    password:               <password>
*/
async authenticate(p){
    let slf = this;
    if (typeof p === 'undefined'){ p = {}; }

    /*
        protocol, server, user & password are required.
        if missing from the function call, but extant on the
        object, use the object value, otherwise barf.
    */
    ['protocol','server','user','password', 'port'].forEach(function(arg){
        if (! (p.hasOwnProperty(arg) && slf.isNotNull(p[arg]))){
            if (slf.hasAttribute(arg)){
                p[arg] = slf[arg];
            }else{
                throw(new noiceRemedyAPIException ({
                    messageType:            'non-ars',
                    message:                `required argument missing: ${arg}`,
                    thrownByFunction:       'authenticate',
                    thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
                }));
            }
        }
    });

    // detail debug ...
    if (slf.debug){ console.log(`[endpoint]: ${p.protocol}://${p.server}:${p.port}${(slf.hasAttribute('proxyPath'))?slf.proxyPath:''}/api/jwt/login`); }

    let authRespXHR = await slf.fetch({
        endpoint:   `${p.protocol}://${p.server}:${p.port}${(slf.hasAttribute('proxyPath'))?slf.proxyPath:''}/api/jwt/login`,
        method:     'POST',
        headers:  {
            "Content-Type":     "application/x-www-form-urlencoded",
            "Cache-Control":    "no-cache"
        },
        expectHtmlStatus: 200,
        timeout:       slf.timeout,
        content:       `username=${p.user}&password=${p.password}`,
        encodeContent: false,
        timeout:       p.timeout
    }).catch(function(e){
        // hannle yo bidness down heeyuh
        e.thrownByFunction =    'authenticate';
        e.thrownByFunctionArgs =   (typeof(p) !== 'undefined')?p:{}
        throw(new noiceRemedyAPIException (e));
    });

    /*
        snag the auth token or die tryin' ...
        this is sneakier than it should have to be as *.hasOwnProperty
        does not work on XHR objects apparently. noice!
    */
    try {
        let tmp = authRespXHR.responseText;
        if (slf.isNull(tmp)){ throw("null response"); }
        slf.token = tmp;
        if (slf.debug){ console.log(`[auth token]: ${slf.token}`); }

        return(slf);
    }catch(e){
        throw(new noiceRemedyAPIException({
            messageType:            'non-ars',
            message:                `authentication response does not contain token`,
            thrownByFunction:       'authenticate',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

} // end authenticate




/*
    logout()
    destroy the session token on the server
*/
async logout(p){
    let slf = this;
    if (typeof p === 'undefined'){ p = {}; }

    // if we're not authenticated, don't bother
    if (! slf.isAuthenticated){
        if (slf.debug){ console.log('[logout] call on object that is not authenticated. nothing to do.'); }
        return(true);
    }

    // we need a protocol, port, server, and token, either as args or on the object
    ['protocol', 'server', 'token', 'port'].forEach(function(a){
        if (! ((p.hasOwnProperty(a)) && (slf.isNotNull(p[a])))){
            if (slf.hasAttribute(a)){
                p[a] = slf[a];
            }else{
                throw(new noiceRemedyAPIException ({
                    messageType:            'non-ars',
                    message:                `required argument missing: ${a}`,
                    thrownByFunction:       'logout',
                    thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
                }));
            }
        }
    });
    if (slf.debug){console.log(`[endpoint]: ${p.protocol}://${p.server}:${p.port}${(slf.hasAttribute('proxyPath'))?slf.proxyPath:''}/api/jwt/logout`); }
    let resp = await slf.fetch({
        endpoint:           `${p.protocol}://${p.server}:${p.port}${(slf.hasAttribute('proxyPath'))?slf.proxyPath:''}/api/jwt/logout`,
        method:             'POST',
        expectHtmlStatus:   204,
        timeout:            slf.timeout,
        headers:  {
            "Authorization":    `AR-JWT ${p.token}`,
            "Cache-Control":    "no-cache",
            "Content-Type":     "application/x-www-form-urlencoded"
        }
    }).catch(function(e){
        e.thrownByFunction = 'logout';
        e.thrownByFunctionArgs = (typeof(p) !== 'undefined')?p:{}
        throw(new noiceRemedyAPIException (e));
    });
    delete(slf.token);
    return(slf);
} // end logout




/*
    getAttachment({

    })
*/
async getAttachment(p){
    let slf = this;
    if (typeof p === 'undefined'){ p = {}; }

    // bounce if we're not authenticated
    if (! this.isAuthenticated){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `api handle is not authenticated`,
            thrownByFunction:       'getAttachment',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    // flatten/check the args
    ['protocol', 'server', 'port', 'schema', 'ticket', 'fieldName'].forEach(function(f){
        if (!(p.hasOwnProperty(f) && slf.isNotNull(p[f]))){
            if (slf.hasAttribute(f)){
                p[f] = slf[f];
            }else{

                throw(new noiceRemedyAPIException ({
                    messageType:            'non-ars',
                    message:                `required argument missing: ${f}`,
                    thrownByFunction:       'getAttachment',
                    thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
                }));
            }
        }
    });

    if (slf.debug){ console.log(`[getAttachment (endpoint)]: ${p.protocol}://${p.server}:${p.port}${(slf.hasAttribute('proxyPath'))?slf.proxyPath:''}/api/arsys/v1/entry/${encodeURIComponent(p.schema)}/${p.ticket}/attach/${encodeURIComponent(p.fieldName)}`)}

    // do it. do it. do it 'till ya satisfied
    let resp = await slf.fetch({
        endpoint:           `${p.protocol}://${p.server}:${p.port}${(slf.hasAttribute('proxyPath'))?slf.proxyPath:''}/api/arsys/v1/entry/${encodeURIComponent(p.schema)}/${p.ticket}/attach/${encodeURIComponent(p.fieldName)}`,
        method:             "GET",
        expectHtmlStatus:   200,
        timeout:            slf.timeout,
        responseType:       'blob',
        headers:  {
            "Authorization":    `AR-JWT ${slf.token}`,
        },
        progressCallback: (p.progressCallback instanceof Function)?p.progressCallback:null
    }).catch(function(e){
        e.ThrownByFunction = 'getAttachment';
        e.thrownByFunctionArgs =   (typeof(p) !== 'undefined')?p:{}
        throw(new noiceRemedyAPIException (e));
    });

    // this'll be a raw binary array buffer ... just so ya know ...
    return(resp.response);

} // end getAttachment




/*
    query({
        schema:       <form name>
        fields:       [array, of, fieldnames, to, get, values, for] -- note add something for assoc stuff later
        QBE:          <QBE string>
        offset:       <return data from this row number -- for paging>
        limit:        <max number of rows to return>
        sort:         <see the docs. but basically <field>.asc or <field>.desc comma separated
    })
*/
async query(p){
    let slf = this;
    if (typeof p === 'undefined'){ p = {}; }

    // bounce if we're not authenticated
    if (! this.isAuthenticated){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `api handle is not authenticated`,
            thrownByFunction:       'query',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    // flatten/check the args
    ['protocol', 'server', 'port', 'schema', 'fields', 'QBE'].forEach(function(f){
        if (!(p.hasOwnProperty(f) && slf.isNotNull(p[f]))){
            if (slf.hasAttribute(f)){
                p[f] = slf[f];
            }else{
                throw(new noiceRemedyAPIException ({
                    messageType:            'non-ars',
                    message:                `required argument missing: ${f}`,
                    thrownByFunction:       'query',
                    thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
                }));
            }
        }
    });

    // default false value of fetchAttachments
    p.fetchAttachments = (p.hasOwnProperty('fetchAttachments') && p.fetchAttachments === true);

    // fields should be an object
    if (typeof p.fields !== 'object'){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `required argument missing: 'fields' is not an object!`,
            thrownByFunction:       'query',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    // construct endpoints
    let url = `${p.protocol}://${p.server}:${p.port}${(slf.hasAttribute('proxyPath'))?slf.proxyPath:''}/api/arsys/v1/entry/${encodeURIComponent(p.schema)}/?q=${encodeURIComponent(p.QBE)}&fields=values(${p.fields.join(",")})`;


    /*
        associations:
            * getAssociations <bool> || array
              if null or boolean false: do nothing
              if boolean true: get a list of all associations   url += `,assoc`
              if array: get associationNames listed             url += `,assoc(getAssociations.join(','))`

            * expandAssociations <bool>
              if true and getAssociations is an array, expand (get fieldValues for) the associations listed in getAssociations
              url += `&expand=assoc(getAssociations.join(','))`
    */
    if (p.hasOwnProperty('getAssociations')){
        if (p.getAssociations === true){
            url += `,assoc`;
        }else if (p.getAssociations instanceof Array){
            let as = [];
            //p.getAssociations.forEach(function(v){ as.push(`'${v}'`); });
            as = p.getAssociations;
            if (p.hasOwnProperty('expandAssociations') && (p.expandAssociations === true)){
                url += `&expand=assoc(${as.join(',')})`;
            }else{
                url += `,assoc(${as.join(',')})`;
            }
        }
    }

    // paging stuffs
    ['offset', 'limit', 'sort'].forEach(function(a){
        if ((p.hasOwnProperty(a)) && (slf.isNotNull(p[a]))){
            url += `&${a}=${encodeURIComponent(p[a])}`;
        }
    });
    if (slf.debug){ console.log(`[query (endpoint)]: ${url}`); }

    let resp = await slf.fetch({
        endpoint:           url,
        method:             'GET',
        expectHtmlStatus:   200,
        timeout:            slf.timeout,
        headers:  {
            "Authorization":    `AR-JWT ${slf.token}`,
            "Content-Type":     "application/x-www-form-urlencoded",
            "Cache-Control":    "no-cache"
        },
        progressCallback:   p.hasOwnProperty('progressCallback')?p.progressCallback:null
    }).catch(function(e){
        e.thrownByFunction = 'query';
        e.thrownByFunctionArgs =   (typeof(p) !== 'undefined')?p:{}
        console.log(e)
        throw(new noiceRemedyAPIException (e));
    });

    // parse the response
    let data;
    try {
        data = JSON.parse(resp.responseText);
    }catch(e){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `cannot parse server response (${JSON.stringify(resp).length}) bytes: ${e}`,
            thrownByFunction:       'query',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    // fetch attachments
    if (p.fetchAttachments){
        let promiseKeeper = [];
        data.entries.forEach(function(row){
            if (row.hasOwnProperty('_links') && row._links.hasOwnProperty('self') && row._links.self[0].hasOwnProperty('href')){
                let parse = row._links.self[0].href.split('/');
                let ticket = parse[(parse.length -1)];

                // find attachment fields if there are any
                Object.keys(row.values).forEach(function(field){
                    if (slf.isNotNull(row.values[field])){
                        if ((typeof(row.values[field]) == 'object') && row.values[field].hasOwnProperty('name') && row.values[field].hasOwnProperty('sizeBytes')){
                            if (slf.debug){ console.log(`fetching attachment from record: ${ticket} and field: ${field} with size: ${row.values[field].sizeBytes} and filename: ${row.values[field].name}`); }
                            promiseKeeper.push(
                                slf.getAttachment({
                                    schema:     p.schema,
                                    ticket:     ticket,
                                    fieldName:  field
                                }).then(function(dta){
                                    row.values[field].data = dta;
                                })
                            );
                        }
                    }
                });
            }
        });
        await Promise.all(promiseKeeper);
    }

    // send it back
    return(data);

} // end query




/*
    getTicket({
        schema:             <form name>
        ticket:             <ticket number>
        fields:             [array, of, fieldnames, to, get, values, for] -- note add something for assoc stuff later
        fetchAttachments:   true | false (default false). if true, fetch the binary data for attachments and include in .data
        progressCallback:   function(evt){ ... xhr progress event handler ... }

        associations:
            * getAssociations <bool> || array
              if null or boolean false: do nothing
              if boolean true: get a list of all associations
              if array: get associationNames listed

            * expandAssociations <bool>
              if true and getAssociations is an array, expand (get fieldValues for) the associations listed in getAssociations
    })
*/
async getTicket(p){
    let slf = this;
    if (typeof p === 'undefined'){ p = {}; }

    // bounce if we're not authenticated
    if (! this.isAuthenticated){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `api handle is not authenticated`,
            thrownByFunction:       'getTicket',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    // flatten/check the args
    ['protocol', 'server', 'port', 'schema', 'fields', 'ticket'].forEach(function(f){
        if (!(p.hasOwnProperty(f) && slf.isNotNull(p[f]))){
            if (slf.hasAttribute(f)){
                p[f] = slf[f];
            }else{
                throw(new noiceRemedyAPIException ({
                    messageType:            'non-ars',
                    message:                `required argument missing: ${f}`,
                    thrownByFunction:       'getTicket',
                    thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
                }));
            }
        }
    });

    // we need fields to be an object of course
    if (typeof p.fields !== 'object'){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `required argument missing: 'fields' is not an object (${typeof(p.fields)})`,
            thrownByFunction:       'getTicket',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    // default false value of fetchAttachments
    p.fetchAttachments = (p.hasOwnProperty('fetchAttachments') && p.fetchAttachments === true);

    /* associations hooks -- this works but we can do better
    let getAssoc = (p.hasOwnProperty('getAssociations') && (p.getAssociations === true));
    let url = `${p.protocol}://${p.server}:${p.port}${(self.hasAttribute('proxyPath'))?self.proxyPath:''}/api/arsys/v1/entry/${encodeURIComponent(p.schema)}/${p.ticket}/?fields=values(${p.fields.join(",")})${(getAssoc)?',assoc':''}`;
    */

    // base url
    let url = `${p.protocol}://${p.server}:${p.port}${(slf.hasAttribute('proxyPath'))?slf.proxyPath:''}/api/arsys/v1/entry/${encodeURIComponent(p.schema)}/${p.ticket}/?fields=values(${p.fields.join(",")})`;

    /*
        associations:
            * getAssociations <bool> || array
              if null or boolean false: do nothing
              if boolean true: get a list of all associations   url += `,assoc`
              if array: get associationNames listed             url += `,assoc(getAssociations.join(','))`

            * expandAssociations <bool>
              if true and getAssociations is an array, expand (get fieldValues for) the associations listed in getAssociations
              url += `&expand=assoc(getAssociations.join(','))`
    */
    if (p.hasOwnProperty('getAssociations')){
        if (p.getAssociations === true){
            url += `,assoc`;
        }else if (p.getAssociations instanceof Array){
            let as = [];
            //p.getAssociations.forEach(function(v){ as.push(`'${v}'`); });
            as = p.getAssociations;
            if (p.hasOwnProperty('expandAssociations') && (p.expandAssociations === true)){
                url += `&expand=assoc(${as.join(',')})`;
            }else{
                url += `,assoc(${as.join(',')})`;
            }
        }
    }


    // log the url for debug
    if (slf.debug){ console.log(`[getTicket (endpoint)]: ${url}`); }

    let resp = await slf.fetch({
        endpoint:           url,
        method:             'GET',
        expectHtmlStatus:   200,
        timeout:            slf.timeout,
        headers:  {
            "Authorization":    `AR-JWT ${slf.token}`,
            "Content-Type":     "application/x-www-form-urlencoded",
            "Cache-Control":    "no-cache"
        },
        progressCallback:   (p.progressCallback instanceof Function)?p.progressCallback:null
    }).catch(function(e){
        e.thrownByFunction = 'getTicket';
        e.thrownByFunctionArgs =   (typeof(p) !== 'undefined')?p:{}
        throw(new noiceRemedyAPIException (e));
    });

    // parse the response
    let data;
    try {
        data = JSON.parse(resp.responseText);
    }catch(e){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `cannot parse server response (${JSON.stringify(resp).length}) bytes: ${e}`,
            thrownByFunction:       'getTicket',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    // get dem attachments yo
    if (p.fetchAttachments){
        let promiseKeeper = [];
        Object.keys(data.values).forEach(function(field){
            if (slf.isNotNull(data.values[field])){
                if ((typeof(data.values[field]) == 'object') && data.values[field].hasOwnProperty('name') && data.values[field].hasOwnProperty('sizeBytes')){
                    if (slf.debug){ console.log(`fetching attachment from field: ${field} with size: ${data.values[field].sizeBytes} and filename: ${data.values[field].name}`); }
                    promiseKeeper.push(
                        slf.getAttachment({
                            schema:     p.schema,
                            ticket:     p.ticket,
                            fieldName:  field,
                            progressCallback: (p.progressCallback instanceof Function)?p.progressCallback:null
                        }).then(function(dta){
                            data.values[field].data = dta;
                        })
                    );
                }
            }
        });
        await Promise.all(promiseKeeper);
    }
    return(data);

} // end getTicket




/*
    createTicket({
        schema:         <formName>
        fields:         { ... },
        attachments:    { fieldName: {fileObject} ... }
    })
*/
async createTicket(p){
    let slf = this;
    if (typeof p === 'undefined'){ p = {}; }

    // bounce if we're not authenticated
    if (! this.isAuthenticated){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `api handle is not authenticated`,
            thrownByFunction:       'createTicket',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    // flatten/check the args
    ['protocol', 'server', 'port', 'schema', 'fields'].forEach(function(f){
        if (!(p.hasOwnProperty(f) && slf.isNotNull(p[f]))){
            if (slf.hasAttribute(f)){
                p[f] = slf[f];
            }else{
                throw(new noiceRemedyAPIException ({
                    messageType:            'non-ars',
                    message:                `required argument missing: ${f}`,
                    thrownByFunction:       'createTicket',
                    thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
                }));
            }
        }
    });

    // we need fields to be an object of course
    if (typeof p.fields !== 'object'){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `required argument missing: 'fields' is not an object (${typeof(p.fields)})`,
            thrownByFunction:       'createTicket',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    let url = `${p.protocol}://${p.server}:${p.port}${(slf.hasAttribute('proxyPath'))?slf.proxyPath:''}/api/arsys/v1/entry/${encodeURIComponent(p.schema)}`;
    if (slf.debug){ console.log(`[createTicket (endpoint)]: ${url}`); }

    let fetchArgs = {
        endpoint:           url,
        method:             'POST',
        expectHtmlStatus:   201,
        timeout:            slf.timeout,
        content:            { values: p.fields },
        encodeContent:      true,
        headers:            {
            "Authorization":    `AR-JWT ${slf.token}`,
            "Content-Type":     "application/json",
            "Cache-Control":    "no-cache"
        }
    };

    /*
        LOH -- 11/25/19 @ 1708
        don't forget to try and hack sending attachments on here.

        RESUME -- 8/9/21 @ 1220
        FINALLY ... the Rock has returned ... to ATTACHMENTS!
        here's how it works.

        1) send the filename as the value to your attachment field in the fields argument
        2) your attachments object should look like this

        {
            'attachmentFieldName': {
                name:     <filename>
                content:  <the content of the file>
                encoding: <optional>
            }
        }

        if you are sending ACTUAL binary data you're gonna have to use FileReader.readAsDataURL()
        see here:
            https://developer.mozilla.org/en-US/docs/Web/API/FileReader/readAsDataURL
        you are gonna need to lop some bs off the front of the string. like this:

            let fileBase64Content = reader.result.replace(/(.+)base64,/,'');

        then fileBase64Content above would become file.content in the attachments object
        NOTE you are going to have to specify:

            encoding: 'BASE64'

        if you pull such shenanigans. If you're sending ascii ... like a CSV for instance (wink wink)
        you can just set the string on file.content, and you don't have to specify the encoding
    */
    if (p.hasOwnProperty('attachments') && (p.attachments instanceof Object)){
        let separator = this.getGUID().replaceAll('-', '');
        let fieldsJSON = JSON.stringify({ values: p.fields });
        fetchArgs.content =
`
--${separator}
Content-Disposition: form-data; name="entry"
Content-Type: application/json; charset=UTF-8
Content-Transfer-Encoding: 8bit

${fieldsJSON}

`;
        let that = this;
        Object.keys(p.attachments).forEach(function(fileFieldName){
            let file = p.attachments[fileFieldName];
            let encoding = (file.hasOwnProperty('encoding'))?file.encoding:'binary';
            fetchArgs.content +=
`
--${separator}
Content-Disposition: form-data; name="attach-${fileFieldName}"; filename="attach-${file.name}"
Content-Type: application/octet-stream
Content-Transfer-Encoding: ${encoding}

${file.content}
--${separator}--
`;
        });

        fetchArgs.encodeContent = false;
        fetchArgs.headers["Content-Type"] = `multipart/form-data;boundary=${separator}`;

    } // end handling attachments


    // as you were!
    let resp = await slf.fetch(fetchArgs).catch(function(e){
        e.thrownByFunction = 'createTicket';
        e.thrownByFunctionArgs =   (typeof(p) !== 'undefined')?p:{}
        throw(new noiceRemedyAPIException (e));
    });

    try {
        let tmp = resp.getResponseHeader('location').split('/');
        return({
            url:       resp.getResponseHeader('location'),
            entryId:   tmp[(tmp.length -1)]
        });
    }catch(e){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `failed to parse server response for record identification (create successful?): ${e}`,
            thrownByFunction:       'createTicket',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }
} // end createTicket




/*
    modifyTicket({
        schema:         <formName>,
        ticket:         <entryId>.
        fields:         {fieldName:fieldValue ... },
        attachments:    { fieldName: {fileObject} ... }
    });
*/
async modifyTicket(p){
    let slf = this;
    if (typeof p === 'undefined'){ p = {}; }

    // bounce if we're not authenticated
    if (! this.isAuthenticated){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `api handle is not authenticated`,
            thrownByFunction:       'modifyTicket',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    // flatten/check the args
    ['protocol', 'server', 'port', 'schema', 'fields', 'ticket'].forEach(function(f){
        if (!(p.hasOwnProperty(f) && slf.isNotNull(p[f]))){
            if (slf.hasAttribute(f)){
                p[f] = slf[f];
            }else{
                throw(new noiceRemedyAPIException ({
                    messageType:            'non-ars',
                    message:                `required argument missing: ${f}`,
                    thrownByFunction:       'modifyTicket',
                    thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
                }));
            }
        }
    });

    // we need fields to be an object of course
    if (typeof p.fields !== 'object'){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `required argument missing: 'fields' is not an object (${typeof(p.fields)})`,
            thrownByFunction:       'modifyTicket',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    let url = `${slf.protocol}://${slf.server}:${slf.port}${(slf.hasAttribute('proxyPath'))?slf.proxyPath:''}/api/arsys/v1/entry/${encodeURIComponent(p.schema)}/${p.ticket}`;
    if (slf.debug){ console.log(`[modifyTicket (endpoint)]: ${url}`); }

    let fetchArgs = {
        endpoint:           url,
        method:             'PUT',
        expectHtmlStatus:   204,
        timeout:            slf.timeout,
        content:            { values: p.fields },
        encodeContent:      true,
        headers:  {
            "Authorization":    `AR-JWT ${slf.token}`,
            "Content-Type":     "application/json",
            "Cache-Control":    "no-cache"
        }
    };


    /*
        handle attachments (see notes in createTicket -- same thing)
    */
    if (p.hasOwnProperty('attachments') && (p.attachments instanceof Object)){
        let separator = this.getGUID().replaceAll('-', '');
        let fieldsJSON = JSON.stringify({ values: p.fields });
        fetchArgs.content =
`
--${separator}
Content-Disposition: form-data; name="entry"
Content-Type: application/json; charset=UTF-8
Content-Transfer-Encoding: 8bit

${fieldsJSON}

`;
    let that = this;
    Object.keys(p.attachments).forEach(function(fileFieldName){
        let file = p.attachments[fileFieldName];
        let encoding = (file.hasOwnProperty('encoding'))?file.encoding:'binary';
        fetchArgs.content +=
`
--${separator}
Content-Disposition: form-data; name="attach-${fileFieldName}"; filename="attach-${file.name}"
Content-Type: application/octet-stream
Content-Transfer-Encoding: ${encoding}

${file.content}
--${separator}--
    `;
        });

        fetchArgs.encodeContent = false;
        fetchArgs.headers["Content-Type"] = `multipart/form-data;boundary=${separator}`;

    } // end handling attachments


    // as you were
    let resp = await slf.fetch(fetchArgs).catch(function(e){
        e.thrownByFunction = 'modifyTicket';
        e.thrownByFunctionArgs =   (typeof(p) !== 'undefined')?p:{}
        throw(new noiceRemedyAPIException (e));
    });

    // guess it worked?
    return(true);
}




/*
    deleteTicket({
        schema:     <formName>,
        ticket:     <entryID>
    })
*/
async deleteTicket(p){
    let slf = this;
    if (typeof p === 'undefined'){ p = {}; }

    // bounce if we're not authenticated
    if (! this.isAuthenticated){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `api handle is not authenticated`,
            thrownByFunction:       'deleteTicket',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    // flatten/check the args
    ['protocol', 'server', 'port', 'schema', 'ticket'].forEach(function(f){
        if (!(p.hasOwnProperty(f) && slf.isNotNull(p[f]))){
            if (slf.hasAttribute(f)){
                p[f] = slf[f];
            }else{
                throw(new noiceRemedyAPIException ({
                    messageType:            'non-ars',
                    message:                `required argument missing: ${f}`,
                    thrownByFunction:       'deleteTicket',
                    thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
                }));
            }
        }
    });

    let url = `${p.protocol}://${p.server}:${p.port}${(slf.hasAttribute('proxyPath'))?slf.proxyPath:''}/api/arsys/v1/entry/${encodeURIComponent(p.schema)}/${p.ticket}`;
    if (slf.debug){ console.log(`[deleteTicket (endpoint)]: ${url}`); }

    let resp = await slf.fetch({
        endpoint:           url,
        method:             'DELETE',
        expectHtmlStatus:   204,
        timeout:            slf.timeout,
        headers:  {
            "Authorization":    `AR-JWT ${slf.token}`,
            "Content-Type":     "application/json",
            "Cache-Control":    "no-cache"
        }
    }).catch(function(e){
        e.thrownByFunction = 'deleteTicket';
        e.thrownByFunctionArgs =   (typeof(p) !== 'undefined')?p:{}
        throw(new noiceRemedyAPIException (e));
    });

    // guess it worked, send back the ticket number we deleted why not?
    return(p.ticket);

    /*
        11/26/19 @ 1014
        y'know what'd be a cool feature would be an archive:<bool>
        argument, to have the thing fetch all the fields off the form
        before deleting and return that.

        dunno, gotta think on that.
        it might just be an entirely different meta function like
        archiveAndDelete() or something ...
    */
} // end deleteTicket




/*
mergeData({
    schema:                 <formName>
    fields:                 {fieldOne:valueOne, fieldTwo:valueTwo ...}
    QBE:                    <qualification> (optional)
    handleDuplicateEntryId: error | create | overwrite | merge | alwaysCreate (default error)
    ignorePatterns:         <bool> (default false)
    ignoreRequired:         <bool> (default false)
    workflowEnabled:        <bool> (default true)
    associationsEnabled:    <bool> (default true)
    multimatchOption:       error | useFirstMatching (default error)
})
*/
async mergeData(p){
    let slf = this;
    if (typeof p === 'undefined'){ p = {}; }

    // bounce if we're not authenticated
    if (! this.isAuthenticated){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `api handle is not authenticated`,
            thrownByFunction:       'mergeData',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    // flatten/check the args
    ['protocol', 'server', 'port', 'schema', 'fields'].forEach(function(f){
        if (!(p.hasOwnProperty(f) && slf.isNotNull(p[f]))){
            if (slf.hasAttribute(f)){
                p[f] = slf[f];
            }else{
                throw(new noiceRemedyAPIException ({
                    messageType:            'non-ars',
                    message:                `required argument missing: ${f}`,
                    thrownByFunction:       'mergeData',
                    thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
                }));
            }
        }
    });

    // we need fields to be an object of course
    if (typeof p.fields !== 'object'){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `required argument missing: 'fields' is not an object (${typeof(p.fields)})`,
            thrownByFunction:       'mergeData',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    // validate handleDuplicateEntryId (default "error")
    let mergeTypeDecoder = {
        error:          "DUP_ERROR",
        create:         "DUP_NEW_ID",
        overwrite:      "DUP_OVERWRITE",
        merge:          "DUP_MERGE",
        alwaysCreate:   "GEN_NEW_ID"
    };
    if (!((p.hasOwnProperty('handleDuplicateEntryId')) && slf.isNotNull(p.handleDuplicateEntryId) && (Object.keys(mergeTypeDecoder).indexOf(p.handleDuplicateEntryId) >= 0))){
        p.handleDuplicateEntryId = 'error';
    }

    // validate multimatchOption (default "error")
    let multimatchOptionDecoder = {
        error:              0,
        useFirstMatching:   1
    };
    if (!((p.hasOwnProperty('multimatchOption')) && slf.isNotNull(p.multimatchOption) && (Object.keys(multimatchOptionDecoder).indexOf(p.multimatchOption) >= 0))){
        p.multimatchOption = 'error';
    }

    // she.done.already.done.had.herses
    let url = `${p.protocol}://${p.server}:${p.port}${(slf.hasAttribute('proxyPath'))?slf.proxyPath:''}/api/arsys/v1/mergeEntry/${encodeURIComponent(p.schema)}`;
    if (slf.debug){ console.log(`[mergeData (endpoint)]: ${url}`); }

    let body = {
        values:         p.fields,
        mergeOptions:   {
            mergeType:              mergeTypeDecoder[p.handleDuplicateEntryId],
            multimatchOption:       multimatchOptionDecoder[p.multimatchOption],
            ignorePatterns:         (p.hasOwnProperty('ignorePatterns') && p.ignorePatterns === true),
            ignoreRequired:         (p.hasOwnProperty('ignoreRequired') && p.ignoreRequired === true),
            workflowEnabled:        (! (p.hasOwnProperty('workflowEnabled') && p.workflowEnabled === true)),
            associationsEnabled:    (! (p.hasOwnProperty('associationsEnabled') && p.associationsEnabled === true))
        }
    };
    if (p.hasOwnProperty('QBE') && (slf.isNotNull(p.QBE))){ body.qualification = p.QBE; }

    let resp = await slf.fetch({
        endpoint:           url,
        method:             'POST',
        expectHtmlStatus:   [201, 204],
        timeout:            slf.timeout,
        headers: {
            "Authorization":    `AR-JWT ${slf.token}`,
            "Content-Type":     "application/json",
            "Cache-Control":    "no-cache"
        },
        content: body,
        encodeContent: true
    }).catch(function(e){
        e.thrownByFunction = 'mergeData';
        e.thrownByFunctionArgs =   (typeof(p) !== 'undefined')?p:{}
        throw(new noiceRemedyAPIException (e));
    });

    try {
        let parse = resp.getResponseHeader('location').split('/');
        return({
            url:        resp.getResponseHeader('location'),
            entryId:    parse[(parse.length -1)]
        });
    }catch (e){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `failed to parse server response for record identification (create successful?): ${e}`,
            thrownByFunction:       'mergeData',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }
} // end mergeData




/*
    getFormOptions({
        schema: <schemaName>
    })
    https://docs.bmc.com/docs/ars2002/endpoints-in-ar-rest-api-909638176.html
    well ... ok ... I'm not sure how this is useful?
    but it's in the docs, so why not ...
*/
async getFormOptions(p){
    let slf = this;
    if (typeof p === 'undefined'){ p = {}; }

    // bounce if we're not authenticated
    if (! this.isAuthenticated){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `api handle is not authenticated`,
            thrownByFunction:       'getFormFields',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    // flatten/check the args
    ['protocol', 'server', 'port', 'schema'].forEach(function(f){
        if (!(p.hasOwnProperty(f) && slf.isNotNull(p[f]))){
            if (slf.hasAttribute(f)){
                p[f] = slf[f];
            }else{
                throw(new noiceRemedyAPIException ({
                    messageType:            'non-ars',
                    message:                `required argument missing: ${f}`,
                    thrownByFunction:       'getFormOptions',
                    thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
                }));
            }
        }
    });

    let url = `${p.protocol}://${p.server}:${p.port}${(slf.hasAttribute('proxyPath'))?slf.proxyPath:''}/api/arsys/v1.0/entry/${encodeURIComponent(p.schema)}`;
    if (slf.debug){ console.log(`[getFormOptions (endpoint)]: ${url}`); }

    let resp = await slf.fetch({
        endpoint:           url,
        method:             'OPTIONS',
        expectHtmlStatus:   200,
        timeout:            slf.timeout,
        headers:  {
            "Authorization":    `AR-JWT ${slf.token}`,
            "Content-Type":     "application/json",
            "Cache-Control":    "no-cache"
        }
    }).catch(function(e){
        e.thrownByFunction = 'getFormOptions';
        e.thrownByFunctionArgs =   (typeof(p) !== 'undefined')?p:{}
        throw(new noiceRemedyAPIException (e));
    });
    return(resp.responseText);
}




/*
    getMenu({name: <menuName>})
    returns meta-data about the specified menu
    use getMenuValues() to get the actual menu content

    see this (strangely detailed for BMC) documentation:
    https://docs.bmc.com/docs/ars2002/example-of-using-the-rest-api-to-retrieve-menu-details-909638136.html

    some notes about return data struct: {
        menu_type:      <Query|...>
        refresh_code:   <?>
        menu_information: {
            qualification_current_fields: [ fieldId, ... ],
            qualification_keywords: [ keyWord ... ]
        }
    }

    menu_information.qualification_current_fields contains an array of the field_id's you can replace in the qualification
    this array will be null if you have a menu with no qualification replacement inputs

    <root>.qualification_string contains the verbatim QBE in the menu definition so I guess you could parse it if ya want

    menu_information.qualification_keywords seems to be the same thing for keywords, which I've never fully understood anyhow

    menu_type will be one of these:
        Sql     (yes, really initcapped)
        Search
        File
        DataDictionary
        List   (aka "Character Manu")

    refresh_codes:
        1:  On Connect
        2:  On Open
        3:  On 15 Minute Interval


*/
async getMenu(p){
    let slf = this;
    if (typeof p === 'undefined'){ p = {}; }

    // bounce if we're not authenticated
    if (! this.isAuthenticated){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `api handle is not authenticated`,
            thrownByFunction:       'getMenu',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    // flatten/check the args
    ['protocol', 'server', 'port', 'name'].forEach(function(f){
        if (!(p.hasOwnProperty(f) && slf.isNotNull(p[f]))){
            if (slf.hasAttribute(f)){
                p[f] = slf[f];
            }else{
                throw(new noiceRemedyAPIException ({
                    messageType:            'non-ars',
                    message:                `required argument missing: ${f}`,
                    thrownByFunction:       'getMenu',
                    thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
                }));
            }
        }
    });

    let url = `${p.protocol}://${p.server}:${p.port}${(slf.hasAttribute('proxyPath'))?slf.proxyPath:''}/api/arsys/v1.0/menu/${encodeURIComponent(p.name)}`;
    if (slf.debug){ console.log(`[getMenu (endpoint)]: ${url}`); }

    let resp = await slf.fetch({
        endpoint:           url,
        method:             'GET',
        expectHtmlStatus:   200,
        timeout:            slf.timeout,
        headers:  {
            "Authorization":    `AR-JWT ${slf.token}`,
            "Content-Type":     "application/json",
            "Cache-Control":    "no-cache"
        }
    }).catch(function(e){
        e.thrownByFunction = 'getMenu';
        e.thrownByFunctionArgs =   (typeof(p) !== 'undefined')?p:{}
        throw(new noiceRemedyAPIException (e));
    });
    try{
        return(JSON.parse(resp.responseText));
    }catch(e){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `failed to parse JSON response from server?: ${e}`,
            thrownByFunction:       'getMenu',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{},
        }));
    }
}




/*
    getMenuValues({
        name:   <menuName>,
        qualification_substitute_info: { <object> }
    })

    there's not a lot of detail about qualification_substitute_info
    in the documentation but this is the example given there, so one
    presumes at least form_name:<str>, field_values:{}, and keyword_values:{}
    keys are supported.

        qualification_substitute_info: {
            form_name: "TestForm_dfb88",
            field_values: {
              "536870915": 100
            },
            keyword_values: {
              "USER": "Demo"
            }
        }

    TRIAL & ERROR ANECTODE:
    form_name needs to be the form owning the field values that you wish to replace in the qualification.
    For instance if you've got a menu with a qualification like this from the recipe demo:

        [primary ui form]           noice:demo:recipe
        [supporting table form]     noice:demo:recipe:ingredient

    now say on your primary form you have a field: 536870919
    and on a menu you have a qualification like this: 'recipe Entry ID' = $536870919$
    where 'recipe Entry ID' is the foreign key on your supporting table that links the rows to the parent

    NOW ... say you want to retrieve the ingredient list for the noice:demo:recipe row where '1' = "000000000000003"

    this will work:
    qualification_substitute_info: {
        form_name: 'noice:demo:recipe',
       	field_values: {
          '536870919': "000000000000003"
        }
      }

    NOTE: some things:

        1) you can't use the system field '1' [Entry ID] in the menu qualification
           it'll work inside ARS, but the API will return an empty string. that's why
           I created a BS field: 536870919. System fields need not apply, but I suspect
           the bug is more sinister ... any field-id replicated between your supposed "calling"
           form (even though the menu would have no concept of that), and your data target form
           gets total confusion server side. I'll guarantee it like the men's warehouse.

        2) the menu points at noice:demo:recipe:ingredient, but you have to specify
           the form from which you might call the menu, which is the form with the BS
           field on it: 536870919, that is noice:demo:recipe. Which makes NO DAMN SENSE
           but ok, BMC ...

    some more things. hooo boy, the return data structure is fun AF!
    here's one with two 'Label Fields' specified.
    {
        items: [
            {
                type:   <SubMenu|?>
                label:  <string menu entry value>,
                content: [
                    {
                        type:   <Value|?>
                        label:  <string menu entry value>,
                        value:  <associated value>
                    }
                ]
            },
            ...
        ]
    }
    basically type gets "SubMenu" or "Value". If there's just one field in the 'Label Fields' section
    it looks like this:
    {
        items: [
            {
                type: 'Value',
                label:  <string>
                value: <string>
            }
        ]
    }
*/
async getMenuValues(p){
    let slf = this;
    if (typeof p === 'undefined'){ p = {}; }

    // bounce if we're not authenticated
    if (! this.isAuthenticated){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `api handle is not authenticated`,
            thrownByFunction:       'getMenuValues',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    // check the args
    ['name'].forEach(function(f){
        if (!(p.hasOwnProperty(f))){
            throw(new noiceRemedyAPIException ({
                messageType:            'non-ars',
                message:                `required argument missing: ${f}`,
                thrownByFunction:       'getMenuValues',
                thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
            }));
        }
    });

    let url = `${slf.protocol}://${slf.server}:${slf.port}${(slf.hasAttribute('proxyPath'))?slf.proxyPath:''}/api/arsys/v1.0/menu/expand`;
    if (slf.debug){ console.log(`[getMenuValues (endpoint)]: ${url}`); }

    let resp = await slf.fetch({
        endpoint:           url,
        method:             'POST',
        expectHtmlStatus:   200,
        timeout:            slf.timeout,
        encodeContent:      true,
        content:            p,
        headers:  {
            "Authorization":    `AR-JWT ${slf.token}`,
            "Content-Type":     "application/json",
            "Cache-Control":    "no-cache"
        },
    }).catch(function(e){
        e.thrownByFunction = 'getMenuValues';
        e.thrownByFunctionArgs =   (typeof(p) !== 'undefined')?p:{}
        throw(new noiceRemedyAPIException (e));
    });

    try{
        return(JSON.parse(resp.responseText));
    }catch(e){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `failed to parse JSON response from server?: ${e}`,
            thrownByFunction:       'getMenuValues',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{},
        }));
    }
}




/*
    getFormFields({
        schema:     <schemaName>,
        fetchMenus: <bool>
    })

        * schema:       the schema (or 'form' if you like), to get fields for
        * fetchMenus:   if true, execute getMenu on any menus referenced by fields, and include

    return data structure: {
        idIndex:    { <field.id>:<{field}>},
        nameIndex:  { <field.name>:<{field}>},
        menus:      { <menuName}:<{menuDef>}
    }

    see:
    https://docs.bmc.com/docs/ars2002/endpoints-in-ar-rest-api-909638176.html
*/
async getFormFields(p){
    let slf = this;
    if (typeof p === 'undefined'){ p = {}; }

    // bounce if we're not authenticated
    if (! this.isAuthenticated){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `api handle is not authenticated`,
            thrownByFunction:       'getFormFields',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
        }));
    }

    // flatten/check the args
    ['protocol', 'server', 'port', 'schema'].forEach(function(f){
        if (!(p.hasOwnProperty(f) && slf.isNotNull(p[f]))){
            if (slf.hasAttribute(f)){
                p[f] = slf[f];
            }else{
                throw(new noiceRemedyAPIException ({
                    messageType:            'non-ars',
                    message:                `required argument missing: ${f}`,
                    thrownByFunction:       'getFormFields',
                    thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
                }));
            }
        }
    });

    let url = `${p.protocol}://${p.server}:${p.port}${(slf.hasAttribute('proxyPath'))?slf.proxyPath:''}/api/arsys/v1.0/fields/${encodeURIComponent(p.schema)}`;
    if (slf.debug){ console.log(`[getFormFields (endpoint)]: ${url}`); }

    let resp = await slf.fetch({
        endpoint:           url,
        method:             'GET',
        expectHtmlStatus:   200,
        timeout:            slf.timeout,
        headers:  {
            "Authorization":    `AR-JWT ${slf.token}`,
            "Content-Type":     "application/json",
            "Cache-Control":    "no-cache"
        }
    }).catch(function(e){
        e.thrownByFunction = 'getFormFields';
        e.thrownByFunctionArgs =   (typeof(p) !== 'undefined')?p:{}
        throw(new noiceRemedyAPIException (e));
    });

    // new hotness: fetchMenus
    let menus = {};
    if (p.hasOwnProperty('fetchMenus') && (p.fetchMenus == true)){
        let menusToGet = {};
        try {
            let tmp = JSON.parse(resp.responseText);
            tmp.forEach(function(fieldDef){
                if (
                    (fieldDef instanceof Object) &&
                    fieldDef.hasOwnProperty('limit') &&
                    (fieldDef.limit instanceof Object) &&
                    (fieldDef.limit.hasOwnProperty('char_menu')) &&
                    (slf.isNotNull(fieldDef.limit.char_menu))
                ){
                    // push a getMenu here
                    menusToGet[fieldDef.limit.char_menu] = true;
                }
            });
        }catch(e){
            throw(new noiceRemedyAPIException ({
                messageType:            'non-ars',
                message:                `failed to parse fieldList JSON from server? (in fetchMenus): ${e}`,
                thrownByFunction:       'getFormFields',
                thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{},
            }));
        }
        let pk = [];
        let menuErrors = [];
        Object.keys(menusToGet).forEach(function(menuName){
            pk.push(new Promise(function(toot, boot){
                let abrt = false;
                slf.getMenu({name: menuName}).catch(function(error){
                    abrt = true;
                    menuErrors.push(error);
                    if (slf.debug){ console.log(`${this._className} | getFormFields()/fetchMenus(${menuName}) | error: ${error}`); }
                    boot(false);
                }).then(function(menuDef){
                    if (! abrt){
                        menus[menuName] = menuDef;
                        toot(true);
                    }
                })
            }))
        });
        await Promise.all(pk).catch(function(error){
            throw(new noiceRemedyAPIException ({
                messageType:            'non-ars',
                message:                `failed to retrieve menus (multiple errors)`,
                thrownByFunction:       'getFormFields',
                thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{},
                errors:                 menuErrors
            }));
        });
    }

    // send it back
    try {
        let tmp = JSON.parse(resp.responseText);
        let formDefinition = {idIndex: {}, nameIndex: {}};
        tmp.forEach(function(field){
            formDefinition.idIndex[field.id] = field;
            formDefinition.nameIndex[field.name] = field;
        });
        if (Object.keys(menus).length > 0){ formDefinition.menus = menus; }
        return(formDefinition);
    }catch(e){
        throw(new noiceRemedyAPIException ({
            messageType:            'non-ars',
            message:                `failed to parse fieldList JSON from server?: ${e}`,
            thrownByFunction:       'getFormFields',
            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{},
        }));
    }
}




/*
    getRelatedFormsAndMenus({ schema: <schemaName> })
    this retrieves formFields for the given schemaName,
    and also recurses to find forms related to tables,
    and menus related to fields

    return data structure: {
        forms:  {
            <schemaName>: {
                idIndex:    { <field.id>:<{field}>},
                nameIndex:  { <field.name>:<{field}>},

            }, ...
        },
        menus:  {
            <menuName>:<{arsMenuDef}>,
            ...
        }
    }
*/
getRelatedFormsAndMenus(p){
    let that = this;
    return(new Promise(function(toot, boot){

        // bounce if we're not authenticated
        if (! that.isAuthenticated){
            abort = true;
            boot(new noiceRemedyAPIException ({
                messageType:            'non-ars',
                message:                `api handle is not authenticated`,
                thrownByFunction:       'getFormDefinitions',
                thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
            }));

        // bounce if we don't have 'schema' input
        }else if (! (
            (p instanceof Object) &&
            p.hasOwnProperty('schema') &&
            that.isNotNull(p.schema)
        )){
            boot(new noiceRemedyAPIException ({
                messageType:            'non-ars',
                message:                `schema is a required input`,
                thrownByFunction:       'getRelatedFormsAndMenus',
                thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{}
            }));

        // recursively get forms ...
        }else{

            let abort = false;
            let out = { forms: {}, menus: {} };
            that.getFormFields({schema: p.schema, fetchMenus: true}).catch(function(error){
                abort = true;
                error.message = `getRelatedFormsAndMenus(${p.schema}) | ${error.message}`;
                boot(error);
            }).then(function(formDefinition){
                if (! abort){
                    // insert the given form & menus into the return datastructure
                    if (formDefinition.menus instanceof Object){
                        Object.keys(formDefinition.menus).forEach(function(menuName){
                            out.menus[menuName] = formDefinition.menus[menuName]
                        });
                        delete(formDefinition.menus);
                    }
                    out.forms[p.schema] = formDefinition;

                    // get a distinct list of referenced forms
                    let formsToGet = {};
                    Object.keys(out.forms[p.schema].idIndex).forEach(function(fieldID){
                        let fieldDef = out.forms[p.schema].idIndex[fieldID];
                        if (
                            (fieldDef instanceof Object) &&
                            fieldDef.hasOwnProperty('datatype') &&
                            (fieldDef.datatype == 'TABLE') &&
                            (fieldDef.hasOwnProperty('limit')) &&
                            (fieldDef.limit instanceof Object) &&
                            (fieldDef.limit.hasOwnProperty('source_form')) &&
                            that.isNotNull(fieldDef.limit.source_form) &&
                            (! (out.forms.hasOwnProperty(fieldDef.limit.source_form)))
                        ){
                            // we found a form to get
                            formsToGet[fieldDef.limit.source_form] = true;
                        }
                    });

                    // await recursion
                    let pk = [];
                    let pkErrors = [];
                    Object.keys(formsToGet).forEach(function(formName){
                        pk.push(new Promise(function(t,b){
                            let abrt = false;
                            that.getRelatedFormsAndMenus({schema: formName}).catch(function(error){
                                abrt = true;
                                pkErrors.push(error);
                                if (that.debug){ console.log(`${that._className} | getRelatedFormsAndMenus(${formName}) | error: ${error}`); }
                                b(false);
                            }).then(function(recurseOut){
                                if (! abrt){

                                    // merge recursion result with output
                                    ['menus', 'forms'].forEach(function(kind){
                                        if (recurseOut[kind] instanceof Object){
                                            Object.keys(recurseOut[kind]).forEach(function(thing){
                                                out[kind][thing] = recurseOut[kind][thing];
                                            })
                                        }
                                    });
                                    t(true);
                                }
                            })
                        }))
                    });
                    let pkAbort = false;
                    Promise.all(pk).catch(function(error){
                        pkAbort = true;
                        boot(new noiceRemedyAPIException ({
                            messageType:            'non-ars',
                            message:                `recursion failed (multiple, see 'errors')`,
                            thrownByFunction:       'getRelatedFormsAndMenus',
                            thrownByFunctionArgs:   (typeof(p) !== 'undefined')?p:{},
                            errors:                 pkErrors
                        }));
                    }).then(function(){
                        if (! pkAbort){
                            toot(out);
                        }
                    });
                } // end getFormFields abort check
            });
        } // end input validation else
    }));
}




} // end noiceRemedyAPI class
export { noiceRemedyAPIException, noiceRemedyAPI };
