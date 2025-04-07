/**
 * NedaraJS - Minimalist JavaScript Framework
 * =========================================
 *
 * @project    NedaraJS
 * @version    0.1.0-alpha
 * @license    MIT
 * @copyright  (c) 2025 Nedara Project
 * @author     Andrea Ulliana
 *
 * @repository https://github.com/Nedara-Project/nedarajs
 * @overview   Lightweight framework for component-based web development
 *
 * @published  2025-04-07
 * @modified   2025-04-07
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
        // Loops
        function processNestedLoops(content, context) {
            return content.replace(
                /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/gm,
                (match, key, section) => {
                    if (!context[key] || !Array.isArray(context[key])) {
                        return "";
                    }
                    return context[key]
                        .map((item) => {
                            let processedContent = section.replace(
                                /\{\{(\w+)\}\}/g,
                                (match, variable) => {
                                    return item.hasOwnProperty(variable)
                                        ? item[variable]
                                        : match;
                                },
                            );
                            // Unlimited loops
                            processedContent = processNestedLoops(
                                processedContent,
                                item,
                            );
                            return processedContent;
                        })
                        .join("");
                },
            );
        }
        let renderedContent = processNestedLoops(templateContent, data);
        // Conditional
        renderedContent = renderedContent.replace(
            /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/gm,
            (match, condition, section) => {
                const conditionResult = data[condition];
                if (conditionResult) {
                    const ifSection = section.split("{{else}}")[0];
                    return ifSection.trim();
                } else if (section.includes("{{else}}")) {
                    const elseSection = section.split("{{else}}")[1];
                    return elseSection.trim();
                }
                return "";
            },
        );
        // Simple variable
        renderedContent = renderedContent.replace(
            /\{\{(\w+)\}\}/gm,
            (match, key) => {
                return data.hasOwnProperty(key) ? data[key] : match;
            },
        );
        // Trick used to avoid Document-Fragment behavior => section from templateContent not matching
        // Any <nedara-*> tag is rendered into original HTML tag after content rendering
        renderedContent = renderedContent.replace(/nedara-(\w+)/g, "$1");
        return renderedContent;
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
