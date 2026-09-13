export const SPV_TEST_UPLOAD_URL = 'https://api.anaf.ro/test/FCTEL/rest/upload'

export type SimulatedSpvResult = {
  simulated: true
  environment: 'test'
  endpoint: string
  cif: string
  executionStatus: '0' | '1'
  indexIncarcare?: string
  stare?: 'ok' | 'nok' | 'in prelucrare'
  idDescarcare?: string
  error?: string
  uploadResponseXml: string
  statusResponseXml?: string
}

function numericCif(cui?: string | null) {
  return (cui || '').replace(/\D/g, '') || '00000000'
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function simulateSpvUpload(input: {
  sellerCui?: string | null
  invoiceRef: string
  xmlError?: string
}): SimulatedSpvResult {
  const cif = numericCif(input.sellerCui)
  const endpoint = `${SPV_TEST_UPLOAD_URL}?standard=UBL&cif=${cif}`

  if (input.xmlError) {
    const message = `Simulare ANAF test: XML respins. ${input.xmlError}`
    return {
      simulated: true,
      environment: 'test',
      endpoint,
      cif,
      executionStatus: '1',
      error: message,
      uploadResponseXml: `<?xml version="1.0" encoding="UTF-8"?>
<header xmlns="mfp:anaf:dgti:spv:req:v1">
  <date>${new Date().toISOString()}</date>
  <ExecutionStatus>1</ExecutionStatus>
  <Errors errorMessage="${xmlEscape(message)}" />
</header>`
    }
  }

  const index = `${Date.now()}${Math.floor(Math.random() * 900 + 100)}`
  const downloadId = `${index}1`

  return {
    simulated: true,
    environment: 'test',
    endpoint,
    cif,
    executionStatus: '0',
    indexIncarcare: index,
    stare: 'ok',
    idDescarcare: downloadId,
    uploadResponseXml: `<?xml version="1.0" encoding="UTF-8"?>
<header xmlns="mfp:anaf:dgti:spv:respUpload:v1">
  <date>${new Date().toISOString()}</date>
  <ExecutionStatus>0</ExecutionStatus>
  <index_incarcare>${index}</index_incarcare>
</header>`,
    statusResponseXml: `<?xml version="1.0" encoding="UTF-8"?>
<header xmlns="mfp:anaf:dgti:spv:stareMesajFactura:v1">
  <stare>ok</stare>
  <id_descarcare>${downloadId}</id_descarcare>
</header>`
  }
}
