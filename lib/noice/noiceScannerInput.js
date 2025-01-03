/*
    noiceScannerInput.js
    2/28/24 - Amy Hicox <amy@hicox.com>

    this library provides infrastructure for accepting automated bluetooth
    keyboard input such as one might receive from a TSL-1128 rfid scanner

    docs to follow

    * tagReceiveCallback(tagString, selfReference)
      if specified, this function is executed in the next animationFrame
      in real-time as each individual tag is received in the input stream

    * scanStartCallback(selfReference)
      if specified is called when the input stream from the scanner begins
      but before we set the isTyping attribute and spawn the timeout listener etc

    * scanEndCallback(tagArray, selfReference)
      if specified, is called when the input stream from the scanner is terminated
      tagArray is an array of strings (presumably tags) returned by the scanner

*/
import { noiceObjectCore, noiceCoreUtility, noiceException} from './noiceCore.js';

class noiceScannerInput extends noiceCoreUtility {




/*
    constructor
*/
constructor(args, defaults, callback){
    super(args, noiceObjectCore.mergeClassDefaults({
        _version:               1,
        _className:             'noiceScannerInput',
        _isTyping:              false,
        _shiftFlag:             false,
        _scanBuffer:            [],
        _found:                 [],
        _enableListener:        false,
        debug:                  false,
        isTypingCheckInterval:  150,   // 100 == 10 times a second
        isTypingTimeout:        500,   // half a second
        scanIndicatorTimeout:   (1000 * 30), // 30 seconds
        scanListener:           null,
        tagReceiveCallback:    null,
        scanStartCallback:      null,
        scanEndCallback:        null
    },defaults),callback);
}




/*
    scanHandler(keyPressEvent)
    this receives keystrokes from a listener on document.body()
    see also the enableListener attribute.
    If the body does not have focus we do not receive keystrokes.
    This is very necessary (trust me on this)
*/
scanHandler(kpevt){
    let that = this;

    if (document.activeElement.tagName == "BODY"){
        that.lastKeyPress = that.epochTimestamp(true);
        that.isTyping = true;

        if (kpevt.code == "Enter"){
            that._found.push(that._scanBuffer.join(''));
            that._scanBuffer = [];

            /*
                in this block, we have received the \n from the scanner
                meaning we've got a complete tag and have pushed it onto
                _scanBuffer. If you want to do something immediately with
                each tag, speficfy a tagReceiveCallback()
            */
            if (that.tagReceiveCallback instanceof Function){
                let thisOne = that._found[(that._found.length -1)];
                requestAnimationFrame(() => { that.tagReceiveCallback(thisOne, that); });
            }

        }else if (kpevt.key == "Shift"){
            that._shiftFlag = true;
        }else{
            that._scanBuffer.push(that._shiftFlag?kpevt.key.toUpperCase():kpevt.key);
            if (that._shiftFlag == true){ that._shiftFlag = false; }
        }
    } // don't fire if anything has focus (classy move!)

    // handy debug statements
    if (that.debug){
        console.log(`${that._className} v${that._version} | scanHandler() | active HTML element is: ${document.activeElement.tagName}`);
        console.log(`${that._className} v${that._version} | scanHandler() | received kestroke: ${kpevt.code} -> ${kpevt.key}`);
    }
}




// isTyping getter and setter
get isTyping(){ return(this._isTyping); }
set isTyping(v){
    let that = this;
    let b = (v == true);

    // seting true from false, setup the timer to check the timeout
    if ((! that._isTyping) && (b == true)){
        that._scanBuffer = [];
        if (that.scanStartCallback instanceof Function){ that.scanStartCallback(that); }
        that.isTypingTimer = setInterval(function(){
            if ((that.lastKeyPress > 0) && ((that.epochTimestamp(true) - that.lastKeyPress) > that.isTypingTimeout)){
                clearInterval(that.isTypingTimer);
                that.isTyping = false;
            }
        }, that.isTypingCheckInterval);

    // setting false from true
    }else if ((that._isTyping == true) && (b == false)){

        // input stream has terminated, reset _found array and call scanEndCallback with the result set if it's specified
        window.requestAnimationFrame(function(){
            if (! that.isTyping){
                if (that.scanEndCallback instanceof Function){ that.scanEndCallback(that._found.slice(), that); }

                // reset the found tag buffer (so if you doin something be sure to *clone* this array not just pass a pointer)
                that._found = [];
            }
        }, that.scanIndicatorTimeout);
    }

    // set the value
    this._isTyping = b;
}




/*
    enableListener (bool)
    this sets up or removes the keystroke listener on document.body
*/
get enableListener(){ return(this._enableListener); }
set enableListener(b){
    let that = this;
    if ((that._enableListener == false) && (b == true)){

        // bind the scanHandler to keydown event
        that.scanListener = that.getEventListenerWrapper(function(evt, sr){ that.scanHandler(evt); });
        document.addEventListener('keydown', that.scanListener);

    }else if ((this._enableListener == true) && (b == false)){

        // remove the listener
        if (that.scanListener instanceof Function){
            document.removeEventListener('keydown', that.scanListener);
            that.scanListener = null;
        }
    }
    that._enableListener = (b === true);
}




/*
    getEventListenerWrapper(<functionReference>)
    return a function in which we call thusly:
        functionReference(event, self)

    this allows us to pass a self reference to event handlers
    and it allows you to save a variable reference to the function
    so you can remove it from the eventHanler later

    grr -- borrowed from noiceCoreUI.
    I mean yeah I get it, it seems to belong over there but
    not really. Almost like it belongs in noiceCoreUtility, but
    there's no guarantee there's a DOM over there so ... yeah
    whatevz.

    copy/paste is the original inheritance system anyhoo LOL
*/
getEventListenerWrapper(functionReference){
    let that = this;
    return(
        function(e){ functionReference(e, that); }
    )
}




}
export { noiceScannerInput };
