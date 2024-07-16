

export class AsyncLock {

    private _locked: boolean
    private _waiting: (() => void)[]

    constructor(){
    	this._locked = false;
        this._waiting = []
    }

    acquire(){

    	if(!this._locked) {
    		this._locked = true;
			return new Promise<void>(r => r())
		} else return new Promise<void>(r => this._waiting.push(r))

    }

    release() {

        this._waiting.length > 0 ? this._waiting.shift()!() : this._locked = false

    }

}