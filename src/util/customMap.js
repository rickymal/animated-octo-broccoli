export default class CustoMap extends Map {
    #observer
    #customMapper
    
    constructor({observer, customMapper}) {
        super()

        this.#observer = observer
        this.#customMapper = customMapper
    }

    * values() {
        for(const value of super.values()) {
            yield this.#customMapper(value)
        }
    }

    set(...args) {
        const result = super.set(...args)
        this.#observer.notify(this)
    }
    delete(...args) {
        const result = super.delete(...args)
        this.#observer.notify(this)
    }


}


