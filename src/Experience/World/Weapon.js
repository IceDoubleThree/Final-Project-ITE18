export default class Weapon {
    constructor(name, options = {}) {
        this.name = name
        this.damage = options.damage || 10
        this.range = options.range || 100
        this.fireRate = options.fireRate || 0.5
        this.isAutomatic = options.isAutomatic || false
        
        this.lastShootTime = 0
    }

    shoot(time) {
        if (time - this.lastShootTime < this.fireRate) return false
        
        this.lastShootTime = time
        console.log(`Bang! ${this.name} fired.`)
        return true
    }
}