/**
 * MIDDLEWARE DE INVENTARIO REAL-TIME - MUNDO IN
 * Optimizado para: Variantes Independientes, Mapeo WEB y Mutaciones Atómicas.
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
    let variantId = null;
    let activeHandle = handle;

    /**
     * FASE 1: RESOLUCIÓN DINÁMICA DE IDENTIDAD (Discovery Mode)
     * Buscamos el ID de la VARIANTE por SKU para asegurar independencia de inventario.
     */
    if (sku) {
      const searchRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
        body: JSON.stringify({
          query: `query($q: String!){ 
            productVariants(first: 1, query: $q){ 
              edges{ 
                node{ 
                  id 
                  product { id handle } 
                } 
              } 
            } 
          }`,
          variables: { q: `sku:${sku}` }
        })
      });
      const searchData = await searchRes.json();
      const foundNode = searchData?.data?.productVariants?.edges[0]?.node;
      
      if (!foundNode) return res.status(404).json({ ok: false, error: `SKU ${sku} no localizado en Shopify` });
      
      variantId = foundNode.id; // GID de la Variante (Indispensable para Cama Indiv vs Matrim)
      activeHandle = foundNode.product.handle;
    }

    if (!variantId) return res.status(400).json({ ok: false, error: 'Identificador de variante no encontrado' });

    /**
     * FASE 2: MAPEO ESTRATÉGICO DE METACAMPOS DE VARIANTE (_v)
     * Vinculación con los namespaces creados en "Definiciones de metacampo de variante".
     */
    const MAPPING = {
      'web': 'stock_web_v', // Mapeo a custom.stock_web_v
      'stock_centro': 'stock_centro_v',
      'suc_coyoacan': 'suc_coyoacan_v',
      'suc_benito_juarez': 'suc_benito_juarez_v',
      'suc_gustavo_baz': 'suc_gustavo_baz_v',
      'suc_naucalpan': 'suc_naucalpan_v',
      'suc_toluca': 'suc_toluca_v',
      'suc_queretaro': 'suc_queretaro_v',
      'suc_vallejo': 'suc_vallejo_v',
      'suc_puebla': 'suc_puebla_v'
    };

    /**
     * OPERACIÓN GET: CONSULTA SINCRONIZADA
     * Recupera los 10 valores de la VARIANTE usando Aliases en un solo request.
     */
    if (req.method === 'GET') {
      const keys = Object.keys(MAPPING);
      const mfRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
        body: JSON.stringify({
          query: `query($id:ID!){ 
            node(id:$id){ 
              ... on ProductVariant {
                ${keys.map((k, i) => `f${i}:metafield(namespace:"custom", key:"${MAPPING[k]}"){value}`).join('\n')} 
              }
            } 
          }`,
          variables: { id: variantId }
        })
      });
      const mfData = await mfRes.json();
      const currentStocks = {};
      
      // Extraemos los datos del nodo de la variante
      keys.forEach((k, i) => {
        currentStocks[k] = mfData?.data?.node?.[`f${i}`]?.value || 0;
      });
      
      return res.json({ ok: true, handle: activeHandle, stocks: currentStocks });
    }

    /**
     * OPERACIÓN POST: ACTUALIZACIÓN ATÓMICA EN VARIANTE
     * Procesa la mutación masiva apuntando al ownerId de la variante.
     */
    if (req.method === 'POST') {
      if (!stocks) return res.status(400).json({ ok: false, error: 'Payload de inventario vacío' });

      const mutations = Object.keys(MAPPING).map(key => {
        if (!(key in stocks)) return null;
        return {
          ownerId: variantId, // Importante: ownerId es la Variante
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
    console.error('ERROR CRÍTICO:', err);
    return res.status(500).json({ ok: false, error: 'Falla crítica en el middleware' });
  }
}
