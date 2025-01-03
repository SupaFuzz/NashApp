/*
    noiceCrypto.js
    this a noiceCoreChildClass extension that implements
    an object that can (porortedly somewhat securely) encrypt
    and decrypt strings with a given passphrase using only
    the vanilla crypto.subtle API

    this is adapted/stolen from:
    https://gist.github.com/chrisveness/770ee96945ec12ac84f134bf538d89fb

    I mean ...  seems like it works ok ...
    yolo!
*/
import { isNull, getGUID, noiceObjectCore, noiceCoreChildClass } from './noiceCore.js';
class noiceCrypto extends noiceCoreChildClass {




// constructor
constructor(args, defaults, callback){
    let _classDefaults = noiceObjectCore.mergeClassDefaults({
        _version: 1,
        _className: 'noiceCrypto',
        _usedGUIDs: [],
        _salt: null,
        usedGUIDMaxCache: 1000,
        keyLength: 32,
        ivLength: 16
    }, defaults);

    // set it up
    super(args, _classDefaults, callback);

    // generate a random salt if not created with one
    if (! (this._salt instanceof Uint8Array)){ this.salt = getGUID(); }
}




/*
    salt setter/getter
*/
set salt(v){
    if (isNull(v)){
        throw(`${this._className} v${this._version} | set salt() | no salt value specified`);
    }else{
        this._salt = this.utf8ToUint8Array(v);
    }
}
get salt(){
    return((this._salt instanceof Uint8Array)?this.arrayBufferToUtf8(this._salt):null);
}




/*
    async deriveKeyAndIv(password, salt)
*/
async deriveKeyAndIv(password, salt){
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      password,
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const numBits = (this.keyLength + this.ivLength) * 8
    const derviedBytes = await crypto.subtle.deriveBits({
      name: 'PBKDF2',
      hash: 'SHA-512',
      salt,
      iterations: 10000
    }, passwordKey, numBits)
    const key = await crypto.subtle.importKey(
      'raw',
      derviedBytes.slice(0, this.keyLength),
      'AES-GCM',
      false,
      ['encrypt', 'decrypt']
    )
    const iv = derviedBytes.slice(this.keyLength, this.keyLength + this.ivLength)
    return {
      key,
      iv
    }
}




/*
    async encrypt(password, salt, plainText)
*/
async encrypt(password, salt, plainText){
    const { key, iv } = await this.deriveKeyAndIv(password, salt)
    return (
        crypto.subtle.encrypt({
            name: 'AES-GCM',
            iv
        }, key, plainText)
    );
}




/*
    async (password, salt, cipher)
*/
async decrypt(password, salt, cipher){
    const { key, iv } = await this.deriveKeyAndIv(password, salt)
    return crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv
    }, key, cipher);
}




/*
    utf8ToUint8Array(input)
*/
utf8ToUint8Array(input){
    return(new TextEncoder().encode(input));
}




/*
    arrayBufferToUtf8(input)
*/
arrayBufferToUtf8(input){
    return(new TextDecoder().decode(new Uint8Array(input)));
}




/*
    arrayBufferToHex(input)
*/
arrayBufferToHex(input){
    input = new Uint8Array(input)
    const output = []
    for (let i = 0; i < input.length; ++i) {
      output.push(input[i].toString(16).padStart(2, '0'))
    }
    return output.join('');
}




/*
    hexToArrayBuffer(hexString)
    google ai wrote this function for me. no shit.
*/
hexToArrayBuffer(hexString) {
  if (hexString.length % 2 !== 0) {
    throw new Error("Invalid hex string: length must be even");
  }

  const buffer = new ArrayBuffer(hexString.length / 2);
  const view = new Uint8Array(buffer);

  for (let i = 0; i < hexString.length; i += 2) {
    view[i / 2] = parseInt(hexString.substr(i, 2), 16);
  }

  return buffer;
}



/*
    async encryptString(string, password)
*/
encryptString(string, password){
    let that = this;
    return(new Promise((toot, boot) => {
        const p = that.utf8ToUint8Array(password);
        const d = that.utf8ToUint8Array(string);
        that.encrypt(p, that._salt, d).then((c) => {
            toot(that.arrayBufferToHex(c))
        }).catch((error) => {
            boot(error);
        })
    }));
}




/*
    async decryptString(string, password)
*/
async decryptString(string, password){
    let that = this;
    return(new Promise((toot, boot) => {
        const p = that.utf8ToUint8Array(password);
        const s = that.hexToArrayBuffer(string);
        this.decrypt(p, that._salt, s).then((b) => {
            toot(that.arrayBufferToUtf8(b));
        }).catch((error) => {
            boot(error);
        });
    }));
}




}
export { noiceCrypto };
