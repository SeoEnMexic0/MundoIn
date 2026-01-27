export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { handle, value } = req.body;
    if (!handle) {
      return res.status(400).json({ ok:false, error:'Handle requerido' });
    }

    const host = 'mundo-in.myshopify.com';
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    const gqlUrl = `https://${host}/admin/api/2024-07/graphql.json`;

    // 1️⃣ Buscar producto por handle
    const queryProduct = `
      query ($handle: String!) {
        productByHandle(handle: $handle) {
          id
        }
      }
    `;

    const productRes = await fetch(gqlUrl, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({
        query: queryProduct,
        variables: { handle }
      })
    });

    const productJson = await productRes.json();
    const productId = productJson?.data?.productByHandle?.id;

    if (!productId) {
      return res.status(404).json({
        ok:false,
        error:`Producto no encontrado por handle: ${handle}`
      });
    }

    // 2️⃣ Insertar metafield
    const mutation = `
      mutation ($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { message }
        }
      }
    `;

    const variables = {
      metafields: [{
        ownerId: productId,
        namespace: "custom",
        key: "sucursales",
        type: "json",
        value: JSON.stringify(value)
      }]
    };

    const mfRes = await fetch(gqlUrl, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ query: mutation, variables })
    });

    const mfJson = await mfRes.json();

    if (mfJson.data.metafieldsSet.userErrors.length) {
      return res.status(400).json({
        ok:false,
        error: mfJson.data.metafieldsSet.userErrors[0].message
      });
    }

    return res.status(200).json({ ok:true });

  } catch (err) {
    return res.status(500).json({ ok:false, error: err.message });
  }
}
