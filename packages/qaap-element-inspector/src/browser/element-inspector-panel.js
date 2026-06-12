"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElementInspectorPanel = void 0;
var React = require("react");
var browser_1 = require("@theia/core/lib/browser");
var nls_1 = require("@theia/core/lib/common/nls");
var qaap_element_style_convention_1 = require("./qaap-element-style-convention");
var ElementInspectorPanel = function (_a) {
    var service = _a.service, onCopySelector = _a.onCopySelector, onAskAgent = _a.onAskAgent, onGenerateVariant = _a.onGenerateVariant;
    var picked = service.state.picked;
    var _b = React.useState('design'), tab = _b[0], setTab = _b[1];
    if (!picked) {
        return <InspectorEmpty />;
    }
    return (<div className='theia-mini-browser-inspector__root'>
            <InspectorActions onCopySelector={onCopySelector} onAskAgent={onAskAgent} onGenerateVariant={onGenerateVariant}/>
            <ComponentsTree picked={picked}/>
            <div className='theia-mini-browser-inspector__tabs' role='tablist'>
                {['design', 'css', 'html'].map(function (id) { return (<button key={id} role='tab' aria-selected={tab === id} className={'theia-mini-browser-inspector__tab' + (tab === id ? ' theia-mini-browser-inspector__tab--active' : '')} onClick={function () { return setTab(id); }}>{id === 'design' ? 'Design' : id === 'css' ? 'CSS' : 'HTML'}</button>); })}
            </div>
            <div className='theia-mini-browser-inspector__body'>
                {tab === 'design' && <DesignTab picked={picked} service={service}/>}
                {tab === 'css' && <CssTab picked={picked} service={service}/>}
                {tab === 'html' && <HtmlTab picked={picked} service={service}/>}
            </div>
        </div>);
};
exports.ElementInspectorPanel = ElementInspectorPanel;
var InspectorActions = function (_a) {
    var onCopySelector = _a.onCopySelector, onAskAgent = _a.onAskAgent, onGenerateVariant = _a.onGenerateVariant;
    return (<div className='theia-mini-browser-inspector__actions' role='toolbar'>
        <button type='button' className='theia-mini-browser-inspector__action' onClick={onCopySelector}>
            {nls_1.nls.localize('qaap/elementInspector/copySelector', 'Copy selector / component path')}
        </button>
        <button type='button' className='theia-mini-browser-inspector__action theia-mini-browser-inspector__action--primary' onClick={onAskAgent}>
            {nls_1.nls.localize('qaap/elementInspector/askAgent', 'Ask agent about this element')}
        </button>
        <button type='button' className='theia-mini-browser-inspector__action' onClick={onGenerateVariant}>
            {nls_1.nls.localize('qaap/elementInspector/generateVariant', 'Generate UI variant in repo')}
        </button>
    </div>);
};
var InspectorEmpty = function () { return (<div className='theia-mini-browser-inspector__empty'>
        <div className={(0, browser_1.codicon)('inspect') + ' theia-mini-browser-inspector__empty-icon'}/>
        <h3>{nls_1.nls.localize('theia/mini-browser/elementInspector', 'Element Inspector')}</h3>
        <p>{nls_1.nls.localize('theia/mini-browser/elementInspectorHint', 'Open a preview in the mini-browser and click the picker icon ({0}) in its toolbar to select an element.', 'inspect')}</p>
    </div>); };
