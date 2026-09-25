'use client'
import DateField from '@/components/DateField'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { UNIT_CODES, VAT_CATEGORIES, unitLabel, vatCategoryFromRate } from '@/lib/efactura'
import { useLocale } from '@/components/LocaleProvider'
import { unitMessageKey, vatCategoryKey } from '@/lib/uiLabels'
import { formatAmount, formatRon } from '@/lib/money'
import { computeInvoiceTotals, roundMoney, vatRateOptions } from '@/lib/invoiceMath'
import { BNR_FX_URL, parseExchangeRate, type InvoiceFxValue } from '@/lib/invoiceFx'
import { formatRoDate, lastBankingDayBefore } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import { useCompany } from '@/components/CompanyProvider'
import {
  catalogNameKey,
  filterSuggestions,
  loadCatalogItems,
  loadRecentInvoiceLines,
  saveLineToCatalog,
  touchCatalogItem,
  type CatalogItem,
  type CatalogSuggestion
} from '@/lib/catalog'

export type InvoiceLineItem = {
  id?: string
  description: string
  quantity: number
  unit_price: number
  tva_rate: number
  total: number
  unit_code: string
  vat_category: string
  vat_exemption_reason: string
  discount_percent: number
}

export const emptyInvoiceLine = (): InvoiceLineItem => ({
  description: '',
  quantity: 1,
  unit_price: 0,
  tva_rate: 21,
  total: 0,
  unit_code: 'H87',
  vat_category: 'S',
  vat_exemption_reason: '',
  discount_percent: 0
})

function lineTotal(item: InvoiceLineItem, exchangeRate = 0) {
  return computeInvoiceTotals([item], { exchange_rate: exchangeRate }).lines[0]?.total || 0
}

function applyValues(current: InvoiceLineItem, values: Omit<CatalogSuggestion, 'source' | 'catalogId' | 'code'>, exchangeRate = 0): InvoiceLineItem {
  const next: InvoiceLineItem = {
    ...current,
    description: values.description,
    unit_code: values.unit_code,
    unit_price: values.unit_price,
    tva_rate: values.tva_rate,
    vat_category: values.vat_category || vatCategoryFromRate(values.tva_rate, values.vat_category),
    vat_exemption_reason: values.tva_rate > 0 ? '' : (values.vat_exemption_reason || ''),
    discount_percent: values.discount_percent || 0
  }
  next.total = lineTotal(next, exchangeRate)
  return next
}

