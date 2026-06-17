/**
 * NedaraJS - Minimalist JavaScript Framework
 * =========================================
 *
 * @project    NedaraJS
 * @version    0.1.5-alpha
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

const Nedara = (function ($) {
    const widgets = {};
    let templateDoc = null;
    let _widgetCounter = 0;

    // ************************************************************
    // * PRIVATE
    // ************************************************************

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
        if (!templateContent) {
            return "";
        }

        function processConditionals(content, context) {
            return content.replace(
                /\{\{#if (.+?)\}\}([\s\S]*?)\{\{\/if\}\}/gm,
                (match, conditionExpr, inner) => {
                    const conditionValue = evaluateExpression(conditionExpr.trim(), context);
                    const [ifPart, elsePart] = inner.split("{{else}}").map(s => s.trim());
                    return conditionValue ? ifPart : (elsePart || "");
                },
            );
        }

        function processSubConditionals(content, context) {
            return content.replace(
                /\{\{#subif (.+?)\}\}([\s\S]*?)\{\{\/subif\}\}/gm,
                (match, conditionExpr, inner) => {
                    const conditionValue = evaluateExpression(conditionExpr.trim(), context);
                    const innerProcessed = processConditionals(inner, context);

                    if (conditionValue) {
                        return innerProcessed.split("{{subelse}}")[0].trim();
                    } else if (inner.includes("{{subelse}}")) {
                        return innerProcessed.split("{{subelse}}")[1].trim();
                    }
                    return "";
                },
            );
        }

        // {{{raw}}} must be processed before {{escaped}} to avoid partial matches on triple braces.
        function processVariables(content, context) {
            let result = content.replace(/\{\{\{([\w.]+)\}\}\}/g, (m, variable) => {
                const val = getValueFromPath(context, variable);
                return val != null ? String(val) : "";
            });
            result = result.replace(/\{\{([\w.]+)\}\}/g, (m, variable) => {
                const val = getValueFromPath(context, variable);
                return val != null ? _escapeHtml(val) : "";
            });
            return result;
        }

        function processNestedLoops(content, parentContext) {
            return content.replace(
                /\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/gm,
                (match, key, section) => {
                    const array = getValueFromPath(parentContext, key);
                    if (!array || !Array.isArray(array)) {
                        return "";
                    }

                    return array.map(item => {
                        const context = { ...parentContext, ...item };
                        let processed = section;
                        processed = processNestedLoops(processed, context);
                        processed = processConditionals(processed, context);
                        processed = processSubConditionals(processed, context);
                        processed = processVariables(processed, context);
                        return processed;
                    }).join("");
                },
            );
        }

        let rendered = processNestedLoops(templateContent, data);
        rendered = processConditionals(rendered, data);
        rendered = processSubConditionals(rendered, data);
        rendered = processVariables(rendered, data);
        rendered = rendered.replace(/nedara-(\w+)/g, "$1");

        return rendered;
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
        const namespace = `.nedara-${widgetId}`;

        // Methods that must never be invoked via data-js-function from the DOM.
        const BLOCKED_METHODS = new Set([
            'init', 'start', 'end', 'refresh', 'destroy', 'extend',
            '_bindEvents', '_unbindEvents', '_checkSelectorAndContainer', '_fnTrigger',
        ]);

        function _fnTrigger(ev) {
            const jsFunction = $(ev.currentTarget).data("jsFunction");
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
            _namespace: namespace,
            init: function () {
                this._bindEvents();
                if (this._checkSelectorAndContainer()) {
                    this.$container = $(this.container);
                    this.$selector = $(this.selector);
                    this.start();
                }
            },
            _checkSelectorAndContainer: function () {
                const $container = $(this.container);
                return (
                    $container.length &&
                    (this.selector === "" ||
                        $container.find(this.selector).length)
                );
            },
            _bindEvents: function () {
                const self = this;
                const $container = $(this.container);
                Object.keys(this.events || {}).forEach((key) => {
                    const spaceIdx = key.indexOf(" ");
                    const eventName = spaceIdx === -1 ? key : key.slice(0, spaceIdx);
                    const selector = spaceIdx === -1 ? "" : key.slice(spaceIdx + 1);
                    const handler = this[this.events[key]];
                    if (handler) {
                        $container.on(
                            eventName + this._namespace,
                            this.selector + (selector ? " " + selector : ""),
                            function (e) {
                                handler.call(self, e);
                            },
                        );
                    }
                });
            },
            _unbindEvents: function () {
                const $container = $(this.container);
                Object.keys(this.events || {}).forEach((key) => {
                    const spaceIdx = key.indexOf(" ");
                    const eventName = spaceIdx === -1 ? key : key.slice(0, spaceIdx);
                    const selector = spaceIdx === -1 ? "" : key.slice(spaceIdx + 1);
                    $container.off(
                        eventName + this._namespace,
                        this.selector + (selector ? " " + selector : ""),
                    );
                });
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
    };
})(jQuery);

export default Nedara;
