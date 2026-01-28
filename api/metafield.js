// Handler para Next.js / Vercel
export default async function handler(req, res) {
  // ======== CORS =========
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { product_id, handle, value } = req.body;

    // ======== CONFIG ========
    const host = 'mundo-jm-test.myshopify.com'; // Cambiar a tu tienda real
    const token = process.env.SHOPIFY_ADMIN_TOKEN; // token de admin
    const version = '2024-07'; // API version

    if (!token) return res.status(500).json({ ok: false, error: "Falta el TOKEN en Vercel" });

    // Determinar el GID
    const idFinal = product_id || null;
    let gid = null;

    if (idFinal) {
      gid = `gid://shopify/Product/${idFinal}`;
    } else if (handle) {
      // Si solo hay handle, necesitamos buscar el producto primero
      const queryByHandle = `
        query getProduct($handle: String!) {
          productByHandle(handle: $handle) {
            id
          }
        }
      `;
      const respHandle = await fetch(`https://${host}/admin/api/${version}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token
        },
        body: JSON.stringify({ query: queryByHandle, variables: { handle } })
      });
      const jsonHandle = await respHandle.json();
      if (!jsonHandle.data?.productByHandle) return res.status(404).json({ ok: false, error: "No se encontró el producto por handle" });
      gid = jsonHandle.data.productByHandle.id;
    } else {
      return res.status(400).json({ ok: false, error: "Falta product_id o handle" });
    }

    // ======== Obtener stock actual (solo para info) ========
    const queryCurrent = `
      query getMetafields($id: ID!) {
        product(id: $id) {
          metafields(namespace: "custom", keys: ["sucursales"]) {
            key
            value
          }
        }
      }
    `;
    const currentResp = await fetch(`https://${host}/admin/api/${version}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ query: queryCurrent, variables: { id: gid } })
    });
    const currentJson = await currentResp.json();
    let currentValues = [];
    try {
      if(currentJson.data.product.metafields.length > 0){
        currentValues = JSON.parse(currentJson.data.product.metafields[0].value);
      }
    } catch(e) { currentValues = []; }

    // ======== Actualizar sucursales ========
    const mutation = `
      mutation metafieldsSet($m: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $m) {
          metafields { id value }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      m: [{
        ownerId: gid,
        namespace: "custom",
        key: "sucursales",
        type: "json",
        value: typeof value === 'object' ? JSON.stringify(value) : value
      }]
    };

    const updateResp = await fetch(`https://${host}/admin/api/${version}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ query: mutation, variables })
    });

    const updateJson = await updateResp.json();

    if(updateJson.errors || updateJson.data.metafieldsSet.userErrors.length > 0) {
      return res.status(500).json({ 
        ok: false, 
        error: updateJson.errors || updateJson.data.metafieldsSet.userErrors 
      });
    }

    return res.status(200).json({
      ok: true,
      productId: gid,
      currentStock: currentValues, // stock actual
      updated: value
    });

  } catch(err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
