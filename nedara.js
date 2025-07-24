/**
 * NedaraJS - Minimalist JavaScript Framework
 * =========================================
 *
 * @project    NedaraJS
 * @version    0.1.2-alpha
 * @license    MIT
 * @copyright  (c) 2025 Nedara Project
 * @author     Andrea Ulliana
 *
 * @repository https://github.com/Nedara-Project/nedarajs
 * @overview   Lightweight framework for component-based web development
 *
 * @published  2025-04-07
 * @modified   2025-07-24
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

        // Loops with nested conditionals
        function processNestedLoops(content, context) {
            return content.replace(
                /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/gm,
                (match, key, section) => {
                    const array = context[key];
                    if (!array || !Array.isArray(array)) {
                        return "";
                    }

                    return array.map((item) => {
                        let processed = section;

                        // Process conditionals inside each loop item
                        processed = processed.replace(
                            /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/gm,
                            (m, condition, inner) => {
                                const conditionValue = item[condition];
                                if (conditionValue) {
                                    const ifSection = inner.split("{{else}}")[0];
                                    return ifSection.trim();
                                } else if (inner.includes("{{else}}")) {
                                    const elseSection = inner.split("{{else}}")[1];
                                    return elseSection.trim();
                                }
                                return "";
                            },
                        );

                        // Replace variables
                        processed = processed.replace(
                            /\{\{(\w+)\}\}/g,
                            (m, variable) => (item.hasOwnProperty(variable) ? item[variable] : m),
                        );

                        // Recursively process nested loops
                        processed = processNestedLoops(processed, item);
                        return processed;
                    }).join("");
                },
            );
        }

        function processConditionals(content, context) {
            return content.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/gm, (match, condition, inner) => {
                const conditionValue = context[condition];

                // Support for nested if inside this block
                const innerProcessed = processConditionals(inner, context); // recursion

                if (conditionValue) {
                    const ifSection = innerProcessed.split("{{else}}")[0];
                    return ifSection.trim();
                } else if (inner.includes("{{else}}")) {
                    const elseSection = innerProcessed.split("{{else}}")[1];
                    return elseSection.trim();
                }
                return "";
            });
        }

        // First pass: process loops (with nested ifs handled in loop body)
        let rendered = processNestedLoops(templateContent, data);
        rendered = processConditionals(rendered, data);

        // Global-level conditionals
        rendered = rendered.replace(
            /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/gm,
            (match, condition, section) => {
                const conditionResult = data[condition];
                if (conditionResult) {
                    return section.split("{{else}}")[0].trim();
                } else if (section.includes("{{else}}")) {
                    return section.split("{{else}}")[1].trim();
                }
                return "";
            },
        );

        // Global-level simple variables
        rendered = rendered.replace(
            /\{\{(\w+)\}\}/gm,
            (match, key) => data.hasOwnProperty(key) ? data[key] : match,
        );

        // Trick used to avoid Document-Fragment behavior => section from templateContent not matching
        // Any <nedara-*> tag is rendered into original HTML tag after content rendering
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
