// /api/stock.js
export default async function handler(req, res) {
  // --- CORS: permitir solicitudes desde Shopify ---
  res.setHeader('Access-Control-Allow-Origin', '*'); // En producción: restringir a tu dominio
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const SHOPIFY_HOST = 'mundo-jm-test.myshopify.com';
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
  const VERSION = '2024-07';

  try {
    // -----------------------------
    // POST: Actualizar stock
    // -----------------------------
    if (req.method === 'POST') {
      const { handle, cambios } = req.body;

      if (!handle || !cambios) {
        return res.status(400).json({ ok: false, error: 'Datos incompletos' });
      }

      // 1️⃣ Obtener producto por handle
      const productRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': TOKEN
        },
        body: JSON.stringify({
          query: `
            query($handle: String!) {
              productByHandle(handle: $handle) {
                id
                metafield(namespace:"custom", key:"sucursales") { value type }
              }
            }
          `,
          variables: { handle }
        })
      });

      const productJson = await productRes.json();
      const product = productJson?.data?.productByHandle;
      if (!product) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });

      // 2️⃣ Parse seguro del metafield
      let data;
      try {
        data = JSON.parse(product.metafield.value);
      } catch {
        data = { sucursales: [] };
      }

      // 3️⃣ Actualizar solo los cambios que vienen
      Object.entries(cambios).forEach(([sucursal, cantidad]) => {
        const idx = data.sucursales.findIndex(s => s.nombre === sucursal);
        if (idx !== -1) data.sucursales[idx].cantidad = Number(cantidad);
      });

      // 4️⃣ Guardar de nuevo en Shopify
      const saveRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': TOKEN
        },
        body: JSON.stringify({
          query: `
            mutation($mf: [MetafieldsSetInput!]!) {
              metafieldsSet(metafields: $mf) {
                metafields { id value type }
                userErrors { field message }
              }
            }
          `,
          variables: {
            mf: [{
              ownerId: product.id,
              namespace: 'custom',
              key: 'sucursales',
              type: 'json',
              value: JSON.stringify(data)
            }]
          }
        })
      });

      const saveJson = await saveRes.json();
      const errors = saveJson?.data?.metafieldsSet?.userErrors;
      if (errors?.length) return res.status(400).json({ ok: false, error: errors[0].message });

      return res.json({ ok: true, sucursales: data.sucursales });
    }

    // -----------------------------
    // GET: Obtener stock actual
    // -----------------------------
    if (req.method === 'GET') {
      const handle = req.query.handle;
      if (!handle) return res.status(400).json({ ok: false, error: 'Falta handle' });

      const productRes = await fetch(`https://${SHOPIFY_HOST}/admin/api/${VERSION}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': TOKEN
        },
        body: JSON.stringify({
          query: `
            query($handle: String!) {
              productByHandle(handle: $handle) {
                metafield(namespace:"custom", key:"sucursales") { value type }
              }
            }
          `,
          variables: { handle }
        })
      });

      const json = await productRes.json();
      const value = json?.data?.productByHandle?.metafield?.value || '{"sucursales":[]}';
      const data = JSON.parse(value);

      return res.json({ ok: true, sucursales: data.sucursales });
    }

    // -----------------------------
    // Otros métodos no permitidos
    // -----------------------------
    return res.status(405).json({ ok: false, error: 'Método no permitido' });

  } catch (err) {
    console.error('Error API /api/stock:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
