export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { handle, sku, updates } = req.body;

    if (!handle || !sku || !updates || typeof updates !== 'object') {
      return res.status(400).json({ ok: false, error: 'Datos incompletos' });
    }

    const SHOP = 'mundo-in.myshopify.com';
    const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
    const URL = `https://${SHOP}/admin/api/2026-01/graphql.json`;

    /* =====================================================
       1. BUSCAR VARIANTE POR HANDLE + SKU
    ===================================================== */
    const queryFind = `
      query ($handle: String!) {
        productByHandle(handle: $handle) {
          id
          variants(first: 50) {
            nodes {
              id
              sku
              metafield(namespace: "custom", key: "sucursales") {
                id
                value
              }
            }
          }
        }
      }
    `;

    const findRes = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN
      },
      body: JSON.stringify({
        query: queryFind,
        variables: { handle }
      })
    });

    const findJson = await findRes.json();
    const product = findJson.data?.productByHandle;

    if (!product) {
      return res.status(404).json({ ok: false, error: `Producto no encontrado: ${handle}` });
    }

    const variant = product.variants.nodes.find(v => v.sku === sku);

    if (!variant) {
      return res.status(404).json({ ok: false, error: `Variante no encontrada por SKU: ${sku}` });
    }

    /* =====================================================
       2. MERGE DE SUCURSALES (NO PISAR LO NO ENVIADO)
    ===================================================== */
    let actual = {};
    if (variant.metafield?.value) {
      actual = JSON.parse(variant.metafield.value);
    }

    const merged = { ...actual };
    for (const key in updates) {
      merged[key] = updates[key]; // incluso 0
    }

    /* =====================================================
       3. GUARDAR METAFIELD EN VARIANTE
    ===================================================== */
    const mutation = `
      mutation ($input: MetafieldsSetInput!) {
        metafieldsSet(metafields: [$input]) {
          metafields { id }
          userErrors { message }
        }
      }
    `;

    const saveRes = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            ownerId: variant.id,
            namespace: 'custom',
            key: 'sucursales',
            type: 'json',
            value: JSON.stringify(merged)
          }
        }
      })
    });

    const saveJson = await saveRes.json();
    const errors = saveJson.data?.metafieldsSet?.userErrors;

    if (errors && errors.length) {
      return res.status(400).json({ ok: false, error: errors[0].message });
    }

    return res.status(200).json({
      ok: true,
      handle,
      sku,
      sucursales: merged
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
