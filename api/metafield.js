/**
 * MIDDLEWARE MAESTRO DE INVENTARIO - MUNDO IN
 * Optimizado para: Carga masiva, Búsqueda por SKU y Mutaciones Atómicas.
 */

export default async function handler(req, res) {
  // CONFIGURACIÓN DE ENTORNO
  const SHOPIFY_HOST = 'mundo-jm-test.myshopify.com';
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
  const VERSION = '2024-07';

  // 1. CONTROL DE ACCESO (CORS) - Indispensable para que tu index.html no falle
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 2. EXTRACCIÓN DINÁMICA DE PARÁMETROS
    const { handle, sku, stocks } = req.method === 'POST' ? req.body : req.query;
    let productId = null;
    let activeHandle = handle;

    /**
     * FASE 1: RESOLUCIÓN DE IDENTIDAD (Reverse Lookup)
     * Si no tenemos el Handle (producto nuevo o manual), lo buscamos en Shopify vía SKU.
     */
    if (sku && !handle) {
      const searchRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
        body: JSON.stringify({
          query: `query($q: String!){ 
            productVariants(first: 1, query: $q){ 
              edges{ node{ product{ id handle } } } 
            } 
          }`,
          variables: { q: `sku:${sku}` }
        })
      });
      const searchJson = await searchRes.json();
      const found = searchJson?.data?.productVariants?.edges[0]?.node?.product;
      
      if (!found) return res.status(404).json({ ok: false, error: `SKU ${sku} no existe en Shopify` });
      
      productId = found.id;
      activeHandle = found.handle;
    }

    // Si ya tenemos el Handle, obtenemos el ID necesario para las mutaciones
    if (!productId && activeHandle) {
      const productRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
        body: JSON.stringify({
          query: `query($h:String!){ productByHandle(handle:$h){ id } }`,
          variables: { h: activeHandle }
        })
      });
      const pJson = await productRes.json();
      productId = pJson?.data?.productByHandle?.id;
    }

    if (!productId) return res.status(404).json({ ok: false, error: 'Identificador de producto no encontrado' });

    /**
     * FASE 2: MAPEO TÉCNICO DE METAFIELDS
     * Vinculamos las columnas de tu CSV con los nombres técnicos en Shopify.
     */
    const MAPPING = {
      'web': 'stock_por_sucursal', // Mapeo solicitado: WEB -> custom.stock_por_sucursal
      'stock_centro': 'stock_centro',
      'suc_coyoacan': 'suc_coyoacan',
      'suc_benito_juarez': 'suc_benito_juarez',
      'suc_gustavo_baz': 'suc_gustavo_baz',
      'suc_naucalpan': 'suc_naucalpan',
      'suc_toluca': 'suc_toluca',
      'suc_queretaro': 'suc_queretaro',
      'suc_vallejo': 'suc_vallejo',
      'suc_puebla': 'suc_puebla'
    };

    /**
     * OPERACIÓN GET: RECUPERACIÓN DE DATOS (Read)
     * Usamos Aliases en GraphQL para traer los 10 campos en una sola petición.
     */
    if (req.method === 'GET') {
      const keys = Object.keys(MAPPING);
      const mfRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
        body: JSON.stringify({
          query: `query($id:ID!){ 
            product(id:$id){ 
              ${keys.map((k, i) => `f${i}:metafield(namespace:"custom", key:"${MAPPING[k]}"){value}`).join(' ')} 
            } 
          }`,
          variables: { id: productId }
        })
      });
      const mfJson = await mfRes.json();
      const currentStocks = {};
      keys.forEach((k, i) => {
        currentStocks[k] = mfJson?.data?.product?.[`f${i}`]?.value || 0;
      });
      return res.json({ ok: true, handle: activeHandle, stocks: currentStocks });
    }

    /**
     * OPERACIÓN POST: ACTUALIZACIÓN MASIVA (Write)
     * Implementamos MetafieldsSet para una mutación atómica y segura.
     */
    if (req.method === 'POST') {
      if (!stocks) return res.status(400).json({ ok: false, error: 'No se enviaron datos de inventario' });

      const mutations = Object.keys(MAPPING).map(key => {
        if (!(key in stocks)) return null;
        return {
          ownerId: productId,
          namespace: 'custom',
          key: MAPPING[key],
          type: 'number_integer',
          value: String(stocks[key]) // Shopify requiere que el número viaje como String
        };
      }).filter(Boolean);

      const saveRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
        body: JSON.stringify({
          query: `mutation($mf:[MetafieldsSetInput!]!){ 
            metafieldsSet(metafields:$mf){ 
              userErrors{ field message } 
            } 
          }`,
          variables: { mf: mutations }
        })
      });
      
      const saveData = await saveRes.json();
      const userErrors = saveData?.data?.metafieldsSet?.userErrors;
      
      if (userErrors && userErrors.length > 0) {
        return res.status(400).json({ ok: false, error: userErrors[0].message });
      }

      return res.json({ ok: true });
    }

  } catch (err) {
    console.error('CRITICAL ERROR:', err);
    return res.status(500).json({ ok: false, error: 'Error interno en el servidor' });
  }
}