var ComponentsTree = function (_a) {
    var picked = _a.picked;
    var chain = React.useMemo(function () { return __spreadArray(__spreadArray([], __spreadArray([], picked.ancestors, true).reverse(), true), [
        { tagName: picked.tagName, id: picked.id, classes: picked.classes }
    ], false); }, [picked]);
    var _b = React.useState(false), fullPath = _b[0], setFullPath = _b[1];
    var collapsed = !fullPath && chain.length > 5;
    var rows = React.useMemo(function () {
        if (!collapsed) {
            return chain.map(function (node, index) { return ({ node: node, index: index, key: "".concat(index, ":").concat(formatSelector(node)), omit: false }); });
        }
        var head = chain[0];
        var tail = chain.slice(-2);
        var out = __spreadArray([
            { node: head, index: 0, key: "0:".concat(formatSelector(head)), omit: false },
            { node: head, index: -1, key: 'ellipsis', omit: true }
        ], tail.map(function (node, i) {
            var realIdx = chain.length - 2 + i;
            return { node: node, index: realIdx, key: "".concat(realIdx, ":").concat(formatSelector(node)), omit: false };
        }), true);
        return out;
    }, [chain, collapsed]);
    return (<div className='theia-mini-browser-inspector__section'>
            <div className='theia-mini-browser-inspector__section-head'>
                <div className='theia-mini-browser-inspector__section-title'>Components</div>
                {chain.length > 5 ? (<button type='button' className='theia-mini-browser-inspector__path-toggle' onClick={function () { return setFullPath(function (f) { return !f; }); }}>{fullPath ? 'Compact path' : 'Full path'}</button>) : undefined}
            </div>
            <ul className='theia-mini-browser-inspector__tree'>
                {rows.map(function (_a) {
            var node = _a.node, index = _a.index, key = _a.key, omit = _a.omit;
            if (omit) {
                return (<li key={key} className='theia-mini-browser-inspector__tree-item theia-mini-browser-inspector__tree-item--omit' aria-hidden>
                                <span className='theia-mini-browser-inspector__tree-omit'>…</span>
                            </li>);
            }
            var isLast = index === chain.length - 1;
            var label = formatSelector(node);
            var chevron = isLast ? (0, browser_1.codicon)('chevron-down') : (0, browser_1.codicon)('chevron-right');
            return (<li key={key} className={'theia-mini-browser-inspector__tree-item' + (isLast ? ' theia-mini-browser-inspector__tree-item--current' : '')} style={{ paddingLeft: "".concat(10 + index * 14, "px") }} title={label}>
                            <span className={chevron + ' theia-mini-browser-inspector__tree-chevron'}/>
                            <span className='theia-mini-browser-inspector__tree-label'>{label}</span>
                        </li>);
        })}
            </ul>
        </div>);
};
var DesignTab = function (_a) {
    var picked = _a.picked, service = _a.service;
    var setStyle = React.useCallback(function (prop, value) { return service.updateStyle(prop, value); }, [service]);
    return (<div className='theia-mini-browser-inspector__design'>
            <DesignSection title='Position' defaultOpen>
                <PositionGroup picked={picked} setStyle={setStyle}/>
                <SelectRow label='Display' prop='display' picked={picked} setStyle={setStyle} options={DISPLAY_OPTIONS}/>
            </DesignSection>
            <DesignSection title='Layout' defaultOpen>
                <LayoutGroup picked={picked} setStyle={setStyle}/>
            </DesignSection>
            <DesignSection title='Dimensions' defaultOpen>
                <DimensionsGroup picked={picked} setStyle={setStyle}/>
            </DesignSection>
            <DesignSection title='Spacing' defaultOpen>
                <SpacingGroup label='Padding' prefix='padding' picked={picked} setStyle={setStyle}/>
                <SpacingGroup label='Margin' prefix='margin' picked={picked} setStyle={setStyle}/>
            </DesignSection>
            <DesignSection title='Box' defaultOpen>
                <BoxToggles picked={picked} setStyle={setStyle}/>
            </DesignSection>
            <DesignSection title='Appearance' defaultOpen>
                <AppearanceGroup picked={picked} setStyle={setStyle}/>
            </DesignSection>
            <DesignSection title='Text' defaultOpen>
                <TextGroup picked={picked} setStyle={setStyle}/>
            </DesignSection>
            <DesignSection title='Background' defaultOpen>
                <BackgroundGroup picked={picked} setStyle={setStyle}/>
            </DesignSection>
            <DesignSection title='Interaction' defaultOpen={false}>
                <SelectRow label='Cursor' prop='cursor' picked={picked} setStyle={setStyle} options={CURSOR_OPTIONS}/>
                <SelectRow label='Pointer events' prop='pointer-events' picked={picked} setStyle={setStyle} options={POINTER_EVENTS_OPTIONS}/>
                <SelectRow label='User select' prop='user-select' picked={picked} setStyle={setStyle} options={USER_SELECT_OPTIONS}/>
            </DesignSection>
        </div>);
};
var DesignSection = function (_a) {
    var title = _a.title, _b = _a.defaultOpen, defaultOpen = _b === void 0 ? true : _b, children = _a.children;
    return (<details className='theia-mini-browser-inspector__details' open={defaultOpen}>
        <summary className='theia-mini-browser-inspector__details-summary'>{title}</summary>
        <div className='theia-mini-browser-inspector__details-body'>{children}</div>
    </details>);
};
var DISPLAY_OPTIONS = ['inline', 'inline-block', 'block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'table', 'none', 'contents'];
var CURSOR_OPTIONS = ['auto', 'default', 'pointer', 'grab', 'grabbing', 'text', 'crosshair', 'move', 'not-allowed', 'wait', 'help'];
var POINTER_EVENTS_OPTIONS = ['auto', 'none'];
var USER_SELECT_OPTIONS = ['auto', 'text', 'none', 'contain', 'all'];
// ----- Position --------------------------------------------------------------
var PositionGroup = function (_a) {
    var picked = _a.picked, setStyle = _a.setStyle;
    return (<div className='theia-mini-browser-inspector__control-block'>
        <div className='theia-mini-browser-inspector__pos'>
            <StyleNumberInput label='X' prop='left' picked={picked} setStyle={setStyle} fallback={String(picked.position.left)}/>
            <StyleNumberInput label='Y' prop='top' picked={picked} setStyle={setStyle} fallback={String(picked.position.top)}/>
            <StyleNumberInput label='Z' prop='z-index' picked={picked} setStyle={setStyle} fallback='' unitless/>
            <StyleNumberInput label='W' prop='width' picked={picked} setStyle={setStyle} fallback={String(picked.position.width)}/>
            <StyleNumberInput label='H' prop='height' picked={picked} setStyle={setStyle} fallback={String(picked.position.height)}/>
        </div>
        <SelectRow label='Position' prop='position' picked={picked} setStyle={setStyle} options={['static', 'relative', 'absolute', 'fixed', 'sticky']}/>
    </div>);
};
// ----- Layout (flex) --------------------------------------------------------
var LayoutGroup = function (_a) {
    var picked = _a.picked, setStyle = _a.setStyle;
    var flexDir = picked.computedStyles['flex-direction'] || 'row';
    var flexWrap = picked.computedStyles['flex-wrap'] || 'nowrap';
    var disp = picked.computedStyles['display'] || '';
    return (<div className='theia-mini-browser-inspector__control-block'>
            <div className='theia-mini-browser-inspector__field-label'>Flow</div>
            <div className='theia-mini-browser-inspector__seg'>
                <SegButton active={flexDir === 'row'} onClick={function () { return setStyle('flex-direction', 'row'); }} icon='arrow-right' title='row'/>
                <SegButton active={flexDir === 'column'} onClick={function () { return setStyle('flex-direction', 'column'); }} icon='arrow-down' title='column'/>
                <SegButton active={flexWrap === 'wrap'} onClick={function () { return setStyle('flex-wrap', flexWrap === 'wrap' ? 'nowrap' : 'wrap'); }} icon='list-unordered' title='wrap'/>
                <SegButton active={disp === 'grid' || disp === 'inline-grid'} onClick={function () { return setStyle('display', disp.includes('grid') ? 'block' : 'grid'); }} icon='layout-panel' title='grid'/>
            </div>
            <SelectRow label='Justify' prop='justify-content' picked={picked} setStyle={setStyle} options={JUSTIFY_CONTENT_OPTIONS}/>
            <SelectRow label='Align items' prop='align-items' picked={picked} setStyle={setStyle} options={ALIGN_ITEMS_OPTIONS}/>
            <SelectRow label='Align content' prop='align-content' picked={picked} setStyle={setStyle} options={ALIGN_CONTENT_OPTIONS}/>
            <StyleNumberInput label='Gap' prop='gap' picked={picked} setStyle={setStyle} fallback='' inline/>
        </div>);
};
var JUSTIFY_CONTENT_OPTIONS = ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly', 'stretch'];
var ALIGN_ITEMS_OPTIONS = ['stretch', 'flex-start', 'center', 'flex-end', 'baseline', 'start', 'end'];
var ALIGN_CONTENT_OPTIONS = ['stretch', 'flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'];
var DimensionsGroup = function (_a) {
    var picked = _a.picked, setStyle = _a.setStyle;
    return (<div className='theia-mini-browser-inspector__control-block'>
        <div className='theia-mini-browser-inspector__row-2'>
            <StyleNumberInput label='W' prop='width' picked={picked} setStyle={setStyle} fallback={String(picked.position.width)}/>
            <StyleNumberInput label='H' prop='height' picked={picked} setStyle={setStyle} fallback={String(picked.position.height)}/>
        </div>
        <div className='theia-mini-browser-inspector__row-2'>
            <StyleNumberInput label='Min W' prop='min-width' picked={picked} setStyle={setStyle} fallback=''/>
            <StyleNumberInput label='Min H' prop='min-height' picked={picked} setStyle={setStyle} fallback=''/>
        </div>
        <div className='theia-mini-browser-inspector__row-2'>
            <StyleNumberInput label='Max W' prop='max-width' picked={picked} setStyle={setStyle} fallback=''/>
            <StyleNumberInput label='Max H' prop='max-height' picked={picked} setStyle={setStyle} fallback=''/>
        </div>
    </div>);
};
var SpacingGroup = function (_a) {
    var label = _a.label, prefix = _a.prefix, picked = _a.picked, setStyle = _a.setStyle;
    return (<div className='theia-mini-browser-inspector__control-block theia-mini-browser-inspector__control-block--nested'>
        <div className='theia-mini-browser-inspector__field-label'>{label}</div>
        <div className='theia-mini-browser-inspector__spacing'>
            <StyleNumberInput label='T' prop={"".concat(prefix, "-top")} picked={picked} setStyle={setStyle} fallback='0'/>
            <StyleNumberInput label='R' prop={"".concat(prefix, "-right")} picked={picked} setStyle={setStyle} fallback='0'/>
            <StyleNumberInput label='B' prop={"".concat(prefix, "-bottom")} picked={picked} setStyle={setStyle} fallback='0'/>
            <StyleNumberInput label='L' prop={"".concat(prefix, "-left")} picked={picked} setStyle={setStyle} fallback='0'/>
        </div>
    </div>);
};
var BoxToggles = function (_a) {
    var picked = _a.picked, setStyle = _a.setStyle;
    var isBorderBox = picked.computedStyles['box-sizing'] === 'border-box';
    var overflow = picked.computedStyles['overflow'] || 'visible';
    return (<div className='theia-mini-browser-inspector__control-block'>
            <label className='theia-mini-browser-inspector__check'>
                <input type='checkbox' checked={isBorderBox} onChange={function (e) { return setStyle('box-sizing', e.target.checked ? 'border-box' : 'content-box'); }}/>
                <span>Border box</span>
            </label>
            <label className='theia-mini-browser-inspector__check'>
                <input type='checkbox' checked={overflow === 'hidden'} onChange={function (e) { return setStyle('overflow', e.target.checked ? 'hidden' : 'visible'); }}/>
                <span>Clip content (overflow: hidden)</span>
            </label>
            <div className='theia-mini-browser-inspector__row-2'>
                <SelectRow label='Overflow X' prop='overflow-x' picked={picked} setStyle={setStyle} options={OVERFLOW_AXIS_OPTIONS}/>
                <SelectRow label='Overflow Y' prop='overflow-y' picked={picked} setStyle={setStyle} options={OVERFLOW_AXIS_OPTIONS}/>
            </div>
        </div>);
};
var OVERFLOW_AXIS_OPTIONS = ['visible', 'hidden', 'clip', 'scroll', 'auto'];
var AppearanceGroup = function (_a) {
    var picked = _a.picked, setStyle = _a.setStyle;
    var opacity = parseFloat(picked.computedStyles['opacity'] || '1');
    return (<div className='theia-mini-browser-inspector__control-block'>
            <div className='theia-mini-browser-inspector__field'>
                <label>Opacity</label>
                <div className='theia-mini-browser-inspector__range-row'>
                    <input type='range' min={0} max={1} step={0.01} value={isNaN(opacity) ? 1 : opacity} onChange={function (e) { return setStyle('opacity', e.target.value); }}/>
                    <span className='theia-mini-browser-inspector__range-value'>{Math.round((isNaN(opacity) ? 1 : opacity) * 100)}%</span>
                </div>
            </div>
            <StyleNumberInput label='Radius' prop='border-radius' picked={picked} setStyle={setStyle} fallback='0'/>
            <ColorRow label='Border color' prop='border-color' picked={picked} setStyle={setStyle}/>
            <StyleNumberInput label='Border W' prop='border-width' picked={picked} setStyle={setStyle} fallback='0'/>
            <SelectRow label='Border' prop='border-style' picked={picked} setStyle={setStyle} options={['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset']}/>
            <StyleTextInput label='Shadow' prop='box-shadow' picked={picked} setStyle={setStyle}/>
        </div>);
};
var TextGroup = function (_a) {
    var picked = _a.picked, setStyle = _a.setStyle;
    return (<div className='theia-mini-browser-inspector__control-block'>
        <StyleTextInput label='Font' prop='font-family' picked={picked} setStyle={setStyle}/>
        <div className='theia-mini-browser-inspector__row-2'>
            <SelectRow label='Weight' prop='font-weight' picked={picked} setStyle={setStyle} options={FONT_WEIGHT_OPTIONS}/>
            <StyleNumberInput label='Size' prop='font-size' picked={picked} setStyle={setStyle} fallback=''/>
        </div>
        <div className='theia-mini-browser-inspector__row-2'>
            <StyleTextInput label='Line H' prop='line-height' picked={picked} setStyle={setStyle}/>
            <StyleTextInput label='Spacing' prop='letter-spacing' picked={picked} setStyle={setStyle}/>
        </div>
        <SelectRow label='Decoration' prop='text-decoration-line' picked={picked} setStyle={setStyle} options={['none', 'underline', 'overline', 'line-through']}/>
        <SelectRow label='Transform' prop='text-transform' picked={picked} setStyle={setStyle} options={['none', 'capitalize', 'uppercase', 'lowercase']}/>
        <ColorRow label='Color' prop='color' picked={picked} setStyle={setStyle}/>
        <div className='theia-mini-browser-inspector__field-label'>Alignment</div>
        <div className='theia-mini-browser-inspector__seg'>
            <SegButton active={isTextAlign(picked, 'left')} onClick={function () { return setStyle('text-align', 'left'); }} icon='arrow-left' title='Left'/>
            <SegButton active={isTextAlign(picked, 'center')} onClick={function () { return setStyle('text-align', 'center'); }} icon='dash' title='Center'/>
            <SegButton active={isTextAlign(picked, 'right')} onClick={function () { return setStyle('text-align', 'right'); }} icon='arrow-right' title='Right'/>
            <SegButton active={isTextAlign(picked, 'justify')} onClick={function () { return setStyle('text-align', 'justify'); }} icon='three-bars' title='Justify'/>
        </div>
    </div>);
};
var FONT_WEIGHT_OPTIONS = ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
var BackgroundGroup = function (_a) {
    var picked = _a.picked, setStyle = _a.setStyle;
    return (<div className='theia-mini-browser-inspector__control-block'>
        <ColorRow label='Color' prop='background-color' picked={picked} setStyle={setStyle}/>
        <SelectRow label='Repeat' prop='background-repeat' picked={picked} setStyle={setStyle} options={['repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round']}/>
        <StyleTextInput label='Size' prop='background-size' picked={picked} setStyle={setStyle}/>
    </div>);
};
var StyleNumberInput = function (_a) {
    var _b;
    var label = _a.label, prop = _a.prop, picked = _a.picked, setStyle = _a.setStyle, fallback = _a.fallback, inline = _a.inline, unitless = _a.unitless;
    var raw = (_b = picked.computedStyles[prop]) !== null && _b !== void 0 ? _b : fallback;
    var parsed = splitNumberUnit(String(raw), String(fallback));
    var _c = React.useState(parsed.text), value = _c[0], setValue = _c[1];
    var focused = React.useRef(false);
    React.useEffect(function () {
        var _a;
        if (!focused.current) {
            var next = splitNumberUnit(String((_a = picked.computedStyles[prop]) !== null && _a !== void 0 ? _a : fallback), String(fallback));
            setValue(next.text);
        }
    }, [picked.computedStyles[prop], picked.pickedId, prop, fallback]);
    var displayUnit = unitless ? '' : parsed.unit;
    var commit = function (v) {
        var trimmed = v.trim();
        if (!trimmed) {
            setStyle(prop, '');
            return;
        }
        if (unitless && /^[-+]?\d+$/.test(trimmed)) {
            setStyle(prop, trimmed);
            return;
        }
        if (unitless) {
            setStyle(prop, trimmed);
            return;
        }
        if (displayUnit && /^[-+]?\d*\.?\d+$/.test(trimmed)) {
            setStyle(prop, trimmed + displayUnit);
        }
        else {
            setStyle(prop, trimmed);
        }
    };
    var applyStep = function (delta) {
        if (!/^[-+]?\d*\.?\d+$/.test(value))
            return;
        var next = (parseFloat(value) || 0) + delta;
        var nextStr = String(next);
        setValue(nextStr);
        commit(nextStr);
    };
    return (<label className={'theia-mini-browser-inspector__num' + (inline ? ' theia-mini-browser-inspector__num--inline' : '')} title={prop}>
            <span className='theia-mini-browser-inspector__num-label'>{label}</span>
            <input type='text' inputMode={unitless ? 'numeric' : 'decimal'} value={value} onFocus={function () { focused.current = true; }} onBlur={function (e) { focused.current = false; commit(e.target.value); }} onChange={function (e) { return setValue(e.target.value); }} onKeyDown={function (e) {
            var _a;
            if (e.key === 'Enter') {
                e.target.blur();
            }
            if (e.key === 'Escape') {
                var next = splitNumberUnit(String((_a = picked.computedStyles[prop]) !== null && _a !== void 0 ? _a : fallback), String(fallback));
                setValue(next.text);
                e.target.blur();
            }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                var step = e.shiftKey ? 10 : 1;
                applyStep(e.key === 'ArrowUp' ? step : -step);
            }
        }}/>
            <span className='theia-mini-browser-inspector__num-unit'>{displayUnit}</span>
        </label>);
};
var StyleTextInput = function (_a) {
    var label = _a.label, prop = _a.prop, picked = _a.picked, setStyle = _a.setStyle;
    var raw = picked.computedStyles[prop] || '';
    var _b = React.useState(raw), value = _b[0], setValue = _b[1];
    var focused = React.useRef(false);
    React.useEffect(function () {
        if (!focused.current)
            setValue(raw);
    }, [raw]);
    return (<label className='theia-mini-browser-inspector__field' title={prop}>
            <span>{label}</span>
            <input type='text' value={value} onFocus={function () { focused.current = true; }} onBlur={function (e) { focused.current = false; setStyle(prop, e.target.value); }} onChange={function (e) { return setValue(e.target.value); }} onKeyDown={function (e) { if (e.key === 'Enter') {
        e.target.blur();
    } }}/>
        </label>);
};
var ColorRow = function (_a) {
    var label = _a.label, prop = _a.prop, picked = _a.picked, setStyle = _a.setStyle;
    var raw = picked.computedStyles[prop] || '';
    var hex = rgbToHex(raw);
    return (<label className='theia-mini-browser-inspector__field' title={prop}>
            <span>{label}</span>
            <div className='theia-mini-browser-inspector__color'>
                <input type='color' value={hex || '#000000'} onChange={function (e) { return setStyle(prop, e.target.value); }}/>
                <input type='text' value={raw} onChange={function (e) { return setStyle(prop, e.target.value); }}/>
            </div>
        </label>);
};
var SelectRow = function (_a) {
    var label = _a.label, prop = _a.prop, picked = _a.picked, setStyle = _a.setStyle, options = _a.options;
    var raw = picked.computedStyles[prop] || '';
    return (<label className='theia-mini-browser-inspector__field' title={prop}>
            <span>{label}</span>
            <select className='theia-mini-browser-inspector__select' value={raw} onChange={function (e) { return setStyle(prop, e.target.value); }}>
                {!raw ? <option value=''>—</option> : undefined}
                {!options.includes(raw) && raw ? <option value={raw}>{raw}</option> : undefined}
                {options.map(function (opt) { return <option key={opt} value={opt}>{opt}</option>; })}
            </select>
        </label>);
};
var SegButton = function (_a) {
    var active = _a.active, onClick = _a.onClick, icon = _a.icon, title = _a.title;
    return (<button type='button' title={title} onClick={onClick} className={'theia-mini-browser-inspector__seg-btn' + (active ? ' theia-mini-browser-inspector__seg-btn--active' : '')}>
        <span className={(0, browser_1.codicon)(icon)}/>
    </button>);
};
function splitNumberUnit(raw, fallback) {
    var r = String(raw || fallback || '').trim();
    if (!r)
        return { text: '', unit: 'px' };
    if (!/^[-+.\d]/.test(r)) {
        return { text: r, unit: '' };
    }
    var m = r.match(/^([-+]?\d*\.?\d+)([a-z%]*)$/i);
    if (m) {
        return { text: m[1], unit: m[2] || 'px' };
    }
    return { text: r, unit: '' };
}
// ----- CSS tab (DevTools-style two columns, editable values) ------------------
var CssTab = function (_a) {
    var picked = _a.picked, service = _a.service;
    var keys = React.useMemo(function () { return Object.keys(picked.computedStyles).sort(function (a, b) { return a.localeCompare(b); }); }, [picked.computedStyles, picked.pickedId]);
    var styleTargets = React.useMemo(function () { return (0, qaap_element_style_convention_1.resolveStyleEditTargets)(picked); }, [picked]);
    var selector = formatSelector({ tagName: picked.tagName, id: picked.id, classes: picked.classes });
    return (<div className='theia-mini-browser-inspector__css-devtools'>
            <div className='theia-mini-browser-inspector__css-conventions'>
                {styleTargets.map(function (target) { return (<div key={"".concat(target.kind, "-").concat(target.summary)} className='theia-mini-browser-inspector__css-convention'>
                        <span className='theia-mini-browser-inspector__css-convention-kind'>{target.kind}</span>
                        <span className='theia-mini-browser-inspector__css-convention-text'>{target.summary}</span>
                        {target.sourceFile ? (<code className='theia-mini-browser-inspector__css-convention-file'>{target.sourceFile}</code>) : undefined}
                    </div>); })}
            </div>
            <div className='theia-mini-browser-inspector__css-devtools-head' title={selector}>
                <span className='theia-mini-browser-inspector__css-devtools-selector'>{selector}</span>
            </div>
            <div className='theia-mini-browser-inspector__css-table' role='list'>
                {keys.map(function (key) {
            var _a;
            return (<CssPropertyRow key={key} prop={key} value={(_a = picked.computedStyles[key]) !== null && _a !== void 0 ? _a : ''} service={service} pickedKey={picked.pickedId}/>);
        })}
            </div>
        </div>);
};
var CssPropertyRow = function (_a) {
    var prop = _a.prop, value = _a.value, service = _a.service, pickedKey = _a.pickedKey;
    var _b = React.useState(value), local = _b[0], setLocal = _b[1];
    var focused = React.useRef(false);
    React.useEffect(function () {
        if (!focused.current) {
            setLocal(value);
        }
    }, [value, pickedKey, prop]);
    var commit = function () {
        service.updateStyle(prop, local.trim());
    };
    return (<div className='theia-mini-browser-inspector__css-row' role='listitem'>
            <span className='theia-mini-browser-inspector__css-name' title={prop}>{prop}</span>
            <div className='theia-mini-browser-inspector__css-value'>
                <input type='text' className='theia-mini-browser-inspector__css-value-input' spellCheck={false} value={local} aria-label={prop} onFocus={function () { focused.current = true; }} onBlur={function () {
            focused.current = false;
            commit();
        }} onChange={function (e) { return setLocal(e.target.value); }} onKeyDown={function (e) {
            if (e.key === 'Enter') {
                e.target.blur();
            }
            if (e.key === 'Escape') {
                setLocal(value);
                e.target.blur();
            }
        }}/>
            </div>
        </div>);
};
// ----- HTML tab -------------------------------------------------------------
var HtmlTab = function (_a) {
    var picked = _a.picked, service = _a.service;
    var _b = React.useState(picked.textPreview), text = _b[0], setText = _b[1];
    var focused = React.useRef(false);
    React.useEffect(function () {
        if (!focused.current)
            setText(picked.textPreview);
    }, [picked.textPreview, picked.pickedId]);
    return (<div className='theia-mini-browser-inspector__html'>
            <label className='theia-mini-browser-inspector__field'>
                <span>Text content</span>
                <textarea rows={3} value={text} onFocus={function () { focused.current = true; }} onBlur={function (e) { focused.current = false; service.updateText(e.target.value); }} onChange={function (e) { return setText(e.target.value); }}/>
            </label>
            <details>
                <summary>Outer HTML</summary>
                <pre className='theia-mini-browser-inspector__css'><code>{picked.outerHTML}</code></pre>
            </details>
            <details>
                <summary>Attributes</summary>
                <ul className='theia-mini-browser-inspector__attrs'>
                    {picked.attributes.map(function (attr) { return (<li key={attr.name}><span>{attr.name}</span><code>{attr.value}</code></li>); })}
                </ul>
            </details>
        </div>);
};
// ----- helpers -------------------------------------------------------------
function formatSelector(node) {
    var selector = node.tagName;
    if (node.id)
        selector += '#' + node.id;
    if (node.classes && node.classes.length)
        selector += '.' + node.classes.slice(0, 3).join('.');
    return selector;
}
function isTextAlign(picked, side) {
    var v = (picked.computedStyles['text-align'] || '').toLowerCase();
    if (side === 'left')
        return v === 'left' || v === 'start';
    if (side === 'right')
        return v === 'right' || v === 'end';
    return v === side;
}
function rgbToHex(color) {
    var match = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!match) {
        return color.startsWith('#') ? color : undefined;
    }
    var toHex = function (n) { return Number(n).toString(16).padStart(2, '0'); };
    return '#' + toHex(match[1]) + toHex(match[2]) + toHex(match[3]);
}
