    import * as THREE from "three"
    import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
    import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
    import EventEmitter from "./EventEmitter"

    export default class Resources extends EventEmitter {
        constructor(sources) {
            super()

            this.sources = sources
            this.items = {}
            this.toLoad = this.sources.length
            this.loaded = 0

            this.setLoaders()
            this.startLoading()
        }

        setLoaders() {
            this.loaders = {}
            this.loaders.gltfLoader = new GLTFLoader()

            // Enable Draco decoding for compressed GLB/GLTF files.
            // Decoder files are served from Vite's publicDir (../static), under /draco/.
            this.loaders.dracoLoader = new DRACOLoader()
            this.loaders.dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
            this.loaders.gltfLoader.setDRACOLoader(this.loaders.dracoLoader)

            this.loaders.textureLoader = new THREE.TextureLoader()
            this.loaders.cubeTextureLoader = new THREE.CubeTextureLoader()
        }

        startLoading() {
            // Load each source

            // Initial progress event
            this.trigger('progress', [{ loaded: this.loaded, toLoad: this.toLoad, source: null }])

            // --- FIX START: Handle empty sources ---
            if(this.toLoad === 0) {
                setTimeout(() => {
                    this.trigger('ready')
                }, 0)
                return
            }
            // --- FIX END ---
            
            for (const source of this.sources) {
                if (source.type === 'gltfModel') {
                    this.loaders.gltfLoader.load(
                        source.path,
                        (file) => {
                            this.sourceLoaded(source, file)
                        },
                        undefined,
                        (error) => {
                            this.sourceErrored(source, error)
                        }
                    )
                } 
                else if (source.type === 'texture') {
                    this.loaders.textureLoader.load(
                        source.path,
                        (file) => {
                            this.sourceLoaded(source, file)
                        },
                        undefined,
                        (error) => {
                            this.sourceErrored(source, error)
                        }
                    )
                } 
                else if (source.type === 'cubeTexture') {
                    this.loaders.cubeTextureLoader.load(
                        source.path,
                        (file) => {
                            this.sourceLoaded(source, file)
                        },
                        undefined,
                        (error) => {
                            this.sourceErrored(source, error)
                        }
                    )
                }
            }
        }

        sourceLoaded(source, file) {
            this.items[source.name] = file
            this.loaded++

            this.trigger('progress', [{ loaded: this.loaded, toLoad: this.toLoad, source }])

            if(this.loaded === this.toLoad) {
                this.trigger('ready')
            }
        }

        sourceErrored(source, error) {
            // Still count it as "done" so the app isn't stuck forever.
            this.loaded++
            this.trigger('error', [{ source, error }])
            this.trigger('progress', [{ loaded: this.loaded, toLoad: this.toLoad, source }])

            if (this.loaded >= this.toLoad) {
                this.trigger('ready')
            }
        }
    }