# Bank extras import and matching

How Facturo turns a bank statement into inbox proposals and, after confirm, into `invoice_payments`.

Code: `lib/bank/import/*`, `lib/bank/matching/*`, `app/api/bank/import`, `app/api/bank/match`.

---

## 1. Pipeline

```
file bytes
  → detectFormat
  → parse (camt053 | xml940 | csv)
  → NormalizedStatementLine[]
  → insert bank_transactions (skip duplicate fingerprint)
  → match engine (propose only on import)
  → bank_match_suggestions + match_status = suggested | unmatched
  → user Confirm / Ignore
  → invoice_payments + amount_paid refresh
```

Import does **not** write collections. `applyMatchWithContext(..., { autoApply: false })`. Confirm (`POST /api/bank/match` action `confirm`) writes allocations.

Limits: **10 MB**, **10 000** lines (`MAX_IMPORT_BYTES`, `MAX_IMPORT_LINES`).

---

## 2. File types

Detection: `lib/bank/import/detectFormat.ts` (filename + first 4 KB).

| Detected `format` | When | Parser |
|---|---|---|
| `camt053` | `CAMT.053` / `<BkToCstmrStmt` in content | `parseCamt053` |
| `xml940` | `.xml` or generic XML, and not CAMT | `parseXml940` → `parseMulticash940` |
| `csv` | `.csv` / `.txt`, or anything else | preview first; parse after column mapping |

Classic SWIFT MT940 **text** (`:20:` / `:61:`), CAMT.052/054, `.xlsx`, and PDF are **not** implemented.

After parse, every line is the same shape (`NormalizedStatementLine`):

| Field | Meaning |
|---|---|
| `statementIban` | Account the extras belongs to |
| `bookingDate` | `YYYY-MM-DD` |
| `valueDate` | optional |
| `amount` | signed RON (credit `>`, debit `< 0`) |
| `currency` | usually `RON` |
| `counterpartyName` | debtor (in) / creditor (out) |
| `counterpartyIban` | counterpart IBAN |
| `description` | remittance / details (used for invoice refs) |
| `providerRef` | bank id if present |
| `fingerprint` | dedupe key |
| `lineError` | skip reason; line is counted in `lineErrors`, not inserted |

Matching **does not** change by file type. Only how those fields are filled (and how fingerprint is built) changes.

### 2.1 CAMT.053

**In:** ISO 20022 XML (`Document` / `BkToCstmrStmt` / `Stmt` / `Ntry` / `TxDtls`).

**Mapped:**

| CAMT | Line |
|---|---|
| `Acct/IBAN` | `statementIban` |
| `Amt` + `CdtDbtInd` (`CRDT` / `DBIT`) | signed `amount` |
| `BookgDt` / `ValDt` | dates |
| `Dbtr`/`Cdtr` + account | name + IBAN |
| `Ustrd` + structured `Ref` | `description` (joined with ` · `) |
| `AcctSvcrRef` / `TxId` / `EndToEndId` / `InstrId` / `ChqId` | `providerRef` |

One `Ntry` with several `TxDtls` becomes several lines.

**Fingerprint:** if `providerRef` exists: `sha256("camt|" + statementIban + "|" + providerRef)`. Else `paymentFingerprint` (same as xml940).

### 2.2 xml940 (Multicash / statement XML)

**In:** bank XML with tags such as `Stmt`, `Ntry`, `Transaction`, `Tranzactie`, `Extras` (`ENTRY_TAGS` / `STATEMENT_TAGS` in `lib/multicash940.ts`).

**Mapped:** booking/value date, credit/debit direction, counterpart name/IBAN, details, `bankTxnId`.

**Fingerprint (`paymentFingerprint`) — do not change the algorithm:**

```
sha256(
  normalizeIban(statementIban)
  + "|" + paidOn
  + "|" + amount.toFixed(2)
  + "|" + normalizeIban(counterpartIban)
  + "|" + bankTxnId.trim().toUpperCase()
  + "|" + details collapsed/uppercased, first 160 chars
)
```

Re-import of the same xml940 file must hit this key.

### 2.3 CSV

**In:** UTF-8 or Windows-1250; delimiter `;` or `,` (sniffed). First upload without mapping returns `needsCsvMapping` + header preview (5 rows).