export default function InvoiceLineItems({
  items,
  onChange,
  fx,
  onFxChange,
  taxPointDate
}: {
  items: InvoiceLineItem[]
  onChange: (items: InvoiceLineItem[]) => void
  fx?: InvoiceFxValue
  onFxChange?: (next: InvoiceFxValue) => void
  taxPointDate?: string
}) {
  const { t } = useLocale()
  const { userId, company, ownerUserId } = useCompany()
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [recent, setRecent] = useState<CatalogSuggestion[]>([])
  const [catalogReady, setCatalogReady] = useState(false)
  const [missingTable, setMissingTable] = useState(false)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [rateText, setRateText] = useState(fx?.rate ? String(fx.rate) : '')
  const wrapRef = useRef<HTMLDivElement>(null)

  const reloadCatalog = async () => {
    if (!userId) return
    const [{ items: rows, missingTable: missing }, recentLines] = await Promise.all([
      loadCatalogItems(supabase, { userId: ownerUserId || userId, activeOnly: true }),
      loadRecentInvoiceLines(supabase, { userId: ownerUserId || userId, companyId: company?.id })
    ])
    setCatalog(rows)
    setRecent(recentLines)
    setMissingTable(!!missing)
    setCatalogReady(true)
  }

  useEffect(() => {
    reloadCatalog()
  }, [userId, company?.id])

  useEffect(() => {
    if (!fx?.enabled) return
    if (parseExchangeRate(rateText) === fx.rate) return
    setRateText(fx.rate ? String(fx.rate) : '')
  }, [fx?.enabled, fx?.rate, rateText])

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpenIndex(null)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [])

  const updateItem = (index: number, field: keyof InvoiceLineItem, value: string | number) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    if (field === 'tva_rate') {
      updated[index].vat_category = vatCategoryFromRate(Number(value), updated[index].vat_category)
      if (Number(value) > 0) updated[index].vat_exemption_reason = ''
    }
    updated[index].total = lineTotal(updated[index], fx?.rate)
    onChange(updated)
  }

  const applySuggestion = (index: number, suggestion: CatalogSuggestion) => {
    const updated = [...items]
    updated[index] = applyValues(updated[index], suggestion, fx?.rate)
    onChange(updated)
    setOpenIndex(null)
    if (suggestion.catalogId) touchCatalogItem(supabase, suggestion.catalogId)
  }

  const applyRecentChip = (suggestion: CatalogSuggestion) => {
    const emptyIdx = items.findIndex(item => !item.description.trim() && !item.unit_price)
    if (emptyIdx >= 0) {
      applySuggestion(emptyIdx, suggestion)
      return
    }
    onChange([...items, applyValues(emptyInvoiceLine(), suggestion, fx?.rate)])
    if (suggestion.catalogId) touchCatalogItem(supabase, suggestion.catalogId)
  }

  const addItem = () => onChange([...items, emptyInvoiceLine()])
  const removeItem = (index: number) => {
    if (items.length === 1) return
    onChange(items.filter((_, i) => i !== index))
    if (openIndex === index) setOpenIndex(null)
  }

  const saveLine = async (index: number) => {
    if (!userId) return
    const item = items[index]
    setSavingIndex(index)
    const result = await saveLineToCatalog(supabase, {
      description: item.description,
      unit_code: item.unit_code,
      unit_price: item.unit_price,
      tva_rate: item.tva_rate,
      vat_category: item.vat_category,
      vat_exemption_reason: item.vat_exemption_reason,
      discount_percent: item.discount_percent
    }, { userId: ownerUserId || userId, companyId: company?.id, items: catalog })
    setSavingIndex(null)
    if (result.error) {
      alert(result.error)
      return
    }
    await reloadCatalog()
  }

  const recentChips = useMemo(() => recent.slice(0, 6), [recent])
  const priced = useMemo(
    () => computeInvoiceTotals(items, { exchange_rate: fx?.enabled ? fx.rate : 0 }),
    [fx?.enabled, fx?.rate, items]
  )

  return (
    <div className="card p-6" ref={wrapRef}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <h3 className="font-bold text-[color:var(--color-foreground)]">{t('inv.lines')}</h3>
        <Link href="/nomenclator" className="text-xs text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)] underline">
          {t('inv.catalogLink')}
        </Link>
      </div>

      {recentChips.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-[color:var(--color-muted-foreground)] uppercase tracking-wider mb-2">{t('inv.recentLines')}</p>
          <div className="flex flex-wrap gap-2">
            {recentChips.map(line => (
              <button
                key={suggestionStableKey(line)}
                type="button"
                onClick={() => applyRecentChip(line)}
                className="text-xs border border-gray-200 rounded-full px-3 py-1.5 text-[color:var(--color-foreground)] hover:bg-gray-50 transition max-w-full truncate"
                title={`${line.description} · ${formatAmount(line.unit_price)}`}
              >
                {line.description}
              </button>
            ))}
          </div>
        </div>
      )}

      {fx && onFxChange && (
        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm text-[color:var(--color-foreground)] mb-3">
            <input
              type="checkbox"
              checked={fx.enabled}
              onChange={e => {
                const enabled = e.target.checked
                onFxChange({
                  ...fx,
                  enabled,
                  source: fx.source || 'BNR',
                  date: enabled ? (fx.date || lastBankingDayBefore(taxPointDate || '')) : fx.date
                })
              }}
            />
            {t('inv.fxToggle')}
          </label>
          {fx.enabled && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('inv.fxRate')}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rateText}
                      onChange={e => {
                        setRateText(e.target.value)
                        onFxChange({ ...fx, rate: parseExchangeRate(e.target.value) })
                      }}
                      className="input"
                      placeholder="5,0851"
                    />
                    <span className="text-sm text-[color:var(--color-muted-foreground)] whitespace-nowrap">lei</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('inv.fxSource')}</label>
                  <select
                    value={fx.source || 'BNR'}
                    onChange={e => onFxChange({ ...fx, source: e.target.value })}
                    className="input bg-white"
                  >
                    <option value="BNR">{t('inv.fxBnr')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[color:var(--color-muted-foreground)] mb-1">{t('inv.fxDate')}</label>
                  <div className="flex items-center gap-2">
                    <DateField
                      value={fx.date || lastBankingDayBefore(taxPointDate || '')}
                      onChange={e => onFxChange({ ...fx, date: e.target.value })}
                      className="input"
                    />
                    <a
                      href={BNR_FX_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                    >
                      {t('inv.fxSeeBnr')} ↗
                    </a>
                  </div>
                </div>
              </div>
              {fx.source === 'BNR' && fx.rate > 0 && (String(rateText).split(/[.,]/)[1] || '').length < 4 && (
                <p className="text-xs text-amber-800 mt-2">{t('inv.fxDecimals')}</p>
              )}
              <p className="text-xs text-[color:var(--color-muted-foreground)] mt-2">
                {t('inv.fxBnrHelp', { date: formatRoDate(taxPointDate || fx.date || '') })}
              </p>
              <p className="text-xs text-[color:var(--color-muted-foreground)] mt-1">{t('inv.fxMentionHint')}</p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {items.map((item, index) => {
          const inCatalog = catalog.some(row => catalogNameKey(row.name) === catalogNameKey(item.description))
          const canSave = catalogReady && !missingTable && item.description.trim().length > 0 && !inCatalog
          const { catalogMatches, recentMatches } = filterSuggestions(item.description, catalog, recent)
          const suggestions = [...catalogMatches, ...recentMatches]
          const showMenu = openIndex === index && suggestions.length > 0

          return (
            <div key={index} className="border border-gray-100 rounded-xl p-3">
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 md:col-span-3 relative">
                  {index === 0 && <label className="block text-xs text-gray-500 mb-1">{t('inv.description')}</label>}
                  <input
                    type="text"
                    value={item.description}
                    onChange={e => {
                      updateItem(index, 'description', e.target.value)
                      setOpenIndex(index)
                      setHighlight(0)
                    }}
                    onFocus={() => {
                      setOpenIndex(index)
                      setHighlight(0)
                    }}
                    onKeyDown={e => {
                      if (!showMenu) return
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setHighlight(h => Math.min(h + 1, suggestions.length - 1))
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setHighlight(h => Math.max(h - 1, 0))
                      }
                      if (e.key === 'Enter' && suggestions[highlight]) {
                        e.preventDefault()
                        applySuggestion(index, suggestions[highlight])
                      }
                      if (e.key === 'Escape') setOpenIndex(null)
                    }}
                    className="input px-3 py-2.5"
                    placeholder={t('inv.linePlaceholder')}
                    autoComplete="off"
                  />
                  {showMenu && (
                    <div className="absolute z-30 left-0 right-0 md:min-w-[22rem] mt-1 bg-white border border-gray-200 rounded-xl overflow-hidden">
                      {catalogMatches.length > 0 && (
                        <SuggestionGroup
                          label={t('inv.catalogLink')}
                          items={catalogMatches}
                          offset={0}
                          highlight={highlight}
                          onPick={suggestion => applySuggestion(index, suggestion)}
                        />
                      )}
                      {recentMatches.length > 0 && (
                        <SuggestionGroup
                          label={t('inv.recentLines')}
                          items={recentMatches}
                          offset={catalogMatches.length}
                          highlight={highlight}
                          onPick={suggestion => applySuggestion(index, suggestion)}
                        />
                      )}
                    </div>
                  )}
                </div>
                <div className="col-span-4 md:col-span-1">
                  {index === 0 && <label className="block text-xs text-gray-500 mb-1">{t('inv.qty')}</label>}
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    className="input px-3 py-2.5"
                    min="0"
                  />
                </div>
                <div className="col-span-8 md:col-span-2">
                  {index === 0 && <label className="block text-xs text-gray-500 mb-1">{t('inv.unit')}</label>}
                  <select
                    value={item.unit_code}
                    onChange={e => updateItem(index, 'unit_code', e.target.value)}
                    className="input bg-white px-3 py-2.5"
                  >
                    {UNIT_CODES.map(unit => (
                      <option key={unit.code} value={unit.code}>{unitMessageKey(unit.code) ? t(unitMessageKey(unit.code)!) : unit.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-4 md:col-span-2">
                  {index === 0 && <label className="block text-xs text-gray-500 mb-1">{fx?.enabled ? t('inv.unitPriceEur') : t('inv.unitPrice')}</label>}
                  <input
                    type="number"
                    value={item.unit_price}
                    onChange={e => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                    className="input px-3 py-2.5"
                    min="0"
                  />
                  {fx?.enabled && fx.rate > 0 && item.unit_price > 0 && (
                    <span className="block text-xs text-[color:var(--color-muted-foreground)] mt-1">= {formatRon(roundMoney(item.unit_price * fx.rate))}</span>
                  )}
                </div>
                <div className="col-span-4 md:col-span-1">
                  {index === 0 && <label className="block text-xs text-gray-500 mb-1">{t('inv.discount')}</label>}
                  <input
                    type="number"
                    value={item.discount_percent}
                    onChange={e => updateItem(index, 'discount_percent', parseFloat(e.target.value) || 0)}
                    className="input px-3 py-2.5"
                    min="0"
                    max="100"
                  />
                </div>
                <div className="col-span-4 md:col-span-1">
                  {index === 0 && <label className="block text-xs text-gray-500 mb-1">{t('inv.vat')}</label>}
                  <select
                    value={item.tva_rate}
                    onChange={e => updateItem(index, 'tva_rate', parseFloat(e.target.value))}
                    className="input bg-white px-3 py-2.5"
                  >
                    {vatRateOptions(item.tva_rate).map(rate => (
                      <option key={rate} value={rate}>{rate}%</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3 md:col-span-1">
                  {index === 0 && <label className="block text-xs text-gray-500 mb-1">Total</label>}
                  <p className="text-sm font-medium text-[color:var(--color-foreground)] py-2.5">{formatAmount(priced.lines[index]?.total || 0)}</p>
                </div>
                <div className="col-span-1">
                  {index === 0 && <div className="mb-1 h-4"></div>}
                  <button
                    onClick={() => removeItem(index)}
                    className="text-red-400 hover:text-red-600 transition text-lg leading-none py-2.5"
                  >
                    ×
                  </button>
                </div>
              </div>
              {item.tva_rate === 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                  <select
                    value={item.vat_category}
                    onChange={e => updateItem(index, 'vat_category', e.target.value)}
                    className="input bg-white px-3 py-2.5"
                  >
                    {VAT_CATEGORIES.filter(cat => cat.code !== 'S').map(cat => (
                      <option key={cat.code} value={cat.code}>{vatCategoryKey(cat.code) ? t(vatCategoryKey(cat.code)!) : cat.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={item.vat_exemption_reason}
                    onChange={e => updateItem(index, 'vat_exemption_reason', e.target.value)}
                    className="input px-3 py-2.5"
                    placeholder={t('inv.vatExemptionPh')}
                  />
                </div>
              )}
              {canSave && (
                <button
                  type="button"
                  onClick={() => saveLine(index)}
                  disabled={savingIndex === index}
                  className="mt-2 text-xs text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)] underline disabled:opacity-50"
                >
                  {savingIndex === index ? t('common.saving') : t('inv.saveToCatalog')}
                </button>
              )}
            </div>
          )
        })}
      </div>
      <button onClick={addItem} className="mt-4 btn btn-outline w-full border-dashed">
        {t('inv.addLine')}
      </button>
    </div>
  )
}

function suggestionStableKey(line: CatalogSuggestion) {
  return `${line.source}:${line.catalogId || ''}:${line.description}:${line.unit_code}:${line.unit_price}:${line.tva_rate}`
}

function SuggestionGroup({
  label,
  items,
  offset,
  highlight,
  onPick
}: {
  label: string
  items: CatalogSuggestion[]
  offset: number
  highlight: number
  onPick: (item: CatalogSuggestion) => void
}) {
  const { t } = useLocale()
  return (
    <div>
      <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-[color:var(--color-muted-foreground)]">{label}</p>
      {items.map((item, i) => {
        const active = highlight === offset + i
        return (
          <button
            key={suggestionStableKey(item)}
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => onPick(item)}
            className={`w-full text-left px-3 py-2 ${active ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
          >
            <p className="text-sm text-[color:var(--color-foreground)] truncate">
              {item.description}
              {item.code ? <span className="text-[color:var(--color-muted-foreground)]"> · {item.code}</span> : null}
            </p>
            <p className="text-xs text-[color:var(--color-muted-foreground)]">
              {(unitMessageKey(item.unit_code) ? t(unitMessageKey(item.unit_code)!) : unitLabel(item.unit_code))} · {formatAmount(item.unit_price)} · {t('inv.vatOnly', { rate: item.tva_rate })}
            </p>
          </button>
        )
      })}
    </div>
  )
}
