/*
    noiceBalloonDialog.js

    this implements a full screen modal dialog
    that looks something like this:

        _____/\________________________
        |  <title>  | <hdrContent>      |
        --------------------------------
        |                               |
        |      <dialogContent>          |
        |                               |
        |                               |
        ---------------------------------

    I'll write the docs as I go.
    hold my white claw ...

    element accessors:
        * title
        * hdrContent
        * dialogContent
    positioning accessors:
        * x
        * y
        * right
        * bottom
        * width
        * arrow
    workflow accessors:
        * allowExit

*/
import { noiceCoreUIElement } from './noiceCoreUI.js';
import { noiceObjectCore } from './noiceCore.js';

class noiceBalloonDialog extends noiceCoreUIElement {




/*
    constructor
*/
constructor(args, defaults, callback){

    // instantiate
    super(args, noiceObjectCore.mergeClassDefaults({
        _version:                   2.2,
        _className:                 'noiceBalloonDialog',
        _x:                         null,
        _y:                         null,
        _right:                     null,
        _bottom:                    null,
        _width:                     'auto',
        _arrow:                     'topRight',
        _allowExit:                 true,
        _zIndex:                    8,
        debug:                      false
    },defaults),callback);

    this.setup();

} // end constructor




/*
    html getter
*/
get html(){return(
    `<div class="dialog" data-templatename="dialog" style="
        display: grid;
        grid-template-columns: 1fr;
        place-items:center;
     ">
        <div class="body">
            <div class="dialogHeader" style="
                display: grid;
                grid-template-columns: auto 5em;
                width:100%;
                border-color:transparent;
                border-width:0;
            ">
                <span class='dialogHeaderTitle' data-templatename="title" data-templateattribute="true" style="align-self: center;">${this.title}</span>
                <div class='dialogHeaderBtnFrame' data-templatename="hdrContent" data-templateattribute="true">${this.hdrContent}</div>
            </div>
            <div class='dialogContent' data-templatename="dialogContent" data-templateattribute="true" style="width:auto;height:auto;">${this.dialogContent}</div>
        </div>
    </div>`
)};




/*
    setup()
*/
setup(){

    // make the DOMElement container a modal full-screen overlay
    let myNecessaryStyle = {
        position:       'absolute',
        overflow:       'hidden',
        display:        'flex',
        justifyContent: 'center',
        alignItems:     'center',
        width:          '100%',
        height:         '100%',
        left:           '0',
        top:            '0',
        zIndex:         this.zIndex
    };
    Object.keys(myNecessaryStyle).forEach(function(k){ this.DOMElement.style[k] = myNecessaryStyle[k]; }, this);

    // init positioning props if we have 'em'
    ['x', 'y', 'right', 'bottom', 'width', 'arrow'].forEach(function(attr){ this[attr] = this[attr]; }, this);

    // setup exit listener & override
    let that = this;
    that.bodyClickListener = this.getEventListenerWrapper(function(evt){ that.bodyClickHandler(evt); });
    this._DOMElements.dialog.addEventListener('click', that.bodyClickListener);

    that.exitClickListener = this.getEventListenerWrapper(function(evt){ that.exitClickHandler(evt); });
    that.DOMElement.addEventListener('click', that.exitClickListener);

    // if we have a setPosition() function call it on orientationchange
    if (that.setPosition instanceof Function){

        // orientation change listener
        that.orientationChangeListener = that.getEventListenerWrapper(function(evt, selfReference){
            if (screen && screen.orientation){
                /*
                    7/6/22
                    NOTE: on windows tablet chrome/edge at least,
                    the setTimeout is a brute-force way to wait until
                    screen.orientation/change has completed. There ought
                    to be a better way than this but it's the best I can
                    figure at the moment
                */
                setTimeout(function(){ that.setPosition(that); }, 100);
            }else{
                that.setPosition(that);
            }
        });
        if (screen && screen.orientation){
            screen.orientation.addEventListener('change', that.orientationChangeListener);
        }else{
            window.addEventListener("orientationchange", that.orientationChangeListener);
        }
        // hookup window resize on it too
        window.onresize = that.orientationChangeListener;
    }

}




/*
    positioning
*/
get x(){ return( this._x); }
set x(v){
    if ((this._DOMElements.dialog instanceof Element) && (! (isNaN(parseInt(v))))){
        if (this._DOMElements.dialog.style.position != 'absolute'){ this._DOMElements.dialog.style.position = 'absolute'; }
        this._DOMElements.dialog.style.left = `${v}px`;
    }
    this._x = v;
}
get y(){ return( this._y); }
set y(v){
    if ((this._DOMElements.dialog instanceof Element) && (! (isNaN(parseInt(v))))){
        if (this._DOMElements.dialog.style.position != 'absolute'){ this._DOMElements.dialog.style.position = 'absolute'; }
        this._DOMElements.dialog.style.top = `${v}px`;
    }
    this._y = v;
}
get right(){ return( this._right); }
set right(v){
    if ((this._DOMElements.dialog instanceof Element) && (! (isNaN(parseInt(v))))){
        if (this._DOMElements.dialog.style.position != 'absolute'){ this._DOMElements.dialog.style.position = 'absolute'; }
        this._DOMElements.dialog.style.right = `${v}px`;
    }
    this._right = v;
}
get bottom(){ return( this._bottom); }
set bottom(v){
    if ((this._DOMElements.dialog instanceof Element) && (! (isNaN(parseInt(v))))){
        if (this._DOMElements.dialog.style.position != 'absolute'){ this._DOMElements.dialog.style.position = 'absolute'; }
        this._DOMElements.dialog.style.bottom = `${v}px`;
    }
    this._bottom = v;
}
get width(){ return(this._width); }
set width(v){
    if (this._DOMElements.dialog instanceof Element){
        if (this._DOMElements.dialog.style.position != 'absolute'){ this._DOMElements.dialog.style.position = 'absolute'; }
        this._DOMElements.dialog.style.width = `${v}`;
    }
    this._width = v;
}
get arrow(){ return(this._arrow); }
set arrow(v){
    this._arrow = v;
    if (this.DOMElement instanceof Element){ this.DOMElement.dataset.arrow = this.arrow; }
}
get zIndex(){ return( this._zIndex); }
set zIndex(v){
    this._zIndex= v;
    if ((this.DOMElement instanceof Element) && (! (isNaN(parseInt(v))))){
        this.DOMElement.style.zIndex = this.zIndex;
    }
}



/*
    appendCallback
    if we have the setPosition function call it
    whenever we get put onScreen
*/
appendCallback(selfReference){
    if (this.setPosition instanceof Function){ this.setPosition(selfReference); }
}





/*
    allowExit
*/
get allowExit(){ return(this._allowExit); }
set allowExit(v){ this._allowExit = (v === true); }




/*
    bodyClickHandler()
    primarily this is here to preventDefault() when allowExit is on'
    NOTE: are you troubleshooting something? --> setDOMAttribute CLONES yo :-)
*/
bodyClickHandler(evt){
    if (this.allowExit){
        evt.stopPropagation();
    }
}




/*
    exitClickHandler()
    closes the dialog when it loses focus if allowExit is on
*/
exitClickHandler(evt){
    let that = this;
    if (this.allowExit){
        if (this.exitCallback instanceof Function){
            let abrt = false;
            this.exitCallback(that).catch(function(error){
                if (that.debug){ console.log(`${that._className} v${that._version} | exitClickHandler() -> exitCallback() | cancelled exit: ${error}`); }
                abrt = true;
            }).then(function(){
                if (! abrt){ that.remove(); }
            });
        }else{
            this.remove();
        }
    }
}




} // end noiceBalloonDialog

export { noiceBalloonDialog };
