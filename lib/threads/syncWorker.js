/*
  syncWorker.js
  what it says on the tin
*/
import { Config } from '../../config/syncWorkerConfig.js';
import { noiceObjectCore } from '../noice/noiceCore.js';
import { noiceWorkerThread } from '../noice/noiceWorkerThread.js';
import { noiceIndexedDB } from '../noice/noiceIndexedDB.js';
import { noiceCrypto } from '../noice/noiceCrypto.js';

const thread = new noiceWorkerThread({
  threadName: 'syncWorker',
  debug: false,
  config: Config,
  //authenticateUserCallback: (api, slfRef) => { return(handleUserAuthSuccess(api, slfRef)); },
  //getAPIAuthCallback: (connectParams, slfRef) => { return(getAPIAuthParams(connectParams, slfRef)); }
});

/*
    offlineAuth signalHandler
    this simply takes the given passphrase and attempts to decrypt
    torgo.p. If it works, we'll set this._torgo and consider the user
    auth'd. Else we won't lol
*/
thread.signalHandlers.offlineAuth = (data, evt) => {
    let that = thread;
    let fn = 'offlineAuth';
    let awaitReleaseEvent = 'offlineAuth';
    let outData = { error: false };

    new Promise((toot, boot) => {

        if (
            (data instanceof Object) &&
            data.hasOwnProperty('pass') &&
            that.isNotNull(data.pass)
        ){
            getAPIAuthParams({}, that, data.pass).then((cp) => {
                that._torgo = data.pass;
                toot({});
            }).catch((error) => {
                boot('offline auth failed');
            });
        }else{
            boot('no passphrase provided');
        }

    }).catch((error) => {
        that.log(`${fn}() | exit with error | ${error}`);
        outData.error = true;
        outData.errorMessage = (outData.hasOwnProperty('errorMessage') && that.isNotNull(outData.errorMessage))?`${outData.errorMessage} | ${error}`:`${error}`;
    }).then((mergeOutput) => {
        if (that.debug){ that.log(`${fn}() | end`)}
        that.signalParent({
            type: awaitReleaseEvent,
            data: Object.assign(outData, (mergeOutput instanceof Object)?mergeOutput:{})
        });
    });
};
