/*
    wcBasic.js
    Amy Hicox 5/21/24

    this is an extension of noiceAutonomousCustomElement where you can do like this:

    new wcBasic({
        content: <string || Element>,
        styleSheet:   <string || Style Element>,
        .. other attributes, I'm sure ..
    })

    content is the HTML content of the webComponent which is appended to this.shadowDOM
    if a string, will be parsed for HTML content and the resulting DOMTree will be used

    Element children of content tagged with .dataset._name will be pulled into ._elements
    (see wcUtils.pullElementReferences). Object accessors will be setup for each of these
    getting gets the .textContent, setting sets the .textContent if a string else if
    Element, empty/replace with

    style can be an Element.style object or a string to parse into one. This stylesheet
    will be inserted into the shadowDOM. Will delete previous style before setting
    (one stylesheet at a time)

    idea: constructor is traditional args object. build it like that
          make a class static function like:

            static makeWebComponent(<html>,<style>,<callbacks>)

         and basically tat wraps the classic style constructor ... noicely.
*/
import { noiceAutonomousCustomElement } from '../noiceAutonomousCustomElement.js';

class wcBasic extends noiceAutonomousCustomElement {




static classID = wcBasic;
static classAttributeDefaults = {

    /*
        we literally don't have any.
        .content and .styleSheet are really all we need to make it work

        ex types:
        disabled: { observed: true, accessor: true, type: 'bool', value: false, forceAttribute: true },
        message: { observed: true, accessor: true, type: 'str', value: '' },
        size: { observed: true, accessor: true, type: 'int', value: 20 },
        options: { observed: true, accessor: true, type: 'json', key: 'values', value: []},
        wrap: { observed: true, accessor: true, type: 'enum', values:['hard','soft','off'], value: 'off' },
        value: { observed: true, accessor: true, type: 'float', value: 1.618 },
    */
}
static observedAttributes = Object.keys(this.classID.classAttributeDefaults).filter((a) =>{ return(this.classID.classAttributeDefaults[a].observed === true); });




/*
    constructor
*/
constructor(args){
    super(args);
    this._className = 'wcBasic';
    this._version = 1;

    // attributeChangeHandlers
    this.attributeChangeHandlers = {
        /*
            ex
            label_position: (attributeName, oldValue, newValue, selfReference) => { selfReference.setLabelPosition(newValue, oldValue); },
        */
    };

    // merge object defaults
    this.mergeClassDefaults({
        _content: null
    });
}




/*
    getAttributeDefaults()
    override this in each subclass, as I can't find a more elegant way of
    referencing the static class vars in an overridable way
*/
getAttributeDefaults(){
    return(wcBasic.classAttributeDefaults);
}




/*
    getHTMLContent()
*/
getHTMLContent(){

    // new hotness
    if ((this._content instanceof Element) || this.isNotNull(this._content)){
        return(this._content);
    }else{

        // the standard noice style container div
        let div = document.createElement('div');
        div.className = this._className;

        /*
            insert default shenanigans here
        */

        return(div);
    }

}




/*
    initializedCallback(slf)
    anything you need to do only once, but *after* everything is rendered
    and this.initialized is set.

    this is called from .initialize() and .setType() (sometimes)
*/
initializedCallback(){
    /*
        doeth thine settting up things here
    */
}




/*
    defaultStyle getter
*/
get defaultStyle(){return(`
    :host {
        display: block;
    }
`)};




/*
    --------------------------------------------------------------------------------
    CUSTOM STUFF
    above this line is class-standard overrides
    --------------------------------------------------------------------------------
*/




/*
    initialize()
    this is called from connectedCallback() if this.initialized === false
    this creates all of the elements in the shadowDOM, etc.

    big override here. makes setting content pretty mucn calling
    initialize again.
*/
initialize(){

    this.spawnDefaultAttributes();

    this.shadowDOM = this.attachShadow({ mode: 'open'});
    //this.shadowDOM.appendChild(this.getHTMLContent());

    // set initial content
    this.content = this.getHTMLContent();

}



/*
    content attribute
*/
get content(){
    return((this.shadowDOM instanceof ShadowRoot)?this.shadowDOM.firstChild:this._content);
}
set content(v){

    // gitrdun
    if (this.shadowDOM instanceof ShadowRoot){
        this.shadowDOM.innerHTML = (v instanceof Element)?'':v;
        if (v instanceof Element){ this.shadowDOM.appendChild(v); }

        // override the style getter in your subclasses or alternately use the style attribute setter
        this.updateStyle();

        // mark it done so we don't do it again
        this.initialized = true;

        // if we have elementAttributes go fetch 'em and set 'em up
        this.pullElementAttributes(this.shadowDOM, true);

        // if we have elementAttributes set their value now that we have a DOM
        this.initElementAttributes();

        // if we have deferred attributes init them
        this.initDeferredAttributes();

        // if we have an initializedCallback, call it
        if (this.initializedCallback instanceof Function){ this.initializedCallback(this); }

    }else{
        this._content = v;
    }
}




/*
    textContent getter
    override does things a little bit different so we can get textContent before we're initialized
*/
get textContent(){
    return(
        this.isNotNull(this.DOMElement)?this.DOMElement.textContent:(
            (this.shadowDOM instanceof ShadowRoot) &&
            (this.shadowDOM.firstChild instanceof Element)
        )?this.shadowDOM.firstChild.textContent:this.getHTMLContent().textContent
    );
}




}
const _classRegistration = wcBasic.registerElement('wc-basic');
export { _classRegistration as wcBasic };
