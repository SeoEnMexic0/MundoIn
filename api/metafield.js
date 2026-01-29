// /pages/api/metafield.js
export default async function handler(req, res) {
  const SHOPIFY_HOST = 'mundo-jm-test.myshopify.com';
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
  const VERSION = '2024-07';

  // --- CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { handle } = req.method === 'POST' ? req.body : req.query;
    if (!handle) return res.status(400).json({ ok:false, error:'Falta handle' });

    // -----------------------------
    // Obtener productId
    // -----------------------------
    const productRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'X-Shopify-Access-Token':TOKEN
      },
      body: JSON.stringify({
        query: `
          query($handle:String!){
            productByHandle(handle:$handle){
              id
            }
          }
        `,
        variables: { handle }
      })
    });

    const productJson = await productRes.json();
    const productId = productJson?.data?.productByHandle?.id;
    if (!productId) return res.status(404).json({ ok:false, error:'Producto no encontrado' });

    // =====================================================
    // GET → LEER TODOS LOS METAFIELDS DE SUCURSALES
    // =====================================================
    if (req.method === 'GET') {
      const keys = [
        'stock_centro',
        'suc_coyoacan',
        'suc_benito_juarez',
        'suc_gustavo_baz',
        'suc_naucalpan',
        'suc_toluca',
        'suc_queretaro',
        'suc_vallejo',
        'suc_puebla'
      ];

      const queries = keys.map(
        k => `
          ${k}: metafield(namespace:"custom", key:"${k}"){ value }
        `
      ).join('\n');

      const stockRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'X-Shopify-Access-Token':TOKEN
        },
        body: JSON.stringify({
          query: `
            query($id:ID!){
              product(id:$id){
                ${queries}
              }
            }
          `,
          variables:{ id: productId }
        })
      });

      const stockJson = await stockRes.json();
      const product = stockJson?.data?.product || {};

      const result = {};
      keys.forEach(k => {
        result[k] = Number(product[k]?.value || 0);
      });

      return res.json({ ok:true, stocks: result });
    }

    // =====================================================
    // POST → GUARDAR VARIOS METAFIELDS
    // =====================================================
    if (req.method === 'POST') {
      const { stocks } = req.body;
      if (!stocks || typeof stocks !== 'object') {
        return res.status(400).json({ ok:false, error:'Faltan stocks' });
      }

      const metafields = Object.entries(stocks).map(([key, value]) => ({
        ownerId: productId,
        namespace: 'custom',
        key,
        type: 'number_integer',
        value: String(value ?? 0)
      }));

      const saveRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'X-Shopify-Access-Token':TOKEN
        },
        body: JSON.stringify({
          query: `
            mutation($mf:[MetafieldsSetInput!]!){
              metafieldsSet(metafields:$mf){
                metafields{ key value }
                userErrors{ field message }
              }
            }
          `,
          variables:{ mf: metafields }
        })
      });

      const saveJson = await saveRes.json();
      const errors = saveJson?.data?.metafieldsSet?.userErrors;
      if (errors?.length) {
        return res.status(400).json({ ok:false, error: errors[0].message });
      }

      return res.json({ ok:true, saved: stocks });
    }

    return res.status(405).json({ ok:false, error:'Método no permitido' });

  } catch (err) {
    console.error('Error /api/metafield:', err);
    return res.status(500).json({ ok:false, error: err.message });
  }
}
