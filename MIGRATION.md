# NedaraJS Migration Guide

## v0.1.4-alpha → v0.1.6-alpha

---

## Table of Contents

### v0.1.5-alpha — Security, bug fixes, jQuery removal

1. [jQuery Removal](#1-jquery-removal)
2. [Template Variables Are Now HTML-Escaped by Default](#2-template-variables-are-now-html-escaped-by-default)
3. [Unresolved Template Variables](#3-unresolved-template-variables)
4. [data-js-function Cannot Call Internal Methods](#4-data-js-function-cannot-call-internal-methods)
5. [Nedara.registeredWidgets Removed](#5-nedararegisteredwidgets-removed)
6. [Non-Breaking Additions (0.1.5)](#6-non-breaking-additions)
7. [Unchanged API Surface](#7-unchanged-api-surface)

### v0.1.6-alpha — Template engine rewrite

8. [{{#subif}} / {{subelse}} / {{/subif}} Removed](#8-subif--subelse--subif-removed)

---

## 1. jQuery Removal

**Versions concerned:** 0.1.4-alpha → 0.1.5-alpha

jQuery is no longer required. Remove the jQuery `<script>` tag from your HTML.

```html
<!-- Before (0.1.4-alpha) -->
<script src="path/to/jquery.min.js"></script>
<script type="module" src="path/to/nedara.js"></script>

<!-- After (0.1.5-alpha) -->
<script type="module" src="path/to/nedara.js"></script>
```

### `this.$container` and `this.$selector`

Inside widgets, `this.$container` and `this.$selector` are now instances of `NEl`,
NedaraJS's built-in DOM wrapper, instead of jQuery objects. The most common methods
are available with the same signature:

| Method | Status |
|---|---|
| `.html(content?)` | ✅ Preserved |
| `.text(content?)` | ✅ Preserved |
| `.find(selector)` | ✅ Preserved |
| `.attr(name, value?)` | ✅ Preserved |
| `.val(value?)` | ✅ Preserved |
| `.data(name)` | ✅ Preserved |
| `.addClass(...cls)` | ✅ Preserved |
| `.removeClass(...cls)` | ✅ Preserved |
| `.toggleClass(cls, force?)` | ✅ Preserved |
| `.toggle(show?)` | ✅ Preserved |
| `.closest(selector)` | ✅ Preserved |
| `.each(fn)` | ✅ Preserved |
| `.get(i)` | ✅ Preserved |
| `.length` | ✅ Preserved |
| `.fadeIn()`, `.animate()`, `.css()`, `.trigger()` … | ❌ Not available |

If your widget code calls jQuery-only methods on `this.$container` or `this.$selector`,
replace them with native DOM calls or use `Nedara.el()` as a bridge.

### `$(...)` inside widget methods

Direct `$(...)` calls inside widget handlers no longer work. Replace them using
`Nedara.el()` or native DOM APIs.

```javascript
// Before (0.1.4-alpha)
_onNavLinkClick: function(ev) {
    const $link = $(ev.currentTarget);
    console.log($link.attr('href'));
    this.$selector.find('.nav-link').removeClass('active');
    $link.addClass('active');
},

// After (0.1.5-alpha) — option A: native DOM
_onNavLinkClick: function(ev) {
    const link = ev.currentTarget;
    console.log(link.getAttribute('href'));
    this.$selector.find('.nav-link').removeClass('active');
    link.classList.add('active');
},

// After (0.1.5-alpha) — option B: Nedara.el() wrapper
_onNavLinkClick: function(ev) {
    const link = Nedara.el(ev.currentTarget);
    console.log(link.attr('href'));
    this.$selector.find('.nav-link').removeClass('active');
    link.addClass('active');
},
```

Common jQuery patterns and their replacements:

```javascript
// Reading a value
$(ev.currentTarget).val()              →  ev.currentTarget.value

// Reading a data attribute
$(ev.currentTarget).data('fieldId')   →  ev.currentTarget.dataset.fieldId
                                       // or: Nedara.el(ev.currentTarget).data('fieldId')

// Walking up the DOM
$(ev.currentTarget).closest('.item')  →  ev.currentTarget.closest('.item')  // returns a raw Element
                                       // or: Nedara.el(ev.currentTarget).closest('.item')  // returns NEl

// Reading an attribute
$(el).attr('href')                     →  el.getAttribute('href')

// DOM manipulation
$(el).append('<div>...</div>')         →  el.insertAdjacentHTML('beforeend', '<div>...</div>')
$(el).remove()                         →  el.remove()
$(el).css('display', 'none')          →  el.style.display = 'none'

// Events
$(el).trigger('click')                 →  el.dispatchEvent(new Event('click'))
```

---

## 2. Template Variables Are Now HTML-Escaped by Default

**Versions concerned:** 0.1.4-alpha → 0.1.5-alpha

`{{var}}` now outputs HTML-escaped content to prevent XSS. If a variable previously
contained raw HTML that was intentionally rendered as markup, switch to the new
triple-brace syntax `{{{var}}}`.

```html
<!-- Before (0.1.4-alpha): both rendered raw HTML -->
<div>{{userBio}}</div>

<!-- After (0.1.5-alpha): {{var}} escapes, {{{var}}} is raw -->
<div>{{userBio}}</div>    <!-- safe: renders as escaped text -->
<div>{{{userBio}}}</div>  <!-- raw: renders HTML as-is, use only for trusted content -->
```

```javascript
Nedara.renderTemplate('profile', {
    name: '<script>alert(1)</script>',  // {{name}} → &lt;script&gt;alert(1)&lt;/script&gt;
    bio:  '<strong>Developer</strong>', // {{{bio}}} → <strong>Developer</strong>
});
```

> **Rule of thumb:** Use `{{var}}` for user-provided data. Use `{{{var}}}` only for
> HTML you fully control and trust.

This change also applies to variables inside loops (`{{#items}}...{{/items}}`).

---

## 3. Unresolved Template Variables

**Versions concerned:** 0.1.4-alpha → 0.1.5-alpha

Template variables with no matching key in the data object previously rendered as
the raw placeholder (`{{key}}`). They now render as an empty string.

```javascript
Nedara.renderTemplate('greeting', { name: 'John' });
```

```html
<!-- Template -->
<p>Hello, {{name}}! Your role is {{role}}.</p>

<!-- Before (0.1.4-alpha) -->
<p>Hello, John! Your role is {{role}}.</p>

<!-- After (0.1.5-alpha) -->
<p>Hello, John! Your role is .</p>
```

If your code checked for the presence of `{{key}}` in rendered output to detect
missing data, replace that logic with an explicit check on the data object before
calling `renderTemplate`.

---

## 4. `data-js-function` Cannot Call Internal Methods

**Versions concerned:** 0.1.4-alpha → 0.1.5-alpha

The `data-js-function` attribute can no longer invoke the following internal widget
methods: `init`, `start`, `end`, `refresh`, `destroy`, `extend`, `_bindEvents`,
`_unbindEvents`, `_checkSelectorAndContainer`, `_fnTrigger`.

```html
<!-- These no longer trigger anything (silently ignored) -->
<button data-js-function="destroy">Delete</button>
<button data-js-function="init">Reset</button>
```

If you were relying on any of these, expose a dedicated wrapper method on your widget:

```javascript
// Before (0.1.4-alpha) — calling destroy via the DOM
// <button data-js-function="destroy">

// After (0.1.5-alpha) — wrap it in a user-defined method
const myWidget = Nedara.createWidget({
    // ...
    _onResetClick: function() {
        this.destroy();
    },
});
// <button data-js-function="_onResetClick">
```

---

## 5. `Nedara.registeredWidgets` Removed

**Versions concerned:** 0.1.4-alpha → 0.1.5-alpha

The `Nedara.registeredWidgets` property was an alias for `Nedara.widgets` and has
been removed. Use `Nedara.widgets` directly.

```javascript
// Before (0.1.4-alpha)
const w = Nedara.registeredWidgets['myWidget'];

// After (0.1.5-alpha)
const w = Nedara.widgets['myWidget'];
```

---

## 6. Non-Breaking Additions

The following features were added and require no changes to existing code.

### `{{{var}}}` — Raw HTML output in templates

Triple-brace syntax explicitly opts out of HTML escaping. Existing `{{var}}` usage
is unaffected unless the variable contained HTML (see [section 2](#2-template-variables-are-now-html-escaped-by-default)).

### `Nedara.el(source)` — DOM utility factory

A lightweight alternative to `$()`. Accepts a CSS selector string, a DOM element,
a `NodeList`, an `HTMLCollection`, an array of elements, or another `NEl` instance.

```javascript
Nedara.el('.my-list')                  // query by selector
Nedara.el(ev.currentTarget)            // wrap a DOM element
Nedara.el(document.querySelectorAll('li'))  // wrap a NodeList
```

See the [DOM Utility section in the README](README.md#dom-utility--nedarael) for the
full method reference.

### Widget lifecycle improvements

- `refresh()` now correctly unbinds existing event listeners before rebinding,
  preventing handler duplication on repeated calls.
- `destroy()` now only removes listeners belonging to the widget being destroyed,
  leaving other widgets on the same container unaffected.
- Event listeners are stored internally per widget instance, so multiple widgets
  on the same container coexist without interference.

---

## 7. Unchanged API Surface

The following are fully backwards compatible and require no changes.

| API | Notes |
|---|---|
| `Nedara.createWidget(options)` | Same signature |
| `Nedara.registerWidget(name, widget)` | Same signature |
| `Nedara.importTemplates(url)` | Same signature, returns a Promise |
| `Nedara.renderTemplate(id, data)` | Same signature |
| `widget.start()` / `widget.end()` | Same lifecycle hooks |
| `widget.refresh()` / `widget.destroy()` | Same signature, bugs fixed |
| `widget.extend(extensions)` | Same signature |
| `this.$container` / `this.$selector` | Now `NEl` — common methods preserved |
| `events` object in `createWidget` | Same format |
| `data-js-function` attribute | Works for all user-defined methods |
| Template syntax: `{{var}}`, `{{{var}}}`, `{{#loop}}`, `{{#if}}` | Unchanged |

---

## 8. `{{#subif}}` / `{{subelse}}` / `{{/subif}}` Removed

**Versions concerned:** 0.1.5-alpha → 0.1.6-alpha

The template engine has been rewritten as a proper recursive-descent parser (tokenizer
→ AST → renderer). As a result, `{{#if}}` blocks can now be nested to **any depth**
inside other `{{#if}}` blocks or loops, with no special syntax needed.

The `{{#subif}}`, `{{subelse}}`, and `{{/subif}}` tags are removed. They render as
literal text or are silently dropped, depending on the tag.

The migration is a mechanical find-and-replace across your template files:

| Before (0.1.5-alpha) | After (0.1.6-alpha) |
|---|---|
| `{{#subif expr}}` | `{{#if expr}}` |
| `{{subelse}}` | `{{else}}` |
| `{{/subif}}` | `{{/if}}` |

**Before:**

```html
{{#if user.loggedIn}}
  <p>Welcome, {{user.name}}!</p>

  {{#subif user.role === 'admin'}}
    <span>Admin</span>
  {{subelse}}
    <span>User</span>
  {{/subif}}
{{else}}
  <p>Please log in</p>
{{/if}}
```

**After:**

```html
{{#if user.loggedIn}}
  <p>Welcome, {{user.name}}!</p>

  {{#if user.role === 'admin'}}
    <span>Admin</span>
  {{else}}
    <span>User</span>
  {{/if}}
{{else}}
  <p>Please log in</p>
{{/if}}
```

Nesting is now unlimited — you can place `{{#if}}` inside `{{#if}}` inside loops,
and all combinations work correctly at any depth.
