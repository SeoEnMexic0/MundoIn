const SHOPIFY_HOST = 'mundo-jm-test.myshopify.com';
const VERSION = '2024-07';
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

const SHOPIFY_URL = `https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`;

// --------------------------------
// Helper: fetch con retry
// --------------------------------
async function shopifyFetch(query, variables = {}, retries = 3) {
  try {
    const res = await fetch(SHOPIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({ query, variables })
    });

    const json = await res.json();

    if (json.errors) throw new Error(json.errors[0].message);
    return json.data;

  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 800));
      return shopifyFetch(query, variables, retries - 1);
    }
    throw err;
  }
}

// --------------------------------
// API Handler
// --------------------------------
export default async function handler(req, res) {

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { handle } = req.method === 'GET' ? req.query : req.body;
    if (!handle) {
      return res.status(400).json({ ok:false, error:'Falta handle' });
    }

    // --------------------------------
    // 1️⃣ Obtener productId
    // --------------------------------
    const productData = await shopifyFetch(`
      query ($handle: String!) {
        productByHandle(handle: $handle) {
          id
        }
      }
    `, { handle });

    const productId = productData?.productByHandle?.id;
    if (!productId) {
      return res.status(404).json({ ok:false, error:'Producto no encontrado' });
    }

    // --------------------------------
    // 2️⃣ GET → leer stocks
    // --------------------------------
    if (req.method === 'GET') {
      const data = await shopifyFetch(`
        query ($id: ID!) {
          product(id: $id) {
            metafield(namespace: "custom", key: "stock_por_sucursal") {
              value
              type
            }
          }
        }
      `, { id: productId });

      let stocks = {};
      try {
        stocks = JSON.parse(
          data?.product?.metafield?.value || '{}'
        );
      } catch {
        stocks = {};
      }

      return res.json({ ok:true, stocks });
    }

    // --------------------------------
    // 3️⃣ POST → guardar stocks
    // --------------------------------
    if (req.method === 'POST') {
      const { stocks } = req.body;
      if (!stocks || typeof stocks !== 'object') {
        return res.status(400).json({ ok:false, error:'Stocks inválidos' });
      }

      const save = await shopifyFetch(`
        mutation ($mf: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $mf) {
            metafields {
              id
              key
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        mf: [{
          ownerId: productId,
          namespace: 'custom',
          key: 'stock_por_sucursal',
          type: 'json',
          value: JSON.stringify(stocks)
        }]
      });

      const errors = save?.metafieldsSet?.userErrors;
      if (errors?.length) {
        return res.status(400).json({ ok:false, error: errors[0].message });
      }

      return res.json({ ok:true });
    }

    return res.status(405).json({ ok:false, error:'Método no permitido' });

  } catch (err) {
    console.error('API metafield error:', err);
    return res.status(500).json({ ok:false, error: err.message });
  }
}
