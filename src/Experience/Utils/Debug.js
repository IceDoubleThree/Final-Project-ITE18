import * as dat from "lil-gui"

export default class Debug {
    constructor() {
        this.active = window.location.hash === '#debug'

        // http://localhost:5173/#debug and refresh

        if(this.active) {
            this.ui = new dat.GUI()
        }

        
    }
}