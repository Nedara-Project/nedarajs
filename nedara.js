/**
 * NedaraJS - Minimalist JavaScript Framework
 * =========================================
 *
 * @project    NedaraJS
 * @version    0.1.6-alpha
 * @license    MIT
 * @copyright  (c) 2025 Nedara Project
 * @author     Andrea Ulliana
 *
 * @repository https://github.com/Nedara-Project/nedarajs
 * @overview   Lightweight framework for component-based web development
 *
 * @published  2025-04-07
 * @modified   2026-06-17
 */

"use strict";

const Nedara = (function () {
    const widgets = {};
    let templateDoc = null;
    let _widgetCounter = 0;

    // ************************************************************
    // * DOM UTILITY (NEl)
    // ************************************************************

    /**
     * Minimal DOM wrapper — replaces jQuery's $() for internal and user-facing
     * element manipulation. Accessible via Nedara.el(source).
     */
    class NEl {
        constructor(source) {
            if (Array.isArray(source)) {
                this.elements = source.filter(n => n instanceof Element || n instanceof Document);
            } else if (source instanceof NEl) {
                this.elements = [...source.elements];
            } else if (source instanceof Element || source instanceof Document) {
                this.elements = [source];
            } else if (source instanceof NodeList || source instanceof HTMLCollection) {
                this.elements = Array.from(source);
            } else if (typeof source === 'string' && source.trim()) {
                this.elements = Array.from(document.querySelectorAll(source));
            } else {
                this.elements = [];
            }
        }

        get length() { return this.elements.length; }
        get(i) { return this.elements[i]; }

        find(selector) {
            const found = [];
            this.elements.forEach(el => {
                if (el.querySelectorAll) found.push(...Array.from(el.querySelectorAll(selector)));
            });
            return new NEl(found);
        }

        html(content) {
            if (content === undefined) return this.elements[0]?.innerHTML ?? '';
            this.elements.forEach(el => { el.innerHTML = content; });
            return this;
        }

        text(content) {
            if (content === undefined) return this.elements[0]?.textContent ?? '';
            this.elements.forEach(el => { el.textContent = content; });
            return this;
        }

        addClass(...classes) {
            const cls = classes.flatMap(c => c.split(/\s+/));
            this.elements.forEach(el => el.classList.add(...cls));
            return this;
        }

        removeClass(...classes) {
            const cls = classes.flatMap(c => c.split(/\s+/));
            this.elements.forEach(el => el.classList.remove(...cls));
            return this;
        }

        toggleClass(cls, force) {
            this.elements.forEach(el => el.classList.toggle(cls, force));
            return this;
        }

        toggle(show) {
            this.elements.forEach(el => {
                el.style.display = show === undefined
                    ? (el.style.display === 'none' ? '' : 'none')
                    : (show ? '' : 'none');
            });
            return this;
        }

        attr(name, value) {
            if (value === undefined) return this.elements[0]?.getAttribute(name) ?? undefined;
            this.elements.forEach(el => el.setAttribute(name, value));
            return this;
        }

        val(value) {
            if (value === undefined) return this.elements[0]?.value;
            this.elements.forEach(el => { el.value = value; });
            return this;
        }

        data(name) {
            const el = this.elements[0];
            if (!el?.dataset) return undefined;
            const raw = el.dataset[name];
            if (raw === undefined) return undefined;
            try { return JSON.parse(raw); } catch { return raw; }
        }

        closest(selector) {
            const el = this.elements[0]?.closest(selector);
            return new NEl(el ? [el] : []);
        }

        each(fn) {
            this.elements.forEach((el, i) => fn.call(el, i, el));
            return this;
        }
    }

    // ************************************************************
    // * PRIVATE
    // ************************************************************

    function _resolveElement(source) {
        if (!source) return null;
        if (source instanceof Element || source instanceof Document) return source;
        if (typeof source === 'string') return document.querySelector(source);
        return null;
    }

    /**
     * @private
     * @param {String} id
     * @returns {String|null}
     */
    function _getTemplate(id) {
        if (!templateDoc) {
            console.error("Templates were not imported");
            return null;
        }
        const template = templateDoc.getElementById(id);
        if (!template) {
            console.error(`Template with ID "${id}" was not found`);
            return null;
        }
        return template.innerHTML.trim();
    }

    /**
     * @private
     * @param {*} val
     * @returns {String}
     */
    function _escapeHtml(val) {
        return String(val)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function getValueFromPath(obj, path) {
        return path.split(".").reduce((acc, key) => {
            if (acc && typeof acc === "object" && key in acc) {
                return acc[key];
            }
            return undefined;
        }, obj);
    }

    function evaluateExpression(expr, context) {
        const sanitized = expr.replace(/\b[\w.]+\b/g, (match) => {
            const val = getValueFromPath(context, match);
            if (val !== undefined) {
                return typeof val === "string" ? JSON.stringify(val) : val;
            }
            return match;
        });

        try {
            return Function('"use strict"; return (' + sanitized + ')')();
        } catch (err) {
            console.error("Error evaluating expression:", expr, err);
            return false;
        }
    }

    // ************************************************************
    // * TEMPLATE ENGINE
    // ************************************************************

    /**
     * Converts a template string into a flat list of typed tokens.
     *
     * Token types and their regex alternatives (in priority order):
     *   RAW_VAR    {{{key}}}
     *   IF         {{#if expr}}
     *   ENDIF      {{/if}}
     *   ELSE       {{else}}
     *   LOOP_START {{#key}}
     *   LOOP_END   {{/key}}
     *   VAR        {{key}}
     *
     * Text between tags is emitted as TEXT tokens.
     * Ordering matters: specific patterns appear before general ones so that
     * e.g. {{/if}} is never captured by the generic {{/key}} alternative.
     *
     * @private
     */
    function _tokenize(template) {
        const tokens = [];
        const re = /\{\{\{([\w.]+)\}\}\}|\{\{#if\s+(.+?)\}\}|\{\{\/if\}\}|\{\{else\}\}|\{\{#([\w.]+)\}\}|\{\{\/([\w.]+)\}\}|\{\{([\w.]+)\}\}/g;
        let last = 0;
        let m;
        while ((m = re.exec(template)) !== null) {
            if (m.index > last) tokens.push({ type: 'TEXT', value: template.slice(last, m.index) });
            if      (m[1] != null) tokens.push({ type: 'RAW_VAR',    key:  m[1] });
            else if (m[2] != null) tokens.push({ type: 'IF',         expr: m[2].trim() });
            else if (m[0] === '{{/if}}')  tokens.push({ type: 'ENDIF' });
            else if (m[0] === '{{else}}') tokens.push({ type: 'ELSE' });
            else if (m[3] != null) tokens.push({ type: 'LOOP_START', key:  m[3] });
            else if (m[4] != null) tokens.push({ type: 'LOOP_END',   key:  m[4] });
            else if (m[5] != null) tokens.push({ type: 'VAR',        key:  m[5] });
            last = re.lastIndex;
        }
        if (last < template.length) tokens.push({ type: 'TEXT', value: template.slice(last) });
        return tokens;
    }

    /**
     * Recursive-descent parser: turns a token list into an AST.
     *
     * Node shapes:
     *   { type: 'text', value }
     *   { type: 'var',  key, raw }
     *   { type: 'if',   expr, ifBranch: Node[], elseBranch: Node[] }
     *   { type: 'loop', key,  body: Node[] }
     *
     * Each block tag consumes its own closing tag before returning,
     * so any level of nesting is handled correctly without special cases.
     *
     * @private
     */
    function _parse(tokens) {
        let pos = 0;

        function parseBlock(stop) {
            const result = [];
            while (pos < tokens.length) {
                const t = tokens[pos];
                if (stop.includes(t.type)) break;

                if (t.type === 'TEXT') {
                    result.push({ type: 'text', value: t.value });
                    pos++;
                } else if (t.type === 'VAR') {
                    result.push({ type: 'var', key: t.key, raw: false });
                    pos++;
                } else if (t.type === 'RAW_VAR') {
                    result.push({ type: 'var', key: t.key, raw: true });
                    pos++;
                } else if (t.type === 'IF') {
                    const expr = t.expr;
                    pos++;
                    const ifBranch = parseBlock(['ELSE', 'ENDIF']);
                    let elseBranch = [];
                    if (pos < tokens.length && tokens[pos].type === 'ELSE') {
                        pos++;
                        elseBranch = parseBlock(['ENDIF']);
                    }
                    if (pos < tokens.length && tokens[pos].type === 'ENDIF') pos++;
                    result.push({ type: 'if', expr, ifBranch, elseBranch });
                } else if (t.type === 'LOOP_START') {
                    const key = t.key;
                    pos++;
                    const body = parseBlock(['LOOP_END']);
                    if (pos < tokens.length && tokens[pos].type === 'LOOP_END') pos++;
                    result.push({ type: 'loop', key, body });
                } else {
                    pos++; // orphaned closing tag in invalid template — skip
                }
            }
            return result;
        }

        return parseBlock([]);
    }

    /**
     * Recursively renders an AST node list against a data context.
     * @private
     */
    function _renderNodes(nodeList, context) {
        return nodeList.map(n => {
            switch (n.type) {
                case 'text':
                    return n.value;
                case 'var': {
                    const val = getValueFromPath(context, n.key);
                    if (val == null) return '';
                    return n.raw ? String(val) : _escapeHtml(val);
                }
                case 'if':
                    return _renderNodes(
                        evaluateExpression(n.expr, context) ? n.ifBranch : n.elseBranch,
                        context
                    );
                case 'loop': {
                    const arr = getValueFromPath(context, n.key);
                    if (!Array.isArray(arr)) return '';
                    return arr.map(item =>
                        _renderNodes(n.body, { ...context, ...item })
                    ).join('');
                }
                default:
                    return '';
            }
        }).join('');
    }

    // ************************************************************
    // * PUBLIC
    // ************************************************************

    /**
     * @public
     * @param {String} url
     * @returns {Promise<void>}
     */
    async function importTemplates(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} — could not load templates from "${url}"`);
            }
            const html = await response.text();
            const parser = new DOMParser();
            templateDoc = parser.parseFromString(html, "text/html");
        } catch (error) {
            console.error("Error while importing template:", error);
        }
    }

    /**
     * @public
     * @param {String} id
     * @param {Object} data
     * @returns {String}
     */
    function renderTemplate(id, data = {}) {
        const templateContent = _getTemplate(id);
        if (!templateContent) return '';
        const ast = _parse(_tokenize(templateContent));
        return _renderNodes(ast, data).replace(/nedara-(\w+)/g, '$1');
    }

    /**
     * @public
     * @param {String} name
     * @param {Object} widgetObject
     */
    function registerWidget(name, widgetObject) {
        widgets[name] = widgetObject;
    }

    /**
     * @public
     * @param {Object} options
     * @returns {Object}
     */
    function createWidget(options) {
        const widgetId = ++_widgetCounter;

        // Methods that must never be invoked via data-js-function from the DOM.
        const BLOCKED_METHODS = new Set([
            'init', 'start', 'end', 'refresh', 'destroy', 'extend',
            '_bindEvents', '_unbindEvents', '_checkSelectorAndContainer', '_fnTrigger',
        ]);

        function _fnTrigger(ev) {
            const jsFunction = ev.currentTarget?.dataset?.jsFunction;
            if (jsFunction && !BLOCKED_METHODS.has(jsFunction) && typeof this[jsFunction] === 'function') {
                this[jsFunction](ev);
            }
        }

        // Merge without mutating the caller's options object.
        const mergedOptions = {
            container: document,
            selector: "",
            start: function () {},
            end: function () {},
            ...options,
            events: Object.assign(
                { 'click [data-js-function]': '_fnTrigger' },
                options.events,
            ),
            _fnTrigger: _fnTrigger,
        };

        const widget = {
            ...mergedOptions,
            _widgetId: widgetId,
            _boundListeners: [],
            init: function () {
                this._bindEvents();
                if (this._checkSelectorAndContainer()) {
                    const container = _resolveElement(this.container);
                    this.$container = new NEl(container);
                    this.$selector = this.selector
                        ? this.$container.find(this.selector)
                        : this.$container;
                    this.start();
                }
            },
            _checkSelectorAndContainer: function () {
                const container = _resolveElement(this.container);
                return !!(
                    container &&
                    (this.selector === "" || container.querySelector(this.selector))
                );
            },
            _bindEvents: function () {
                const self = this;
                const container = _resolveElement(this.container);
                if (!container) return;

                Object.keys(this.events || {}).forEach((key) => {
                    const spaceIdx = key.indexOf(" ");
                    const eventName = spaceIdx === -1 ? key : key.slice(0, spaceIdx);
                    const delegateSel = spaceIdx === -1 ? "" : key.slice(spaceIdx + 1);
                    const handler = this[this.events[key]];
                    if (!handler) return;

                    const fullSel = (this.selector + (delegateSel ? " " + delegateSel : "")).trim();

                    const listener = function (e) {
                        // Resolve the actual target element (text nodes have no closest()).
                        const target = e.target instanceof Element ? e.target : e.target?.parentElement;
                        if (!target) return;

                        if (fullSel) {
                            const matched = target.closest(fullSel);
                            if (!matched || !container.contains(matched)) return;
                            // Proxy ev.currentTarget to the matched delegated element,
                            // mirroring jQuery's delegation behaviour.
                            const proxy = new Proxy(e, {
                                get(t, prop) {
                                    if (prop === 'currentTarget') return matched;
                                    const v = t[prop];
                                    return typeof v === 'function' ? v.bind(t) : v;
                                },
                            });
                            handler.call(self, proxy);
                        } else {
                            handler.call(self, e);
                        }
                    };

                    container.addEventListener(eventName, listener);
                    this._boundListeners.push({ container, eventName, listener });
                });
            },
            _unbindEvents: function () {
                this._boundListeners.forEach(({ container, eventName, listener }) => {
                    container.removeEventListener(eventName, listener);
                });
                this._boundListeners = [];
            },
            refresh: function () {
                this._unbindEvents();
                this._bindEvents();
            },
            destroy: function () {
                this.end();
                this._unbindEvents();
            },
            extend: function (extensions) {
                const newWidget = Object.assign({}, this, extensions);
                newWidget.events = {
                    ...this.events,
                    ...extensions.events,
                };
                newWidget._boundListeners = [];
                return newWidget;
            },
        };

        widget.init();
        return widget;
    }

    return {
        widgets: widgets,
        registerWidget: registerWidget,
        createWidget: createWidget,
        importTemplates: importTemplates,
        renderTemplate: renderTemplate,
        el: (source) => new NEl(source),
    };
})();

export default Nedara;
