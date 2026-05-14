// *****************************************************************************
// Copyright (C) 2026 Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from 'react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { codicon, Message } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { ElementInspectorService } from './element-inspector-service';
import { PickedElement } from './element-inspector-types';

@injectable()
export class ElementInspectorWidget extends ReactWidget {

    static readonly ID = 'theia-mini-browser:element-inspector';
    static readonly LABEL = nls.localize('theia/mini-browser/elementInspector', 'Element Inspector');

    @inject(ElementInspectorService)
    protected readonly service: ElementInspectorService;

    @postConstruct()
    protected init(): void {
        this.id = ElementInspectorWidget.ID;
        this.title.label = ElementInspectorWidget.LABEL;
        this.title.caption = ElementInspectorWidget.LABEL;
        this.title.iconClass = codicon('inspect');
        this.title.closable = true;
        this.addClass('theia-mini-browser-inspector');
        this.toDispose.push(this.service.onDidChangeState(() => this.update()));
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected render(): React.ReactNode {
        return <InspectorPanel service={this.service} />;
    }
}

// ---------------------------------------------------------------------------
// React layer (function components with local edit state)
// ---------------------------------------------------------------------------

interface InspectorPanelProps {
    service: ElementInspectorService;
}

const InspectorPanel: React.FC<InspectorPanelProps> = ({ service }) => {
    const picked = service.state.picked;
    const [tab, setTab] = React.useState<'design' | 'css' | 'html'>('design');
    if (!picked) {
        return <InspectorEmpty />;
    }
    return (
        <div className='theia-mini-browser-inspector__root'>
            <ComponentsTree picked={picked} />
            <div className='theia-mini-browser-inspector__tabs' role='tablist'>
                {(['design', 'css', 'html'] as const).map(id => (
                    <button
                        key={id}
                        role='tab'
                        aria-selected={tab === id}
                        className={'theia-mini-browser-inspector__tab' + (tab === id ? ' theia-mini-browser-inspector__tab--active' : '')}
                        onClick={() => setTab(id)}
                    >{id === 'design' ? 'Design' : id === 'css' ? 'CSS' : 'HTML'}</button>
                ))}
            </div>
            <div className='theia-mini-browser-inspector__body'>
                {tab === 'design' && <DesignTab picked={picked} service={service} />}
                {tab === 'css' && <CssTab picked={picked} service={service} />}
                {tab === 'html' && <HtmlTab picked={picked} service={service} />}
            </div>
        </div>
    );
};

const InspectorEmpty: React.FC = () => (
    <div className='theia-mini-browser-inspector__empty'>
        <div className={codicon('inspect') + ' theia-mini-browser-inspector__empty-icon'} />
        <h3>{nls.localize('theia/mini-browser/elementInspector', 'Element Inspector')}</h3>
        <p>{nls.localize(
            'theia/mini-browser/elementInspectorHint',
            'Open a preview in the mini-browser and click the picker icon ({0}) in its toolbar to select an element.',
            'inspect'
        )}</p>
    </div>
);

const ComponentsTree: React.FC<{ picked: PickedElement }> = ({ picked }) => {
    const chain = React.useMemo(() => [
        ...[...picked.ancestors].reverse(),
        { tagName: picked.tagName, id: picked.id, classes: picked.classes }
    ], [picked]);
    const [fullPath, setFullPath] = React.useState(false);
    const collapsed = !fullPath && chain.length > 5;
    const rows = React.useMemo(() => {
        if (!collapsed) {
            return chain.map((node, index) => ({ node, index, key: `${index}:${formatSelector(node)}`, omit: false }));
        }
        const head = chain[0];
        const tail = chain.slice(-2);
        const out: Array<{ node: typeof head; index: number; key: string; omit: boolean }> = [
            { node: head, index: 0, key: `0:${formatSelector(head)}`, omit: false },
            { node: head, index: -1, key: 'ellipsis', omit: true },
            ...tail.map((node, i) => {
                const realIdx = chain.length - 2 + i;
                return { node, index: realIdx, key: `${realIdx}:${formatSelector(node)}`, omit: false };
            })
        ];
        return out;
    }, [chain, collapsed]);
    return (
        <div className='theia-mini-browser-inspector__section'>
            <div className='theia-mini-browser-inspector__section-head'>
                <div className='theia-mini-browser-inspector__section-title'>Components</div>
                {chain.length > 5 ? (
                    <button
                        type='button'
                        className='theia-mini-browser-inspector__path-toggle'
                        onClick={() => setFullPath(f => !f)}
                    >{fullPath ? 'Compact path' : 'Full path'}</button>
                ) : undefined}
            </div>
            <ul className='theia-mini-browser-inspector__tree'>
                {rows.map(({ node, index, key, omit }) => {
                    if (omit) {
                        return (
                            <li key={key} className='theia-mini-browser-inspector__tree-item theia-mini-browser-inspector__tree-item--omit' aria-hidden>
                                <span className='theia-mini-browser-inspector__tree-omit'>…</span>
                            </li>
                        );
                    }
                    const isLast = index === chain.length - 1;
                    const label = formatSelector(node);
                    const chevron = isLast ? codicon('chevron-down') : codicon('chevron-right');
                    return (
                        <li
                            key={key}
                            className={'theia-mini-browser-inspector__tree-item' + (isLast ? ' theia-mini-browser-inspector__tree-item--current' : '')}
                            style={{ paddingLeft: `${10 + index * 14}px` }}
                            title={label}
                        >
                            <span className={chevron + ' theia-mini-browser-inspector__tree-chevron'} />
                            <span className='theia-mini-browser-inspector__tree-label'>{label}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

// ----- Design tab --------------------------------------------------------------------------

interface DesignProps {
    picked: PickedElement;
    service: ElementInspectorService;
}

const DesignTab: React.FC<DesignProps> = ({ picked, service }) => {
    const setStyle = React.useCallback((prop: string, value: string) => service.updateStyle(prop, value), [service]);
    return (
        <div className='theia-mini-browser-inspector__design'>
            <DesignSection title='Position' defaultOpen>
                <PositionGroup picked={picked} setStyle={setStyle} />
                <SelectRow label='Display' prop='display' picked={picked} setStyle={setStyle} options={DISPLAY_OPTIONS} />
            </DesignSection>
            <DesignSection title='Layout' defaultOpen>
                <LayoutGroup picked={picked} setStyle={setStyle} />
            </DesignSection>
            <DesignSection title='Dimensions' defaultOpen>
                <DimensionsGroup picked={picked} setStyle={setStyle} />
            </DesignSection>
            <DesignSection title='Spacing' defaultOpen>
                <SpacingGroup label='Padding' prefix='padding' picked={picked} setStyle={setStyle} />
                <SpacingGroup label='Margin' prefix='margin' picked={picked} setStyle={setStyle} />
            </DesignSection>
            <DesignSection title='Box' defaultOpen>
                <BoxToggles picked={picked} setStyle={setStyle} />
            </DesignSection>
            <DesignSection title='Appearance' defaultOpen>
                <AppearanceGroup picked={picked} setStyle={setStyle} />
            </DesignSection>
            <DesignSection title='Text' defaultOpen>
                <TextGroup picked={picked} setStyle={setStyle} />
            </DesignSection>
            <DesignSection title='Background' defaultOpen>
                <BackgroundGroup picked={picked} setStyle={setStyle} />
            </DesignSection>
            <DesignSection title='Interaction' defaultOpen={false}>
                <SelectRow label='Cursor' prop='cursor' picked={picked} setStyle={setStyle} options={CURSOR_OPTIONS} />
                <SelectRow label='Pointer events' prop='pointer-events' picked={picked} setStyle={setStyle} options={POINTER_EVENTS_OPTIONS} />
                <SelectRow label='User select' prop='user-select' picked={picked} setStyle={setStyle} options={USER_SELECT_OPTIONS} />
            </DesignSection>
        </div>
    );
};

const DesignSection: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({ title, defaultOpen = true, children }) => (
    <details className='theia-mini-browser-inspector__details' open={defaultOpen}>
        <summary className='theia-mini-browser-inspector__details-summary'>{title}</summary>
        <div className='theia-mini-browser-inspector__details-body'>{children}</div>
    </details>
);

const DISPLAY_OPTIONS = ['inline', 'inline-block', 'block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'table', 'none', 'contents'];
const CURSOR_OPTIONS = ['auto', 'default', 'pointer', 'grab', 'grabbing', 'text', 'crosshair', 'move', 'not-allowed', 'wait', 'help'];
const POINTER_EVENTS_OPTIONS = ['auto', 'none'];
const USER_SELECT_OPTIONS = ['auto', 'text', 'none', 'contain', 'all'];

interface FieldProps {
    picked: PickedElement;
    setStyle: (prop: string, value: string) => void;
}

// ----- Position --------------------------------------------------------------

const PositionGroup: React.FC<FieldProps> = ({ picked, setStyle }) => (
    <div className='theia-mini-browser-inspector__control-block'>
        <div className='theia-mini-browser-inspector__pos'>
            <StyleNumberInput label='X' prop='left' picked={picked} setStyle={setStyle} fallback={String(picked.position.left)} />
            <StyleNumberInput label='Y' prop='top' picked={picked} setStyle={setStyle} fallback={String(picked.position.top)} />
            <StyleNumberInput label='Z' prop='z-index' picked={picked} setStyle={setStyle} fallback='' unitless />
            <StyleNumberInput label='W' prop='width' picked={picked} setStyle={setStyle} fallback={String(picked.position.width)} />
            <StyleNumberInput label='H' prop='height' picked={picked} setStyle={setStyle} fallback={String(picked.position.height)} />
        </div>
        <SelectRow label='Position' prop='position' picked={picked} setStyle={setStyle} options={['static', 'relative', 'absolute', 'fixed', 'sticky']} />
    </div>
);

// ----- Layout (flex) --------------------------------------------------------

const LayoutGroup: React.FC<FieldProps> = ({ picked, setStyle }) => {
    const flexDir = picked.computedStyles['flex-direction'] || 'row';
    const flexWrap = picked.computedStyles['flex-wrap'] || 'nowrap';
    const disp = picked.computedStyles['display'] || '';
    return (
        <div className='theia-mini-browser-inspector__control-block'>
            <div className='theia-mini-browser-inspector__field-label'>Flow</div>
            <div className='theia-mini-browser-inspector__seg'>
                <SegButton active={flexDir === 'row'} onClick={() => setStyle('flex-direction', 'row')} icon='arrow-right' title='row' />
                <SegButton active={flexDir === 'column'} onClick={() => setStyle('flex-direction', 'column')} icon='arrow-down' title='column' />
                <SegButton active={flexWrap === 'wrap'} onClick={() => setStyle('flex-wrap', flexWrap === 'wrap' ? 'nowrap' : 'wrap')} icon='list-unordered' title='wrap' />
                <SegButton active={disp === 'grid' || disp === 'inline-grid'} onClick={() => setStyle('display', disp.includes('grid') ? 'block' : 'grid')} icon='layout-panel' title='grid' />
            </div>
            <SelectRow label='Justify' prop='justify-content' picked={picked} setStyle={setStyle} options={JUSTIFY_CONTENT_OPTIONS} />
            <SelectRow label='Align items' prop='align-items' picked={picked} setStyle={setStyle} options={ALIGN_ITEMS_OPTIONS} />
            <SelectRow label='Align content' prop='align-content' picked={picked} setStyle={setStyle} options={ALIGN_CONTENT_OPTIONS} />
            <StyleNumberInput label='Gap' prop='gap' picked={picked} setStyle={setStyle} fallback='' inline />
        </div>
    );
};

const JUSTIFY_CONTENT_OPTIONS = ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly', 'stretch'];
const ALIGN_ITEMS_OPTIONS = ['stretch', 'flex-start', 'center', 'flex-end', 'baseline', 'start', 'end'];
const ALIGN_CONTENT_OPTIONS = ['stretch', 'flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'];

const DimensionsGroup: React.FC<FieldProps> = ({ picked, setStyle }) => (
    <div className='theia-mini-browser-inspector__control-block'>
        <div className='theia-mini-browser-inspector__row-2'>
            <StyleNumberInput label='W' prop='width' picked={picked} setStyle={setStyle} fallback={String(picked.position.width)} />
            <StyleNumberInput label='H' prop='height' picked={picked} setStyle={setStyle} fallback={String(picked.position.height)} />
        </div>
        <div className='theia-mini-browser-inspector__row-2'>
            <StyleNumberInput label='Min W' prop='min-width' picked={picked} setStyle={setStyle} fallback='' />
            <StyleNumberInput label='Min H' prop='min-height' picked={picked} setStyle={setStyle} fallback='' />
        </div>
        <div className='theia-mini-browser-inspector__row-2'>
            <StyleNumberInput label='Max W' prop='max-width' picked={picked} setStyle={setStyle} fallback='' />
            <StyleNumberInput label='Max H' prop='max-height' picked={picked} setStyle={setStyle} fallback='' />
        </div>
    </div>
);

const SpacingGroup: React.FC<{ label: string; prefix: 'padding' | 'margin' } & FieldProps> = ({ label, prefix, picked, setStyle }) => (
    <div className='theia-mini-browser-inspector__control-block theia-mini-browser-inspector__control-block--nested'>
        <div className='theia-mini-browser-inspector__field-label'>{label}</div>
        <div className='theia-mini-browser-inspector__spacing'>
            <StyleNumberInput label='T' prop={`${prefix}-top`} picked={picked} setStyle={setStyle} fallback='0' />
            <StyleNumberInput label='R' prop={`${prefix}-right`} picked={picked} setStyle={setStyle} fallback='0' />
            <StyleNumberInput label='B' prop={`${prefix}-bottom`} picked={picked} setStyle={setStyle} fallback='0' />
            <StyleNumberInput label='L' prop={`${prefix}-left`} picked={picked} setStyle={setStyle} fallback='0' />
        </div>
    </div>
);

const BoxToggles: React.FC<FieldProps> = ({ picked, setStyle }) => {
    const isBorderBox = picked.computedStyles['box-sizing'] === 'border-box';
    const overflow = picked.computedStyles['overflow'] || 'visible';
    return (
        <div className='theia-mini-browser-inspector__control-block'>
            <label className='theia-mini-browser-inspector__check'>
                <input type='checkbox' checked={isBorderBox} onChange={e => setStyle('box-sizing', e.target.checked ? 'border-box' : 'content-box')} />
                <span>Border box</span>
            </label>
            <label className='theia-mini-browser-inspector__check'>
                <input type='checkbox' checked={overflow === 'hidden'} onChange={e => setStyle('overflow', e.target.checked ? 'hidden' : 'visible')} />
                <span>Clip content (overflow: hidden)</span>
            </label>
            <div className='theia-mini-browser-inspector__row-2'>
                <SelectRow label='Overflow X' prop='overflow-x' picked={picked} setStyle={setStyle} options={OVERFLOW_AXIS_OPTIONS} />
                <SelectRow label='Overflow Y' prop='overflow-y' picked={picked} setStyle={setStyle} options={OVERFLOW_AXIS_OPTIONS} />
            </div>
        </div>
    );
};

const OVERFLOW_AXIS_OPTIONS = ['visible', 'hidden', 'clip', 'scroll', 'auto'];

const AppearanceGroup: React.FC<FieldProps> = ({ picked, setStyle }) => {
    const opacity = parseFloat(picked.computedStyles['opacity'] || '1');
    return (
        <div className='theia-mini-browser-inspector__control-block'>
            <div className='theia-mini-browser-inspector__field'>
                <label>Opacity</label>
                <div className='theia-mini-browser-inspector__range-row'>
                    <input
                        type='range' min={0} max={1} step={0.01}
                        value={isNaN(opacity) ? 1 : opacity}
                        onChange={e => setStyle('opacity', e.target.value)}
                    />
                    <span className='theia-mini-browser-inspector__range-value'>{Math.round((isNaN(opacity) ? 1 : opacity) * 100)}%</span>
                </div>
            </div>
            <StyleNumberInput label='Radius' prop='border-radius' picked={picked} setStyle={setStyle} fallback='0' />
            <ColorRow label='Border color' prop='border-color' picked={picked} setStyle={setStyle} />
            <StyleNumberInput label='Border W' prop='border-width' picked={picked} setStyle={setStyle} fallback='0' />
            <SelectRow label='Border' prop='border-style' picked={picked} setStyle={setStyle} options={['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset']} />
            <StyleTextInput label='Shadow' prop='box-shadow' picked={picked} setStyle={setStyle} />
        </div>
    );
};

const TextGroup: React.FC<FieldProps> = ({ picked, setStyle }) => (
    <div className='theia-mini-browser-inspector__control-block'>
        <StyleTextInput label='Font' prop='font-family' picked={picked} setStyle={setStyle} />
        <div className='theia-mini-browser-inspector__row-2'>
            <SelectRow label='Weight' prop='font-weight' picked={picked} setStyle={setStyle} options={FONT_WEIGHT_OPTIONS} />
            <StyleNumberInput label='Size' prop='font-size' picked={picked} setStyle={setStyle} fallback='' />
        </div>
        <div className='theia-mini-browser-inspector__row-2'>
            <StyleTextInput label='Line H' prop='line-height' picked={picked} setStyle={setStyle} />
            <StyleTextInput label='Spacing' prop='letter-spacing' picked={picked} setStyle={setStyle} />
        </div>
        <SelectRow label='Decoration' prop='text-decoration-line' picked={picked} setStyle={setStyle} options={['none', 'underline', 'overline', 'line-through']} />
        <SelectRow label='Transform' prop='text-transform' picked={picked} setStyle={setStyle} options={['none', 'capitalize', 'uppercase', 'lowercase']} />
        <ColorRow label='Color' prop='color' picked={picked} setStyle={setStyle} />
        <div className='theia-mini-browser-inspector__field-label'>Alignment</div>
        <div className='theia-mini-browser-inspector__seg'>
            <SegButton active={isTextAlign(picked, 'left')} onClick={() => setStyle('text-align', 'left')} icon='arrow-left' title='Left' />
            <SegButton active={isTextAlign(picked, 'center')} onClick={() => setStyle('text-align', 'center')} icon='dash' title='Center' />
            <SegButton active={isTextAlign(picked, 'right')} onClick={() => setStyle('text-align', 'right')} icon='arrow-right' title='Right' />
            <SegButton active={isTextAlign(picked, 'justify')} onClick={() => setStyle('text-align', 'justify')} icon='three-bars' title='Justify' />
        </div>
    </div>
);

const FONT_WEIGHT_OPTIONS = ['normal', 'bold', 'bolder', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

const BackgroundGroup: React.FC<FieldProps> = ({ picked, setStyle }) => (
    <div className='theia-mini-browser-inspector__control-block'>
        <ColorRow label='Color' prop='background-color' picked={picked} setStyle={setStyle} />
        <SelectRow label='Repeat' prop='background-repeat' picked={picked} setStyle={setStyle} options={['repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round']} />
        <StyleTextInput label='Size' prop='background-size' picked={picked} setStyle={setStyle} />
    </div>
);

// ----- Reusable controls -----------------------------------------------------

interface InputBaseProps extends FieldProps {
    label: string;
    prop: string;
}

const StyleNumberInput: React.FC<InputBaseProps & { fallback: string; inline?: boolean; unitless?: boolean }> = ({
    label, prop, picked, setStyle, fallback, inline, unitless
}) => {
    const raw = picked.computedStyles[prop] ?? fallback;
    const parsed = splitNumberUnit(String(raw), String(fallback));
    const [value, setValue] = React.useState<string>(parsed.text);
    const focused = React.useRef(false);
    React.useEffect(() => {
        if (!focused.current) {
            const next = splitNumberUnit(String(picked.computedStyles[prop] ?? fallback), String(fallback));
            setValue(next.text);
        }
    }, [picked.computedStyles[prop], picked.pickedId, prop, fallback]);
    const displayUnit = unitless ? '' : parsed.unit;
    const commit = (v: string): void => {
        const trimmed = v.trim();
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
        } else {
            setStyle(prop, trimmed);
        }
    };
    const applyStep = (delta: number): void => {
        if (!/^[-+]?\d*\.?\d+$/.test(value)) return;
        const next = (parseFloat(value) || 0) + delta;
        const nextStr = String(next);
        setValue(nextStr);
        commit(nextStr);
    };
    return (
        <label className={'theia-mini-browser-inspector__num' + (inline ? ' theia-mini-browser-inspector__num--inline' : '')} title={prop}>
            <span className='theia-mini-browser-inspector__num-label'>{label}</span>
            <input
                type='text'
                inputMode={unitless ? 'numeric' : 'decimal'}
                value={value}
                onFocus={() => { focused.current = true; }}
                onBlur={e => { focused.current = false; commit(e.target.value); }}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                    if (e.key === 'Escape') {
                        const next = splitNumberUnit(String(picked.computedStyles[prop] ?? fallback), String(fallback));
                        setValue(next.text);
                        (e.target as HTMLInputElement).blur();
                    }
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        const step = e.shiftKey ? 10 : 1;
                        applyStep(e.key === 'ArrowUp' ? step : -step);
                    }
                }}
            />
            <span className='theia-mini-browser-inspector__num-unit'>{displayUnit}</span>
        </label>
    );
};

const StyleTextInput: React.FC<InputBaseProps> = ({ label, prop, picked, setStyle }) => {
    const raw = picked.computedStyles[prop] || '';
    const [value, setValue] = React.useState<string>(raw);
    const focused = React.useRef(false);
    React.useEffect(() => {
        if (!focused.current) setValue(raw);
    }, [raw]);
    return (
        <label className='theia-mini-browser-inspector__field' title={prop}>
            <span>{label}</span>
            <input
                type='text'
                value={value}
                onFocus={() => { focused.current = true; }}
                onBlur={e => { focused.current = false; setStyle(prop, e.target.value); }}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
            />
        </label>
    );
};

const ColorRow: React.FC<InputBaseProps> = ({ label, prop, picked, setStyle }) => {
    const raw = picked.computedStyles[prop] || '';
    const hex = rgbToHex(raw);
    return (
        <label className='theia-mini-browser-inspector__field' title={prop}>
            <span>{label}</span>
            <div className='theia-mini-browser-inspector__color'>
                <input
                    type='color'
                    value={hex || '#000000'}
                    onChange={e => setStyle(prop, e.target.value)}
                />
                <input
                    type='text'
                    value={raw}
                    onChange={e => setStyle(prop, e.target.value)}
                />
            </div>
        </label>
    );
};

const SelectRow: React.FC<InputBaseProps & { options: string[] }> = ({ label, prop, picked, setStyle, options }) => {
    const raw = picked.computedStyles[prop] || '';
    return (
        <label className='theia-mini-browser-inspector__field' title={prop}>
            <span>{label}</span>
            <select className='theia-mini-browser-inspector__select' value={raw} onChange={e => setStyle(prop, e.target.value)}>
                {!raw ? <option value=''>—</option> : undefined}
                {!options.includes(raw) && raw ? <option value={raw}>{raw}</option> : undefined}
                {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
        </label>
    );
};

const SegButton: React.FC<{ active: boolean; onClick: () => void; icon: string; title: string }> = ({ active, onClick, icon, title }) => (
    <button
        type='button'
        title={title}
        onClick={onClick}
        className={'theia-mini-browser-inspector__seg-btn' + (active ? ' theia-mini-browser-inspector__seg-btn--active' : '')}
    >
        <span className={codicon(icon)} />
    </button>
);

function splitNumberUnit(raw: string, fallback: string): { text: string; unit: string } {
    const r = String(raw || fallback || '').trim();
    if (!r) return { text: '', unit: 'px' };
    if (!/^[-+.\d]/.test(r)) {
        return { text: r, unit: '' };
    }
    const m = r.match(/^([-+]?\d*\.?\d+)([a-z%]*)$/i);
    if (m) {
        return { text: m[1], unit: m[2] || 'px' };
    }
    return { text: r, unit: '' };
}

// ----- CSS tab (DevTools-style two columns, editable values) ------------------

const CssTab: React.FC<{ picked: PickedElement; service: ElementInspectorService }> = ({ picked, service }) => {
    const keys = React.useMemo(
        () => Object.keys(picked.computedStyles).sort((a, b) => a.localeCompare(b)),
        [picked.computedStyles, picked.pickedId]
    );
    const selector = formatSelector({ tagName: picked.tagName, id: picked.id, classes: picked.classes });
    return (
        <div className='theia-mini-browser-inspector__css-devtools'>
            <div className='theia-mini-browser-inspector__css-devtools-head' title={selector}>
                <span className='theia-mini-browser-inspector__css-devtools-selector'>{selector}</span>
            </div>
            <div className='theia-mini-browser-inspector__css-table' role='list'>
                {keys.map(key => (
                    <CssPropertyRow
                        key={key}
                        prop={key}
                        value={picked.computedStyles[key] ?? ''}
                        service={service}
                        pickedKey={picked.pickedId}
                    />
                ))}
            </div>
        </div>
    );
};

const CssPropertyRow: React.FC<{
    prop: string;
    value: string;
    service: ElementInspectorService;
    pickedKey: string;
}> = ({ prop, value, service, pickedKey }) => {
    const [local, setLocal] = React.useState(value);
    const focused = React.useRef(false);
    React.useEffect(() => {
        if (!focused.current) {
            setLocal(value);
        }
    }, [value, pickedKey, prop]);
    const commit = (): void => {
        service.updateStyle(prop, local.trim());
    };
    return (
        <div className='theia-mini-browser-inspector__css-row' role='listitem'>
            <span className='theia-mini-browser-inspector__css-name' title={prop}>{prop}</span>
            <div className='theia-mini-browser-inspector__css-value'>
                <input
                    type='text'
                    className='theia-mini-browser-inspector__css-value-input'
                    spellCheck={false}
                    value={local}
                    aria-label={prop}
                    onFocus={() => { focused.current = true; }}
                    onBlur={() => {
                        focused.current = false;
                        commit();
                    }}
                    onChange={e => setLocal(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                        }
                        if (e.key === 'Escape') {
                            setLocal(value);
                            (e.target as HTMLInputElement).blur();
                        }
                    }}
                />
            </div>
        </div>
    );
};

// ----- HTML tab -------------------------------------------------------------

const HtmlTab: React.FC<{ picked: PickedElement; service: ElementInspectorService }> = ({ picked, service }) => {
    const [text, setText] = React.useState<string>(picked.textPreview);
    const focused = React.useRef(false);
    React.useEffect(() => {
        if (!focused.current) setText(picked.textPreview);
    }, [picked.textPreview, picked.pickedId]);
    return (
        <div className='theia-mini-browser-inspector__html'>
            <label className='theia-mini-browser-inspector__field'>
                <span>Text content</span>
                <textarea
                    rows={3}
                    value={text}
                    onFocus={() => { focused.current = true; }}
                    onBlur={e => { focused.current = false; service.updateText(e.target.value); }}
                    onChange={e => setText(e.target.value)}
                />
            </label>
            <details>
                <summary>Outer HTML</summary>
                <pre className='theia-mini-browser-inspector__css'><code>{picked.outerHTML}</code></pre>
            </details>
            <details>
                <summary>Attributes</summary>
                <ul className='theia-mini-browser-inspector__attrs'>
                    {picked.attributes.map(attr => (
                        <li key={attr.name}><span>{attr.name}</span><code>{attr.value}</code></li>
                    ))}
                </ul>
            </details>
        </div>
    );
};

// ----- helpers -------------------------------------------------------------

function formatSelector(node: { tagName: string; id?: string; classes: ReadonlyArray<string> }): string {
    let selector = node.tagName;
    if (node.id) selector += '#' + node.id;
    if (node.classes && node.classes.length) selector += '.' + node.classes.slice(0, 3).join('.');
    return selector;
}

function isTextAlign(picked: PickedElement, side: 'left' | 'center' | 'right' | 'justify'): boolean {
    const v = (picked.computedStyles['text-align'] || '').toLowerCase();
    if (side === 'left') return v === 'left' || v === 'start';
    if (side === 'right') return v === 'right' || v === 'end';
    return v === side;
}

function rgbToHex(color: string): string | undefined {
    const match = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!match) {
        return color.startsWith('#') ? color : undefined;
    }
    const toHex = (n: string) => Number(n).toString(16).padStart(2, '0');
    return '#' + toHex(match[1]) + toHex(match[2]) + toHex(match[3]);
}
