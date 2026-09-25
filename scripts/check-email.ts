import { validateEmail } from '../lib/email'

function assert(name: string, ok: boolean) {
  if (!ok) throw new Error(name)
  console.log('ok', name)
}

assert('empty optional ok', validateEmail('').ok)
assert('empty required fails', validateEmail('', { required: true }).issue === 'required')
assert('normalizes case', validateEmail('  Office@Facturo.RO  ').normalized === 'office@facturo.ro')
assert('plus tag ok', validateEmail('ana+factura@gmail.com').ok)
assert('simple company ok', validateEmail('contact@companie.ro').ok)
assert('rejects no tld', !validateEmail('ana@companie').ok)
assert('rejects spaces mid', !validateEmail('ana @companie.ro').ok)
assert('rejects two at', !validateEmail('ana@@companie.ro').ok)
assert('rejects consecutive dots', !validateEmail('ana..pop@companie.ro').ok)
assert('rejects leading dot', !validateEmail('.ana@companie.ro').ok)
assert('rejects trailing dot local', !validateEmail('ana.@companie.ro').ok)
assert('rejects comma list', !validateEmail('a@b.ro,c@d.ro').ok)
assert('typo gmail.con', validateEmail('ana@gmail.con').issue === 'typo' && validateEmail('ana@gmail.con').suggestion === 'ana@gmail.com')
assert('too long', validateEmail(`${'a'.repeat(250)}@x.ro`).issue === 'too_long')

console.log('all email checks passed')
