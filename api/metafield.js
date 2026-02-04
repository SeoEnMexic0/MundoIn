/**
 * MIDDLEWARE DE INVENTARIO REAL-TIME - MUNDO IN
 * Optimizado para: Descubrimiento de SKUs, Mapeo WEB y Mutaciones Atómicas.
 */

export default async function handler(req, res) {
  // CONFIGURACIÓN DE ENTORNO SEGURO
  const SHOPIFY_HOST = 'mundo-jm-test.myshopify.com';
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
  const VERSION = '2024-07';

  // 1. HEADERS DE SEGURIDAD Y CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { handle, sku, stocks } = req.method === 'POST' ? req.body : req.query;
    let productId = null;
    let activeHandle = handle;

    /**
     * FASE 1: RESOLUCIÓN DINÁMICA DE IDENTIDAD (Discovery Mode)
     * Si el sistema recibe un SKU sin handle, consulta Shopify para "descubrir" el producto.
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
      const searchData = await searchRes.json();
      const found = searchData?.data?.productVariants?.edges[0]?.node?.product;
      
      if (!found) return res.status(404).json({ ok: false, error: `SKU ${sku} no localizado en Shopify` });
      
      productId = found.id;
      activeHandle = found.handle;
    }

    // Obtención de ID por Handle (Fallback)
    if (!productId && activeHandle) {
      const pRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
        body: JSON.stringify({
          query: `query($h:String!){ productByHandle(handle:$h){ id } }`,
          variables: { h: activeHandle }
        })
      });
      const pData = await pRes.json();
      productId = pData?.data?.productByHandle?.id;
    }

    if (!productId) return res.status(404).json({ ok: false, error: 'Producto no identificado' });

    /**
     * FASE 2: MAPEO ESTRATÉGICO DE METACAMPOS (9+1)
     * Vinculación de la interfaz con los namespaces técnicos de Shopify.
     */
    const MAPPING = {
      'web': 'stock_por_sucursal', // Mapeo crítico para inventario online
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
     * OPERACIÓN GET: CONSULTA SINCRONIZADA
     * Recupera los 10 valores de stock en un solo ciclo de reloj usando Aliases.
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
      const mfData = await mfRes.json();
      const currentStocks = {};
      keys.forEach((k, i) => {
        currentStocks[k] = mfData?.data?.product?.[`f${i}`]?.value || 0;
      });
      return res.json({ ok: true, handle: activeHandle, stocks: currentStocks });
    }

    /**
     * OPERACIÓN POST: ACTUALIZACIÓN ATÓMICA (Insert)
     * Procesa la mutación masiva de metafields garantizando integridad de datos.
     */
    if (req.method === 'POST') {
      if (!stocks) return res.status(400).json({ ok: false, error: 'Payload de inventario vacío' });

      const mutations = Object.keys(MAPPING).map(key => {
        if (!(key in stocks)) return null;
        return {
          ownerId: productId,
          namespace: 'custom',
          key: MAPPING[key],
          type: 'number_integer',
          value: String(stocks[key]) // Transmisión de entero como String (Requisito GraphQL)
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
      const errors = saveData?.data?.metafieldsSet?.userErrors;
      
      if (errors && errors.length > 0) return res.status(400).json({ ok: false, error: errors[0].message });

      return res.json({ ok: true });
    }

  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Falla crítica en el middleware' });
  }
}