**User mapping (`CsvImportMapping`):**

| Role | Use |
|---|---|
| `date` | `dd.mm.yyyy` / `dd/mm/yyyy` / `yyyy-mm-dd` → `bookingDate` |
| `debit` + `credit` | `amount = credit − |debit|` |
| `amount` | signed (or parentheses = negative) if no debit/credit |
| `name` | counterpart |
| `iban` | counterpart IBAN |
| `details` | description |
| `reference` | `providerRef` |
| `ignore` | unused column |

Mapping is stored on `bank_accounts.import_mapping` for that IBAN.

**Fingerprint:** `paymentFingerprint` with `statementIban` filled after the company account is known (import overwrites CSV fingerprint with the statement IBAN).

**CSV-only extra:** `needsIbanConfirm` if the extras IBAN is another company’s account.

---

## 3. What gets persisted on import

`bank_transactions` row:

| Column | Source |
|---|---|
| `source` | `camt053` / `xml940` / `csv` |
| `fingerprint` | see above |
| `provider_tx_id` | `providerRef` |
| `booking_date`, `value_date`, `amount`, `currency` | line |
| `counterparty_name`, `counterparty_iban`, `description` | line |
| `match_status` | `ignored` if counterpart IBAN is another of *this* company’s accounts (`transfer_intern`); else `unmatched` then engine updates to `suggested` / stays `unmatched` |

Duplicate `fingerprint` (same company): no second row. If the existing row is still `unmatched` / `suggested`, matching is run again (still no auto-apply).

---

## 4. Matching engine

`matchBankTransaction` (`lib/bank/matching/engine.ts`). Same for all three formats.

### 4.1 Input

```ts
{
  transaction: {
    amount_bani,          // signed, 1 RON = 100
    currency,             // must match invoice currency
    counterparty_name,
    counterparty_iban,
    description
  },
  invoices: MatchInvoice[],  // open only (see remaining)
  seriesList: string[],      // all series on the company
  defaultSeries: string,     // companies.invoice_series or first series
  rules: LearnedRule[]       // bank_match_rules (learned IBAN / name)
}
```

Open invoice (`MatchInvoice`):

| Field | Notes |
|---|---|
| `remaining_bani` | `toBani(total − prepaid − max(amount_paid, sum(invoice_payments)))` |
| `direction` | `issued` or `purchase` |
| `client_ibans` | `clients.iban` + `client_bank_accounts` |
| `series`, `invoice_number` | keyed as `FCT:16` after normalize (letters+digits, leading zeros stripped) |

Skipped: drafts, credit notes, `remaining_bani ≤ 1`.

**Direction:** `amount_bani > 0` → issued (încasare). `amount_bani < 0` → purchase (plată). Amount `0` → no candidate.

### 4.2 Invoice number extraction

From `description + counterparty_name`, after masking IBAN, CUI (`ROdigits`), dates, and amounts:

- `FCT0026`, `FCT 26`, `fct-0026`
- `F.0026`
- `factura 26`, `c/v fact FCT26`

Output: `{ series, number }` unique list.

### 4.3 Output

```ts
{
  allocations: [{ invoiceId, amount_bani }],
  confidence: number,       // 45–98
  rule: MatchRule,
  overpayment_bani: number, // leftover vs invoice remaining
  auto: confidence >= 90    // computed; import ignores this
} | null
```

`null` → `match_status = unmatched` (inbox, no proposal).

Otherwise import writes `bank_match_suggestions` and `match_status = suggested`.

---

## 5. Rules and UI levels

UI (`confidenceKind`):

| UI (RO / EN) | Score |
|---|---|
| **Sigur** / Sure | `confidence >= 90` |
| **Probabil** / Likely | `70–89` |
| **Posibil** / Possible | `< 70` |

Engine order (first hit wins):

