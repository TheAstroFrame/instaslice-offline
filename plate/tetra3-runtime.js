let wasm_bindgen = (function(exports) {
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }

    class PlateSolver {
        __destroy_into_raw() {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            PlateSolverFinalization.unregister(this);
            return ptr;
        }
        free() {
            const ptr = this.__destroy_into_raw();
            wasm.__wbg_platesolver_free(ptr, 0);
        }
        /**
         * @param {Uint8Array | number[]} index
         */
        constructor(index) {
            const ptr0 = passArray8ToWasm0(index, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.platesolver_new(ptr0, len0);
            if (ret[2]) {
                throw takeFromExternrefTable0(ret[1]);
            }
            this.__wbg_ptr = ret[0];
            PlateSolverFinalization.register(this, this.__wbg_ptr, this);
            return this;
        }
        /**
         * @param {Uint8Array | number[]} rgba
         * @param {number} width
         * @param {number} height
         * @returns {string}
         */
        solveCloseUp(rgba, width, height) {
            let deferred5_0;
            let deferred5_1;
            try {
                const val2 = +width;
                const val3 = +height;
                const ptr0 = passArray8ToWasm0(rgba, wasm.__wbindgen_malloc);
                const len0 = WASM_VECTOR_LEN;
                const ret = wasm.platesolver_solveCloseUp(this.__wbg_ptr, ptr0, len0, val2, val3);
                var ptr4 = ret[0];
                var len4 = ret[1];
                if (ret[3]) {
                    ptr4 = 0; len4 = 0;
                    throw takeFromExternrefTable0(ret[2]);
                }
                deferred5_0 = ptr4;
                deferred5_1 = len4;
                return getStringFromWasm0(ptr4, len4);
            } finally {
                wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
            }
        }
        /**
         * @param {Uint8Array | number[]} rgba
         * @param {number} width
         * @param {number} height
         * @returns {string}
         */
        solveDeepSky(rgba, width, height) {
            let deferred5_0;
            let deferred5_1;
            try {
                const val2 = +width;
                const val3 = +height;
                const ptr0 = passArray8ToWasm0(rgba, wasm.__wbindgen_malloc);
                const len0 = WASM_VECTOR_LEN;
                const ret = wasm.platesolver_solveDeepSky(this.__wbg_ptr, ptr0, len0, val2, val3);
                var ptr4 = ret[0];
                var len4 = ret[1];
                if (ret[3]) {
                    ptr4 = 0; len4 = 0;
                    throw takeFromExternrefTable0(ret[2]);
                }
                deferred5_0 = ptr4;
                deferred5_1 = len4;
                return getStringFromWasm0(ptr4, len4);
            } finally {
                wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
            }
        }
        /**
         * @param {Uint8Array | number[]} rgba
         * @param {number} width
         * @param {number} height
         * @returns {string}
         */
        solveNarrow(rgba, width, height) {
            let deferred5_0;
            let deferred5_1;
            try {
                const val2 = +width;
                const val3 = +height;
                const ptr0 = passArray8ToWasm0(rgba, wasm.__wbindgen_malloc);
                const len0 = WASM_VECTOR_LEN;
                const ret = wasm.platesolver_solveNarrow(this.__wbg_ptr, ptr0, len0, val2, val3);
                var ptr4 = ret[0];
                var len4 = ret[1];
                if (ret[3]) {
                    ptr4 = 0; len4 = 0;
                    throw takeFromExternrefTable0(ret[2]);
                }
                deferred5_0 = ptr4;
                deferred5_1 = len4;
                return getStringFromWasm0(ptr4, len4);
            } finally {
                wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
            }
        }
        /**
         * @param {Uint8Array | number[]} rgba
         * @param {number} width
         * @param {number} height
         * @param {number} catalogue
         * @returns {string | undefined}
         */
        solveQuick(rgba, width, height, catalogue) {
            const val2 = +width;
            const val3 = +height;
            const val4 = +catalogue;
            const ptr0 = passArray8ToWasm0(rgba, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.platesolver_solveQuick(this.__wbg_ptr, ptr0, len0, val2, val3, val4);
            let v5;
            if (ret[0] !== 0) {
                v5 = getStringFromWasm0(ret[0], ret[1]);
                wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
            }
            return v5;
        }
        /**
         * @param {Uint8Array | number[]} rgba
         * @param {number} width
         * @param {number} height
         * @returns {string | undefined}
         */
        solveSmallField(rgba, width, height) {
            const val2 = +width;
            const val3 = +height;
            const ptr0 = passArray8ToWasm0(rgba, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.platesolver_solveSmallField(this.__wbg_ptr, ptr0, len0, val2, val3);
            let v4;
            if (ret[0] !== 0) {
                v4 = getStringFromWasm0(ret[0], ret[1]);
                wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
            }
            return v4;
        }
        /**
         * @param {Uint8Array | number[]} rgba
         * @param {number} width
         * @param {number} height
         * @returns {string | undefined}
         */
        solveUpperSky(rgba, width, height) {
            const val2 = +width;
            const val3 = +height;
            const ptr0 = passArray8ToWasm0(rgba, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.platesolver_solveUpperSky(this.__wbg_ptr, ptr0, len0, val2, val3);
            let v4;
            if (ret[0] !== 0) {
                v4 = getStringFromWasm0(ret[0], ret[1]);
                wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
            }
            return v4;
        }
        /**
         * @param {Uint8Array | number[]} rgba
         * @param {number} width
         * @param {number} height
         * @returns {string}
         */
        solve(rgba, width, height) {
            let deferred5_0;
            let deferred5_1;
            try {
                const val2 = +width;
                const val3 = +height;
                const ptr0 = passArray8ToWasm0(rgba, wasm.__wbindgen_malloc);
                const len0 = WASM_VECTOR_LEN;
                const ret = wasm.platesolver_solve(this.__wbg_ptr, ptr0, len0, val2, val3);
                var ptr4 = ret[0];
                var len4 = ret[1];
                if (ret[3]) {
                    ptr4 = 0; len4 = 0;
                    throw takeFromExternrefTable0(ret[2]);
                }
                deferred5_0 = ptr4;
                deferred5_1 = len4;
                return getStringFromWasm0(ptr4, len4);
            } finally {
                wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
            }
        }
    }
    if (Symbol.dispose) PlateSolver.prototype[Symbol.dispose] = PlateSolver.prototype.free;
    exports.PlateSolver = PlateSolver;
    function __wbg_get_imports() {
        const import0 = {
            __proto__: null,
            __wbg___wbindgen_is_undefined_be5b34249ff1fc15: function(arg0) {
                const ret = arg0 === undefined;
                return ret;
            },
            __wbg___wbindgen_throw_4c88d8bf264fd984: function(arg0, arg1) {
                throw new Error(getStringFromWasm0(arg0, arg1));
            },
            __wbg_now_e7c6795a7f81e10f: function(arg0) {
                const ret = arg0.now();
                return ret;
            },
            __wbg_performance_7e4e4494fdc9d07a: function(arg0) {
                const ret = arg0.performance;
                return ret;
            },
            __wbg_static_accessor_GLOBAL_THIS_003ee833af9699fc: function() {
                const ret = typeof globalThis === 'undefined' ? undefined : globalThis;
                return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
            },
            __wbg_static_accessor_GLOBAL_e4293fb22cbe77da: function() {
                const ret = typeof global === 'undefined' ? undefined : global;
                return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
            },
            __wbg_static_accessor_SELF_53bb20457401453d: function() {
                const ret = typeof self === 'undefined' ? undefined : self;
                return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
            },
            __wbg_static_accessor_WINDOW_b5e0810bfecb7feb: function() {
                const ret = typeof window === 'undefined' ? undefined : window;
                return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
            },
            __wbindgen_generic_0000000000000001: function(arg0, arg1) {
                // Cast intrinsic for `Ref(String) -> Externref`.
                const ret = getStringFromWasm0(arg0, arg1);
                return ret;
            },
            __wbindgen_init_externref_table: function() {
                const table = wasm.__wbindgen_externrefs;
                table.set(0, undefined);
                table.set(1024, undefined);
                table.set(1025, null);
                table.set(1026, true);
                table.set(1027, false);
            },
        };
        return {
            __proto__: null,
            "./tetra3_bg.js": import0,
        };
    }

    const PlateSolverFinalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_platesolver_free(ptr, 1));

    function addToExternrefTable0(obj) {
        const idx = wasm.__externref_table_alloc();
        wasm.__wbindgen_externrefs.set(idx, obj);
        return idx;
    }

    function getStringFromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
    }

    let cachedUint8ArrayMemory0 = null;
    function getUint8ArrayMemory0() {
        if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
            cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
        }
        return cachedUint8ArrayMemory0;
    }

    function isLikeNone(x) {
        return x === undefined || x === null;
    }

    function passArray8ToWasm0(arg, malloc) {
        const ptr = malloc(arg.length * 1, 1) >>> 0;
        getUint8ArrayMemory0().set(arg, ptr / 1);
        WASM_VECTOR_LEN = arg.length;
        return ptr;
    }

    function takeFromExternrefTable0(idx) {
        const value = wasm.__wbindgen_externrefs.get(idx);
        wasm.__externref_table_dealloc(idx);
        return value;
    }

    let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
    cachedTextDecoder.decode();
    function decodeText(bytes) {
        return cachedTextDecoder.decode(bytes);
    }

    let WASM_VECTOR_LEN = 0;

    let wasmModule, wasmInstance, wasm;
    function __wbg_finalize_init(instance, module) {
        wasmInstance = instance;
        wasm = instance.exports;
        wasmModule = module;
        cachedUint8ArrayMemory0 = null;
        wasm.__wbindgen_start();
        return wasm;
    }

    async function __wbg_load(module, imports) {
        if (typeof Response === 'function' && module instanceof Response) {
            if (!module.ok) {
                throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
            }

            if (typeof WebAssembly.instantiateStreaming === 'function') {
                try {
                    return await WebAssembly.instantiateStreaming(module, imports);
                } catch (e) {
                    const validResponse = expectedResponseType(module.type);

                    if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                        console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                    } else { throw e; }
                }
            }

            const bytes = await module.arrayBuffer();
            return await WebAssembly.instantiate(bytes, imports);
        } else {
            const instance = await WebAssembly.instantiate(module, imports);

            if (instance instanceof WebAssembly.Instance) {
                return { instance, module };
            } else {
                return instance;
            }
        }

        function expectedResponseType(type) {
            switch (type) {
                case 'basic': case 'cors': case 'default': return true;
            }
            return false;
        }
    }

    function initSync(module) {
        if (wasm !== undefined) return wasm;


        if (module !== undefined) {
            if (Object.getPrototypeOf(module) === Object.prototype) {
                ({module} = module)
            } else {
                console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
            }
        }

        const imports = __wbg_get_imports();
        if (!(module instanceof WebAssembly.Module)) {
            module = new WebAssembly.Module(module);
        }
        const instance = new WebAssembly.Instance(module, imports);
        return __wbg_finalize_init(instance, module);
    }

    let __wbg_init_promise;
    async function __wbg_init(module_or_path) {
        if (wasm !== undefined) return wasm;
        if (__wbg_init_promise === undefined) {
            __wbg_init_promise = __wbg_init_once(module_or_path);
            __wbg_init_promise.catch(() => { __wbg_init_promise = undefined; });
        }
        return __wbg_init_promise;
    }

    async function __wbg_init_once(module_or_path) {

        if (module_or_path !== undefined) {
            if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
                ({module_or_path} = module_or_path)
            } else {
                console.warn('using deprecated parameters for the initialization function; pass a single object instead')
            }
        }

        if (module_or_path === undefined && script_src !== undefined) {
            module_or_path = script_src.replace(/\.js$/, "_bg.wasm");
        }
        const imports = __wbg_get_imports();

        if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
            module_or_path = fetch(module_or_path);
        }

        const { instance, module } = await __wbg_load(await module_or_path, imports);

        return __wbg_finalize_init(instance, module);
    }

    return Object.assign(__wbg_init, { initSync }, exports);
})({ __proto__: null });
