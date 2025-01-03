/*
    this is a client for noiceARSSyncWorkerThread
    12/22/23 - start work
*/

import { noiceCoreUtility, noiceException, noiceObjectCore } from './noiceCore.js';
import { noiceIndexedDB } from './noiceIndexedDB.js';

class noiceARSSyncWorkerClient extends noiceCoreUtility {




/*
    constructor({
        _app: <noiceApplicationCore>,
        threadName: <nameOfARSSyncWorkerThreadIn_app>,
        threadInfo:   <noiceARSSyncWorkerThread.getThreadInfo() output>
        messageHandler: <function(data)>
    })
*/
constructor(args, defaults, callback){
    super(args, noiceObjectCore.mergeClassDefaults({
        _version: 1,
        _className: 'noiceARSSyncWorkerClient',
        _app: null,
        _hasThreadInfo: false,
        debug: false,
        threadName: null,
        threadInfo:   {},
        messageHandler: null,
        DBs: {}
    },defaults),callback);
}




/*
    CRUD!
    --------------------------------------------------------------------------------
*/




/*
    getARSRow({
        schema: <str>,
        ticket: <str>,
        fields: [<str>,<str>,...],
        returnFormat: <enum: raw|fieldName|fieldID> (default fieldName),
        returnChanges: <bool> (default: false),
        bypassFilters: <bool> (default: false)
    })

    this emulates noiceRemedyAPI.getTicket() args
    for now, pulls data out of the appropriate indexedDB instance
    in the future this might multiplex an optional server-query-first
    more traditional cache mechanism

    returned data format is controlled by returnFormat:
        * raw -> gives you exactly what's in the dataStore
        * fieldName -> converts all fields to ARS fieldName (if present in config, else raw row column name)
        * fieldID -> converts everything to numeric fieldID (again if present in config, else raw)

    if returnChanges is set true, we also return the content of the writeQueue for this schema and record:
    _changes: [ arrayOfWriteQueueEntries ]

    if bypassFilters is set true, do not pass the row through dbOutputFilter

*/
getARSRow(args){
    let that = this;
    return(new Promise((toot, boot) => {

        if (
            (args instanceof Object) &&
            args.hasOwnProperty('schema') &&
            that.isNotNull(args.schema) &&
            (that.threadInfo instanceof Object) &&
            (that.threadInfo.formDBMappings instanceof Object) &&
            that.threadInfo.formDBMappings.hasOwnProperty(args.schema) &&
            args.hasOwnProperty('ticket') &&
            that.isNotNull(args.ticket)
        ){

            that.DBs[that.threadInfo.formDBMappings[args.schema].dbTagName].get({
                storeName: that.threadInfo.formDBMappings[args.schema].storeName,
                indexName: 'entryId',
                key: args.ticket
            }).then((row) => {
                that.dbOutputFilter(args.schema, row, (args.hasOwnProperty('bypassFilters') && (args.bypassFilters === true)), args.hasOwnProperty('dateFormat')?args.dateFormat:null ).then((row) => {
                    let out = {};
                    // fetch the writeQueue if we're supposed to
                    new Promise((_t,_b) => {
                        if (args.hasOwnProperty('returnChanges') && (args.returnChanges === true)){
                            that.DBs.internalDB.getAll({
                                storeName: 'writeQueue',
                                indexName: 'schemaEntryId',
                                query: IDBKeyRange.only([args.schema, args.ticket])
                            }).then((rows) =>{
                                out._changes = rows;
                                _t(true);
                            }).catch((error) => {
                                // note should not happen as no-match is just an empty array so this real-deal bad time stuff here
                                _b(error);
                            });
                        }else{
                            _t(true);
                        }
                    }).then(() => {

                        let fields = (args.fields instanceof Array)?args.fields:[];
                        let mode = args.hasOwnProperty('returnFormat')?args.returnFormat:'fieldName';
                        switch (mode){
                            case 'raw':
                                toot(Object.assign(out, that.filterRequestedFields(args.schema, fields, row)));
                                break;
                            case 'fieldName':
                                toot(Object.assign(out, that.convertDBRowToFieldNames(args.schema, that.filterRequestedFields(args.schema, fields, row))));
                                break;
                            case 'fieldID':
                                toot(Object.assign(out, that.convertDBRowToFieldIDs(args.schema, that.filterRequestedFields(args.schema, fields, row))));
                            default:
                                if (that.debug){that._app.log(`${that._className} v${that._version} | getARSRow(${JSON.stringify(args)}) | invalid 'returnFormat' specified`);}
                                boot(`invalid 'returnFormat' specified`);
                        }
                    }).catch((error) => {
                        that._app.log(`${that._className} v${that._version} | getARSRow(${JSON.stringify(args)}) | indexedDB.getAll() threw unexpectedly fetching requested writeQueue: ${error}`);
                        boot(error);
                    });
                }).catch((error) => {
                    // dbOutputFilter error
                    that._app.log(`${that._className} v${that._version} | getARSRow(${JSON.stringify(args)}) | dbOutputFilter threw unexpectedly: ${error}`);
                    boot(error);
                });
            }).catch((error) => {
                if (that.debug){that._app.log(`${that._className} v${that._version} | getARSRow(${JSON.stringify(args)}) | query failed: ${error}`);}
                boot(error);
            });

        }else{
            if (that.debug){that._app.log(`${that._className} v${that._version} | getARSRow(${JSON.stringify(args)}) | invalid input args`);}
            boot('invalid input args');
        }
    }));
}




/*
    getAllARSRows({
        schema: <str>,
        fields: [<str>, <str>, ...],
        indexName: <str (optional)>,
        query: <IDBKeyRange (optional)>,
        count: <int (optional)>,
        returnFormat: <enum: raw|fieldName|fieldID> (default fieldName),
        returnChanges: <bool> (default: false),
        bypassFilters: <bool> (default: false)
    })

    this is sort of like a query? it allows you to do the equivalent of noiceIndexedDB.getAll() but
    against a schema with otherwise the same options as getARSRow(). So like ... real simple queries
    perhaps against complex indexes. See also the openCursor for more extensible options

    if bypassFilters is set true, don't pass output rows through dbOutputFilter
*/
getAllARSRows(args){
    let that = this;
    return(new Promise((toot, boot) => {
        if (
            (args instanceof Object) &&
            args.hasOwnProperty('schema') &&
            that.isNotNull(args.schema) &&
            (that.threadInfo instanceof Object) &&
            (that.threadInfo.formDBMappings instanceof Object) &&
            that.threadInfo.formDBMappings.hasOwnProperty(args.schema) &&
            (! (
                args.hasOwnProperty('returnFormat') &&
                (['raw', 'fieldName', 'fieldID'].indexOf(args.returnFormat) < 0)
            ))
        ){

            // get the db instance and the function args together
            let dbi = that.getDBInstance(args.schema);
            let funcArgs = { storeName: that.threadInfo.formDBMappings[args.schema].storeName };
            ['indexName', 'query', 'count'].filter((a)=>{return(args.hasOwnProperty(a))}).forEach((a) => {funcArgs[a] = args[a]; });

            // execute the indexedDB function
            dbi.getAll(funcArgs).then((bros) => {

                let rows = [];
                Promise.all(bros.map((row) =>{
                    return(new Promise((_t, _b) => {
                        that.dbOutputFilter(args.schema, row, (args.hasOwnProperty('bypassFilters') && (args.bypassFilters === true)), args.hasOwnProperty('dateFormat')?args.dateFormat:null).then((fRow) => {
                            rows.push(fRow);
                            _t(true);
                        }).catch((error) => {
                            that._app.log(`${that._className} v${that._version} | getAllARSRows(${JSON.stringify(args)}) | dbOutputFilter() threw unexpectedly on ${row.entryId} | ${error}`);
                            _b(error);
                        });
                    }));
                })).then(() => {

                    // fetch the writeQueue if we're supposed to
                    new Promise((_t,_b) => {
                        if (args.hasOwnProperty('returnChanges') && (args.returnChanges === true)){

                            let pk = [];
                            rows.forEach((row) => {
                                pk.push(new Promise((__t, __b) => {
                                    that.DBs.internalDB.getAll({
                                        storeName: 'writeQueue',
                                        indexName: 'schemaEntryId',
                                        query: IDBKeyRange.only([args.schema, row.entryId])
                                    }).then((wqRows) =>{
                                        row._changes = wqRows;
                                        __t(true);
                                    }).catch((error) => {
                                        // note should not happen as no-match is just an empty array so this real-deal bad time stuff here
                                        that._app.log(`${that._className} v${that._version} | getAllARSRows(${JSON.stringify(args)}) | returnChanges option | indexedDB.getAll(writeQueue) threw unexpectedly on entryId: ${row.entryId}: ${error}`);
                                        __b(error);
                                    });
                                }));
                            });
                            Promise.all(pk).then(() => {_t(true); }).catch((error) => { _b(error); });

                        }else{
                            _t(true);
                        }
                    }).then(() => {

                        // munge rows for specified format and selected fields
                        let fields = (args.fields instanceof Array)?args.fields:[];
                        let mode = args.hasOwnProperty('returnFormat')?args.returnFormat:'fieldName';
                        toot(rows.map((row) => {
                            switch (mode){
                                case 'raw':
                                    return(that.filterRequestedFields(args.schema, fields, row));
                                    break;
                                case 'fieldName':
                                    return(that.convertDBRowToFieldNames(args.schema, that.filterRequestedFields(args.schema, fields, row)));
                                    break;
                                case 'fieldID':
                                    return(that.convertDBRowToFieldIDs(args.schema, that.filterRequestedFields(args.schema, fields, row)));
                                    break;
                            }
                        }));

                    }).catch((error) => {
                        // error - indexedDB.getAll() threw
                        that._app.log(`${that._className} v${that._version} | getAllARSRows(${JSON.stringify(args)}) | returnChanges option threw unexpectedly: ${error}`);
                        boot(error);
                    });

                }).catch((error) => {
                    that._app.log(`${that._className} v${that._version} | getAllARSRows(${JSON.stringify(args)}) | one or more rows failed dbOutputFilter() unexpectedly (see log): ${error}`);
                    boot(error);
                });

            }).catch((error) => {
                // error - indexedDB.getAll() threw
                that._app.log(`${that._className} v${that._version} | getAllARSRows(${JSON.stringify(args)}) | indexedDB.getAll() threw unexpectedly: ${error}`);
                boot(error);
            });
        }else{
            // error - invalid input
            that._app.log(`${that._className} v${that._version} | getAllARSRows(${JSON.stringify(args)}) | invalid input`)
            boot('invalid input');
        }
    }));
}




/*
    modifyARSRow({
        schema: <str>,
        ticket: <str>,
        fields: { <fieldName>:<value>, ... }
    })

    emulates noiceRemedyAPI.modifyTicket() args
    what it says on the tin. Modifies a row in the local indexedDB instance where the
    dataStore corresponding to the specified schema resides. This handles updating both
    the in-table row as well as adding the appropriate transaction to the arsSyncWorker's
    writeQueue

    note fields can be fieldName or fieldID spefified columns
*/
modifyARSRow(args){
    let that = this;
    return(new Promise((toot, boot) => {
        if (
            (args instanceof Object) &&
            args.hasOwnProperty('schema') &&
            that.isNotNull(args.schema) &&
            (that.threadInfo instanceof Object) &&
            (that.threadInfo.formDBMappings instanceof Object) &&
            that.threadInfo.formDBMappings.hasOwnProperty(args.schema) &&
            args.hasOwnProperty('ticket') &&
            that.isNotNull(args.ticket) &&
            (args.fields instanceof Object) &&
            (Object.keys(args.fields).length > 0)
        ){

            // step one: fetch the existing row
            that.DBs[that.threadInfo.formDBMappings[args.schema].dbTagName].get({
                storeName: that.threadInfo.formDBMappings[args.schema].storeName,
                indexName: 'entryId',
                key: args.ticket
            }).then((row) => {

                /*
                    NOTE: we might want a mechanism like filters here
                    which is to say, externally defined code chunks that
                    fire on modify or rows on a specific form that are
                    capable of changing values on the way into the database
                    or throwing errors and aborting the write.

                    that's a big chunk of complication. Think it's a great idea
                    but later. not today -Amy 1/5/23 @ 1414
                */

                // step two: convert given fields to row (raw) format
                let dbRow = null;
                try {
                    dbRow = that.convertFieldNamesToDBRow(args.schema, args.fields);
                }catch(error){
                    // error - failed to convert fields to dbRow format
                    that._app.log(`${that._className} v${that._version} | modifyARSRow(${JSON.stringify(args)}) | convertFieldNamesToDBRow() threw unexpectedly: ${error}`);
                }
                if (that.isNotNull(dbRow)){

                    // step two point five: pass it through the dbInputFilter
                    that.dbInputFilter(args.schema, dbRow).then((dbRoow) => {

                        // step three: convert given fields to writeQueue entry
                        let wqFields = that.convertDBRowToFieldIDs(args.schema, dbRoow);
                        if ((wqFields instanceof Object) && (Object.keys(wqFields).length > 0)){

                            let modDateHiRes = that.epochTimestamp(true);

                            // step four: write the writeQueue entry
                            that.DBs.internalDB.put({
                                storeName: 'writeQueue',
                                object: {
                                    entryId: args.ticket,
                                    schema:  args.schema,
                                    transactionType: 'modify',
                                    transactionDate: modDateHiRes,
                                    status: 'queued',
                                    fields: wqFields
                                }
                            }).then(() => {

                                // update modified date field
                                dbRoow[that.threadInfo.formIndexMappings.hasOwnProperty('6')?that.threadInfo.formIndexMappings['6']:6] = Math.floor(modDateHiRes/1000);

                                // step five: write changes to target dataStore
                                that.DBs[that.threadInfo.formDBMappings[args.schema].dbTagName].put({
                                    storeName: that.threadInfo.formDBMappings[args.schema].storeName,
                                    object: Object.assign(row, dbRoow)
                                }).then(() => {

                                    // all good we out
                                    if (that.debug){ that._app.log(`${that._className} v${that._version} | modifyARSRow(${JSON.stringify(args)}) | success!`); }
                                    toot(true);

                                }).catch((error) => {
                                    that._app.log(`${that._className} v${that._version} | modifyARSRow(${JSON.stringify(args)}) | failed to update targetForm entry: ${error}`);
                                    boot('failed to modify targetForm entry');
                                });
                            }).catch((error) => {
                                that._app.log(`${that._className} v${that._version} | modifyARSRow(${JSON.stringify(args)}) | failed to create writeQueue entry: ${error}`);
                                boot('failed to create writeQueue entry');
                            });
                        }else{
                            that._app.log(`${that._className} v${that._version} | modifyARSRow(${JSON.stringify(args)}) | convertDBRowToFieldIDs() threw unexpectedly: ${error}`);
                            boot('failed to convert fields to writeQueue entry');
                        }
                    }).catch((error) => {
                        that._app.log(`${that._className} v${that._version} | modifyARSRow(${JSON.stringify(args)})| dbInputFilter() threw unexpectedly: ${error}`);
                        boot(`dbInputFilter threw unexpectedly`);
                    });
                }else{
                    boot(`failed to convert fieldNames to dbRow format`);
                }
            }).catch((error) => {
                // error - failed to fetch requested row
                if (that.debug){that._app.log(`${that._className} v${that._version} | modifyARSRow(${JSON.stringify(args)}) | failed to fetch row to modify from db: ${error}`);}
                boot(error);
            });
        }else{
            // error - invalid input
            that._app.log(`${that._className} v${that._version} | modifyARSRow(${JSON.stringify(args)}) | invalid input`)
            boot('invalid input');
        }
    }));
}




/*
    createARSRow({
        schema: <str>,
        fields: { <fieldName>:<value>, ...}
    })
*/
createARSRow(args){
    let that = this;
    return(new Promise((toot, boot) => {
        if (
            (args instanceof Object) &&
            args.hasOwnProperty('schema') &&
            that.isNotNull(args.schema) &&
            (that.threadInfo instanceof Object) &&
            (that.threadInfo.formDBMappings instanceof Object) &&
            that.threadInfo.formDBMappings.hasOwnProperty(args.schema) &&
            (args.fields instanceof Object) &&
            (Object.keys(args.fields).length > 0)
        ){

            // convert fields to dbRow format
            let dbRow = null;
            try {
                dbRow = that.convertFieldNamesToDBRow(args.schema, args.fields);
            }catch(error){
                // error - failed to convert fields to dbRow format
                that._app.log(`${that._className} v${that._version} | createARSRow(${JSON.stringify(args)}) | convertFieldNamesToDBRow() threw unexpectedly: ${error}`);
            }
            if (that.isNotNull(dbRow)){

                // setup createDate/ModifiedDate
                let modDateHiRes = that.epochTimestamp(true);
                ['3','6'].forEach((fid) => {
                    dbRow[that.threadInfo.formIndexMappings.hasOwnProperty(fid)?that.threadInfo.formIndexMappings[fid]:fid] = Math.floor(modDateHiRes/1000);
                });

                // pass it through the dbInputFilter
                that.dbInputFilter(args.schema, dbRow).then((dbRoow) => {

                    // make a writeQueue format row
                    let wqFields = that.convertDBRowToFieldIDs(args.schema, dbRoow);

                    // give it a GUID for entryId if the caller didn't specify one
                    if (! (dbRoow.hasOwnProperty('entryId') && that.isNotNull(dbRoow.entryId) )){ dbRoow.entryId = that.getGUID(); }

                    if ((wqFields instanceof Object) && (Object.keys(wqFields).length > 0)){

                        // put it in the writeQueue
                        that.DBs.internalDB.put({
                            storeName: 'writeQueue',
                            object: {
                                entryId: dbRoow.entryId,
                                schema:  args.schema,
                                transactionType: 'create',
                                transactionDate: modDateHiRes,
                                status: 'queued',
                                fields: wqFields
                            }
                        }).then(() => {

                            // write the new row to the targetForm
                            that.DBs[that.threadInfo.formDBMappings[args.schema].dbTagName].put({
                                storeName: that.threadInfo.formDBMappings[args.schema].storeName,
                                object: dbRoow
                            }).then(() => {

                                // all good we out
                                if (that.debug){ that._app.log(`${that._className} v${that._version} | createARSRow(${JSON.stringify(args)}) | success!`); }
                                toot(dbRoow.entryId);

                            }).catch((error) => {
                                that._app.log(`${that._className} v${that._version} | createARSRow(${JSON.stringify(args)}) | failed to create targetForm entry: ${error}`);
                                boot('failed to create targetForm entry');
                            });

                        }).catch((error) => {
                            that._app.log(`${that._className} v${that._version} | createARSRow(${JSON.stringify(args)}) | failed to create writeQueue entry indexedDB.put(writeQueue) threw unexpectedly: ${error}`);
                            boot('failed to create writeQueue entry');
                        });
                    }else{
                        // error - failed to convert to writeQueue format
                        that._app.log(`${that._className} v${that._version} | createARSRow(${JSON.stringify(args)}) | convertDBRowToFieldIDs() threw unexpectedly: ${error}`);
                        boot('failed to convert fields to writeQueue entry');
                    }

                }).catch((error) => {
                    // dbInputFilter threw?
                    that._app.log(`${that._className} v${that._version} | createARSRow(${JSON.stringify(args)}) | dbInputFilter() threw unexpectedly: ${error}`);
                    boot(error);
                });

            }else{
                // error - failed to convert fields to dbRow
                boot(`failed to convert fieldNames to dbRow format`);
            }
        }else{
            // error - invalid input
            that._app.log(`${that._className} v${that._version} | createARSRow(${JSON.stringify(args)}) | invalid input`)
            boot('invalid input');
        }
    }));
}




/*
    getMatchingARSRows({
        schema: <str>
        match: {indexedFieldName: value, indexedFieldName: value ...},
        fields: [<str>, <str>, ...],
        returnFormat: <enum: raw|fieldName|fieldID> (default fieldName),
        returnChanges: <bool> (default: false),
        bypassFilters: <bool> (default: false)
        dateFormat: <str>
    })

    wraps indexedDB.getMatching(), returns all rows on `args.schema` matching
    the given input `args.query` object which is an object of indexed fields
    and values.

    For isntance: {
        'Assigned User': 'SpongeBob',
        'Location': 'BikiniBottom'
    }

    where 'Asssigned User' and 'Location' fields have corresponding indexNames in the
    schema's indexedDB dataStore, AND there is a composite index of ['Assigned User', 'Location']

    this function will automatically identify the correct index, and retrieve all matching rows
    which are then passed through the standard dbOutputFilter and returnChanges and filters and
    the rest.
*/
getMatchingARSRows(args){
    let that = this;
    return(new Promise((toot, boot) => {
        if (
            (args instanceof Object) &&
            args.hasOwnProperty('schema') &&
            that.isNotNull(args.schema) &&
            (that.threadInfo instanceof Object) &&
            (that.threadInfo.formDBMappings instanceof Object) &&
            that.threadInfo.formDBMappings.hasOwnProperty(args.schema) &&
            (that.threadInfo.formDefinitions instanceof Object) &&
            (that.threadInfo.formDefinitions[args.schema] instanceof Object) &&
            (that.threadInfo.formDefinitions[args.schema].nameIndex instanceof Object) &&
            (that.threadInfo.formIndexMappings instanceof Object) &&
            (that.threadInfo.formIndexMappings[args.schema] instanceof Object) &&
            (! (
                args.hasOwnProperty('returnFormat') &&
                (['raw', 'fieldName', 'fieldID'].indexOf(args.returnFormat) < 0)
            )) &&
            (args.query instanceof Object) &&
            (Object.keys(args.query).length > 0)
        ){

            // convert query args from fieldName to indexNames
            let query = {};
            Object.keys(args.query).filter((fieldName) => {return(
                that.threadInfo.formDefinitions[args.schema].nameIndex.hasOwnProperty(fieldName) &&
                that.threadInfo.formIndexMappings[args.schema].hasOwnProperty(that.threadInfo.formDefinitions[args.schema].nameIndex[fieldName].id)
            )}).forEach((fieldName) => {
                query[that.threadInfo.formIndexMappings[args.schema][that.threadInfo.formDefinitions[args.schema].nameIndex[fieldName].id]] = args.query[fieldName];
            });

            // execute the indexedDB function
            that.getDBInstance(args.schema).getMatching({
                storeName: that.threadInfo.formDBMappings[args.schema].storeName,
                match: query
            }).then((bros) => {

                let rows = [];
                Promise.all(bros.map((row) =>{
                    return(new Promise((_t, _b) => {
                        that.dbOutputFilter(args.schema, row, (args.hasOwnProperty('bypassFilters') && (args.bypassFilters === true)), args.hasOwnProperty('dateFormat')?args.dateFormat:null).then((fRow) => {
                            rows.push(fRow);
                            _t(true);
                        }).catch((error) => {
                            that._app.log(`${that._className} v${that._version} | getMatchingARSRows(${JSON.stringify(args)}) | dbOutputFilter() threw unexpectedly on ${row.entryId} | ${error}`);
                            _b(error);
                        });
                    }));
                })).then(() => {

                    // fetch the writeQueue if we're supposed to
                    new Promise((_t,_b) => {
                        if (args.hasOwnProperty('returnChanges') && (args.returnChanges === true)){

                            let pk = [];
                            rows.forEach((row) => {
                                pk.push(new Promise((__t, __b) => {
                                    that.DBs.internalDB.getAll({
                                        storeName: 'writeQueue',
                                        indexName: 'schemaEntryId',
                                        query: IDBKeyRange.only([args.schema, row.entryId])
                                    }).then((wqRows) =>{
                                        row._changes = wqRows;
                                        __t(true);
                                    }).catch((error) => {
                                        // note should not happen as no-match is just an empty array so this real-deal bad time stuff here
                                        that._app.log(`${that._className} v${that._version} | getMatchingARSRows(${JSON.stringify(args)}) | returnChanges option | indexedDB.getAll(writeQueue) threw unexpectedly on entryId: ${row.entryId}: ${error}`);
                                        __b(error);
                                    });
                                }));
                            });
                            Promise.all(pk).then(() => {_t(true); }).catch((error) => { _b(error); });

                        }else{
                            _t(true);
                        }
                    }).then(() => {

                        // munge rows for specified format and selected fields
                        let fields = (args.fields instanceof Array)?args.fields:[];
                        let mode = args.hasOwnProperty('returnFormat')?args.returnFormat:'fieldName';
                        toot(rows.map((row) => {
                            switch (mode){
                                case 'raw':
                                    return(that.filterRequestedFields(args.schema, fields, row));
                                    break;
                                case 'fieldName':
                                    return(that.convertDBRowToFieldNames(args.schema, that.filterRequestedFields(args.schema, fields, row)));
                                    break;
                                case 'fieldID':
                                    return(that.convertDBRowToFieldIDs(args.schema, that.filterRequestedFields(args.schema, fields, row)));
                                    break;
                            }
                        }));

                    }).catch((error) => {
                        // error - indexedDB.getAll() threw
                        that._app.log(`${that._className} v${that._version} | getMatchingARSRows(${JSON.stringify(args)}) | returnChanges option threw unexpectedly: ${error}`);
                        boot(error);
                    });

                }).catch((error) => {
                    that._app.log(`${that._className} v${that._version} | getMatchingARSRows(${JSON.stringify(args)}) | one or more rows failed dbOutputFilter() unexpectedly (see log): ${error}`);
                    boot(error);
                });

            }).catch((error) => {
                // error - indexedDB.getAll() threw
                that._app.log(`${that._className} v${that._version} | getMatchingARSRows(${JSON.stringify(args)}) | indexedDB.getAll() threw unexpectedly: ${error}`);
                boot(error);
            });
        }else{
            // error - invalid input
            that._app.log(`${that._className} v${that._version} | getMatchingARSRows(${JSON.stringify(args)}) | invalid input`)
            boot('invalid input');
        }
    }));
}




/*
    infrastructure
    --------------------------------------------------------------------------------
*/




/*
    getThreadInfo()
    fetch threadInfo from the given threadHandle
*/
getThreadInfo(){
    let that = this;
    return(new Promise((toot, boot) =>{
        if (that.isNull(that._app)){
            boot('_app is not specified for thread communication');
        }else if (that.isNull(that.threadName)){
            boot('threadName is not specified');
        }else if (!(that._app._threadHandles.hasOwnProperty(that.threadName))){
            boot('_app does not have a threadHandle for the specified threadName');
        }else{
            that._app.threadResponse({
                threadName: that.threadName,
                postMessage: { type: 'threadInfo' },
                awaitResponseType: 'threadInfo'
            }).then((r) => {
                if ((r instanceof Object) && (r.data instanceof Object) && (r.data.threadInfo instanceof Object) && (Object.keys(r.data.threadInfo) > 0)){
                    that.threadInfo = r.data.threadInfo;
                    toot(r.data.threadInfo);
                }else{
                    let error = ((r instanceof Object) && (r.data instanceof Object) && r.data.hasOwnProperty('errorMessage'))?r.data.errorMessage:'unknown';
                    that._app.log(`${that._className} v${that._version} | getThreadInfo() | threadInfo threadResponse contains error: ${error}`);
                    boot(error);
                }
            }).catch((error) => {
                that._app.log(`${that._className} v${that._version} | getThreadInfo() | threadInfo threadResponse call threw unexpectedly: ${error}`);
                boot(error);
            });
        }

    }));
}
get hasThreadInfo(){ return( Object.keys(this.threadInfo).length > 0 ); }
set hasThreadInfo(v){ this._hasThreadInfo = (v === true); }




/*
    mountDB(dbTagName)
    mount the specified indexedDB instance. We don't give a hoot about
    upgrades and versions n stuff here ... the noiceARSSyncWorkerThread
    must be initted before we can spawn the client, and it'll handle
    the housekeeping :-)
*/
mountDB(dbTagName){
    let that = this;
    return(new Promise((toot, boot) => {
        if (that.hasThreadInfo && (that.threadInfo.DBs instanceof Object) && (that.threadInfo.internalDBConfig instanceof Object)){

            let dbConfig = (dbTagName == 'internalDB')?that.threadInfo.internalDBConfig:(that.threadInfo.DBs.hasOwnProperty(dbTagName))?that.threadInfo.DBs[dbTagName]:null;
            if (that.isNotNull(dbConfig)){
                new noiceIndexedDB(dbConfig).open({destructiveSetup: false}).then((db) => {
                    that.DBs[dbTagName] = db;
                    toot(db);
                }).catch((error) => {
                    that._app.log(`${that._className} v${that._version} | mountDB(${dbTagName}) | indexedDB.mount() threw unexpectedly ${error}`);
                    boot(error);
                });
            }else{
                let error = 'threadInfo does not contain definition for specified dbTagName';
                that._app.log(`${that._className} v${that._version} | mountDB(${dbTagName}) | ${error}`);
                boot(error);
            }
        }else{
            let error = 'threadInfo not loaded, exit with error';
            that._app.log(`${that._className} v${that._version} | mountDB(${dbTagName}) | ${error}`);
            boot(error);
        }

    }));
}




/*
    mountAll()
    mount all the databases specified in threadInfo
    resolves to self so can be chained with constructor
*/
mountAll(){
    let that = this;
    let fn = 'mountAll';
    return(new Promise((toot, boot) => {
        if (that.hasThreadInfo && (that.threadInfo.DBs instanceof Object)){

            let mountQueue = Object.keys(that.threadInfo.DBs).concat(['internalDB']);

            // side note: it is a tragedy that there's not a Promise.each or something ugh. tired of writing these iterators
            function mountHelper(idx){
                if (idx == mountQueue.length){
                    if (that.messageHandler instanceof Function){ that.messageHandler({
                        error: false,
                        message: 'all databases mounted',
                        detail: ``,
                        runAnimation: false,
                        functionName: fn
                    }); }
                    toot(that);
                }else{
                    that.mountDB(mountQueue[idx]).then((d) => {
                        mountHelper((idx + 1));
                    }).catch((error) => {
                        that._app.log(`${that._className} v${that._version} | mount() | failed to mount database ${mountQueue[idx]} | ${error}`);
                        if (that.messageHandler instanceof Function){ that.messageHandler({
                            messageNumber: 21,
                            error: true,
                            message: `failed to mount database ${mountQueue[idx]} (please contact administrator)`,
                            detail: `${error}`,
                            runAnimation: false,
                            functionName: fn
                        }); }
                        boot(error);
                    });
                }
            }

            // do ieet (or don't if we don't have any)
            if (mountQueue.length > 0){
                mountHelper(0);
            }else{
                let error = 'there do not appear to be any databses defined in the config. exit with error';
                that._app.log(`${that._className} v${that._version} | mount() | ${error}`);
                if (that.messageHandler instanceof Function){ that.messageHandler({
                    messageNumber: 22,
                    error: true,
                    message: `failed to mount databases (please contact administrator)`,
                    detail: `${error}`,
                    runAnimation: false,
                    functionName: fn
                }); }
                boot(error);
            }

        }else{
            let error = 'cannot find DBs in threadInfo?'
            that._app.log(`${that._className} v${that._version} | mount() | ${error}`);
            if (that.messageHandler instanceof Function){ that.messageHandler({
                messageNumber: 20,
                error: true,
                message: 'failed to mount databases (please contact administrator)',
                detail: `${error}`,
                runAnimation: false,
            }); }
            boot(error);
        }
    }));
}




/*
    conversions and helpers
    --------------------------------------------------------------------------------
*/




/*
    filterRequestedFields(schema, fields, dbRow)
    return the dbRow but delete every column that is not equivalent to
    a value in the specified array of fieldNames (fields) on schema
    failures return an empty object
*/
filterRequestedFields(schema, fields, dbRow){
    let that = this;
    if (
        (that.isNotNull(schema)) &&
        (dbRow instanceof Object) &&
        (that.threadInfo.formDefinitions instanceof Object) &&
        (that.threadInfo.formDefinitions[schema] instanceof Object) &&
        (that.threadInfo.formDefinitions[schema].nameIndex instanceof Object) &&
        (fields instanceof Array) &&
        (fields.length > 0) &&
        (fields.filter((a)=>{return(that.threadInfo.formDefinitions[schema].nameIndex.hasOwnProperty(a))}).length == fields.length) &&
        (that.threadInfo.formIndexMappings instanceof Object) &&
        (that.threadInfo.formIndexMappings[schema] instanceof Object)
    ){

        /*
            1/5/24 @ 0956 -- just a note
            indexOf does not work against integer values in arrays. no shit
            that's why all the explicit string conversions below
            who woulda thought?!!
        */

        // translate fields (fieldNames) into an equivalent list of dbRow format columnNames
        let match = fields.map((fieldName) => {return(
            that.threadInfo.formIndexMappings[schema].hasOwnProperty(that.threadInfo.formDefinitions[schema].nameIndex[fieldName].id)?`${that.threadInfo.formIndexMappings[schema][that.threadInfo.formDefinitions[schema].nameIndex[fieldName].id]}`:`${that.threadInfo.formDefinitions[schema].nameIndex[fieldName].id}`
        )});
        match.push('_changes'); // don't name a field _changes lol

        // we filterin'!
        let out = {};
        Object.keys(dbRow).filter((colName) => {return(match.indexOf(`${colName}`) >= 0)}).forEach((colName) => {out[colName] = dbRow[colName]; });
        return(out);

    }else{
        if (that.debug){ that._app.log(`${that._className} v${that._version} | filterRequestedFields(${schema}) | invalid input`); }
        return(dbRow);
    }
}




/*
    convertDBRowToFieldNames(schema, dbRow)
    convert all columns on the dbRow to equivalent fieldName values from the given schema
    if no match on formDef, just return the db-native column names
*/
convertDBRowToFieldNames(schema, dbRow){
    let that = this;
    if (
        (that.isNotNull(schema)) &&
        (dbRow instanceof Object) &&
        (that.threadInfo.formDefinitions instanceof Object) &&
        (that.threadInfo.formDefinitions[schema] instanceof Object) &&
        (that.threadInfo.formDefinitions[schema].idIndex instanceof Object) &&
        (that.threadInfo.formIDToIndexMappings instanceof Object) &&
        (that.threadInfo.formIDToIndexMappings[schema] instanceof Object)
    ){
        let out = {};
        Object.keys(dbRow).forEach((colName) => {
            let fid = that.threadInfo.formIDToIndexMappings[schema].hasOwnProperty(colName)?that.threadInfo.formIDToIndexMappings[schema][colName]:colName;
            let colRename = that.threadInfo.formDefinitions[schema].idIndex.hasOwnProperty(fid)?that.threadInfo.formDefinitions[schema].idIndex[fid].name:fid;
            out[colRename] = dbRow[colName];
        })
        return(out);
    }else{
        that._app.log(`${that._className} v${that._version} | convertDBRowToFieldNames(${schema}) | invalid input`)
        return({});
    }
}




/*
    convertDBRowToFieldIDs(schema, dbRow)
    convert all columns on the dbRow to equivalent fieldID values from the given schema
    if no match on formDef, just return the db-native column names
*/
convertDBRowToFieldIDs(schema, dbRow){
    let that = this;
    if (
        (that.isNotNull(schema)) &&
        (dbRow instanceof Object) &&
        (that.threadInfo.formIDToIndexMappings instanceof Object) &&
        (that.threadInfo.formIDToIndexMappings[schema] instanceof Object)
    ){
        let out = {};
        Object.keys(dbRow).forEach((colName) => {
            out[that.threadInfo.formIDToIndexMappings[schema].hasOwnProperty(colName)?that.threadInfo.formIDToIndexMappings[schema][colName]:colName] = dbRow[colName];
        });
        return(out);
    }else{
        that._app.log(`${that._className} v${that._version} | convertDBRowToFieldIDs(${schema}) | invalid input`)
        return({});
    }
}




/*
    convertFieldNamesToDBRow(schema, data)

    NOTE: if you pass in extra fields that don't exist in the formDefinition,
    this will simply pass them through to the output unchanged.
*/
convertFieldNamesToDBRow(schema, data){
    let that = this;
    if (
        (that.isNotNull(schema)) &&
        (data instanceof Object) &&
        (Object.keys(data).length > 0) &&
        (that.threadInfo.formDefinitions instanceof Object) &&
        (that.threadInfo.formDefinitions[schema] instanceof Object) &&
        (that.threadInfo.formDefinitions[schema].nameIndex instanceof Object) &&
        (that.threadInfo.formIndexMappings instanceof Object) &&
        (that.threadInfo.formIndexMappings[schema] instanceof Object) &&
        (that.threadInfo.formIDToIndexMappings instanceof Object) &&
        (that.threadInfo.formIDToIndexMappings[schema] instanceof Object)
    ){

        let out = {};
        Object.keys(data).forEach((fieldName) => {

            // if it's a fully numeric columnName ...
            if (/^\d+$/.test(fieldName)){
                out[that.threadInfo.formIndexMappings[schema].hasOwnProperty(fieldName)?that.threadInfo.formIndexMappings[schema][fieldName]:fieldName] = data[fieldName];

            // else if the formDefinition has a field named this ...
            }else if (that.threadInfo.formDefinitions[schema].nameIndex.hasOwnProperty(fieldName)){
                let id = that.threadInfo.formDefinitions[schema].nameIndex[fieldName].id;
                out[that.threadInfo.formIndexMappings[schema].hasOwnProperty(id)?that.threadInfo.formIndexMappings[schema][id]:id] = data[fieldName];

            // else if it's just a random field y'know?
            }else{
                out[that.threadInfo.formIDToIndexMappings[schema].hasOwnProperty(fieldName)?that.threadInfo.formIDToIndexMappings[schema][fieldName]:fieldName] = data[fieldName];
            }
        });
        return(out);
    }else{
        // error - invalid input. I hate it but this needs a throw
        that._app.log(`${that._className} v${that._version} | convertFieldNamesToDBRow(${schema}) | invalid input `)
        throw(`invalid input`);
    }
}




/*
    external utilities
    --------------------------------------------------------------------------------
*/




/*
    getDBInfo()
    return getDescription for all the DBs we've got
*/
getDBInfo(){
    let that = this;
    return(new Promise((toot, boot) => {
        let out = {};
        Promise.all(Object.keys(that.DBs).map((dbName) => {return(new Promise((_t,_b) => {
            that.DBs[dbName].getDescription().then((desc) => {
                out[dbName] = desc;
                _t(true);
            }).catch((error) => {
                that._app.log(`${that._className} v${that._version} | getDBInfo() | indexedDB.getDescription(${dbName}) threw unexpectedly: ${error}`);
                boot(error);
            });
        }))})).then(() => {
            toot(out);
        }).catch((error) => {
            that._app.log(`${that._className} v${that._version} | getDBInfo() | at least one DB failed getDescription() (see log): ${error}`);
            boot(error);
        })
    }));
}




/*
    getDBInstance(schemaName)
    this just returns the DB instance to the caller based on the schemaName
*/
getDBInstance(schemaName){
    if (
        (this.DBs instanceof Object) &&
        (this.threadInfo instanceof Object) &&
        (this.threadInfo.formDBMappings instanceof Object) &&
        (this.threadInfo.formDBMappings[schemaName] instanceof Object) &&
        this.threadInfo.formDBMappings[schemaName].hasOwnProperty('dbTagName') &&
        this.isNotNull(this.threadInfo.formDBMappings[schemaName].dbTagName) &&
        this.DBs.hasOwnProperty(this.threadInfo.formDBMappings[schemaName].dbTagName)
    ){
        return(this.DBs[this.threadInfo.formDBMappings[schemaName].dbTagName]);
    }else{
        that._app.log(`${this._className} v${this._version} | getDBInstance(${schemaName}) | invalid input`)
        throw('getDBInstance() | invalid input');
    }
}




/*
    listSchemas()
*/
listSchemas(){
    return(
        (
            (this.DBs instanceof Object) &&
            (this.threadInfo instanceof Object) &&
            (this.threadInfo.formDBMappings instanceof Object)
        )?Object.keys(this.threadInfo.formDBMappings).sort():[]
    );
}




/*
    openCursor({
        schema: <str>,
        indexName: <string (optional)>,
        query:     <IDBKeyRange (optional)>,
        direction: <next|nextunique|prev|prevunique> default:next
        callback: <function(cursor, client, schemaName)>
    });

    there's just no good way to implement a QBE or other freeform search with this
    best I can give you is an enhanced openCursor that knows about schemas and fields
    and indexes and stuff. Also you could use getDBInstance() above to do specific
    index searches via getAll() and the like.

    so this is a re-implementation of noiceIndexedDB.openCursor
    the main difference being no 'storeName' arg, instead we take the schemaName,
    the other big difference is that we pass *three* arguments to the callback,
    cursor, and a self ref, and the schemaName
*/
openCursor(args){
    let that = this;
    return(new Promise((toot, boot) => {

        // check args
        if (
            (args instanceof Object) &&
            args.hasOwnProperty('schema') &&
            that.isNotNull(args.schema) &&
            (args.callback instanceof Function) &&
            (that.DBs instanceof Object) &&
            (that.threadInfo instanceof Object) &&
            (that.threadInfo.formDBMappings instanceof Object) &&
            (that.threadInfo.formDBMappings[args.schema] instanceof Object) &&
            that.threadInfo.formDBMappings[args.schema].hasOwnProperty('dbTagName') &&
            that.isNotNull(that.threadInfo.formDBMappings[args.schema].dbTagName) &&
            that.DBs.hasOwnProperty(that.threadInfo.formDBMappings[args.schema].dbTagName)
        ){

            // get the db instance
            let dbi = that.getDBInstance(args.schema);
            let storeName = that.threadInfo.formDBMappings[args.schema].storeName;

            // aight, time to straight up reimplement noiceIndexedDB.openCursor LOL
            let trans = dbi.db.transaction(storeName, "readwrite");
            trans.onerror = function(e){
                that._app.log(`${that._className} v${that._version} | openCursor() | indexedDB transaction error: ${e}`);
                boot(e);
            }
            trans.oncomplete = function(e){
                if(that.debug){that._app.log(`${that._className} v${that._version} | openCursor() | indexedDB transaction complete`);}
                toot(e);
            }
            trans.onabort = function(e){
                that._app.log(`${that._className} v${that._version} | openCursor() | indexedDB transaction abort: ${e}`);
                boot(e);
            }

            let req;
            if (args.hasOwnProperty('indexName')){
                if (! (trans.objectStore(storeName).indexNames.contains(args.indexName))){
                    boot('indexName does not exist on specified storeName');
                }
                if (args.hasOwnProperty('query')){
                    if (args.hasOwnProperty('direction')){
                        req = trans.objectStore(storeName).index(args.indexName).openCursor(args.query,args.direction);
                    }else{
                        req = trans.objectStore(storeName).index(args.indexName).openCursor(args.query);
                    }
                }else{
                    req = trans.objectStore(storeName).index(args.indexName).openCursor();
                }
            }else{
                if (args.hasOwnProperty('query')){
                    if (args.hasOwnProperty('direction')){
                        req = trans.objectStore(storeName).openCursor(args.query,args.direction);
                    }else{
                        req = trans.objectStore(storeName).openCursor(args.query);
                    }
                }else{
                    req = trans.objectStore(storeName).openCursor();
                }
            }
            req.onerror = function(e){
                that._app.log(`${that._className} v${that._version} | openCursor() | indexedDB openCursor request error: ${e}`);
                boot(e);
            }
            req.onabort = function(e){
                that._app.log(`${that._className} v${that._version} | openCursor() | indexedDB openCursor request abort: ${e}`);
                boot(e);
            }

            // pass cursor and client ref to callback for each row
            req.onsuccess = function(e){ args.callback(e.target.result, that, args.schema); }

        }else{
            that._app.log(`${that._className} v${that._version} | openCursor() | invalid input`);
            boot('invalid input');
        }
    }));
}




/*
    data filters
    --------------------------------------------------------------------------------
    dbInputFilter() is fired against each row before writing to the dataStore
    dbOuputFilter() if fired against each row before returning it from a dataStore

    dbInputFilterCallback() & and dbOutputFilterCallback() are optional externally defined
    asynchronous functions which will will call *before* executing statically defined
    internal logic. Rejecting a promise from a callback will cancel the transaction.
    Whatever dataset is resolved from the promise is passed through to the internal
    logic.

    if you wanna build something like ARS filters, this is your mechanism to do that
*/




/*
    dbInputFilter(schema, dbRow)
    this fires on every row on the way INTO the indexedDB datastore.
    if dbInputFilterCallback is specified, await that and pass its
    output through to the rest.

    dbRow need not be a complete dbRow but must be in dbRow format

    we resolve a *copy* of the dbRow with conversions, or we reject for errors
*/
dbInputFilter(schema, dbRow){
    let that = this;
    return(new Promise((toot, boot) => {
        if ((that.isNotNull(schema)) && (dbRow instanceof Object)){

            // handle dbInputFilterCallback() should we have one
            new Promise((_t,_b) => {
                _t((that.dbInputFilterCallback instanceof Function)?that.dbInputFilterCallback(schema, Object.assign({}, dbRow), that ):Object.assign({}, dbRow));
            }).then((cData) => {

                /*
                    cData has the copy of dbRow potentially modified by dbInputFilterCallback
                    now do the built-in date/time and currency ones
                    (which we can only do if we've got a formDefinition and stuffs)
                */
                if (
                    (that.threadInfo instanceof Object) &&
                    (that.threadInfo.formIDToIndexMappings instanceof Object) &&
                    (that.threadInfo.formIDToIndexMappings[schema] instanceof Object) &&
                    (that.threadInfo.formDefinitions instanceof Object) &&
                    (that.threadInfo.formDefinitions[schema] instanceof Object) &&
                    (that.threadInfo.formDefinitions[schema].idIndex instanceof Object)
                ){

                    let errors = [];

                    // handle date & currency conversions
                    Object.keys(cData).filter((colName) => {
                        let fieldID  = (that.threadInfo.formIDToIndexMappings[schema].hasOwnProperty(colName))?that.threadInfo.formIDToIndexMappings[schema][colName]:colName;
                        return(
                            (that.threadInfo.formDefinitions[schema].idIndex[fieldID] instanceof Object) &&
                            that.threadInfo.formDefinitions[schema].idIndex[fieldID].hasOwnProperty('datatype')
                        )
                    }).forEach((colName) => {
                        let fieldID  = (that.threadInfo.formIDToIndexMappings[schema].hasOwnProperty(colName))?that.threadInfo.formIDToIndexMappings[schema][colName]:colName;
                        switch(that.threadInfo.formDefinitions[schema].idIndex[fieldID].datatype){
                            case "TIME":
                                if (! /^\d+$/.test(cData[colName])){
                                    try {
                                        let t = that.toEpoch(cData[colName]);
                                        if (! isNaN(t)){
                                            cData[colName] = t;
                                        }else{
                                            throw("invalid date format");
                                        }
                                    }catch(e){
                                        errors.push(`failed epoch conversion on (${fieldID}) value: ${cData[colName]} | ${e}`);
                                    }
                                }
                                break;
                            case "CURRENCY":
                                cData[colName] = `${cData[colName]}`.replace("$", "");
                                cData[colName] = `${cData[colName]}`.replace(/,/g, "");
                                try {
                                    let t = parseFloat(cData[colName]);
                                    if (isNaN(t)){
                                        throw("invalid currency value");
                                    }else{
                                        cData[colName] = t;
                                    }
                                }catch(e){
                                    errors.push(`failed parse (${fieldID}) value: ${cData[colName]} | ${e}`);
                                }
                                break;
                        }
                    });

                    if (errors.length == 0){
                        // no errors, toot it!
                        toot(cData);

                    }else{
                        // had conversion errors boot
                        that._app.log(`${that._className} v${that._version} | dbInputFilter(${schema}) | conversion error(s) encountered: ${errors.join(" | ")}`);
                        boot(errors.join(" | "));
                    }

                }else{
                    that._app.log(`${that._className} v${that._version} | dbInputFilter(${schema}) | missing formIDToIndexMappings or formDefinition, cannot continue`);
                    boot('missing formIDToIndexMappings or formDefinition');
                }
            }).catch((error) => {
                if (that.debug){ that._app.log(`${that._className} v${that._version} | dbInputFilter(${schema}) | dbInputFilterCallback() threw unexpectedly | ${error}`); }
                boot(error);
            });

        }else{
            // invalid input params
            that._app.log(`${that._className} v${that._version} | dbInputFilter(${schema}) | invalid input args`);
            boot('invalid input args');
        }
    }));
}




/*
    dbOutputFilter(schema, dbRow, bypassBool)
    fires on every row on the way Out of the indexedDB datastore
    if dbOutputFilterCallback is specified, await output of that and passthrough
    to the rest of the date/currency logic

    if bypassBool is set true, just passthrough the input dbRow to the output
    why? well -- it's just a lot easier to put the switch here than in a million
    differnet embedded promise switches
*/
dbOutputFilter(schema, dbRow, bypassBool, dateTimeFormat){
    let that = this;
    return(new Promise((toot, boot) => {
        if ((that.isNotNull(schema)) && (dbRow instanceof Object)){

            if (bypassBool === true){
                toot(dbRow);
            }else{
                // handle dbInputFilterCallback() should we have one
                new Promise((_t,_b) => {
                    _t((that.dbOutputFilterCallback instanceof Function)?that.dbOutputFilterCallback(schema, Object.assign({}, dbRow), that ):Object.assign({}, dbRow));
                }).then((cData) => {

                    /*
                        cData has the copy of dbRow potentially modified by dbInputFilterCallback
                        now do the built-in date/time and currency ones
                        (which we can only do if we've got a formDefinition and stuffs)
                    */
                    if (
                        (that.threadInfo instanceof Object) &&
                        (that.threadInfo.formIDToIndexMappings instanceof Object) &&
                        (that.threadInfo.formIDToIndexMappings[schema] instanceof Object) &&
                        (that.threadInfo.formDefinitions instanceof Object) &&
                        (that.threadInfo.formDefinitions[schema] instanceof Object) &&
                        (that.threadInfo.formDefinitions[schema].idIndex instanceof Object)
                    ){

                        let errors = [];

                        // handle date & currency conversions
                        Object.keys(cData).filter((colName) => {
                            let fieldID  = (that.threadInfo.formIDToIndexMappings[schema].hasOwnProperty(colName))?that.threadInfo.formIDToIndexMappings[schema][colName]:colName;
                            return(
                                (that.threadInfo.formDefinitions[schema].idIndex[fieldID] instanceof Object) &&
                                that.threadInfo.formDefinitions[schema].idIndex[fieldID].hasOwnProperty('datatype')
                            )
                        }).forEach((colName) => {
                            let fieldID  = (that.threadInfo.formIDToIndexMappings[schema].hasOwnProperty(colName))?that.threadInfo.formIDToIndexMappings[schema][colName]:colName;
                            switch(that.threadInfo.formDefinitions[schema].idIndex[fieldID].datatype){
                                case "TIME":
                                    if (/^\d+$/.test(cData[colName])){
                                        try {
                                            let t = that.fromEpoch(cData[colName], that.isNotNull(dateTimeFormat)?dateTimeFormat:'dateTimeLocale');
                                            if (that.isNotNull(t)){
                                                cData[colName] = t;
                                            }else{
                                                throw("invalid date format");
                                            }
                                        }catch(e){
                                            errors.push(`failed epoch deconversion on (${fieldID}) value: ${cData[colName]} | ${e}`);
                                        }
                                    }
                                    break;
                                case "CURRENCY":
                                    cData[colName] = `${cData[colName]}`.replace("$", "");
                                    cData[colName] = `${cData[colName]}`.replace(/,/g, "");
                                    try {
                                        let t = parseFloat(cData[colName]);
                                        if (isNaN(t)){
                                            throw("invalid currency value");
                                        }else{
                                            cData[colName] = '$' + parseFloat(t.toFixed(2)).toLocaleString('en-US', {style: 'decimal', minimumFractionDigits: 2,  maximumFractionDigits: 2});
                                        }
                                    }catch(e){
                                        errors.push(`failed parse (${fieldID}) value: ${cData[colName]} | ${e}`);
                                    }
                                    break;
                            }
                        });

                        if (errors.length == 0){
                            // no errors, toot it!
                            toot(cData);

                        }else{
                            // had conversion errors boot
                            that._app.log(`${that._className} v${that._version} | dbOutputFilter(${schema}) | conversion error(s) encountered: ${errors.join(" | ")}`);
                            boot(errors.join(" | "));
                        }

                    }else{
                        that._app.log(`${that._className} v${that._version} | dbOutputFilter(${schema}) | missing formIDToIndexMappings or formDefinition, cannot continue`);
                        boot('missing formIDToIndexMappings or formDefinition');
                    }

                }).catch((error) => {
                    if (that.debug){ that._app.log(`${that._className} v${that._version} | dbOutputFilter(${schema}) | dbInputFilterCallback() threw unexpectedly | ${error}`); }
                    boot(error);
                });
            }
        }else{
            // invalid input params
            that._app.log(`${that._className} v${that._version} | dbOuputFilter(${schema}) | invalid input args`);
            boot('invalid input args');
        }
    }));
}




/*
    checkUserAuth(user_id, pass)
*/
checkUserAuth(user_id, pass){
    let that = this;
    return(new Promise((toot, boot) => {
        that._app.threadResponse({
            threadName: that.threadName,
            postMessage: {
                type: 'authenticateUser',
                data:{ user: user_id, pass: pass }
            },
            awaitResponseType: 'authenticateUser'
        }).then((r) => {
            if (
                (r instanceof Object) &&
                (r.data instanceof Object) &&
                r.data.hasOwnProperty('error') &&
                r.data.error === false
            ){
                toot(true);
            }else{
                const error = (
                    (r instanceof Object) &&
                    (r.data instanceof Object) &&
                    r.data.hasOwnProperty('errorMessage') &&
                    that.isNotNull(r.data.errorMessage)
                )?r.data.errorMessage:'invalid auth';
                if (that.debug){ that._app.log(`${that._className} v${that._version} | checkUserAuth(${user_id}) | auth failed: ${error}`); }
                boot(error);
            }
        }).catch((error) => {
            that._app.log(`${that._className} v${that._version} | checkUserAuth(${user_id}) threadResponse generated error unexpectedly: ${error}`);
            boot(error);
        });
    }))
}




}
export { noiceARSSyncWorkerClient };
