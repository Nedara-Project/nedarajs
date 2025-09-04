/**
 * NedaraJS - Minimalist JavaScript Framework
 * =========================================
 *
 * @project    NedaraJS
 * @version    0.1.3-alpha
 * @license    MIT
 * @copyright  (c) 2025 Nedara Project
 * @author     Andrea Ulliana
 *
 * @repository https://github.com/Nedara-Project/nedarajs
 * @overview   Lightweight framework for component-based web development
 *
 * @published  2025-04-07
 * @modified   2025-08-15
 */

"use strict";

const Nedara = (function ($) {
    const widgets = {};
    let templateDoc = null;

    // ************************************************************
    // * PRIVATE
    // ************************************************************

    /**
     * @private
     * @param {String} id
     * @returns
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
     * @returns
     */
    async function importTemplates(url) {
        try {
            const response = await fetch(url);
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
     * @returns
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
                    const innerProcessed = processConditionals(inner, context);

                    if (conditionValue) {
                        const ifSection = innerProcessed.split("{{else}}")[0];
                        return ifSection.trim();
                    } else if (inner.includes("{{else}}")) {
                        const elseSection = innerProcessed.split("{{else}}")[1];
                        return elseSection.trim();
                    }
                    return "";
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
                        const ifSection = innerProcessed.split("{{subelse}}")[0];
                        return ifSection.trim();
                    } else if (inner.includes("{{subelse}}")) {
                        const elseSection = innerProcessed.split("{{subelse}}")[1];
                        return elseSection.trim();
                    }
                    return "";
                },
            );
        }

        function processNestedLoops(content, context) {
            return content.replace(
                /\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/gm,
                (match, key, section) => {
                    const array = getValueFromPath(context, key);
                    if (!array || !Array.isArray(array)) {
                        return "";
                    }

                    return array.map((item) => {
                        let processed = section;

                        processed = processConditionals(processed, item);
                        processed = processSubConditionals(processed, item);

                        processed = processed.replace(
                            /\{\{([\w.]+)\}\}/g,
                            (m, variable) => {
                                const val = getValueFromPath(item, variable);
                                return val !== undefined ? val : m;
                            },
                        );

                        processed = processNestedLoops(processed, item);
                        return processed;
                    }).join("");
                },
            );
        }

        let rendered = processNestedLoops(templateContent, data);
        rendered = processConditionals(rendered, data);
        rendered = processSubConditionals(rendered, data);

        rendered = rendered.replace(
            /\{\{#if (.+?)\}\}([\s\S]*?)\{\{\/if\}\}/gm,
            (match, condition, section) => {
                const conditionResult = evaluateExpression(condition.trim(), data);
                if (conditionResult) {
                    return section.split("{{else}}")[0].trim();
                } else if (section.includes("{{else}}")) {
                    return section.split("{{else}}")[1].trim();
                }
                return "";
            },
        );

        rendered = rendered.replace(
            /\{\{([\w.]+)\}\}/gm,
            (match, key) => {
                const val = getValueFromPath(data, key);
                return val !== undefined ? val : match;
            },
        );

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
     * @returns
     */
    function createWidget(options) {
        const defaultOptions = {
            container: document,
            selector: "",
            events: {
                'click [data-js-function]': '_fnTrigger',
            },
            start: function () {},
            end: function () {},
            _fnTrigger: function (ev) {
                const jsFunction = $(ev.currentTarget).data("jsFunction");
                if (jsFunction) {
                    this[jsFunction](ev);
                }
            },
        };
        options.events = Object.assign(defaultOptions.events, options.events);
        options['_fnTrigger'] = defaultOptions._fnTrigger;
        const widget = {
            ...defaultOptions,
            ...options,
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
                    const [eventName, selector] = key.split(" ");
                    const handler = this[this.events[key]];
                    if (handler) {
                        $container.on(
                            eventName,
                            this.selector + (selector ? " " + selector : ""),
                            function (e) {
                                handler.call(self, e);
                            },
                        );
                    }
                });
            },
            refresh: function () {
                this._bindEvents();
            },
            destroy: function () {
                this.end();
                const $container = $(this.container);
                Object.keys(this.events || {}).forEach((key) => {
                    const [eventName, selector] = key.split(" ");
                    $container.off(
                        eventName,
                        this.selector + (selector ? " " + selector : ""),
                    );
                });
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
        registeredWidgets: widgets,
    };
})(jQuery);

export default Nedara;
