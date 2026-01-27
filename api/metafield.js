export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const { product_id, handle, value } = req.body;

    if (!value) {
      return res.status(400).json({ ok: false, error: 'Value (metafield) requerido' });
    }

    const host = 'mundo-in.myshopify.com';
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    const gqlUrl = `https://${host}/admin/api/2024-07/graphql.json`;

    let ownerGid = null;

    /* ======================================================
       1. RESOLVER PRODUCT ID
    ====================================================== */
    if (product_id) {
      ownerGid = `gid://shopify/Product/${String(product_id).trim()}`;
    } else if (handle) {
      const query = `
        query getProductByHandle($handle: String!) {
          productByHandle(handle: $handle) {
            id
          }
        }
      `;

      const r = await fetch(gqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token
        },
        body: JSON.stringify({ query, variables: { handle } })
      });

      const j = await r.json();
      ownerGid = j?.data?.productByHandle?.id;

      if (!ownerGid) {
        return res.status(404).json({
          ok: false,
          error: `Producto no encontrado por handle: ${handle}`
        });
      }
    } else {
      return res.status(400).json({
        ok: false,
        error: 'Debes enviar product_id o handle'
      });
    }

    /* ======================================================
       2. SET METAFIELD
    ====================================================== */
    const mutation = `
      mutation setMetafield($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      metafields: [
        {
          ownerId: ownerGid,
          namespace: 'custom',
          key: 'sucursales',
          type: 'json',
          value: typeof value === 'string' ? value : JSON.stringify(value)
        }
      ]
    };

    const response = await fetch(gqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ query: mutation, variables })
    });

    const result = await response.json();

    const errors = result?.data?.metafieldsSet?.userErrors;
    if (errors && errors.length) {
      return res.status(400).json({
        ok: false,
        error: errors[0].message
      });
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('METAFIELD ERROR:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Error interno'
    });
  }
}