| `rule` | Confidence | UI | When |
|---|---|---|---|
| `duplicate_ref` | **70** (cap) | Probabil | Same series+number hits **more than one** open invoice. Never treated as unique. |
| `invoice_ref` | **98** | Sigur | Exactly one invoice for the extracted ref, amount **=** remaining. |
| `invoice_ref_partial` | **90** | Sigur | One ref, amount **<** remaining (partial collection). |
| `overpayment` | **90** | Sigur | One ref (or several whose remainings sum **<** amount). Allocates remaining; leftover in `overpayment_bani`. |
| `invoice_ref_multi` | **97** | Sigur | Several refs in the text; amount **=** sum of those remainings. |
| `iban_amount` | **90** | Sigur | Exactly one client identified (IBAN, CUI in text, or learned rule) **and** IBAN known **and** exactly one of their open invoices has remaining **=** amount. |
| `multi_invoice` | **75** | Probabil | One client; oldest 2–5 open invoices sum to the amount. |
| `partial_oldest` | **60** | Posibil | One client; allocate up to remaining of the oldest open invoice. |
| `name_amount` | **45** | Posibil | No unique client from IBAN/CUI; exactly one invoice with remaining **=** amount and similar client name (legal form stripped). |
| `already_collected` | **95** | Sigur | Ref matches an invoice with **no remaining**, but unlinked **manual** payments cover the amount. Import **proposes** only; confirm **links** `bank_transaction_id` (does not add a second payment). |

If none apply → unmatched.

**Client identification** (for IBAN / oldest / multi): counterpart IBAN equals a client IBAN; or CUI appears in description/name; or `bank_match_rules` (IBAN or normalized name). Must resolve to **exactly one** `client_id` for those rules.

**Name similarity:** diacritics stripped; tokens `SRL`, `SA`, `IFN`, … dropped; one name’s tokens ⊆ the other.

---

## 6. After the user acts

| Action | Effect |
|---|---|
| **Confirmă** | Insert `invoice_payments` (source = file format) **or** link existing manuals (`already_collected`). `amount_paid` = `sum(invoice_payments)`. `match_status` = `matched` or `partially_matched`. May learn counterpart IBAN into `bank_match_rules`. |
| **Ignoră** | `match_status = ignored`. No payment. Leaves **De confirmat**. Visible under Tranzacții → Ignorată. |
| **Anulează** | Delete allocations created by the match; **unlink** `already_collected` (does not delete the old manual row). |

Guard: a new allocation cannot exceed `total − prepaid − sum(existing payments)` (`allocation exceeds invoice remaining`).

**Paid / remaining (Facturi, Încasări, matching):**

```
remaining = total − prepaid_amount − sum(invoice_payments)
```

Manual încasări and **confirmed** bank allocations both count. Ignored / unconfirmed extras do not.

---

## 7. APIs

**`POST /api/bank/import`** (multipart)

| In | Out |
|---|---|
| `file`, `userId` / `actorUserId`, `companyId` | `{ format, newCount, autoMatched, toConfirm, duplicates, internalTransfers, lineErrors, accountIban, transactionIds }` |
| optional `csvMapping`, `confirmForeignIban`, `statementIban` | or `{ needsCsvMapping, preview }` / `{ needsIbanConfirm, foreignIban }` |

On current product, `autoMatched` stays **0** (proposals only). `toConfirm` = suggested + unmatched new lines.

**`POST /api/bank/match`** (JSON)

| `action` | In | Out |
|---|---|---|
| `confirm` | `transactionId`, `allocations: [{ invoiceId, amount }]` | `{ status, applied }` |
| `ignore` | `transactionId`, `reason` | `{ status: 'ignored' }` |
| `undo` | `transactionId` or `paymentId` | unmatched / reallocate |

---

## 8. Code map

| Topic | Path |
|---|---|
| Detect | `lib/bank/import/detectFormat.ts` |
| CAMT | `lib/bank/import/parseCamt053.ts` |
| xml940 | `lib/bank/import/parseXml940.ts`, `lib/multicash940.ts` |
| CSV | `lib/bank/import/parseCsv.ts` |
| Import write | `lib/bank/import/importStatement.ts` |
| Engine | `lib/bank/matching/engine.ts` |
| Refs | `lib/bank/matching/extractRefs.ts` |
| Apply / link / confirm | `lib/bank/matching/apply.ts` |
| UI labels | `lib/bank/labels.ts` (`sure` / `likely` / `possible`) |
| Tests | `lib/bank/import/import.test.ts`, `lib/bank/matching/engine.test.ts`, `lib/bank/matching/apply.test.ts` |
