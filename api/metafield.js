export default async function handler(req, res) {
  const SHOPIFY_HOST = 'mundo-jm-test.myshopify.com';
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
  const VERSION = '2024-07';

  // --- Configuración de CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { handle, sku, stocks } = req.method === 'POST' ? req.body : req.query;
    let productId = null;
    let activeHandle = handle;

    // 1. RESOLUCIÓN DE IDENTIDAD (Discovery Mode)
    // Si el SKU no está en el CSV, lo buscamos directo en Shopify
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
      
      if (!found) return res.status(404).json({ ok: false, error: 'SKU no existe en Shopify' });
      
      productId = found.id;
      activeHandle = found.handle;
    }

    // 2. OBTENER PRODUCT ID POR HANDLE
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

    if (!productId) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });

    // 3. MAPEO MAESTRO DE METACAMPOS (9 Sucursales + WEB)
    // Mapeamos 'web' al campo custom.stock_por_sucursal según el formato solicitado
    const MAPPING = {
      'web': 'stock_por_sucursal',
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

    // --- GET: OBTENER TODOS LOS STOCKS ACTUALES ---
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

    // --- POST: ACTUALIZAR METACAMPOS (Inserts Reales) ---
    if (req.method === 'POST') {
      const mutations = Object.keys(MAPPING).map(key => {
        if (!(key in stocks)) return null;
        return {
          ownerId: productId,
          namespace: 'custom',
          key: MAPPING[key],
          type: 'number_integer',
          value: String(stocks[key])
        };
      }).filter(Boolean);

      const saveRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
        body: JSON.stringify({
          query: `mutation($mf:[MetafieldsSetInput!]!){ 
            metafieldsSet(metafields:$mf){ 
              userErrors{message} 
            } 
          }`,
          variables: { mf: mutations }
        })
      });
      return res.json({ ok: true });
    }

  } catch (err) {
    console.error('Error en /api/metafield:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
